"use client";

// 편집 가능한 날짜 입력 + 앞뒤 화살표(◀ ▶) — 상단 작업일 토글과 동일한 조작감.
// 잠금(마감일·변경 원래날짜)에는 쓰지 않음(직접 수정 불가).
function shift(dateStr: string, days: number): string {
  const d = new Date(dateStr + "T00:00:00Z");
  d.setUTCDate(d.getUTCDate() + days);
  return d.toISOString().slice(0, 10);
}

const arrowCls =
  "rounded-md border border-slate-300 px-1.5 py-1 text-xs leading-none hover:bg-slate-100 dark:border-neutral-700 dark:hover:bg-neutral-800";
const inputCls =
  "rounded-md border border-slate-300 bg-white px-2 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-900";

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
        ◀
      </button>
      <input
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={inputCls}
      />
      <button
        type="button"
        onClick={() => onChange(shift(value, 1))}
        disabled={disabled}
        className={arrowCls}
        aria-label="다음 날짜"
      >
        ▶
      </button>
    </span>
  );
}
