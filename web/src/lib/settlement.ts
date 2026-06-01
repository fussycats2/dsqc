// 품질관리부 일일 결산서 — 셀 수식 · 이월매핑 · 보존셀 (품질결산서.xlsm '일일결산서' 1:1)
//  · 입력칸(수동/이월/보존)만 CellMap에 저장, 수식칸은 derive()로 계산
//  · 이월(carryData) = 엑셀 매크로 '기존시트_새파일저장_후_현재시트이월'의 8개 매핑 + 보존규칙

import { round2 } from "./types";

export type CellMap = Record<string, number | null>;

const g = (d: CellMap, a: string) => Number(d[a]) || 0;
const colRange = (cols: string, row: number) => cols.split("").map((c) => `${c}${row}`);

// ───────── 수식칸 계산 (엑셀 수식 그대로) ─────────
export function derive(d: CellMap): Record<string, number> {
  const s = (addrs: string[]) => round2(addrs.reduce((a, x) => a + g(d, x), 0));
  const r: Record<string, number> = {};

  // ===== K18 =====
  // 부서별거래
  r.J5 = s(colRange("BCDEFGHI", 5));
  r.J6 = s(colRange("BCDEFGHI", 6));
  // 분석투입량 (연마9 / 스트립핑10 / 빠우11): L=SUM(C:J)-K, M=B+L
  for (const row of [9, 10, 11]) {
    const L = round2(s(colRange("CDEFGHIJ", row)) - g(d, `K${row}`));
    r[`L${row}`] = L;
    r[`M${row}`] = round2(g(d, `B${row}`) + L);
  }
  // 계(12행): 각 열 9~11 합 (L,M은 수식값 사용)
  for (const c of "BCDEFGHIJK") r[`${c}12`] = s([`${c}9`, `${c}10`, `${c}11`]);
  r.L12 = round2(r.L9 + r.L10 + r.L11);
  r.M12 = round2(r.M9 + r.M10 + r.M11);
  // 분석 당일누계 = 전일누계 + 바코드계
  r.K13 = round2(g(d, "I13") + r.K12);
  // 돌가랑 계 = 전일재고 + 입고 - 출고
  r.E15 = round2(g(d, "B15") + g(d, "C15") - g(d, "D15"));
  // 분석중량(위탁) 계
  r.B21 = round2(
    g(d, "C19") + g(d, "D19") + g(d, "E19") + g(d, "F19") -
      g(d, "I19") - g(d, "J19") - g(d, "K19") - g(d, "L19"),
  );
  // 실재고 = 분석중량합(B21:L21) + 분석투입누계계 + 돌가랑계
  r.A24 = round2(
    r.B21 + s(colRange("CDEFGHIJKL", 21)) + r.M12 + r.E15,
  );
  // 장부재고 = 전일재고 + 입고 - 출고
  r.B24 = round2(g(d, "B18") + r.J5 - r.J6);
  // 차중량 = 실재고 - 장부재고
  r.C24 = round2(r.A24 - r.B24);

  // ===== K14 =====
  r.I29 = s(colRange("BCDEFGH", 29));
  r.I30 = s(colRange("BCDEFGH", 30));
  for (const row of [33, 34, 35]) {
    const L = round2(s(colRange("CDEFGHIJ", row)) - g(d, `K${row}`));
    r[`L${row}`] = L;
    r[`M${row}`] = round2(g(d, `B${row}`) + L);
  }
  for (const c of "BCDEFGHIJK") r[`${c}36`] = s([`${c}33`, `${c}34`, `${c}35`]);
  r.L36 = round2(r.L33 + r.L34 + r.L35);
  r.M36 = round2(r.M33 + r.M34 + r.M35);
  r.K37 = round2(g(d, "I37") + r.K36);
  r.E39 = round2(g(d, "B39") + g(d, "C39") - g(d, "D39"));
  r.B45 = round2(
    g(d, "C43") + g(d, "D43") + g(d, "E43") + g(d, "F43") -
      g(d, "I43") - g(d, "J43") - g(d, "K43") - g(d, "L43"),
  );
  // 실재고 = 분석중량합(B45:J45) + 분석투입누계계 + 돌가랑계
  r.K45 = round2(r.B45 + s(colRange("CDEFGHIJ", 45)) + r.M36 + r.E39);
  // 장부재고 = 전일재고 + 입고 - 출고
  r.L45 = round2(g(d, "B42") + r.I29 - r.I30);
  // 차중량
  r.M45 = round2(r.K45 - r.L45);

  return r;
}

// ───────── 이월 (오늘 마감값 → 내일 전일값) — 엑셀 매크로 예외매핑 8건 ─────────
export const CARRY: [string, string][] = [
  ["B9", "M9"], ["B10", "M10"], ["B11", "M11"], // 분석투입 전일누계 ← 오늘 누계
  ["B15", "E15"],                                // 돌가랑 전일재고 ← 오늘 계
  ["B18", "B24"],                                // K18 전일재고 ← 오늘 장부재고
  ["I13", "K13"],                                // 분석 전일누계 ← 오늘 당일누계
  ["B33", "M33"], ["B34", "M34"], ["B35", "M35"],
  ["B39", "E39"],
  ["B42", "L45"],                                // K14 전일재고 ← 오늘 장부재고
  ["I37", "K37"],
];

// 이월해도 지우지 않고 유지(위탁 분석중량 행19·43 + 고정값 + 현분잔량)
export const PRESERVE: string[] = [
  ...colRange("CDEFGHIJKL", 19),
  ...colRange("CDEFGHIJKL", 43),
  "K21", "L21", "I45", "J45",
  "hbjr18", "hbjr14", // 현분잔량(18K·14K) — 외주 분석 잔량, 다음날로 유지
];

// 전일(prev) 데이터 → 다음날 시작 데이터 (나머지는 빈 칸)
export function carryData(prev: CellMap): CellMap {
  const f = derive(prev);
  const next: CellMap = {};
  for (const [to, from] of CARRY) next[to] = round2(f[from] ?? (Number(prev[from]) || 0));
  for (const a of PRESERVE) if (prev[a] != null) next[a] = prev[a];
  return next;
}
