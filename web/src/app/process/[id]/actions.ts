"use server";

import { randomUUID } from "node:crypto";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { buildGroupedSerial } from "@/lib/serial";
import { round2, type TraceNode, type TraceEdge, type TraceResult, type LotRelation } from "@/lib/types";
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
//  서버는 UTC라 KST(+9h)로 환산해서 문자열 생성(이 값은 텍스트로 저장·표시되므로 생성 시점에 KST여야 함).
function partStamp(name: string | null) {
  if (!name) return null;
  const d = new Date(Date.now() + 9 * 3600 * 1000); // KST
  const hh = String(d.getUTCHours()).padStart(2, "0");
  const mm = String(d.getUTCMinutes()).padStart(2, "0");
  return `${name} ${d.getUTCDate()} ${hh}:${mm}`;
}
async function schemaOf(supabase: Awaited<ReturnType<typeof createClient>>, id: string) {
  const { data } = await supabase.from("processes").select("schema_type").eq("id", id).single();
  return (data?.schema_type as string | undefined) ?? null;
}
// 동시작업 안전장치: 선택 행을 '먼저 조건부 잠금(locked=false인 것만)'으로 점유하고, 실제 점유한 행만 반환.
//  · 두 기기가 같은 행을 동시에 처리해도 한쪽만 점유 → 이중 집계/이중 이관 차단.
//  · patch = 흐름별 점유 상태값(완료+잠금, 이관이면 moved_* 포함). undo = 중단/실패 시 원복할 값.
async function claimUnlocked(
  supabase: Awaited<ReturnType<typeof createClient>>,
  lotIds: string[],
  patch: Record<string, unknown>,
) {
  const { data, error } = await supabase
    .from("lots").update(patch).eq("locked", false).in("id", lotIds).select("*");
  return { rows: (data ?? []) as LotRow[], error };
}

// 중단/실패 시 점유 해제(원복) — 이중 처리 차단으로 일부만 점유됐거나 후속 insert가 실패한 경우.
async function releaseClaim(
  supabase: Awaited<ReturnType<typeof createClient>>,
  rows: LotRow[],
  undo: Record<string, unknown>,
) {
  if (rows.length === 0) return;
  await supabase.from("lots").update(undo).in("id", rows.map((l) => l.id));
}

const STALE_MSG = "선택한 행 중 일부가 다른 기기에서 먼저 처리되었습니다. 새로고침 후 다시 시도하세요.";

