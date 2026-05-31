// 엑셀 원본 열과 1:1 (docs/05_정밀스펙.md). io/work × in/out 4형.
export type SchemaType = "io" | "work" | "entry";
export type CellKind = "int" | "weight" | "date" | "datetime" | "text" | "status";

export interface Process {
  id: string;
  name: string;
  code: string | null;
  karat: "18K" | "14K" | null;
  schema_type: SchemaType;
  is_inspection: boolean;
  is_blue: boolean;
  category: string[];
  sort_order: number;
}

export interface Lot {
  id: string;
  serial: string | null;
  process_id: string;
  side: "in" | "out";
  description: string | null;
  qty: number | null;
  weight: number | null;        // io입고:중량D / io출고:실중량O / work입고:중량K / work완료:작업후Q
  weight_in: number | null;     // work 작업중 입중량(E)
  weight_before: number | null; // work 완료 작업전(P)
  tag: number | null;           // 1 tag = 0.035g
  tag_fixed: number | null;     // io출고 Tag수정(V)
  tag_weight: number | null;    // io출고 Tag중량(W)
  tag_loss: number | null;      // io출고 Tag로스(X)
  q: number | null;
  due_date: string | null;
  raw_weight: number | null;    // 원중량
  note: string | null;
  prev_part_name: string | null;// 이전파트 표시(io출고 U / work작업중 L)
  prev_process_id: string | null;
  moved_at: string | null;      // 투입시간(io입고 J) / 이관·출고시간(work완료 Y)
  moved_to_name: string | null; // 투입부서(io입고 K) / 이관파트(work완료 Z)
  status: "대기" | "작업중" | "완료";
  locked: boolean;
  period_id: string | null;
  created_at: string;
  completed_at: string | null;
  updated_at: string;
  version: number;
}

export interface ColDef {
  key: keyof Lot;
  label: string;
  kind: CellKind;
  width?: number;
  editable?: boolean;                          // 수동 입력 칸
  computed?: "loss" | "lossRate" | "ship";     // 자동 계산 표시 칸
}

// ───────── io 계열 (일반공정 + 검수) ─────────
// 입고블록 A:K, 출고블록 L:Y
const IO_IN: ColDef[] = [
  { key: "serial", label: "일련번호", kind: "text", width: 104 },
  { key: "description", label: "내역", kind: "text", width: 132 },
  { key: "qty", label: "수량", kind: "int", width: 44 },
  { key: "weight", label: "중량", kind: "weight", width: 58 },
  { key: "tag", label: "Tag", kind: "weight", width: 48 },
  { key: "q", label: "Q", kind: "weight", width: 40 },
  { key: "due_date", label: "납기", kind: "date", width: 46 },
  { key: "raw_weight", label: "원중량", kind: "weight", width: 54 },
  { key: "note", label: "비고", kind: "text", width: 56 },
  { key: "moved_at", label: "투입시간", kind: "datetime", width: 88 },
  { key: "moved_to_name", label: "투입부서", kind: "text", width: 72 },
];
const IO_OUT: ColDef[] = [
  { key: "serial", label: "일련번호", kind: "text", width: 116 },
  { key: "description", label: "내역", kind: "text", width: 132 },
  { key: "qty", label: "수량", kind: "int", width: 44 },
  { key: "weight", label: "실중량", kind: "weight", width: 58, editable: true },
  { key: "tag", label: "Tag", kind: "weight", width: 48, editable: true },
  { key: "q", label: "Q", kind: "weight", width: 40, editable: true },
  { key: "due_date", label: "납기", kind: "date", width: 46 },
  { key: "raw_weight", label: "원중량", kind: "weight", width: 54, editable: true },
  { key: "note", label: "비고", kind: "text", width: 56, editable: true },
  { key: "prev_part_name", label: "이전파트", kind: "text", width: 84 },
  { key: "tag_fixed", label: "Tag수정", kind: "weight", width: 58, editable: true },
  { key: "tag_weight", label: "Tag중량", kind: "weight", width: 58, editable: true },
  { key: "tag_loss", label: "Tag로스", kind: "weight", width: 58, editable: true },
  { key: "weight", label: "출고중량", kind: "weight", width: 60, computed: "ship" },
];

