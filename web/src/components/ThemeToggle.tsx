"use client";

import { useEffect, useState } from "react";

type Theme = "light" | "dark" | "system";
const KEY = "dsqc.theme";

export function applyTheme(theme: Theme) {
  const dark =
    theme === "dark" ||
    (theme === "system" &&
      window.matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.classList.toggle("dark", dark);
}

export function ThemeToggle() {
  const [theme, setTheme] = useState<Theme>("light");

  useEffect(() => {
    const saved = (localStorage.getItem(KEY) as Theme) ?? "light";
    setTheme(saved);
  }, []);

  const change = (t: Theme) => {
    setTheme(t);
    localStorage.setItem(KEY, t);
    applyTheme(t);
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
