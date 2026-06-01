"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { buildGroupedSerial } from "@/lib/serial";
import { round2 } from "@/lib/types";
import { getWorkDate } from "@/lib/workDate";

// ────────────────────────────────────────────────────────────────────────
//  공정 흐름 액션 — docs/05_정밀스펙.md §2 매핑 그대로 (엑셀 VBA 1:1)
//  보내기(Module2) · 투입(Module4) · 타부서투입(Module16) ·
//  작업완료=집계(Module7) · 이관(Module9) · 출고(Module10) · 분할(Module1)
// ────────────────────────────────────────────────────────────────────────

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

const toNum = (v: unknown) =>
  v === undefined || v === null || v === "" ? null : Number(v);
const toStr = (v: unknown) =>
  v === undefined || v === null || v === "" ? null : String(v);

type LotRow = Record<string, unknown> & {
  id: string;
  process_id: string;
  serial: string | null;
  prev_process_id: string | null;
};

const N = (v: unknown) => Number(v) || 0;
const sumOf = (rows: LotRow[], k: string) =>
  round2(rows.reduce((a, l) => a + N(l[k]), 0)) || null;
// 텍스트 결합(중복 제거 후 콤마) — VBA Module7 textAlways: 내역(C)·납기(H)·원중량(I)·비고(J)
//  납기·원중량은 자유 텍스트(현장에서 복수 입력 가능)라 합산 아닌 결합으로 전부 보존
const joinText = (rows: LotRow[], k: string) =>
  [...new Set(rows.map((l) => l[k]).filter(Boolean).map(String))].join(",") || null;

async function nameOf(supabase: Awaited<ReturnType<typeof createClient>>, id: string) {
  const { data } = await supabase.from("processes").select("name").eq("id", id).single();
  return (data?.name as string | undefined) ?? null;
}
// 이전파트 표시(엑셀 Module4/9): "시트명 일 HH:MM" 예) "양장 21 11:56"
function partStamp(name: string | null) {
  if (!name) return null;
  const d = new Date();
  const hh = String(d.getHours()).padStart(2, "0");
  const mm = String(d.getMinutes()).padStart(2, "0");
  return `${name} ${d.getDate()} ${hh}:${mm}`;
}
async function schemaOf(supabase: Awaited<ReturnType<typeof createClient>>, id: string) {
  const { data } = await supabase.from("processes").select("schema_type").eq("id", id).single();
  return (data?.schema_type as string | undefined) ?? null;
}
async function readUnlocked(
  supabase: Awaited<ReturnType<typeof createClient>>,
  lotIds: string[],
) {
  const { data, error } = await supabase
    .from("lots").select("*").in("id", lotIds).eq("locked", false);
  return { rows: (data ?? []) as LotRow[], error };
}

// ───────── 보내기 (작성 → io/검수 입고): 일련번호 최초 생성 ─────────
export async function sendRows(
  sourceProcessId: string,
  targetProcessId: string,
  rows: EntryRow[],
) {
  const supabase = await createClient();
  const valid = rows.filter((r) => r.description?.trim() || r.qty || r.weight || r.tag);
  if (valid.length === 0) return { error: "입력된 행이 없습니다." };

  const wd = await getWorkDate(); // 새 입력은 현재 작업일에 귀속
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
      weight: toNum(r.weight), // 중량
      tag: toNum(r.tag),
      q: toNum(r.q),
      due_date: toStr(r.due_date),
      raw_weight: toStr(r.raw_weight), // 원중량 = 자유 텍스트
      note: toStr(r.note),
      work_date: wd,
    });
    if (error) return { error: error.message };
    sent++;
  }
  revalidatePath(`/process/${targetProcessId}`);
  return { ok: true, sent };
}

