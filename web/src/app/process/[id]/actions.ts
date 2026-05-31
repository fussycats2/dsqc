"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { buildGroupedSerial } from "@/lib/serial";

export interface EntryRow {
  description?: string;
  qty?: string;
  weight?: string;
  tag?: string;
  q?: string;
  due_date?: string;
  raw_weight?: string;
  note?: string;
}

const toNum = (v?: string) => (v === undefined || v === "" ? null : Number(v));
const toStr = (v?: string) => (v === undefined || v === "" ? null : v);

type LotRow = Record<string, unknown> & {
  id: string;
  process_id: string;
  serial: string | null;
  prev_process_id: string | null;
};

// 다음 공정 입고로 넘길 때 들고 가는 필드
const CARRY = [
  "description", "qty", "weight", "tag", "q", "due_date", "raw_weight", "note",
] as const;
function carry(l: LotRow) {
  const o: Record<string, unknown> = {};
  for (const f of CARRY) o[f] = l[f] ?? null;
  return o;
}
const sum = (rows: LotRow[], k: string) =>
  rows.reduce((a, l) => a + (Number(l[k]) || 0), 0) || null;
const joinDesc = (rows: LotRow[]) =>
  [...new Set(rows.map((l) => l.description).filter(Boolean))].join(",") || null;
const firstDue = (rows: LotRow[]) =>
  (rows.find((l) => l.due_date)?.due_date as string | null) ?? null;

// ───────── 작성 → 대상 공정 일괄 보내기(입고): 일련번호 최초 생성 ─────────
export async function sendRows(
  sourceProcessId: string,
  targetProcessId: string,
  rows: EntryRow[],
) {
  const supabase = await createClient();
  const valid = rows.filter(
    (r) => r.description?.trim() || r.qty || r.weight || r.tag,
  );
  if (valid.length === 0) return { error: "입력된 행이 없습니다." };

  let sent = 0;
  for (const r of valid) {
    const { data: serial, error: serr } = await supabase.rpc("next_serial", {
      p_process_id: targetProcessId,
    });
    if (serr) return { error: serr.message };
    const { error } = await supabase.from("lots").insert({
      serial,
      process_id: targetProcessId,
      side: "in",
      status: "작업중",
      prev_process_id: sourceProcessId,
      description: toStr(r.description),
      qty: toNum(r.qty),
      weight: toNum(r.weight),
      tag: toNum(r.tag),
      q: toNum(r.q),
      due_date: toStr(r.due_date),
      raw_weight: toNum(r.raw_weight),
      note: toStr(r.note),
    });
    if (error) return { error: error.message };
    await supabase.from("movements").insert({
      type: "입고",
      source_process_id: sourceProcessId,
      target_process_id: targetProcessId,
      qty: toNum(r.qty),
      weight: toNum(r.weight),
      tag: toNum(r.tag),
    });
    sent++;
  }
  revalidatePath(`/process/${targetProcessId}`);
  return { ok: true, sent };
}

// ───────── 집계(=작업중→완료): N건 → 완료 1건, 일련번호 유지/그룹화 ─────────
//  · 단건이면 일련번호 그대로, 여러 건이면 그룹표기
//  · work: 입중량 합계 → 작업전. 작업후/로스/로스율은 비움(수동 입력)
//  · io  : 실중량은 비움(수동 입력). Tag 등은 합계로 들고 옴
export async function completeLots(processId: string, lotIds: string[]) {
  if (lotIds.length === 0) return { error: "선택된 행이 없습니다." };
  const supabase = await createClient();
  const { data: proc } = await supabase
    .from("processes")
    .select("schema_type")
    .eq("id", processId)
    .single();
  const { data: lotsData, error: readErr } = await supabase
    .from("lots")
    .select("*")
    .in("id", lotIds)
    .eq("locked", false);
  if (readErr) return { error: "DB: " + readErr.message };
  const lots = (lotsData ?? []) as LotRow[];
  if (lots.length === 0) return { error: "처리 가능한 행이 없습니다." };

  const serial = buildGroupedSerial(lots.map((l) => l.serial));
  const isWork = proc?.schema_type === "work";

  const { data: out } = await supabase
    .from("lots")
    .insert({
      serial,
      process_id: processId,
      side: "out",
      status: "작업중",
      description: joinDesc(lots),
      qty: sum(lots, "qty"),
      weight_before: isWork ? sum(lots, "weight") : null, // 입중량→작업전
      weight: null, // 작업후/실중량 = 수동 입력
      tag: sum(lots, "tag"),
      q: sum(lots, "q"),
      raw_weight: sum(lots, "raw_weight"),
      due_date: firstDue(lots),
    })
    .select("id")
    .single();
  if (!out) return { error: "완료행 생성 실패" };

  for (const l of lots) {
    await supabase.from("lot_links").insert({
      from_lot: l.id,
      to_lot: out.id,
      relation: "merge",
    });
    await supabase
      .from("lots")
      .update({ status: "완료", locked: true, completed_at: new Date().toISOString() })
      .eq("id", l.id);
  }
  await supabase.from("movements").insert({
    type: "집계",
    target_process_id: processId,
    lot_id: out.id,
    qty: sum(lots, "qty"),
  });
  revalidatePath(`/process/${processId}`);
  return { ok: true, merged: lots.length, serial };
}

