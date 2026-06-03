"use client";

// 완전 제어형 숫자 입력
//  - weight: 소수 2자리까지만 허용(셋째 자리 입력 차단), blur 시 X.00 정규화
//  - int   : 정수만
//  - onBlurExtra: blur 시 추가 콜백(예: 서버 커밋)
export function NumberInput({
  value,
  onChange,
  onBlurExtra,
  kind,
  align = "right",
  className = "",
  placeholder,
  cellId,
}: {
  value: string;
  onChange: (v: string) => void;
  onBlurExtra?: () => void;
  kind: "int" | "weight";
  align?: "left" | "right";
  className?: string;
  placeholder?: string;
  cellId?: string; // 엑셀식 격자 좌표(useGridSheet) — 지정 시 data-cell로 노출
}) {
  const pat = kind === "int" ? /^\d*$/ : /^\d*\.?\d{0,2}$/;

  return (
    <input
      value={value}
      placeholder={placeholder}
      data-cell={cellId}
      inputMode={kind === "int" ? "numeric" : "decimal"}
      onChange={(e) => {
        const raw = e.target.value;
        if (raw === "" || pat.test(raw)) onChange(raw);
      }}
      onBlur={() => {
        if (kind === "weight" && value !== "" && !isNaN(Number(value))) {
          onChange(Number(value).toFixed(2));
        }
        onBlurExtra?.();
      }}
      className={`${align === "left" ? "text-left" : "text-right"} tabular-nums ${className}`}
    />
  );
}
