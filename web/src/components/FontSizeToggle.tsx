"use client";

import { useSyncExternalStore } from "react";
import { Switch } from "@/components/ui/switch";

const KEY = "dsqc.fontScale";
const EVT = "dsqc.fontScale.change"; // change() 후 useSyncExternalStore 재읽기 트리거용

// <html class="font-lg"> → globals.css의 .font-lg table 규칙으로 표 글자만 키움
export function applyFontScale(lg: boolean) {
  document.documentElement.classList.toggle("font-lg", lg);
}

// localStorage 를 외부 스토어로 구독 — ThemeToggle과 동일 패턴(SSR 하이드레이션 안전 + 탭 간 동기화)
function subscribe(cb: () => void) {
  window.addEventListener(EVT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVT, cb);
    window.removeEventListener("storage", cb);
  };
}

// 표 글자 크기 보통 ↔ 크게 스위치 — 현장 가독성용(나이대별 차이 큼)
export function FontSizeToggle() {
  const isLg = useSyncExternalStore(
    subscribe,
    () => localStorage.getItem(KEY) === "lg",
    () => false,
  );

  const change = (lg: boolean) => {
    localStorage.setItem(KEY, lg ? "lg" : "normal");
    applyFontScale(lg);
    window.dispatchEvent(new Event(EVT)); // 구독자(useSyncExternalStore) 재읽기
  };

  return (
    <label
      className="flex items-center gap-1.5 text-slate-500 dark:text-neutral-400"
      title="표 글자 크게"
    >
      <span className="text-[10px] leading-none">가</span>
      <Switch checked={isLg} onCheckedChange={change} aria-label="표 글자 크게" />
      <span className="text-sm font-semibold leading-none">가</span>
    </label>
  );
}
