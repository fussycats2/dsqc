"use client";

import { ChevronLeft, ChevronRight } from "lucide-react";
import { DatePicker } from "@/components/DatePicker";

// 편집 가능한 날짜: ‹ [작업일 달력] › — 상단 작업일 토글과 동일한 위젯·조작감.
// 잠금(마감일·변경 원래날짜)에는 쓰지 않음(DatePicker의 locked 사용).
function shift(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

// 작업일 토글의 ‹ › Chevron 화살표와 동일한 스타일
const arrowCls =
  "inline-flex items-center rounded border border-gray-300 px-1.5 py-1 hover:bg-gray-100 disabled:opacity-50 dark:border-neutral-600 dark:hover:bg-neutral-800";

export function DateStepper({
  value,
  onChange,
  disabled,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled?: boolean;
}) {
  return (
    <span className="inline-flex items-center gap-1">
      <button
        type="button"
        onClick={() => onChange(shift(value, -1))}
        disabled={disabled}
        className={arrowCls}
        aria-label="이전 날짜"
      >
        <ChevronLeft className="size-4" />
      </button>
      <DatePicker value={value} onChange={onChange} disabled={disabled} />
      <button
        type="button"
        onClick={() => onChange(shift(value, 1))}
        disabled={disabled}
        className={arrowCls}
        aria-label="다음 날짜"
      >
        <ChevronRight className="size-4" />
      </button>
    </span>
  );
}