// ───────── 작업완료=집계 (Module7, work 전용): 작업중 N건 → 완료 1건 ─────────
//  · 같은 시트 완료블록 생성. 일련번호 그룹표기(단건이면 그대로)
//  · 작업전(P) = 선택행 weight(중량K) 합 · 작업후(Q) = 집계 모달에서 입력받음
//  · 로스(R)/로스율(S)은 작업전·작업후로 자동계산(shipWeight/lossOf)
export async function completeLots(
  processId: string,
  lotIds: string[],
  afterWeight: number | null,
) {
  if (lotIds.length === 0) return { error: "선택된 행이 없습니다." };
  const supabase = await createClient();
  if ((await schemaOf(supabase, processId)) !== "work")
    return { error: "집계(작업완료)는 공정(연마/뻥/빠우)에서만 가능합니다." };

  const { rows: lots, error } = await readUnlocked(supabase, lotIds);
  if (error) return { error: "DB: " + error.message };
  if (lots.length === 0) return { error: "처리 가능한 행이 없습니다." };

  const serial = buildGroupedSerial(lots.map((l) => l.serial));
  const { data: out } = await supabase
    .from("lots")
    .insert({
      serial,
      process_id: processId,
      side: "out",
      status: "작업중",
      description: joinText(lots, "description"),           // 내역(C) 중복제거 결합
      qty: sumOf(lots, "qty"),                              // 수량(D) 합
      weight_before: sumOf(lots, "weight"),                 // 작업전 = 중량(K) 합
      weight: afterWeight == null ? null : round2(afterWeight), // 작업후 = 모달 입력
      tag: sumOf(lots, "tag"),                              // Tag(F) 합
      q: sumOf(lots, "q"),                                  // Q(G) 합
      raw_weight: joinText(lots, "raw_weight"),             // 원중량(I) 중복제거 결합(합산 아님)
      due_date: joinText(lots, "due_date"),                 // 납기(H) 중복제거 결합
      note: joinText(lots, "note"),                         // 비고(J) 중복제거 결합
      work_date: lots[0]?.work_date, // 집계 결과는 원본 작업일 승계
    })
    .select("id")
    .single();
  if (!out) return { error: "완료행 생성 실패" };

  for (const l of lots) {
    await supabase.from("lot_links").insert({ from_lot: l.id, to_lot: out.id, relation: "merge" });
    await supabase
      .from("lots")
      .update({ status: "완료", locked: true, completed_at: new Date().toISOString() })
      .eq("id", l.id);
  }
  revalidatePath(`/process/${processId}`);
  return { ok: true, merged: lots.length, serial };
}

// ───────── 투입 (Module4): io/검수 입고행 → work 작업중 ─────────
//  dest: serial유지, 입중량←중량, 수량/Tag/Q/납기/원중량/비고 그대로,
//        중량(K) = 원본 중량+Tag+Q+원중량 합(VBA D+E+F+H), 이전파트=원본명
export async function feedToWork(
  sourceProcessId: string,
  targetProcessId: string,
  lotIds: string[],
) {
  if (lotIds.length === 0) return { error: "선택된 행이 없습니다." };
  const supabase = await createClient();
  const { rows: lots, error } = await readUnlocked(supabase, lotIds);
  if (error) return { error: "DB: " + error.message };
  if (lots.length === 0) return { error: "처리 가능한 행이 없습니다." };
  const srcName = await nameOf(supabase, sourceProcessId);

  for (const l of lots) {
    const { data: created } = await supabase
      .from("lots")
      .insert({
        serial: l.serial,
        process_id: targetProcessId,
        side: "in",
        status: "작업중",
        prev_process_id: sourceProcessId,
        prev_part_name: partStamp(srcName),
        description: l.description,
        qty: l.qty,
        weight_in: l.weight, // 입중량 ← 원본 중량
        weight: round2(N(l.weight) + N(l.tag) + N(l.q) + N(l.raw_weight)) || null, // 중량(K)=D+E+F+H
        tag: l.tag,
        q: l.q,
        due_date: l.due_date,
        raw_weight: l.raw_weight,
        note: l.note,
        work_date: l.work_date, // 이동 흐름은 원본 작업일 승계
      })
      .select("id")
      .single();
    if (created)
      await supabase.from("lot_links").insert({ from_lot: l.id, to_lot: created.id, relation: "move" });
    await supabase.from("lots").update({
      locked: true, status: "완료",
      moved_at: new Date().toISOString(),
      moved_to_name: await nameOf(supabase, targetProcessId),
    }).eq("id", l.id);
  }
  revalidatePath(`/process/${sourceProcessId}`);
  revalidatePath(`/process/${targetProcessId}`);
  return { ok: true, moved: lots.length };
}

