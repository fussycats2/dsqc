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

// React cache: 동일 요청(렌더) 안에서 레이아웃(TabBar)·페이지가 공정목록을 공유 → 중복 조회 제거.
// 공정 구성은 거의 바뀌지 않아 요청 단위 캐시로 충분(요청마다 1회만 조회).
export const getProcesses = cache(async (): Promise<Process[]> => {
  if (envMissing()) return [];
  const supabase = await createClient();
  const { data } = await supabase
    .from("processes")
    .select("*")
    .order("sort_order");
  return (data ?? []) as Process[];
});
