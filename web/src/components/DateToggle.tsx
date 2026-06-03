"use client";

import { useSyncExternalStore, useTransition } from "react";
import { useRouter } from "next/navigation";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { DatePicker } from "@/components/DatePicker";
import { LoadingOverlay } from "@/components/LoadingOverlay";

const KEY = "dsqc.workDate";
const EVT = "dsqc.workDate.change"; // change() 후 useSyncExternalStore 재읽기 트리거용

function todayKST(): string {
  // Asia/Seoul 기준 YYYY-MM-DD
  const d = new Date(Date.now() + 9 * 3600 * 1000);
  return d.toISOString().slice(0, 10);
}

function shift(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

function readCookie(): string | null {
  const m = document.cookie.match(/(?:^|; )dsqc\.workDate=([^;]+)/);
  return m ? decodeURIComponent(m[1]) : null;
}

// 쿠키를 외부 스토어로 구독 — effect+setState 없이 SSR 하이드레이션 안전.
function subscribe(cb: () => void) {
  window.addEventListener(EVT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVT, cb);
    window.removeEventListener("storage", cb);
  };
}

// 작업 날짜 토글 (◀ 달력 ▶ · 오늘). 쿠키에 저장 → 서버가 그 날짜 데이터로 필터.
export function DateToggle() {
  const router = useRouter();
  const date = useSyncExternalStore(subscribe, () => readCookie() ?? todayKST(), todayKST);
  // 작업일 변경 시 router.refresh()를 transition으로 감싸 '불러오는 중' 상태를 노출
  //  (서버 컴포넌트 재실행이라 loading.tsx가 안 걸림 → isPending으로 직접 표시)
  const [pending, start] = useTransition();

  const change = (v: string) => {
    // 1년 보존 쿠키 + 서버 컴포넌트 재실행(작업일 필터 반영)
    document.cookie = `${KEY}=${v}; path=/; max-age=31536000`;
    window.dispatchEvent(new Event(EVT)); // 구독자(useSyncExternalStore) 재읽기
    start(() => router.refresh());
  };

  const isToday = date === todayKST();

  return (
    <div className="flex items-center gap-1 text-sm">
      <span className="text-gray-400 text-xs mr-1 dark:text-neutral-500">작업일</span>
      <button
        onClick={() => change(shift(date, -1))}
        className="inline-flex items-center rounded border border-gray-300 px-1.5 py-1 hover:bg-gray-100 dark:border-neutral-600 dark:hover:bg-neutral-800"
        aria-label="이전 날짜"
      >
        <ChevronLeft className="size-4" />
      </button>
      <DatePicker value={date} onChange={change} />
      <button
        onClick={() => change(shift(date, 1))}
        className="inline-flex items-center rounded border border-gray-300 px-1.5 py-1 hover:bg-gray-100 dark:border-neutral-600 dark:hover:bg-neutral-800"
        aria-label="다음 날짜"
      >
        <ChevronRight className="size-4" />
      </button>
      <button
        onClick={() => change(todayKST())}
        disabled={isToday}
        className={`px-2 py-0.5 rounded border text-xs ${
          isToday
            ? "border-gray-200 text-gray-300 dark:border-neutral-700 dark:text-neutral-600"
            : "border-blue-300 text-blue-600 hover:bg-blue-50 dark:hover:bg-blue-950"
        }`}
      >
        오늘
      </button>

      {/* 불러오는 중: 토글 옆 스피너 + 중앙 오버레이 */}
      {pending && (
        <Loader2 className="ml-1 size-4 animate-spin text-blue-500" aria-label="불러오는 중" />
      )}
      <LoadingOverlay show={pending} />
    </div>
  );
}