// ───────── 타부서투입 (Module16): io/검수 입고행 → 다른 io 출고블록 ─────────
//  dest io-out: serial/내역/수량/원중량/비고 그대로, 실중량←원본 중량, 이전파트=원본명
export async function feedToOtherDept(
  sourceProcessId: string,
  targetProcessId: string,
  lotIds: string[],
) {
  if (lotIds.length === 0) return { error: "선택된 행이 없습니다." };
  const supabase = await createClient();
  const { rows: lots, error } = await readUnlocked(supabase, lotIds);
  if (error) return { error: "DB: " + error.message };
  if (lots.length === 0) return { error: "처리 가능한 행이 없습니다." };
  const srcName = await nameOf(supabase, sourceProcessId);

  for (const l of lots) {
    const { data: created } = await supabase
      .from("lots")
      .insert({
        serial: l.serial,
        process_id: targetProcessId,
        side: "out",
        status: "작업중",
        prev_process_id: sourceProcessId,
        prev_part_name: srcName,
        description: l.description,
        qty: l.qty,
        weight: l.weight, // 실중량 ← 원본 중량
        tag: l.tag,
        q: l.q,
        due_date: l.due_date,
        raw_weight: l.raw_weight,
        note: l.note,
        work_date: l.work_date, // 이동 흐름은 원본 작업일 승계
      })
      .select("id")
      .single();
    if (created)
      await supabase.from("lot_links").insert({ from_lot: l.id, to_lot: created.id, relation: "move" });
    await supabase.from("lots").update({
      locked: true, status: "완료",
      moved_at: new Date().toISOString(),
      moved_to_name: await nameOf(supabase, targetProcessId),
    }).eq("id", l.id);
  }
  revalidatePath(`/process/${sourceProcessId}`);
  revalidatePath(`/process/${targetProcessId}`);
  return { ok: true, moved: lots.length };
}

// ───────── 이관 (Module9): work 완료행 → 다른 work 작업중 ─────────
//  dest work-in: serial유지, 중량(K)←작업후, 입중량 비움, 나머지 그대로
export async function relayToWork(
  sourceProcessId: string,
  targetProcessId: string,
  lotIds: string[],
) {
  if (lotIds.length === 0) return { error: "선택된 행이 없습니다." };
  const supabase = await createClient();
  const { rows: lots, error } = await readUnlocked(supabase, lotIds);
  if (error) return { error: "DB: " + error.message };
  if (lots.length === 0) return { error: "처리 가능한 행이 없습니다." };
  const srcName = await nameOf(supabase, sourceProcessId);

  for (const l of lots) {
    const { data: created } = await supabase
      .from("lots")
      .insert({
        serial: l.serial,
        process_id: targetProcessId,
        side: "in",
        status: "작업중",
        prev_process_id: sourceProcessId,
        prev_part_name: partStamp(srcName),
        description: l.description,
        qty: l.qty,
        weight: l.weight, // 중량(K) ← 작업후(Q)
        tag: l.tag,
        q: l.q,
        due_date: l.due_date,
        raw_weight: l.raw_weight,
        note: l.note,
        work_date: l.work_date, // 이동 흐름은 원본 작업일 승계
      })
      .select("id")
      .single();
    if (created)
      await supabase.from("lot_links").insert({ from_lot: l.id, to_lot: created.id, relation: "move" });
    await supabase.from("lots").update({
      locked: true, status: "완료",
      moved_at: new Date().toISOString(),
      moved_to_name: await nameOf(supabase, targetProcessId),
    }).eq("id", l.id);
  }
  revalidatePath(`/process/${sourceProcessId}`);
  revalidatePath(`/process/${targetProcessId}`);
  return { ok: true, moved: lots.length };
}

