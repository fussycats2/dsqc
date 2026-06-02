// 엑셀 원본 열과 1:1 (docs/05_정밀스펙.md). io/work × in/out 4형.
export type SchemaType = "io" | "work" | "entry";
export type CellKind = "int" | "weight" | "datetime" | "text" | "status";

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
  raw_weight: string | null;    // 원중량 — 자유 텍스트(집계 시 중복제거-결합, VBA textAlways)
  note: string | null;
  prev_part_name: string | null;// 이전파트 표시(io출고 U / work작업중 L)
  prev_process_id: string | null;
  moved_at: string | null;      // 투입시간(io입고 J) / 이관·출고시간(work완료 Y)
  moved_to_name: string | null; // 투입부서(io입고 K) / 이관파트(work완료 Z)
  status: "대기" | "작업중" | "완료";
  locked: boolean;
  work_date: string | null;     // 작업일(YYYY-MM-DD) — 날짜별 관리/조회/마감
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
  computed?: "loss" | "lossRate" | "ship";     // 자동 계산 표시 칸(표·모달 미리보기)
  autoFit?: boolean;                            // 줄바꿈 없이 셀 폭에 맞춰 글자 자동 축소(투입부서·이전파트 등 넓힌 칸)
  bold?: boolean;                               // 데이터 굵게(io 중량·출고중량, work 중량·작업후 — 핵심 중량)
}

// ───────── 계보 추적 (lot_links 그래프) ─────────
// 일련번호 클릭 → 한 행이 거쳐온/거쳐갈 전 공정 경로(이동·집계·분할)
export type LotRelation = "move" | "merge" | "split";
export interface TraceNode {
  id: string;
  serial: string | null;
  side: "in" | "out";
  description: string | null;
  qty: number | null;
  weight: number | null;
  weight_before: number | null;
  created_at: string;
  moved_at: string | null;
  locked: boolean;
  process_id: string;
  process_name: string;
  karat: "18K" | "14K" | null;
  schema_type: SchemaType;
}
export interface TraceEdge { from: string; to: string; relation: LotRelation; }
export interface TraceResult { nodes: TraceNode[]; edges: TraceEdge[]; rootId: string; }

// 노드 단계 라벨(공정=작업중/완료, 부서·검수=입고/출고)
export function stageLabel(schemaType: SchemaType, side: "in" | "out"): string {
  if (schemaType === "work") return side === "in" ? "작업중" : "완료";
  return side === "in" ? "입고" : "출고";
}
export const RELATION_LABEL: Record<LotRelation, string> = {
  move: "이동", merge: "집계", split: "분할",
};

// ───────── io 계열 (일반공정 + 검수) ─────────
// 입고블록 A:K, 출고블록 L:Y
// 폭(좌/우 비례배분): 내역·수량·비고 축소(줄바꿈↓), 입고=투입부서↑ · 출고=이전파트↑
//  · 카드 폭을 열 합폭에 비례 배분(ProcessView)하므로 같은 nominal 폭이면 좌/우 같은 px로 렌더 → 일련번호도 동일값
const IO_IN: ColDef[] = [
  { key: "serial", label: "일련번호", kind: "text", width: 148 },  // 출고와 동일(카드 비례배분으로 같은 px)
  { key: "description", label: "내역", kind: "text", width: 80, autoFit: true },
  { key: "qty", label: "수량", kind: "int", width: 38 },
  { key: "weight", label: "중량", kind: "weight", width: 64, bold: true },
  { key: "tag", label: "Tag", kind: "weight", width: 56 },
  { key: "q", label: "Q", kind: "weight", width: 48 },
  { key: "due_date", label: "납기", kind: "text", width: 54 },
  { key: "raw_weight", label: "원중량", kind: "weight", width: 62 },
  { key: "note", label: "비고", kind: "text", width: 53, autoFit: true },
  { key: "moved_at", label: "투입시간", kind: "datetime", width: 64 },  // 데이터 "일 HH:MM"=짧음 → 축소
  { key: "moved_to_name", label: "투입부서", kind: "text", width: 98, autoFit: true }, // 넘치면 글자 자동 축소
];
const IO_OUT: ColDef[] = [
  { key: "serial", label: "일련번호", kind: "text", width: 148 },  // 입고와 동일(카드 비례배분으로 같은 px)
  { key: "description", label: "내역", kind: "text", width: 80, autoFit: true },
  { key: "qty", label: "수량", kind: "int", width: 38 },
  { key: "weight", label: "실중량", kind: "weight", width: 64 },   // 표=이전파트 이월(읽기), 모달=수정 가능
  { key: "tag", label: "Tag", kind: "weight", width: 56 },
  { key: "q", label: "Q", kind: "weight", width: 48 },
  { key: "due_date", label: "납기", kind: "text", width: 54 },
  { key: "raw_weight", label: "원중량", kind: "weight", width: 62 },
  { key: "note", label: "비고", kind: "text", width: 53, autoFit: true },
  { key: "prev_part_name", label: "이전파트", kind: "text", width: 105, autoFit: true }, // 넘치면 글자 자동 축소
  { key: "tag_fixed", label: "Tag수정", kind: "weight", width: 56 },  // 표=Tag보정 모달 전용, 모달=수정 가능
  { key: "tag_weight", label: "Tag중량", kind: "weight", width: 56 }, // Tag보정=ROUNDDOWN 자동
  { key: "tag_loss", label: "Tag로스", kind: "weight", width: 56 },   // Tag보정=Tag−Tag중량 자동
  { key: "weight", label: "출고중량", kind: "weight", width: 66, computed: "ship", bold: true },
];

