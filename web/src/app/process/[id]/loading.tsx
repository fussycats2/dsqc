import { Skeleton } from "@/components/ui/skeleton";

// 공정 화면 로딩 스켈레톤 — loading.tsx가 있으면 Next.js가 서버 렌더(lots 조회)를 기다리지 않고
//  화면 전환을 즉시 커밋한다(헤더·하단탭은 그대로, 본문만 자리표시 → 데이터가 차오름).
//  실제 화면(ProcessView)과 같은 골격으로 그림: 제목 줄 → 액션 툴바 → 표 카드 2장
//  (rounded-xl 카드 + 헤더 구분선 + 표 머리띠 + 칸 단위 행, 아래로 갈수록 옅어짐).
//  로직 없음 — 순수 표시용.

function TableCard() {
  return (
    <section className="min-w-0 flex-1 rounded-xl border border-slate-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      {/* 카드 헤더: 색점 · 제목 · 건수 알약 · 중량 합 (LotTable 헤더와 동일 배치) */}
      <header className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-2 dark:border-neutral-800">
        <div className="flex items-center gap-2">
          <Skeleton className="size-2.5 rounded-full" />
          <Skeleton className="h-4 w-14" />
          <Skeleton className="h-4 w-12 rounded-full" />
        </div>
        <Skeleton className="h-3 w-24" />
      </header>
      <div className="space-y-1.5 p-2">
        {/* 표 머리띠 */}
        <Skeleton className="h-7 w-full rounded-md" />
        {/* 데이터 행 — 체크박스·내역(넓게)·숫자칸들로 칸 느낌, 아래로 갈수록 페이드 */}
        {Array.from({ length: 7 }).map((_, i) => (
          <div key={i} className="flex gap-1.5" style={{ opacity: 1 - i * 0.12 }}>
            <Skeleton className="h-6 w-6 shrink-0 rounded-sm" />
            <Skeleton className="h-6 flex-[2.2] rounded-sm" />
            <Skeleton className="h-6 flex-1 rounded-sm" />
            <Skeleton className="h-6 flex-1 rounded-sm" />
            <Skeleton className="h-6 flex-1 rounded-sm" />
            <Skeleton className="h-6 flex-[1.4] rounded-sm" />
          </div>
        ))}
      </div>
    </section>
  );
}

export default function Loading() {
  return (
    <main className="p-6">
      <div className="space-y-3">
        {/* 제목 줄: ←대시보드 · 공정명 · 분류 알약 */}
        <div className="flex items-center gap-3">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-7 w-36" />
          <Skeleton className="h-5 w-24 rounded-full" />
        </div>
        {/* 액션 툴바: 테두리 카드 안에 버튼 알약들 */}
        <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white/90 p-2.5 shadow-sm dark:border-neutral-800 dark:bg-neutral-900/90">
          <Skeleton className="h-4 w-28" />
          <Skeleton className="h-7 w-16 rounded-md" />
          <Skeleton className="h-7 w-20 rounded-md" />
          <Skeleton className="h-7 w-16 rounded-md" />
          <Skeleton className="h-7 w-24 rounded-md" />
          <Skeleton className="ml-auto h-7 w-20 rounded-md" />
        </div>
        {/* 표 카드 2장 — 실제와 동일하게 좁으면 위아래, 넓은 화면(2xl)에선 좌우 */}
        <div className="flex flex-col gap-3 2xl:flex-row">
          <TableCard />
          <TableCard />
        </div>
      </div>
    </main>
  );
}