// ───────── 출고 (Module10, 현장출고/검수출고): work 완료행 → io 출고블록 ─────────
//  dest io-out: 실중량 = 작업후 − Tag − Q − 원중량, 이전파트=원본명
export async function shipToIo(
  sourceProcessId: string,
  targetProcessId: string,
  lotIds: string[],
) {
  if (lotIds.length === 0) return { error: "선택된 행이 없습니다." };
  const supabase = await createClient();
  const { rows: lots, error } = await readUnlocked(supabase, lotIds);
  if (error) return { error: "DB: " + error.message };
  if (lots.length === 0) return { error: "처리 가능한 행이 없습니다." };
  const srcName = await nameOf(supabase, sourceProcessId);

  for (const l of lots) {
    const realWeight = round2(N(l.weight) - N(l.tag) - N(l.q) - N(l.raw_weight)); // 실중량 O = Q−T−U−W
    const { data: created } = await supabase
      .from("lots")
      .insert({
        serial: l.serial,
        process_id: targetProcessId,
        side: "out",
        status: "작업중",
        prev_process_id: sourceProcessId,
        prev_part_name: srcName,
        description: l.description,
        qty: l.qty,
        weight: realWeight || null, // 실중량
        tag: l.tag,
        q: l.q,
        due_date: l.due_date,
        raw_weight: l.raw_weight,
        note: l.note,
        work_date: l.work_date, // 이동 흐름은 원본 작업일 승계
      })
      .select("id")
      .single();
    if (created)
      await supabase.from("lot_links").insert({ from_lot: l.id, to_lot: created.id, relation: "move" });
    await supabase.from("lots").update({
      locked: true, status: "완료",
      moved_at: new Date().toISOString(),
      moved_to_name: await nameOf(supabase, targetProcessId),
    }).eq("id", l.id);
  }
  revalidatePath(`/process/${sourceProcessId}`);
  revalidatePath(`/process/${targetProcessId}`);
  return { ok: true, moved: lots.length };
}

// ───────── 분할 (Module1 확장): 1건 → 사용자가 지정한 수량/중량으로 n건. 원본 삭제 ─────────
//  · 분할 합(수량/중량)은 원본과 동일해야 함(클라이언트에서 강제, 서버에서 재검증)
//  · 일련번호 -1..-n, 내역/납기/비고/이전파트 승계
export async function splitLotCustom(
  processId: string,
  lotId: string,
  parts: { qty: number | null; weight: number | null }[],
) {
  if (parts.length < 2) return { error: "2개 이상으로 나누세요." };
  const supabase = await createClient();
  const { data: lotData } = await supabase
    .from("lots").select("*").eq("id", lotId).eq("locked", false).single();
  if (!lotData) return { error: "처리 가능한 행이 아닙니다." };
  const L = lotData as LotRow;

  // 서버 재검증: 합이 원본과 일치(원본 값이 있을 때만)
  const sumQ = parts.reduce((a, p) => a + (Number(p.qty) || 0), 0);
  const sumW = round2(parts.reduce((a, p) => a + (Number(p.weight) || 0), 0));
  if (L.qty != null && sumQ !== Number(L.qty))
    return { error: `수량 합(${sumQ})이 원본(${L.qty})과 다릅니다.` };
  if (L.weight != null && sumW !== round2(Number(L.weight)))
    return { error: `중량 합(${sumW})이 원본(${L.weight})과 다릅니다.` };

  for (let i = 0; i < parts.length; i++) {
    await supabase.from("lots").insert({
      serial: L.serial ? `${L.serial}-${i + 1}` : null,
      process_id: processId,
      side: L.side,
      status: "작업중",
      prev_process_id: L.prev_process_id,
      prev_part_name: L.prev_part_name,
      description: L.description,
      qty: parts[i].qty,
      weight: parts[i].weight,
      due_date: L.due_date,
      note: L.note,
      work_date: L.work_date, // 분할도 원본 작업일 승계
    });
  }
  // 원본 삭제 (자식 lot_links는 원본 참조 안 함)
  await supabase.from("lots").delete().eq("id", L.id);
  revalidatePath(`/process/${processId}`);
  return { ok: true, parts: parts.length };
}

