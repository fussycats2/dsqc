"use client";

import { createPortal } from "react-dom";
import { Loader2 } from "lucide-react";

// 화면 전환·작업일 변경 등 서버 왕복 중 '불러오는 중' 표시.
//  · 본문 딤은 헤더·하단탭(z-20) 아래(z-15)라 그것들은 그대로 보임.
//  · 스피너는 뷰포트 정중앙 + z-[60]라 어떤 스티키에도 가려지지 않음.
//  · pointer-events-none: 시각 표시만, 조작은 막지 않음.
export function LoadingOverlay({ show }: { show: boolean }) {
  if (!show || typeof document === "undefined") return null;
  return createPortal(
    <>
      <div className="pointer-events-none fixed inset-x-0 bottom-0 top-[49px] z-[15] bg-white/45 backdrop-blur-[1px] dark:bg-neutral-950/45" />
      <div className="pointer-events-none fixed inset-0 z-[60] flex items-center justify-center">
        <div className="flex items-center gap-2 rounded-full border border-slate-200 bg-white px-4 py-2 text-sm shadow-lg dark:border-neutral-700 dark:bg-neutral-900">
          <Loader2 className="size-4 animate-spin text-blue-500" />
          불러오는 중…
        </div>
      </div>
    </>,
    document.body,
  );
}