// ───────── 보내기 (작성 → io 입고/출고): Module2 AskInboundMode ─────────
//  · 입고(side=in, A:I): 일련번호 최초 생성(약자_YYMMDD_001)
//  · 출고(side=out, L:U): 일련번호 없음(엑셀 L열 "신규"), 중량→실중량(O) 매핑
export async function sendRows(
  sourceProcessId: string,
  targetProcessId: string,
  rows: EntryRow[],
  side: "in" | "out" = "in",
) {
  const supabase = await createClient();
  const valid = rows.filter((r) => r.description?.trim() || r.qty || r.weight || r.tag);
  if (valid.length === 0) return { error: "입력된 행이 없습니다." };

  const wd = await getWorkDate(); // 새 입력은 현재 작업일에 귀속
  const row = (r: EntryRow, serial: string | null) => ({
    serial,
    process_id: targetProcessId,
    side,
    status: "작업중",
    prev_process_id: sourceProcessId,
    description: toStr(r.description),
    qty: toNum(r.qty),
    weight: toNum(r.weight), // 입고=중량(D) / 출고=실중량(O)
    tag: toNum(r.tag),
    q: toNum(r.q),
    due_date: toStr(r.due_date),
    raw_weight: toStr(r.raw_weight), // 원중량 = 자유 텍스트
    note: toStr(r.note),
    work_date: wd,
  });

  // 출고: 일련번호 발번 없이 바로 삽입(엑셀은 L열 "신규" 표기, 번호 생성 안 함)
  if (side === "out") {
    const { error } = await supabase.from("lots").insert(valid.map((r) => row(r, null)));
    if (error) return { error: error.message };
    revalidatePath(`/process/${targetProcessId}`);
    return { ok: true, sent: valid.length };
  }

  // 빠른 경로: 일련번호 N개를 1콜로 발번 (next_serials RPC, migration 0012).
  //  PostgREST의 setof text 응답 형태(스칼라 배열 ["S1",..] / 객체 배열 [{...:"S1"},..]) 모두 수용.
  const { data: rpcData, error: berr } = await supabase.rpc("next_serials", {
    p_process_id: targetProcessId, p_count: valid.length,
  });
  let serials: string[] | null = null;
  if (!berr && Array.isArray(rpcData) && rpcData.length === valid.length) {
    const arr = rpcData.map((d: unknown) =>
      typeof d === "string" ? d
        : d && typeof d === "object" ? Object.values(d as Record<string, unknown>)[0]
          : null,
    );
    if (arr.every((s): s is string => typeof s === "string" && s.length > 0)) serials = arr;
  }
  if (serials) {
    const { error } = await supabase.from("lots").insert(valid.map((r, i) => row(r, serials![i])));
    if (error) return { error: error.message };
  } else {
    // 폴백: RPC 미적용/형태 불일치 — 기존 단건 발번(행 사이 insert로 순번 증가) 유지
    for (const r of valid) {
      const { data: serial, error: serr } = await supabase.rpc("next_serial", { p_process_id: targetProcessId });
      if (serr) return { error: serr.message };
      const { error } = await supabase.from("lots").insert(row(r, serial as string));
      if (error) return { error: error.message };
    }
  }
  revalidatePath(`/process/${targetProcessId}`);
  return { ok: true, sent: valid.length };
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

  // 1) 먼저 점유(완료+잠금) — 동시/중복 작업완료 차단. 실제로 내가 잠근 행만 반환.
  const COMPLETE_UNDO = { status: "작업중", locked: false, completed_at: null };
  const { rows: lots, error } = await claimUnlocked(supabase, lotIds, {
    status: "완료", locked: true, completed_at: new Date().toISOString(),
  });
  if (error) return { error: "DB: " + error.message };
  if (lots.length === 0) return { error: "처리 가능한 행이 없습니다." };
  if (lots.length !== lotIds.length) {
    await releaseClaim(supabase, lots, COMPLETE_UNDO); // 일부만 점유 → 이중 집계 방지 위해 원복 후 중단
    return { error: STALE_MSG };
  }

  // 2) 점유분으로 집계 출력행 생성
  const serial = buildGroupedSerial(lots.map((l) => l.serial));
  const outId = randomUUID(); // id를 직접 부여 → 읽기-후-삽입 없이 lot_links 일괄 생성
  const { error: insErr } = await supabase
    .from("lots")
    .insert({
      id: outId,
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
    });
  if (insErr) {
    await releaseClaim(supabase, lots, COMPLETE_UNDO); // 출력행 생성 실패 → 점유 원복
    return { error: "완료행 생성 실패: " + insErr.message };
  }

  const lk = await supabase.from("lot_links")
    .insert(lots.map((l) => ({ from_lot: l.id, to_lot: outId, relation: "merge" })));
  if (lk.error) return { error: lk.error.message };
  revalidatePath(`/process/${processId}`);
  return { ok: true, merged: lots.length, serial };
}

