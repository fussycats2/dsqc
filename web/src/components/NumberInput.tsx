"use client";

// 완전 제어형 숫자 입력
//  - weight: 소수 2자리까지만 허용(셋째 자리 입력 차단), blur 시 X.00 정규화
//  - int   : 정수만
export function NumberInput({
  value,
  onChange,
  kind,
  className = "",
}: {
  value: string;
  onChange: (v: string) => void;
  kind: "int" | "weight";
  className?: string;
}) {
  const pat = kind === "int" ? /^\d*$/ : /^\d*\.?\d{0,2}$/;

  return (
    <input
      value={value}
      inputMode={kind === "int" ? "numeric" : "decimal"}
      onChange={(e) => {
        const raw = e.target.value;
        // 패턴에 맞을 때만 반영 → 셋째 자리 등은 입력 무시(이전 값 유지)
        if (raw === "" || pat.test(raw)) onChange(raw);
      }}
      onBlur={() => {
        if (kind === "weight" && value !== "" && !isNaN(Number(value))) {
          onChange(Number(value).toFixed(2));
        }
      }}
      className={`text-right tabular-nums ${className}`}
    />
  );
}
