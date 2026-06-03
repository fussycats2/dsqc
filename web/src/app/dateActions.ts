"use server";

import { createClient } from "@/lib/supabase/server";
import { envMissing } from "@/lib/getProcesses";

// 달력 강조용: [from, to] 기간 안에서 lots 데이터가 존재하는 작업일(distinct) 목록.
//  · work_date 단독 인덱스(lots_work_date_idx)로 월 범위 스캔이 가볍다.
//  · PostgREST엔 DISTINCT가 없어 행을 받아 JS에서 중복 제거(월 단위라 양이 작음).
//    추후 데이터가 커지면 distinct RPC로 옮길 수 있음.
export async function datesWithData(from: string, to: string): Promise<string[]> {
  if (envMissing()) return [];
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("lots")
    .select("work_date")
    .gte("work_date", from)
    .lte("work_date", to)
    .not("work_date", "is", null);
  if (error || !data) return [];
  return Array.from(
    new Set((data as { work_date: string }[]).map((r) => r.work_date)),
  );
}
