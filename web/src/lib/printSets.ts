// 인쇄 대상 정의 — 엑셀 메뉴 5종(재고·입고·출고·검수입고·검수출고)
//  · 입고/출고 일괄 = Module27/28, 검수 = Module29/30(이어붙이기), 재고 = Module19(4그룹)

// 입고/출고 장부 일괄 대상(io 부서) — Module27/28
export const IO_BATCH = ["기계", "양장", "캐스팅", "개발", "컷팅", "조립14K", "캐스팅14K", "컷팅14K"];

// 검수 장부 대상 — Module29/30
export const INSPECT = ["검수(기계)", "검수(볼)", "검수(양장)", "검수(캐스팅)", "검수(조립)14K", "검수(캐스팅)14K"];

// 재고(미완료) 4그룹 — Module19
export const STOCK_GROUPS: Record<string, { label: string; names: string[] }> = {
  asm18: { label: "18K · 조립", names: ["연마(조립)", "뻥(기계)", "뻥(양장)", "빠우(양장볼)", "빠우(할로우)", "빠우(기계)", "빠우(초광-조립)"] },
  cast18: { label: "18K · 캐스팅", names: ["연마(캐스팅)", "뻥(캐스팅)", "뻥(개발)", "빠우(패션반지)", "빠우(캐스팅양장)", "빠우(캐스팅체인)", "빠우(초광-캐스팅)", "빠우(개발)"] },
  asm14: { label: "14K · 조립", names: ["연마(조립)14K", "뻥(조립)14K", "빠우(조립)14K", "빠우(초광-조립)14K"] },
  cast14: { label: "14K · 캐스팅", names: ["연마(캐스팅)14K", "뻥(캐스팅)14K", "빠우(패션반지)14K", "빠우(캐스팅양장)14K", "빠우(캐스팅체인)14K", "빠우(초광-캐스팅)14K"] },
};

export type PrintKind = "inbound" | "outbound" | "inspect-in" | "inspect-out" | "stock";

// kind → 제목·대상공정·블록(in/out)·연속여부(검수는 이어붙임)
export const PRINT_KINDS: Record<Exclude<PrintKind, "stock">, { title: string; names: string[]; side: "in" | "out"; continuous: boolean }> = {
  inbound: { title: "입고 장부", names: IO_BATCH, side: "in", continuous: false },
  outbound: { title: "출고 장부", names: IO_BATCH, side: "out", continuous: false },
  "inspect-in": { title: "검수 입고 장부", names: INSPECT, side: "in", continuous: true },
  "inspect-out": { title: "검수 출고 장부", names: INSPECT, side: "out", continuous: true },
};

export const PRINT_MENU: { kind: PrintKind; label: string }[] = [
  { kind: "stock", label: "재고" },
  { kind: "inbound", label: "입고" },
  { kind: "outbound", label: "출고" },
  { kind: "inspect-in", label: "검수입고" },
  { kind: "inspect-out", label: "검수출고" },
];
