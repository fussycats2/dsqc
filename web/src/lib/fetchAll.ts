// 행수 제한에 잘리지 않는 전량 조회 헬퍼.
//  · PostgREST는 응답을 서버 설정(Max Rows)까지만 돌려주고 에러 없이 자른다 — 하루 lots가
//    1000건을 넘으면서 실제로 발생(대시보드·결산전송 등이 일부 행만 계산하던 버그).
//  · PAGE행씩 range로 끝까지 받아 합치므로 서버 설정값과 무관하게 안전하다.
//  · 호출부 규칙: 페이지 경계가 흔들리지 않도록 동률 없는 정렬을 반드시 포함할 것
//    (집계용은 .order("id"), 표시용은 기존 정렬 뒤에 .order("id") 꼬리 정렬).
//  · 서버 Max Rows가 PAGE보다 작으면 마지막 페이지로 오인해 조기 종료될 수 있음
//    — Supabase 설정을 1000 미만으로 낮추지 말 것(기본값 1000, 현재 5000).

const PAGE = 1000;

type PageResult<T> = { data: T[] | null; error: { message: string } | null };

export async function fetchAll<T>(
  page: (from: number, to: number) => PromiseLike<PageResult<T>>,
): Promise<{ data: T[]; error: { message: string } | null }> {
  const all: T[] = [];
  for (let from = 0; ; from += PAGE) {
    const { data, error } = await page(from, from + PAGE - 1);
    if (error) return { data: all, error };
    const rows = data ?? [];
    all.push(...rows);
    if (rows.length < PAGE) return { data: all, error: null };
  }
}