// ───────── 이동류 공통 (투입·타부서투입·이관·출고): N+1 제거 ─────────
//  · 새 행 id를 직접 부여 → 읽기-후-삽입 없이 lot_links 일괄 생성
//  · 파트명 조회 2건(원본·대상)만 선조회, 그 뒤 insert/lot_links/원본잠금은 각 1콜(.in)
//  · build(l, srcName): 흐름별 행 매핑(serial/side/중량 등). 공통필드(id/대상/상태/작업일)는 여기서 주입
type MoveBuild = (l: LotRow, srcName: string | null) => Record<string, unknown>;
async function moveLots(
  supabase: Awaited<ReturnType<typeof createClient>>,
  sourceProcessId: string,
  targetProcessId: string,
  lotIds: string[],
  build: MoveBuild,
) {
  if (lotIds.length === 0) return { error: "선택된 행이 없습니다." };
  const [srcName, tgtName] = await Promise.all([
    nameOf(supabase, sourceProcessId),
    nameOf(supabase, targetProcessId),
  ]);
  const now = new Date().toISOString();

  // 1) 먼저 점유(완료+잠금+이동표시) — 동시/중복 이동 차단. 실제로 내가 잠근 행만 반환.
  const MOVE_UNDO = { locked: false, status: "작업중", moved_at: null, moved_to_name: null };
  const { rows: lots, error } = await claimUnlocked(supabase, lotIds, {
    locked: true, status: "완료", moved_at: now, moved_to_name: tgtName,
  });
  if (error) return { error: "DB: " + error.message };
  if (lots.length === 0) return { error: "처리 가능한 행이 없습니다." };
  if (lots.length !== lotIds.length) {
    await releaseClaim(supabase, lots, MOVE_UNDO); // 일부만 점유 → 이중 이동 방지 위해 원복 후 중단
    return { error: STALE_MSG };
  }

  // 2) 점유분으로 대상 공정 행 생성
  const newLots = lots.map((l) => ({
    id: randomUUID(),
    process_id: targetProcessId,
    status: "작업중",
    prev_process_id: sourceProcessId,
    work_date: l.work_date, // 이동 흐름은 원본 작업일 승계
    ...build(l, srcName),
  }));
  const ins = await supabase.from("lots").insert(newLots);
  if (ins.error) {
    await releaseClaim(supabase, lots, MOVE_UNDO); // 대상행 생성 실패 → 점유 원복
    return { error: ins.error.message };
  }

  const lk = await supabase.from("lot_links").insert(
    lots.map((l, i) => ({ from_lot: l.id, to_lot: newLots[i].id, relation: "move" })),
  );
  if (lk.error) return { error: lk.error.message };
  revalidatePath(`/process/${sourceProcessId}`);
  revalidatePath(`/process/${targetProcessId}`);
  return { ok: true, moved: lots.length };
}

// ───────── 투입 (Module4): io/검수 입고행 → work 작업중 ─────────
//  dest: serial유지, 입중량←중량, 수량/Tag/Q/납기/원중량/비고 그대로,
//        중량(K) = 원본 중량+Tag+Q+원중량 합(VBA D+E+F+H), 이전파트=원본명
export async function feedToWork(
  sourceProcessId: string,
  targetProcessId: string,
  lotIds: string[],
) {
  const supabase = await createClient();
  return moveLots(supabase, sourceProcessId, targetProcessId, lotIds, (l, srcName) => ({
    serial: l.serial,
    side: "in",
    prev_part_name: partStamp(srcName),
    description: l.description,
    qty: l.qty,
    weight_in: l.weight, // 입중량 ← 원본 중량
    weight: round2(N(l.weight) + N(l.tag) + N(l.q) + N(l.raw_weight)) || null, // 중량(K)=D+E+F+H
    tag: l.tag, q: l.q, due_date: l.due_date, raw_weight: l.raw_weight, note: l.note,
  }));
}

// ───────── 타부서투입 (Module16): io/검수 입고행 → 다른 io 출고블록 ─────────
//  dest io-out: serial/내역/수량/원중량/비고 그대로, 실중량←원본 중량, 이전파트=원본명
export async function feedToOtherDept(
  sourceProcessId: string,
  targetProcessId: string,
  lotIds: string[],
) {
  const supabase = await createClient();
  return moveLots(supabase, sourceProcessId, targetProcessId, lotIds, (l, srcName) => ({
    serial: l.serial,
    side: "out",
    prev_part_name: srcName,
    description: l.description,
    qty: l.qty,
    weight: l.weight, // 실중량 ← 원본 중량
    tag: l.tag, q: l.q, due_date: l.due_date, raw_weight: l.raw_weight, note: l.note,
  }));
}

// ───────── 이관 (Module9): work 완료행 → 다른 work 작업중 ─────────
//  dest work-in: serial유지, 중량(K)←작업후, 입중량 비움, 나머지 그대로
export async function relayToWork(
  sourceProcessId: string,
  targetProcessId: string,
  lotIds: string[],
) {
  const supabase = await createClient();
  return moveLots(supabase, sourceProcessId, targetProcessId, lotIds, (l, srcName) => ({
    serial: l.serial,
    side: "in",
    prev_part_name: partStamp(srcName),
    description: l.description,
    qty: l.qty,
    weight: l.weight, // 중량(K) ← 작업후(Q)
    tag: l.tag, q: l.q, due_date: l.due_date, raw_weight: l.raw_weight, note: l.note,
  }));
}

