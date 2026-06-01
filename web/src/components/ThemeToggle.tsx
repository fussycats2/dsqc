"use client";

import { useSyncExternalStore } from "react";

type Theme = "light" | "dark" | "system";
const KEY = "dsqc.theme";
const EVT = "dsqc.theme.change"; // change() 후 useSyncExternalStore 재읽기 트리거용

export function applyTheme(theme: Theme) {
  const dark =
    theme === "dark" ||
    (theme === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
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

export function ThemeToggle() {
  const theme = useSyncExternalStore(
    subscribe,
    () => (localStorage.getItem(KEY) as Theme) ?? "light",
    () => "light" as Theme,
  );

  const change = (t: Theme) => {
    localStorage.setItem(KEY, t);
    applyTheme(t);
    window.dispatchEvent(new Event(EVT)); // 구독자(useSyncExternalStore) 재읽기
  };

  const opts: { key: Theme; label: string }[] = [
    { key: "light", label: "☀️ 밝게" },
    { key: "dark", label: "🌙 어둡게" },
    { key: "system", label: "🖥️ 시스템" },
  ];

  return (
    <div className="flex gap-1">
      {opts.map((o) => (
        <button
          key={o.key}
          onClick={() => change(o.key)}
          className={`px-2 py-0.5 rounded text-xs border transition-colors ${
            theme === o.key
              ? "bg-blue-600 text-white border-blue-600"
              : "border-gray-300 text-gray-600 hover:bg-gray-100 dark:border-neutral-600 dark:text-neutral-300 dark:hover:bg-neutral-800"
          }`}
        >
          {o.label}
        </button>
      ))}
    </div>
  );
}
