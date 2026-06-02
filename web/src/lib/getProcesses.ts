import { cache } from "react";
import { createClient } from "@/lib/supabase/server";
import type { Process } from "@/lib/types";

export function envMissing() {
  return (
    !process.env.NEXT_PUBLIC_SUPABASE_URL ||
    !process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY ||
    process.env.NEXT_PUBLIC_SUPABASE_URL.includes("YOUR_PROJECT")
  );
}

// 공정 마스터(40행)는 런타임에 거의 안 바뀜 → 워밍된 서버 인스턴스에서 재조회 회피.
//  · React cache(): 동일 요청 안에서 레이아웃(TabBar)·페이지가 공유 → 요청당 1회.
//  · 모듈 캐시(TTL): 요청 간에도 재사용 → 매 페이지 로드의 Supabase 왕복 1건 제거.
//    (unstable_cache는 콜백 내부에서 cookies() 접근 불가 → 결과만 메모리에 보관하는 방식 사용.
//     캐시 적중 경로는 supabase/cookies를 안 건드림. 미스 경로만 정상 요청 스코프에서 조회.)
const TTL_MS = 5 * 60 * 1000;
let memo: { data: Process[]; at: number } | null = null;

export const getProcesses = cache(async (): Promise<Process[]> => {
  if (envMissing()) return [];
  if (memo && Date.now() - memo.at < TTL_MS) return memo.data;
  const supabase = await createClient();
  const { data } = await supabase
    .from("processes")
    .select("*")
    .order("sort_order");
  const rows = (data ?? []) as Process[];
  if (rows.length) memo = { data: rows, at: Date.now() }; // 빈 결과(미인증 등)는 캐시 안 함
  return rows;
});