// ───────── 출고 (Module10, 현장출고/검수출고): work 완료행 → io 출고블록 ─────────
//  dest io-out: 실중량 = 작업후 − Tag − Q − 원중량, 이전파트=원본명
export async function shipToIo(
  sourceProcessId: string,
  targetProcessId: string,
  lotIds: string[],
) {
  const supabase = await createClient();
  return moveLots(supabase, sourceProcessId, targetProcessId, lotIds, (l, srcName) => ({
    serial: l.serial,
    side: "out",
    prev_part_name: srcName,
    description: l.description,
    qty: l.qty,
    weight: round2(N(l.weight) - N(l.tag) - N(l.q) - N(l.raw_weight)) || null, // 실중량 O = Q−T−U−W
    tag: l.tag, q: l.q, due_date: l.due_date, raw_weight: l.raw_weight, note: l.note,
  }));
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

  // 원본을 먼저 점유(조건부 잠금) — 동시 분할 차단. 못 잠그면 이미 다른 기기에서 처리/삭제됨.
  const { data: claimed } = await supabase
    .from("lots").update({ locked: true }).eq("id", lotId).eq("locked", false).select("*").maybeSingle();
  if (!claimed) return { error: "처리 가능한 행이 아닙니다(다른 기기에서 먼저 처리됨). 새로고침 후 다시 시도하세요." };
  const L = claimed as LotRow;
  const unlockParent = () => supabase.from("lots").update({ locked: false }).eq("id", lotId);

  // 서버 재검증: 합이 원본과 일치(원본 값이 있을 때만). 어긋나면 점유 원복 후 중단.
  const sumQ = parts.reduce((a, p) => a + (Number(p.qty) || 0), 0);
  const sumW = round2(parts.reduce((a, p) => a + (Number(p.weight) || 0), 0));
  if (L.qty != null && sumQ !== Number(L.qty)) {
    await unlockParent();
    return { error: `수량 합(${sumQ})이 원본(${L.qty})과 다릅니다.` };
  }
  if (L.weight != null && sumW !== round2(Number(L.weight))) {
    await unlockParent();
    return { error: `중량 합(${sumW})이 원본(${L.weight})과 다릅니다.` };
  }

  // 계보(Option A): 원본의 부모(이전 공정) 링크를 찾아 자식들을 그 부모에 'split'로 직접 연결.
  //  원본은 계속 삭제(회계=대시보드 입고/오차 무변), 대신 자식이 이전 공정 계보를 이어받음.
  const { data: parentLinks } = await supabase
    .from("lot_links").select("from_lot").eq("to_lot", L.id);
  const parents = [...new Set((parentLinks ?? []).map((e) => e.from_lot as string))];

  // 자식 행(id 직접 부여 → lot_links 일괄 생성). 일련번호 -1..-n, 내역/납기/비고/이전파트 승계.
  const childIds = parts.map(() => randomUUID());
  const childRows = parts.map((p, i) => ({
    id: childIds[i],
    serial: L.serial ? `${L.serial}-${i + 1}` : null,
    process_id: processId,
    side: L.side,
    status: "작업중",
    prev_process_id: L.prev_process_id,
    prev_part_name: L.prev_part_name,
    description: L.description,
    qty: p.qty,
    weight: p.weight,
    due_date: L.due_date,
    note: L.note,
    work_date: L.work_date, // 분할도 원본 작업일 승계
  }));
  const ins = await supabase.from("lots").insert(childRows);
  if (ins.error) {
    await unlockParent(); // 자식행 생성 실패 → 원본 점유 원복
    return { error: ins.error.message };
  }

  // 부모 → 각 자식 'split' 링크(부모 있을 때만 — 출처행이면 이전 이력 없어 생략).
  if (parents.length > 0) {
    const links = parents.flatMap((pid) =>
      childIds.map((cid) => ({ from_lot: pid, to_lot: cid, relation: "split" as const })));
    const lk = await supabase.from("lot_links").insert(links);
    if (lk.error) return { error: lk.error.message };
  }
  // 원본 삭제 — 원본의 기존 링크(부모→원본)는 on delete cascade로 정리(부모→자식 링크는 유지).
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
  const valid = targets.filter((it) => tagOf.has(it.id));
  if (valid.length === 0) return { error: "보정할 행이 없습니다." };
  // 행마다 값(잔여수량)이 달라 단일 .in() 불가 → 병렬 실행으로 라운드트립을 1회 수준으로
  const results = await Promise.all(valid.map((it) => {
    const tw = Math.floor(it.qty * 0.035 * 100) / 100; // ROUNDDOWN 2자리
    const tl = round2((tagOf.get(it.id) ?? 0) - tw);
    return supabase.from("lots")
      .update({ tag_fixed: it.qty, tag_weight: tw, tag_loss: tl })
      .eq("id", it.id);
  }));
  const err = results.find((r) => r.error)?.error;
  if (err) return { error: err.message };
  revalidatePath(`/process/${processId}`);
  return { ok: true, adjusted: valid.length };
}

