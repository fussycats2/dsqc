"use server";

import { createClient } from "@/lib/supabase/server";
import { envMissing } from "@/lib/getProcesses";

// 달력 강조용: [from, to] 기간 안에서 데이터가 존재하는 작업일(distinct) 목록.
//  · lots(공정검수 입력)·settlements(결산서) 어느 쪽이든 행이 있으면 "데이터 있는 날".
//  · work_date 인덱스(lots_work_date_idx, settlements PK)로 월 범위 스캔이 가볍다.
//  · PostgREST엔 DISTINCT가 없어 행을 받아 JS에서 중복 제거(월 단위라 양이 작음).
//    추후 데이터가 커지면 distinct RPC로 옮길 수 있음.
export async function datesWithData(from: string, to: string): Promise<string[]> {
  if (envMissing()) return [];
  const supabase = await createClient();
  const [lots, settlements] = await Promise.all([
    supabase
      .from("lots")
      .select("work_date")
      .gte("work_date", from)
      .lte("work_date", to)
      .not("work_date", "is", null),
    supabase
      .from("settlements")
      .select("work_date")
      .gte("work_date", from)
      .lte("work_date", to),
  ]);
  const days = new Set<string>();
  for (const row of (lots.data ?? []) as { work_date: string }[])
    days.add(row.work_date);
  for (const row of (settlements.data ?? []) as { work_date: string }[])
    days.add(row.work_date);
  return Array.from(days);
}
