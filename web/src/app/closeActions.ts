"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { round2 } from "@/lib/types";

// ────────────────────────────────────────────────────────────────────────
//  일마감 (엑셀 Module18 → period 태깅 방식). docs: memory dsqc-daily-close
//   · 스냅샷=마감일(오늘) period에 저장 · 공정 완료분→마감 period(숨김)
//   · 공정 미작업 재고→다음 영업일 open period(이월) · 부서/검수는 손대지 않음
// ────────────────────────────────────────────────────────────────────────

type ProcRow = { id: string; schema_type: string; is_inspection: boolean; karat: string | null; name: string; sort_order: number };
type LotRow = { id: string; process_id: string; side: string; weight: number | null; weight_before: number | null; locked: boolean; period_id: string | null };

const N = (v: unknown) => Number(v) || 0;
const todayISO = () => new Date().toISOString().slice(0, 10);

// 마감 시점 현황(대시보드 집계)을 스냅샷 객체로
function buildSnapshot(lots: LotRow[], procs: ProcRow[], date: string) {
  const pmap = new Map(procs.map((p) => [p.id, p]));
  const agg = new Map<string, { inW: number; outW: number; stock: number; lossW: number }>();
  for (const l of lots) {
    let a = agg.get(l.process_id);
    if (!a) { a = { inW: 0, outW: 0, stock: 0, lossW: 0 }; agg.set(l.process_id, a); }
    const w = N(l.weight);
    if (l.side === "in") { a.inW += w; if (!l.locked) a.stock += w; }
    else { a.outW += w; a.lossW += N(l.weight_before) - w; }
  }
  const rows = procs
    .filter((p) => p.schema_type !== "entry")
    .map((p) => {
      const a = agg.get(p.id) ?? { inW: 0, outW: 0, stock: 0, lossW: 0 };
      const kind = p.schema_type === "work" ? "공정" : p.is_inspection ? "검수" : "부서";
      return {
        process_id: p.id, name: p.name, karat: p.karat, kind,
        inW: round2(a.inW), stock: round2(a.stock), outW: round2(a.outW), lossW: round2(a.lossW),
      };
    })
    .filter((r) => r.inW || r.outW || r.stock); // 값 있는 공정만
  return { date, rows };
}

// 활성(마감 안 된) lot 조회: period_id가 null 또는 열린 day period
async function fetchActive(
  supabase: Awaited<ReturnType<typeof createClient>>,
  openIds: string[],
) {
  let q = supabase
    .from("lots")
    .select("id, process_id, side, weight, weight_before, locked, period_id");
  q = openIds.length
    ? q.or(`period_id.is.null,period_id.in.(${openIds.join(",")})`)
    : q.is("period_id", null);
  const { data } = await q;
  return (data ?? []) as LotRow[];
}

export async function closeDay(carryDate: string) {
  if (!carryDate) return { error: "이월 날짜를 선택하세요." };
  const supabase = await createClient();

  const { data: procData } = await supabase
    .from("processes").select("id, schema_type, is_inspection, karat, name, sort_order").order("sort_order");
  const procs = (procData ?? []) as ProcRow[];
  const workIds = new Set(procs.filter((p) => p.schema_type === "work").map((p) => p.id));

  const { data: openData } = await supabase
    .from("periods").select("id").eq("status", "open").eq("kind", "day");
  const openIds = (openData ?? []).map((p) => p.id as string);

  const lots = await fetchActive(supabase, openIds);
  const today = todayISO();
  const snapshot = buildSnapshot(lots, procs, today);

  // 마감일 closed period(스냅샷) + 이월 open period 생성
  const now = new Date().toISOString();
  const { data: closedP, error: e1 } = await supabase
    .from("periods").insert({ label: today, kind: "day", status: "closed", closed_at: now, snapshot })
    .select("id").single();
  if (e1 || !closedP) return { error: "마감 period 생성 실패: " + (e1?.message ?? "") };
  const { data: openP, error: e2 } = await supabase
    .from("periods").insert({ label: carryDate, kind: "day", status: "open" })
    .select("id").single();
  if (e2 || !openP) return { error: "이월 period 생성 실패: " + (e2?.message ?? "") };

  // 공정(work) 활성 lot 분류: 완료→마감 period(숨김), 미작업 재고→이월 open period
  const work = lots.filter((l) => workIds.has(l.process_id));
  const completed = work.filter((l) => l.side === "out" || (l.side === "in" && l.locked)).map((l) => l.id);
  const carried = work.filter((l) => l.side === "in" && !l.locked).map((l) => l.id);
  if (completed.length) await supabase.from("lots").update({ period_id: closedP.id }).in("id", completed);
  if (carried.length) await supabase.from("lots").update({ period_id: openP.id }).in("id", carried);

  // 이전 열린 day period들 정리(부서/검수는 period_id null이라 영향 없음)
  if (openIds.length)
    await supabase.from("periods").update({ status: "closed", closed_at: now }).in("id", openIds);

  revalidatePath("/", "layout");
  return { ok: true, date: today, carryDate, completed: completed.length, carried: carried.length };
}

// 이월(열린 day period) 날짜를 다른 날짜로 변경 — 휴일 등으로 날짜가 바뀔 때
export async function rescheduleCarry(newDate: string) {
  if (!newDate) return { error: "옮길 날짜를 선택하세요." };
  const supabase = await createClient();
  const { data: openP } = await supabase
    .from("periods").select("id").eq("status", "open").eq("kind", "day")
    .order("opened_at", { ascending: false }).limit(1).maybeSingle();
  if (!openP) return { error: "이월된(열린) 마감이 없습니다." };
  await supabase.from("periods").update({ label: newDate }).eq("id", openP.id);
  revalidatePath("/", "layout");
  return { ok: true, newDate };
}