// ───────── Tag 확정 (Module36, 검수 전용): 실중량 있고 Tag중량 비면 Tag중량=Tag ─────────
export async function tagConfirm(processId: string) {
  const supabase = await createClient();
  const { data } = await supabase
    .from("lots").select("id, tag")
    .eq("process_id", processId).eq("side", "out")
    .not("weight", "is", null).is("tag_weight", null).not("tag", "is", null);
  const rows = (data ?? []) as { id: string; tag: number | null }[];
  // 값(Tag)이 행마다 달라 단일 update 불가 → 병렬 실행
  const results = await Promise.all(
    rows.map((l) => supabase.from("lots").update({ tag_weight: l.tag }).eq("id", l.id)),
  );
  const err = results.find((r) => r.error)?.error;
  if (err) return { error: err.message };
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

// ───────── 계보 추적: 한 행이 거쳐온/거쳐갈 전 공정 경로 ─────────
//  lot_links(move/merge/split)를 양방향 BFS로 따라가 연결된 모든 lot + 관계를 수집.
//  · 분할(splitLotCustom)은 원본을 삭제하므로 그 지점에서 계보가 끊김(현재 사양).
export async function traceLot(lotId: string): Promise<{ error?: string } & Partial<TraceResult>> {
  if (!lotId) return { error: "행이 지정되지 않았습니다." };
  const supabase = await createClient();

  const visited = new Set<string>([lotId]);
  const edgeMap = new Map<string, TraceEdge>();
  let frontier = [lotId];
  let guard = 0;
  while (frontier.length && guard++ < 100) {
    const [fwd, bwd] = await Promise.all([
      supabase.from("lot_links").select("from_lot, to_lot, relation").in("from_lot", frontier),
      supabase.from("lot_links").select("from_lot, to_lot, relation").in("to_lot", frontier),
    ]);
    if (fwd.error) return { error: fwd.error.message };
    if (bwd.error) return { error: bwd.error.message };
    const next: string[] = [];
    for (const lk of [...(fwd.data ?? []), ...(bwd.data ?? [])]) {
      const from = lk.from_lot as string, to = lk.to_lot as string;
      const key = `${from}->${to}`;
      if (!edgeMap.has(key)) edgeMap.set(key, { from, to, relation: lk.relation as LotRelation });
      for (const id of [from, to]) if (!visited.has(id)) { visited.add(id); next.push(id); }
    }
    frontier = next;
  }

  const { data: lotData, error } = await supabase
    .from("lots")
    .select("id, serial, side, description, qty, weight, weight_before, created_at, moved_at, locked, process_id")
    .in("id", [...visited]);
  if (error) return { error: error.message };

  const procIds = [...new Set((lotData ?? []).map((l) => l.process_id as string))];
  const { data: procData } = await supabase
    .from("processes").select("id, name, karat, schema_type").in("id", procIds);
  const procMap = new Map((procData ?? []).map((p) => [p.id as string, p]));

  const nodes: TraceNode[] = (lotData ?? []).map((l) => {
    const p = procMap.get(l.process_id as string);
    return {
      id: l.id as string,
      serial: l.serial as string | null,
      side: l.side as "in" | "out",
      description: l.description as string | null,
      qty: l.qty as number | null,
      weight: l.weight as number | null,
      weight_before: l.weight_before as number | null,
      created_at: l.created_at as string,
      moved_at: l.moved_at as string | null,
      locked: l.locked as boolean,
      process_id: l.process_id as string,
      process_name: (p?.name as string | undefined) ?? "(알 수 없음)",
      karat: (p?.karat as "18K" | "14K" | null) ?? null,
      schema_type: (p?.schema_type as TraceNode["schema_type"]) ?? "io",
    };
  });

  return { nodes, edges: [...edgeMap.values()], rootId: lotId };
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
