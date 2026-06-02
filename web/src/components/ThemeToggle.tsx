"use client";

import { useSyncExternalStore } from "react";
import { Moon, Sun } from "lucide-react";
import { Switch } from "@/components/ui/switch";

type Theme = "light" | "dark";
const KEY = "dsqc.theme";
const EVT = "dsqc.theme.change"; // change() 후 useSyncExternalStore 재읽기 트리거용

export function applyTheme(theme: Theme) {
  document.documentElement.classList.toggle("dark", theme === "dark");
}

// localStorage 를 외부 스토어로 구독 — effect+setState 없이 SSR 하이드레이션 안전(+ 탭 간 동기화).
function subscribe(cb: () => void) {
  window.addEventListener(EVT, cb);
  window.addEventListener("storage", cb);
  return () => {
    window.removeEventListener(EVT, cb);
    window.removeEventListener("storage", cb);
  };
}

// 다크 모드 on/off 스위치 (밝게 ↔ 어둡게). system 옵션은 폐기 — 단순화 요청.
export function ThemeToggle() {
  const isDark = useSyncExternalStore(
    subscribe,
    () => localStorage.getItem(KEY) === "dark",
    () => false,
  );

  const change = (dark: boolean) => {
    const t: Theme = dark ? "dark" : "light";
    localStorage.setItem(KEY, t);
    applyTheme(t);
    window.dispatchEvent(new Event(EVT)); // 구독자(useSyncExternalStore) 재읽기
  };

  return (
    <label className="flex items-center gap-1.5 text-gray-500 dark:text-neutral-400">
      <Sun className={`size-4 transition-colors ${isDark ? "" : "text-amber-500"}`} />
      <Switch checked={isDark} onCheckedChange={change} aria-label="다크 모드" />
      <Moon className={`size-4 transition-colors ${isDark ? "text-indigo-400" : ""}`} />
    </label>
  );
}
