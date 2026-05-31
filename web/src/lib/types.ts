export type SchemaType = "io" | "work" | "entry";
export type CellKind = "int" | "weight" | "date" | "text";

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
  weight: number | null;
  weight_before: number | null;
  tag: number | null;
  tag_fixed: number | null;
  tag_weight: number | null;
  tag_loss: number | null;
  q: number | null;
  due_date: string | null;
  raw_weight: number | null;
  note: string | null;
  prev_process_id: string | null;
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
  editable?: boolean; // 완료/출고 측 수동 입력 칸
  computed?: "loss" | "lossRate" | "ship"; // 자동 계산 표시 칸
}

// 입고(작업중) 컬럼은 공통, 출고(완료) 컬럼은 계열별로 다름
export const COLUMNS: Record<SchemaType, { in: ColDef[]; out: ColDef[] }> = {
  io: {
    in: [
      { key: "serial", label: "일련번호", kind: "text", width: 130 },
      { key: "description", label: "내역", kind: "text", width: 90 },
      { key: "qty", label: "수량", kind: "int", width: 60 },
      { key: "weight", label: "중량", kind: "weight", width: 80 },
      { key: "tag", label: "Tag", kind: "weight", width: 70 },
      { key: "q", label: "Q", kind: "int", width: 52 },
      { key: "due_date", label: "납기", kind: "date", width: 120 },
      { key: "raw_weight", label: "원중량", kind: "weight", width: 80 },
      { key: "note", label: "비고", kind: "text", width: 80 },
    ],
    out: [
      { key: "serial", label: "일련번호", kind: "text", width: 150 },
      { key: "description", label: "내역", kind: "text", width: 90 },
      { key: "qty", label: "수량", kind: "int", width: 60 },
      { key: "weight", label: "실중량", kind: "weight", width: 80, editable: true },
      { key: "tag", label: "Tag", kind: "weight", width: 70 },
      { key: "tag_fixed", label: "Tag수정", kind: "weight", width: 80, editable: true },
      { key: "tag_weight", label: "Tag중량", kind: "weight", width: 80, editable: true },
      { key: "tag_loss", label: "Tag로스", kind: "weight", width: 80, editable: true },
      { key: "weight", label: "출고중량", kind: "weight", width: 80, computed: "ship" },
      { key: "q", label: "Q", kind: "int", width: 52 },
      { key: "due_date", label: "납기", kind: "date", width: 120 },
      { key: "note", label: "비고", kind: "text", width: 80 },
    ],
  },
  work: {
    in: [
      { key: "serial", label: "일련번호", kind: "text", width: 130 },
      { key: "description", label: "내역", kind: "text", width: 90 },
      { key: "qty", label: "수량", kind: "int", width: 60 },
      { key: "weight", label: "입중량", kind: "weight", width: 80 },
      { key: "tag", label: "Tag", kind: "weight", width: 70 },
      { key: "q", label: "Q", kind: "int", width: 52 },
      { key: "due_date", label: "납기", kind: "date", width: 120 },
      { key: "raw_weight", label: "원중량", kind: "weight", width: 80 },
      { key: "note", label: "비고", kind: "text", width: 80 },
    ],
    out: [
      { key: "serial", label: "일련번호", kind: "text", width: 150 },
      { key: "description", label: "내역", kind: "text", width: 90 },
      { key: "qty", label: "수량", kind: "int", width: 60 },
      { key: "weight_before", label: "작업전", kind: "weight", width: 80 },
      { key: "weight", label: "작업후", kind: "weight", width: 80, editable: true },
      { key: "weight", label: "로스", kind: "weight", width: 70, computed: "loss" },
      { key: "weight", label: "로스율", kind: "weight", width: 70, computed: "lossRate" },
      { key: "tag", label: "Tag", kind: "weight", width: 70 },
      { key: "q", label: "Q", kind: "int", width: 52 },
      { key: "due_date", label: "납기", kind: "date", width: 120 },
      { key: "note", label: "비고", kind: "text", width: 80 },
    ],
  },
  entry: {
    in: [
      { key: "description", label: "내역", kind: "text", width: 110 },
      { key: "qty", label: "수량", kind: "int", width: 70 },
      { key: "weight", label: "중량", kind: "weight", width: 90 },
      { key: "tag", label: "Tag", kind: "weight", width: 80 },
      { key: "q", label: "Q", kind: "int", width: 60 },
      { key: "due_date", label: "납기", kind: "date", width: 130 },
      { key: "raw_weight", label: "원중량(수리)", kind: "weight", width: 100 },
      { key: "note", label: "비고", kind: "text", width: 110 },
    ],
    out: [],
  },
};

export const TAG_PER_GRAM = 0.035;

export function fmtWeight(v: unknown): string {
  if (v === null || v === undefined || v === "") return "";
  const n = Number(v);
  return Number.isFinite(n) ? n.toFixed(2) : "";
}

// 출고/완료 자동 계산값
export function shipWeight(l: Lot): number | null {
  if (l.weight == null) return null;
  return (
    Number(l.weight) + Number(l.tag ?? 0) - Number(l.tag_weight ?? 0)
  );
}
export function lossOf(l: Lot): number | null {
  if (l.weight_before == null || l.weight == null) return null;
  return Number(l.weight_before) - Number(l.weight);
}
export function lossRateOf(l: Lot): number | null {
  if (!l.weight_before || l.weight == null) return null;
  return 1 - Number(l.weight) / Number(l.weight_before);
}
