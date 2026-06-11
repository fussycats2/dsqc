import { Skeleton } from "@/components/ui/skeleton";

// 공정 화면 로딩 스켈레톤 — loading.tsx가 있으면 Next.js가 서버 렌더(lots 조회)를 기다리지 않고
//  화면 전환을 즉시 커밋한다(헤더·하단탭은 그대로, 본문만 자리표시 → 데이터가 차오름).
//  탭/우클릭 이동의 "클릭 후 멈춤" 체감을 제거하는 핵심. 로직 없음 — 순수 표시용.
export default function Loading() {
  return (
    <main className="p-6">
      <div className="space-y-3">
        {/* 제목 줄 */}
        <div className="flex items-center gap-3">
          <Skeleton className="h-4 w-16" />
          <Skeleton className="h-7 w-36" />
          <Skeleton className="h-5 w-24 rounded-full" />
        </div>
        {/* 액션 툴바 자리 */}
        <Skeleton className="h-12 w-full rounded-xl" />
        {/* 표(입고/작업중 · 출고/완료) 자리 */}
        {[0, 1].map((t) => (
          <div key={t} className="space-y-2 rounded-xl border border-slate-200 p-3 dark:border-neutral-800">
            <Skeleton className="h-5 w-28" />
            {Array.from({ length: 6 }).map((_, i) => (
              <Skeleton key={i} className="h-8 w-full" />
            ))}
          </div>
        ))}
      </div>
    </main>
  );
}
