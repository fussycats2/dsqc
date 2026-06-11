import { Skeleton } from "@/components/ui/skeleton";

// 루트 로딩 스켈레톤(대시보드 등 자체 loading.tsx가 없는 화면 공용) — 서버 렌더를 기다리지
//  않고 화면 전환을 즉시 커밋시켜 "클릭 후 멈춤"을 없앤다. 실제 대시보드 골격(제목 →
//  일마감 박스 → 섹션 라벨 + 카드들)을 본떠 그림. 로직 없음 — 순수 표시용.

function StatCard({ rows }: { rows: number }) {
  return (
    <section className="min-w-[360px] flex-1 rounded-xl border border-slate-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      {/* 카드 헤더: 색점 · 제목 · 건수 알약 · 우측 요약 */}
      <header className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-2 dark:border-neutral-800">
        <div className="flex items-center gap-2">
          <Skeleton className="size-2.5 rounded-full" />
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-4 w-8 rounded-full" />
        </div>
        <Skeleton className="h-3 w-20" />
      </header>
      <div className="space-y-1.5 p-2">
        <Skeleton className="h-6 w-full rounded-md" />
        {Array.from({ length: rows }).map((_, i) => (
          <div key={i} className="flex gap-1.5" style={{ opacity: 1 - i * 0.14 }}>
            <Skeleton className="h-5 flex-[1.6] rounded-sm" />
            <Skeleton className="h-5 flex-1 rounded-sm" />
            <Skeleton className="h-5 flex-1 rounded-sm" />
            <Skeleton className="h-5 flex-1 rounded-sm" />
            <Skeleton className="h-5 flex-1 rounded-sm" />
          </div>
        ))}
      </div>
    </section>
  );
}

export default function Loading() {
  return (
    <main className="space-y-5 p-6">
      {/* 제목 줄 */}
      <div className="flex flex-wrap items-baseline gap-3">
        <Skeleton className="h-7 w-28" />
        <Skeleton className="h-3.5 w-56" />
      </div>
      {/* 일마감 박스 자리 */}
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <Skeleton className="h-8 w-28 rounded-md" />
        <Skeleton className="h-5 w-40" />
        <Skeleton className="ml-auto h-5 w-48" />
      </div>
      {/* 섹션: 공정 (카드 2장) */}
      <div className="space-y-2">
        <Skeleton className="h-3 w-32" />
        <div className="flex flex-wrap gap-4">
          <StatCard rows={5} />
          <StatCard rows={5} />
        </div>
      </div>
      {/* 섹션: 부서·검수 (카드 4장) */}
      <div className="space-y-2">
        <Skeleton className="h-3 w-24" />
        <div className="flex flex-wrap gap-4">
          <StatCard rows={4} />
          <StatCard rows={4} />
          <StatCard rows={4} />
          <StatCard rows={4} />
        </div>
      </div>
    </main>
  );
}
