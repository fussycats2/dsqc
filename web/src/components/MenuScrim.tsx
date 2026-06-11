"use client";

import { createPortal } from "react-dom";

// 메뉴가 열린 동안 본문을 살짝 어둡게+흐리게 — 메뉴 패널(z-50)만 또렷하게 돋보이게.
//  우클릭 네비게이션(NavContextMenu)과 하단탭 드롭다운(TabBar)이 공유.
//  · z-[15]: LoadingOverlay 딤과 같은 층 — 헤더(z-30)·하단탭·액션 툴바(z-20)는 또렷하게
//    남기고 본문 데이터만 가림(하단탭 옆 버튼으로 이동할 때 잘 보이도록).
//  · body 포털: 하단탭(z-20) 같은 stacking context에 갇히지 않도록.
//  · pointer-events-none: 호버 자동닫힘·바깥 클릭 등 조작은 그대로 통과.
export function MenuScrim({ show }: { show: boolean }) {
  if (!show || typeof document === "undefined") return null;
  return createPortal(
    <div className="pointer-events-none fixed inset-0 z-[15] bg-black/25 backdrop-blur-[2px] animate-in fade-in-0 print:hidden" />,
    document.body,
  );
}