// ───────── work 계열 (연마·뻥·빠우) ─────────
// 작업중블록 A:L (A=현황), 완료블록 M:Z
const WORK_IN: ColDef[] = [
  { key: "status", label: "현황", kind: "status", width: 44 },
  { key: "serial", label: "일련번호", kind: "text", width: 104 },
  { key: "description", label: "내역", kind: "text", width: 128 },
  { key: "qty", label: "수량", kind: "int", width: 44 },
  { key: "weight_in", label: "입중량", kind: "weight", width: 56 },
  { key: "tag", label: "Tag", kind: "weight", width: 48 },
  { key: "q", label: "Q", kind: "weight", width: 40 },
  { key: "due_date", label: "납기", kind: "date", width: 46 },
  { key: "raw_weight", label: "원중량", kind: "weight", width: 54 },
  { key: "note", label: "비고", kind: "text", width: 56 },
  { key: "weight", label: "중량", kind: "weight", width: 56 },
  { key: "prev_part_name", label: "이전파트", kind: "text", width: 112 },
];
const WORK_OUT: ColDef[] = [
  { key: "serial", label: "일련번호", kind: "text", width: 116 },
  { key: "description", label: "내역", kind: "text", width: 128 },
  { key: "qty", label: "수량", kind: "int", width: 44 },
  { key: "weight_before", label: "작업전", kind: "weight", width: 56 },
  { key: "weight", label: "작업후", kind: "weight", width: 56, editable: true },
  { key: "weight", label: "로스", kind: "weight", width: 50, computed: "loss" },
  { key: "weight", label: "로스율", kind: "weight", width: 52, computed: "lossRate" },
  { key: "tag", label: "Tag", kind: "weight", width: 48 },
  { key: "q", label: "Q", kind: "weight", width: 40 },
  { key: "due_date", label: "납기", kind: "date", width: 46 },
  { key: "raw_weight", label: "원중량", kind: "weight", width: 54 },
  { key: "note", label: "비고", kind: "text", width: 56 },
  { key: "moved_at", label: "이관/출고시간", kind: "datetime", width: 88 },
  { key: "moved_to_name", label: "이관파트", kind: "text", width: 100 },
];

// ───────── 작성 (entry) B:I ─────────
const ENTRY_IN: ColDef[] = [
  { key: "description", label: "내역", kind: "text", width: 110 },
  { key: "qty", label: "수량", kind: "int", width: 70 },
  { key: "weight", label: "중량", kind: "weight", width: 90 },
  { key: "tag", label: "Tag", kind: "weight", width: 80 },
  { key: "q", label: "Q", kind: "weight", width: 60 },
  { key: "due_date", label: "납기", kind: "date", width: 130 },
  { key: "raw_weight", label: "원중량(수리)", kind: "weight", width: 100 },
  { key: "note", label: "비고", kind: "text", width: 110 },
];

export const COLUMNS: Record<SchemaType, { in: ColDef[]; out: ColDef[] }> = {
  io: { in: IO_IN, out: IO_OUT },
  work: { in: WORK_IN, out: WORK_OUT },
  entry: { in: ENTRY_IN, out: [] },
};

export const TAG_PER_GRAM = 0.035;

// 부동소수점 오류 방지: 모든 중량 합산/계산 결과를 2자리로 라운딩
export const round2 = (n: number) => Math.round((n + Number.EPSILON) * 100) / 100;

// 천 단위 콤마 + 소수 2자리 (중량/Tag/Q 등)
export function fmtWeight(v: unknown): string {
  if (v === null || v === undefined || v === "") return "";
  const n = Number(v);
  if (!Number.isFinite(n)) return "";
  return round2(n).toLocaleString("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}
// 천 단위 콤마 정수 (수량)
export function fmtInt(v: unknown): string {
  if (v === null || v === undefined || v === "") return "";
  const n = Number(v);
  if (!Number.isFinite(n)) return "";
  return Math.round(n).toLocaleString("en-US");
}

// io 출고중량 Y = IF(O=0,"", IF(X=0, O, O+P-W))  (O실중량 P Tag W Tag중량 X Tag로스)
export function shipWeight(l: Lot): number | null {
  const o = Number(l.weight ?? 0);
  if (!o) return null;
  const x = Number(l.tag_loss ?? 0);
  if (!x) return round2(o);
  return round2(o + Number(l.tag ?? 0) - Number(l.tag_weight ?? 0));
}
// work 로스 R = 작업전 P − 작업후 Q
export function lossOf(l: Lot): number | null {
  if (l.weight_before == null || l.weight == null) return null;
  return round2(Number(l.weight_before) - Number(l.weight));
}
// work 로스율 S = IFERROR(1 − 작업후/작업전, "")
export function lossRateOf(l: Lot): number | null {
  if (!l.weight_before || l.weight == null) return null;
  return 1 - Number(l.weight) / Number(l.weight_before);
}
