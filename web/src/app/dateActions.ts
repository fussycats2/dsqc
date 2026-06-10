"use server";

import { createClient } from "@/lib/supabase/server";
import { envMissing } from "@/lib/getProcesses";

// 달력 강조용: [from, to] 기간 안에서 데이터가 존재하는 작업일(distinct) 목록.
//  · lots(공정검수 입력)·settlements(결산서) 어느 쪽이든 행이 있으면 "데이터 있는 날".
//  · DB의 dates_with_data RPC(0015)로 distinct를 처리 — 행을 통째로 받으면 PostgREST
//    최대 행수(1000)에 잘려 데이터 많은 달엔 일부 날짜가 누락된다(실제 발생했던 버그).
export async function datesWithData(from: string, to: string): Promise<string[]> {
  if (envMissing()) return [];
  const supabase = await createClient();
  const { data, error } = await supabase.rpc("dates_with_data", {
    p_from: from,
    p_to: to,
  });
  if (error || !data) return [];
  return data as string[];
}
