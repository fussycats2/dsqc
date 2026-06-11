import { Skeleton } from "@/components/ui/skeleton";

// 루트 로딩 스켈레톤(대시보드 등 자체 loading.tsx가 없는 화면 공용) — 서버 렌더를 기다리지
//  않고 화면 전환을 즉시 커밋시켜 "클릭 후 멈춤"을 없앤다. 로직 없음 — 순수 표시용.
export default function Loading() {
  return (
    <main className="space-y-5 p-6">
      {/* 제목 줄 */}
      <div className="flex items-baseline gap-3">
        <Skeleton className="h-7 w-32" />
        <Skeleton className="h-4 w-48" />
      </div>
      {/* 일마감 박스 자리 */}
      <Skeleton className="h-16 w-full rounded-xl" />
      {/* 파트별 현황 표 자리 */}
      <div className="grid gap-4 md:grid-cols-2">
        {[0, 1].map((t) => (
          <div key={t} className="space-y-2 rounded-xl border border-slate-200 p-3 dark:border-neutral-800">
            <Skeleton className="h-5 w-24" />
            {Array.from({ length: 8 }).map((_, i) => (
              <Skeleton key={i} className="h-7 w-full" />
            ))}
          </div>
        ))}
      </div>
    </main>
  );
}
