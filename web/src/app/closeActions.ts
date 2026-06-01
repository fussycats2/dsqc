"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { round2 } from "@/lib/types";

// ────────────────────────────────────────────────────────────────────────
//  일마감 (작업일 모델). docs: memory dsqc-daily-close
//   · 마감일(source)의 현황을 스냅샷으로 박제(periods.snapshot)
//   · 공정 미작업 재고를 이월날짜(carry)로 **복사**(원래 날짜에도 남김)
//   · 이월날짜에 공정 미작업이 이미 있으면 덮어쓰기(확인 후 삭제 뒤 복사)
//   · 부서·검수는 손대지 않음
// ────────────────────────────────────────────────────────────────────────

type ProcRow = { id: string; schema_type: string; is_inspection: boolean; karat: string | null; name: string; sort_order: number };
type LotRow = Record<string, unknown> & { id: string; process_id: string; side: string; weight: number | null; weight_before: number | null; locked: boolean };

const N = (v: unknown) => Number(v) || 0;

// 복사 이월 시 그대로 옮길 필드(식별/타임스탬프 제외)
const COPY_FIELDS = [
  "serial", "process_id", "side", "description", "qty", "weight", "weight_in", "weight_before",
  "tag", "tag_fixed", "tag_weight", "tag_loss", "q", "due_date", "raw_weight", "note",
  "prev_process_id", "prev_part_name", "moved_at", "moved_to_name", "status",
] as const;

// 마감 시점 현황(대시보드 집계)을 스냅샷 객체로
function buildSnapshot(lots: LotRow[], procs: ProcRow[], date: string) {
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
      return { process_id: p.id, name: p.name, karat: p.karat, kind, inW: round2(a.inW), stock: round2(a.stock), outW: round2(a.outW), lossW: round2(a.lossW) };
    })
    .filter((r) => r.inW || r.outW || r.stock);
  return { date, rows };
}

async function saveSnapshot(
  supabase: Awaited<ReturnType<typeof createClient>>,
  date: string,
  snapshot: ReturnType<typeof buildSnapshot>,
) {
  const now = new Date().toISOString();
  const { data: ex } = await supabase.from("periods").select("id").eq("kind", "day").eq("label", date).maybeSingle();
  if (ex) await supabase.from("periods").update({ snapshot, status: "closed", closed_at: now }).eq("id", ex.id);
  else await supabase.from("periods").insert({ label: date, kind: "day", status: "closed", closed_at: now, snapshot });
}

export async function closeDay(sourceDate: string, carryDate: string) {
  if (!sourceDate || !carryDate) return { error: "마감일과 이월 날짜를 선택하세요." };
  if (sourceDate === carryDate) return { error: "이월 날짜는 마감일과 달라야 합니다." };
  const supabase = await createClient();

  const { data: procData } = await supabase
    .from("processes").select("id, schema_type, is_inspection, karat, name, sort_order").order("sort_order");
  const procs = (procData ?? []) as ProcRow[];
  const workIds = procs.filter((p) => p.schema_type === "work").map((p) => p.id);

  // 마감일 전체 → 스냅샷
  const { data: srcAll } = await supabase
    .from("lots").select("id, process_id, side, weight, weight_before, locked").eq("work_date", sourceDate);
  const snapshot = buildSnapshot((srcAll ?? []) as LotRow[], procs, sourceDate);

  // 마감일 공정 미작업(복사 대상)
  const { data: carryData } = await supabase
    .from("lots").select("*").eq("work_date", sourceDate).eq("side", "in").eq("locked", false).in("process_id", workIds);
  const carryLots = (carryData ?? []) as LotRow[];

  if (carryLots.length === 0) {
    await saveSnapshot(supabase, sourceDate, snapshot);
    revalidatePath("/", "layout");
    return { ok: true, carried: 0, snapshotOnly: true, date: sourceDate };
  }

  // 이월날짜에 이미 공정 미작업이 있으면 덮어쓰지 않고 취소(데이터 이동·삭제 후 재시도 안내)
  const { data: existing } = await supabase
    .from("lots").select("id").eq("work_date", carryDate).eq("side", "in").eq("locked", false).in("process_id", workIds);
  if (existing && existing.length > 0) {
    return { blocked: true, existing: existing.length, carryDate };
  }

  // 복사 이월(원래 날짜엔 그대로 남음)
  const rows = carryLots.map((l) => {
    const o: Record<string, unknown> = {};
    for (const f of COPY_FIELDS) o[f] = l[f];
    o.locked = false;
    o.work_date = carryDate;
    o.period_id = null;
    return o;
  });
  const { error: insErr } = await supabase.from("lots").insert(rows);
  if (insErr) return { error: "이월 복사 실패: " + insErr.message };

  await saveSnapshot(supabase, sourceDate, snapshot);
  revalidatePath("/", "layout");
  return { ok: true, carried: rows.length, carryDate, date: sourceDate };
}

// 한 작업일의 데이터 전체를 다른 날짜로 변경(이월일 재조정 + 스냅샷 날짜 변경 겸용)
//  · 옮길 날짜(to)의 기존 데이터는 덮어씀(삭제 후 이동)
//  · lots.work_date 일괄 변경 + 해당 day period(스냅샷) label도 변경
export async function moveDate(fromDate: string, toDate: string) {
  if (!fromDate || !toDate) return { error: "날짜를 선택하세요." };
  if (fromDate === toDate) return { error: "같은 날짜입니다." };
  const supabase = await createClient();

  // 옮길 날짜에 기존 데이터(또는 스냅샷)가 있으면 덮어쓰지 않고 취소
  const { data: exLots } = await supabase
    .from("lots").select("id").eq("work_date", toDate);
  const { data: exPer } = await supabase
    .from("periods").select("id").eq("kind", "day").eq("label", toDate).maybeSingle();
  if ((exLots && exLots.length > 0) || exPer) {
    return { blocked: true, existing: exLots?.length ?? 0, toDate };
  }

  const { error, count } = await supabase
    .from("lots").update({ work_date: toDate }, { count: "exact" }).eq("work_date", fromDate);
  if (error) return { error: "날짜 변경 실패: " + error.message };

  // 스냅샷(day period) label도 함께 이동(있으면)
  await supabase.from("periods").update({ label: toDate }).eq("kind", "day").eq("label", fromDate);

  revalidatePath("/", "layout");
  return { ok: true, moved: count ?? 0, fromDate, toDate };
}
