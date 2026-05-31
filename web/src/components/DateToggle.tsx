"use client";

import { useEffect, useState } from "react";

const KEY = "dsqc.workDate";

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

// 작업 날짜 토글 (◀ 날짜 ▶ · 오늘). 선택값은 localStorage에 보존.
export function DateToggle() {
  const [date, setDate] = useState<string>(todayKST());

  useEffect(() => {
    const saved = localStorage.getItem(KEY);
    if (saved) setDate(saved);
  }, []);

  const change = (v: string) => {
    setDate(v);
    localStorage.setItem(KEY, v);
    window.dispatchEvent(new CustomEvent("dsqc:workDate", { detail: v }));
  };

  const isToday = date === todayKST();

  return (
    <div className="flex items-center gap-1 text-sm">
      <span className="text-gray-400 text-xs mr-1 dark:text-neutral-500">작업일</span>
      <button
        onClick={() => change(shift(date, -1))}
        className="px-2 py-0.5 rounded border border-gray-300 hover:bg-gray-100 dark:border-neutral-600 dark:hover:bg-neutral-800"
        aria-label="이전 날짜"
      >
        ◀
      </button>
      <input
        type="date"
        value={date}
        onChange={(e) => change(e.target.value)}
        className="border border-gray-300 rounded px-2 py-0.5 tabular-nums dark:border-neutral-600 dark:bg-neutral-900"
      />
      <button
        onClick={() => change(shift(date, 1))}
        className="px-2 py-0.5 rounded border border-gray-300 hover:bg-gray-100 dark:border-neutral-600 dark:hover:bg-neutral-800"
        aria-label="다음 날짜"
      >
        ▶
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
    </div>
  );
}
