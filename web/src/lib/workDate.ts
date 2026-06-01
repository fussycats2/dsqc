import { cookies } from "next/headers";

export const WORK_DATE_COOKIE = "dsqc.workDate";

// Asia/Seoul 기준 오늘 YYYY-MM-DD
export function todayKST(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}

// 서버 컴포넌트/액션에서 현재 작업일(쿠키) 읽기. 없으면 오늘(KST).
export async function getWorkDate(): Promise<string> {
  const c = await cookies();
  const v = c.get(WORK_DATE_COOKIE)?.value;
  return v && /^\d{4}-\d{2}-\d{2}$/.test(v) ? v : todayKST();
}