// ───────── Tag 보정 (Module14): 모달에서 받은 잔여 Tag 수량 → Tag수정/Tag중량/Tag로스 ─────────
//  · 입력=행별 잔여 Tag 수량. Tag수정(V)=수량, Tag중량(W)=ROUNDDOWN(수량×0.035,2), Tag로스(X)=Tag(P)−Tag중량
//  · 출고중량(Y)은 수식 자동(shipWeight): IF(실중량=0,"",IF(Tag로스=0,실중량,실중량+Tag−Tag중량))
export async function tagAdjust(
  processId: string,
  items: { id: string; qty: number }[],
) {
  const targets = (items ?? []).filter((it) => it.id && it.qty != null && !Number.isNaN(it.qty));
  if (targets.length === 0) return { error: "잔여 Tag 수량이 입력된 행이 없습니다." };
  const supabase = await createClient();
  const { data } = await supabase
    .from("lots").select("id, tag").in("id", targets.map((t) => t.id));
  const tagOf = new Map((data ?? []).map((l) => [l.id as string, Number(l.tag) || 0]));
  let n = 0;
  for (const it of targets) {
    if (!tagOf.has(it.id)) continue;
    const tw = Math.floor(it.qty * 0.035 * 100) / 100; // ROUNDDOWN 2자리
    const tl = round2((tagOf.get(it.id) ?? 0) - tw);
    await supabase.from("lots")
      .update({ tag_fixed: it.qty, tag_weight: tw, tag_loss: tl })
      .eq("id", it.id);
    n++;
  }
  revalidatePath(`/process/${processId}`);
  return n === 0 ? { error: "보정할 행이 없습니다." } : { ok: true, adjusted: n };
}

// ───────── Tag 확정 (Module36, 검수 전용): 실중량 있고 Tag중량 비면 Tag중량=Tag ─────────
export async function tagConfirm(processId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("lots").select("id, tag")
    .eq("process_id", processId).eq("side", "out")
    .not("weight", "is", null).is("tag_weight", null).not("tag", "is", null);
  const rows = (data ?? []) as { id: string; tag: number | null }[];
  for (const l of rows) await supabase.from("lots").update({ tag_weight: l.tag }).eq("id", l.id);
  revalidatePath(`/process/${processId}`);
  return { ok: true, filled: rows.length };
}

// ───────── 인라인 수정 (작업후/실중량/Tag류/내역/비고 등) ─────────
export async function updateLot(
  processId: string,
  lotId: string,
  patch: Record<string, number | string | null>,
) {
  const supabase = await createClient();
  const { error } = await supabase.from("lots").update(patch).eq("id", lotId);
  if (error) return { error: error.message };
  revalidatePath(`/process/${processId}`);
  return { ok: true };
}

// ───────── 잠금 해제 (locked 행을 다시 작업 가능 상태로) ─────────
export async function unlockLots(processId: string, lotIds: string[]) {
  if (lotIds.length === 0) return { error: "선택된 행이 없습니다." };
  const supabase = await createClient();
  const { error } = await supabase
    .from("lots")
    .update({ locked: false, status: "작업중", moved_at: null, moved_to_name: null })
    .in("id", lotIds);
  if (error) return { error: error.message };
  revalidatePath(`/process/${processId}`);
  return { ok: true, unlocked: lotIds.length };
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