// ───────── 투입: 작업중(입고) 행을 다른 공정 입고로 직접 이동 (일련번호 유지) ─────────
export async function transferInbound(
  sourceProcessId: string,
  targetProcessId: string,
  lotIds: string[],
) {
  return moveToTarget(sourceProcessId, targetProcessId, lotIds, "투입");
}
// ───────── 이관: 완료(출고) 행을 다음 공정 입고로 이동 (일련번호 유지) ─────────
export async function transferOutbound(
  sourceProcessId: string,
  targetProcessId: string,
  lotIds: string[],
) {
  return moveToTarget(sourceProcessId, targetProcessId, lotIds, "이관");
}

async function moveToTarget(
  sourceProcessId: string,
  targetProcessId: string,
  lotIds: string[],
  type: "투입" | "이관",
) {
  if (lotIds.length === 0) return { error: "선택된 행이 없습니다." };
  const supabase = await createClient();
  const { data: lotsData, error: readErr } = await supabase
    .from("lots")
    .select("*")
    .in("id", lotIds)
    .eq("locked", false);
  if (readErr) return { error: "DB: " + readErr.message };
  const lots = (lotsData ?? []) as LotRow[];
  if (lots.length === 0) return { error: "처리 가능한 행이 없습니다." };

  for (const l of lots) {
    const { data: created } = await supabase
      .from("lots")
      .insert({
        ...carry(l),
        serial: l.serial, // 일련번호 그대로 유지
        process_id: targetProcessId,
        side: "in",
        status: "작업중",
        prev_process_id: sourceProcessId,
      })
      .select("id")
      .single();
    if (created)
      await supabase.from("lot_links").insert({
        from_lot: l.id,
        to_lot: created.id,
        relation: "move",
      });
    await supabase
      .from("lots")
      .update({ locked: true, status: "완료", completed_at: new Date().toISOString() })
      .eq("id", l.id);
    await supabase.from("movements").insert({
      type,
      source_process_id: sourceProcessId,
      target_process_id: targetProcessId,
      lot_id: created?.id ?? null,
      qty: l.qty as number,
      weight: l.weight as number,
    });
  }
  revalidatePath(`/process/${sourceProcessId}`);
  revalidatePath(`/process/${targetProcessId}`);
  return { ok: true, moved: lots.length };
}

// ───────── 분할: 입고 1건 → n건 (일련번호 -1,-2 …), 수량/중량 배분 ─────────
export async function splitLot(processId: string, lotId: string, n: number) {
  if (n < 2) return { error: "2 이상으로 분할하세요." };
  const supabase = await createClient();
  const { data: lotData, error: readErr } = await supabase
    .from("lots")
    .select("*")
    .eq("id", lotId)
    .eq("locked", false)
    .single();
  if (readErr) return { error: "DB: " + readErr.message };
  if (!lotData) return { error: "처리 가능한 행이 아닙니다." };
  const L = lotData as LotRow;

  const splitWeight = (total: number | null, i: number) => {
    if (total == null) return null;
    const base = Math.floor((total / n) * 100) / 100;
    return i === n - 1 ? Math.round((total - base * (n - 1)) * 100) / 100 : base;
  };
  const qtyTotal = L.qty as number | null;

  for (let i = 0; i < n; i++) {
    const qShare =
      qtyTotal == null
        ? null
        : i === n - 1
          ? qtyTotal - Math.floor(qtyTotal / n) * (n - 1)
          : Math.floor(qtyTotal / n);
    const childSerial = L.serial ? `${L.serial}-${i + 1}` : null;
    const { data: child } = await supabase
      .from("lots")
      .insert({
        ...carry(L),
        qty: qShare,
        weight: splitWeight(L.weight as number | null, i),
        serial: childSerial,
        process_id: processId,
        side: "in",
        status: "작업중",
        prev_process_id: L.prev_process_id,
      })
      .select("id")
      .single();
    if (child)
      await supabase.from("lot_links").insert({
        from_lot: L.id,
        to_lot: child.id,
        relation: "split",
      });
  }
  await supabase
    .from("lots")
    .update({ locked: true, status: "완료" })
    .eq("id", L.id);
  await supabase.from("movements").insert({
    type: "분할",
    target_process_id: processId,
    lot_id: L.id,
  });
  revalidatePath(`/process/${processId}`);
  return { ok: true, parts: n };
}

// ───────── 완료/출고 측 수동 입력 칸 인라인 수정 ─────────
export async function updateLot(
  processId: string,
  lotId: string,
  patch: Record<string, number | null>,
) {
  const supabase = await createClient();
  const { error } = await supabase.from("lots").update(patch).eq("id", lotId);
  if (error) return { error: error.message };
  revalidatePath(`/process/${processId}`);
  return { ok: true };
}

// ───────── 삭제 ─────────
export async function deleteLots(processId: string, lotIds: string[]) {
  if (lotIds.length === 0) return { error: "선택된 행이 없습니다." };
  const supabase = await createClient();
  const { error } = await supabase.from("lots").delete().in("id", lotIds);
  if (error) return { error: error.message };
  revalidatePath(`/process/${processId}`);
  return { ok: true, deleted: lotIds.length };
}