// ───────── work 계열 (연마·뻥·빠우) ─────────
// 작업중블록(완료블록 M:Z) — 현황(A) 열은 제거: 잠금=완료/미잠금=재고로 구분
const WORK_IN: ColDef[] = [
  { key: "serial", label: "일련번호", kind: "text", width: 153 },  // 완료와 동일(카드 비례배분으로 같은 px)
  { key: "description", label: "내역", kind: "text", width: 80, autoFit: true },
  { key: "qty", label: "수량", kind: "int", width: 38 },
  { key: "weight_in", label: "입중량", kind: "weight", width: 64 },
  { key: "tag", label: "Tag", kind: "weight", width: 56 },
  { key: "q", label: "Q", kind: "weight", width: 48 },
  { key: "due_date", label: "납기", kind: "text", width: 54 },
  { key: "raw_weight", label: "원중량", kind: "weight", width: 62 },
  { key: "note", label: "비고", kind: "text", width: 53, autoFit: true },
  { key: "weight", label: "중량", kind: "weight", width: 64, bold: true },
  { key: "prev_part_name", label: "이전파트", kind: "text", width: 119, autoFit: true }, // "파트명 일 HH:MM" 길어 — 넘치면 글자 자동 축소
];
const WORK_OUT: ColDef[] = [
  { key: "serial", label: "일련번호", kind: "text", width: 153 },  // 작업중과 동일(카드 비례배분으로 같은 px)
  { key: "description", label: "내역", kind: "text", width: 80, autoFit: true },
  { key: "qty", label: "수량", kind: "int", width: 38 },
  { key: "weight_before", label: "작업전", kind: "weight", width: 64 }, // 표=집계 합(읽기), 모달=수정 가능
  { key: "weight", label: "작업후", kind: "weight", width: 64, bold: true },
  { key: "weight", label: "로스", kind: "weight", width: 56, computed: "loss" },
  { key: "weight", label: "로스율", kind: "weight", width: 58, computed: "lossRate" },
  { key: "tag", label: "Tag", kind: "weight", width: 56 },
  { key: "q", label: "Q", kind: "weight", width: 48 },
  { key: "due_date", label: "납기", kind: "text", width: 54 },
  { key: "raw_weight", label: "원중량", kind: "weight", width: 62 },
  { key: "note", label: "비고", kind: "text", width: 53, autoFit: true },
  { key: "moved_at", label: "이관/출고시간", kind: "datetime", width: 70 }, // 데이터 "일 HH:MM"=짧음 → 축소
  { key: "moved_to_name", label: "이관파트", kind: "text", width: 112, autoFit: true }, // 넘치면 글자 자동 축소
];

// ───────── 작성 (entry) B:I ─────────
const ENTRY_IN: ColDef[] = [
  { key: "description", label: "내역", kind: "text", width: 96 },
  { key: "qty", label: "수량", kind: "int", width: 52 },
  { key: "weight", label: "중량", kind: "weight", width: 64 },
  { key: "tag", label: "Tag", kind: "weight", width: 56 },
  { key: "q", label: "Q", kind: "weight", width: 48 },
  { key: "due_date", label: "납기", kind: "text", width: 76 },
  { key: "raw_weight", label: "원중량(수리)", kind: "weight", width: 80 },
  { key: "note", label: "비고", kind: "text", width: 88 },
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
// 투입/이관·출고시간(moved_at, timestamptz=UTC) → KST '일 HH:MM' 표시.
//  DB엔 UTC로 저장되므로 +9h 해서 한국 시각으로 보여줌(엑셀 백업도 KST라 일치).
export function fmtKstDayTime(v: unknown): string {
  if (v === null || v === undefined || v === "") return "";
  const d = new Date(String(v));
  if (Number.isNaN(d.getTime())) {
    const s = String(v); // 비ISO 폴백(기존 슬라이스)
    return `${s.slice(8, 10)} ${s.slice(11, 16)}`;
  }
  const k = new Date(d.getTime() + 9 * 3600 * 1000); // UTC → KST
  const p = (n: number) => String(n).padStart(2, "0");
  return `${p(k.getUTCDate())} ${p(k.getUTCHours())}:${p(k.getUTCMinutes())}`;
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
