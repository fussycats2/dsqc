// 업로드.xlsm 백업/복원 — 공정 시트(시트명=공정명)의 in/out 블록에 lots 주입/파싱.
//  · 수식(io:Y 출고중량, work:R 로스·S 로스율)·스타일·VBA(vbaProject.bin)·다른 시트 전부 보존(바이트 복사).
//  · 행 구조: 11=합계, 12=헤더, 13~=데이터. io 입고 A:K / 출고 L:Y, work 작업중 A(현황)+B:L / 완료 M:Z.
//  · 잠금(locked) 마커(엑셀엔 플래그 없음, VBA 검증): io입고=J투입시간 / work작업중=A현황'완료' / work완료=Y이관·출고시간.
//  · 서버 전용(node fs + jszip).
import JSZip from "jszip";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { COLUMNS, type ColDef, type Lot, type SchemaType } from "./types";

const NFC = (s: string) => s.normalize("NFC");

// 한글 파일명 정규화(NFC/NFD) 불일치로 readFile 실패하는 것 방지 — readdir로 실제 바이트 경로 확보.
async function templatePath(): Promise<string> {
  const dir = path.join(process.cwd(), "templates");
  const files = await readdir(dir);
  const hit = files.find(
    (f) => f.toLowerCase().endsWith(".xlsm") && NFC(f).includes(NFC("업로드")),
  );
  if (!hit) throw new Error("templates/업로드.xlsm 템플릿을 찾을 수 없습니다.");
  return path.join(dir, hit);
}

// 1=A, 2=B, ... 27=AA
function colLetter(n: number): string {
  let s = "";
  while (n > 0) {
    const m = (n - 1) % 26;
    s = String.fromCharCode(65 + m) + s;
    n = (n - m - 1) / 26;
  }
  return s;
}
const xmlEsc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
const xmlUnesc = (s: string) =>
  s
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&apos;/g, "'")
    .replace(/&amp;/g, "&");

type IoOrWork = Exclude<SchemaType, "entry">;
// 블록 = 시작 열(1=A) + 컬럼 정의(순서=엑셀 열). work 작업중은 A=현황이라 데이터가 B(2)부터.
type Block = { start: number; cols: ColDef[]; statusCol?: number };
function layout(schema: IoOrWork): { in: Block; out: Block } {
  return schema === "io"
    ? { in: { start: 1, cols: COLUMNS.io.in }, out: { start: 12, cols: COLUMNS.io.out } }
    : { in: { start: 2, cols: COLUMNS.work.in, statusCol: 1 }, out: { start: 13, cols: COLUMNS.work.out } };
}

// 시트 이름(NFC) → worksheets/sheetN.xml 경로
async function sheetMap(zip: JSZip): Promise<Map<string, string>> {
  const wb = await zip.file("xl/workbook.xml")!.async("string");
  const rels = await zip.file("xl/_rels/workbook.xml.rels")!.async("string");
  const targets = new Map<string, string>();
  for (const m of rels.matchAll(/<Relationship [^>]*Id="(rId\d+)"[^>]*Target="([^"]+)"/g))
    targets.set(m[1], "xl/" + m[2].replace(/^\/?xl\//, ""));
  const map = new Map<string, string>();
  for (const m of wb.matchAll(/<sheet [^>]*name="([^"]+)"[^>]*r:id="(rId\d+)"/g)) {
    const p = targets.get(m[2]);
    if (p) map.set(NFC(m[1]), p);
  }
  return map;
}

// ───────── 채우기(백업) ─────────

// <c r="REF" .../> 또는 <c r="REF" ...>..</c> → 스타일(s) 보존하고 값 주입.
function setCell(xml: string, ref: string, value: number | string): string {
  const re = new RegExp(`<c r="${ref}"([^>]*?)(/>|>.*?</c>)`);
  return xml.replace(re, (_m, attrs: string) => {
    const s = /\ss="\d+"/.exec(attrs);
    const sAttr = s ? s[0] : "";
    if (typeof value === "number") return `<c r="${ref}"${sAttr}><v>${value}</v></c>`;
    return `<c r="${ref}"${sAttr} t="inlineStr"><is><t xml:space="preserve">${xmlEsc(value)}</t></is></c>`;
  });
}

// lot의 한 칸 값 → 숫자/문자 (원중량은 콤마결합 가능 → 항상 문자)
function cellFor(lot: Lot, col: ColDef): number | string | null {
  const raw = lot[col.key];
  if (raw == null || raw === "") return null;
  if (col.key === "raw_weight") return String(raw);
  if (col.kind === "int" || col.kind === "weight") {
    const n = Number(raw);
    return Number.isFinite(n) && String(raw).trim() !== "" ? n : String(raw);
  }
  return String(raw);
}

function fillSheet(xml: string, schema: IoOrWork, lotsIn: Lot[], lotsOut: Lot[]): string {
  const lay = layout(schema);
  let cur = xml;
  const writeBlock = (block: Block, lots: Lot[]) => {
    lots.forEach((lot, i) => {
      const row = 13 + i;
      if (block.statusCol && lot.locked) // work 작업중 A=현황: 잠금이면 '완료'
        cur = setCell(cur, colLetter(block.statusCol) + row, "완료");
      block.cols.forEach((col, ci) => {
        if (col.computed) return; // 수식 칸(Y / R·S)은 건드리지 않음
        const v = cellFor(lot, col);
        if (v == null) return; // 빈 값은 스타일만 있는 빈 셀로 둠
        cur = setCell(cur, colLetter(block.start + ci) + row, v);
      });
    });
  };
  writeBlock(lay.in, lotsIn);
  writeBlock(lay.out, lotsOut);
  return cur;
}

// 다운로드 .xlsm 후처리(결산서와 동일): 열 때 전체 재계산 + calcChain 제거(복구 경고 방지).
async function finalize(zip: JSZip): Promise<Buffer> {
  let wbx = await zip.file("xl/workbook.xml")!.async("string");
  if (!/fullCalcOnLoad/.test(wbx)) {
    wbx = /<calcPr\b/.test(wbx)
      ? wbx.replace(/<calcPr\b/, '<calcPr fullCalcOnLoad="1"')
      : wbx.replace("</workbook>", '<calcPr fullCalcOnLoad="1"/></workbook>');
    zip.file("xl/workbook.xml", wbx);
  }
  if (zip.file("xl/calcChain.xml")) {
    zip.remove("xl/calcChain.xml");
    const ct = await zip.file("[Content_Types].xml")!.async("string");
    zip.file("[Content_Types].xml", ct.replace(/<Override PartName="\/xl\/calcChain\.xml"[^>]*\/>/, ""));
    const rels = await zip.file("xl/_rels/workbook.xml.rels")!.async("string");
    zip.file("xl/_rels/workbook.xml.rels", rels.replace(/<Relationship [^>]*Target="calcChain\.xml"[^>]*\/>/, ""));
  }
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

type ProcMeta = { id: string; name: string; schema_type: SchemaType };

// 공정·lots → 채워진 .xlsm 버퍼
export async function fillUploadXlsm(procs: ProcMeta[], lots: Lot[]): Promise<Buffer> {
  const tpl = await readFile(await templatePath());
  const zip = await JSZip.loadAsync(tpl);
  const sheets = await sheetMap(zip);
  const byId = new Map(procs.map((p) => [p.id, p]));

  // 공정명(NFC) → {schema, in, out}
  const groups = new Map<string, { schema: IoOrWork; in: Lot[]; out: Lot[] }>();
  for (const lot of lots) {
    const p = byId.get(lot.process_id);
    if (!p || p.schema_type === "entry") continue;
    const key = NFC(p.name);
    let g = groups.get(key);
    if (!g) { g = { schema: p.schema_type, in: [], out: [] }; groups.set(key, g); }
    (lot.side === "in" ? g.in : g.out).push(lot);
  }
  const sorter = (a: Lot, b: Lot) =>
    (a.created_at ?? "").localeCompare(b.created_at ?? "") || a.id.localeCompare(b.id);
  for (const [name, g] of groups) {
    const sp = sheets.get(name);
    if (!sp) continue; // 시트 없는 공정은 건너뜀
    g.in.sort(sorter);
    g.out.sort(sorter);
    let xml = await zip.file(sp)!.async("string");
    xml = fillSheet(xml, g.schema, g.in, g.out);
    zip.file(sp, xml);
  }
  return finalize(zip);
}

// ───────── 파싱(복원) ─────────

export type ParsedLot = { processName: string; side: "in" | "out"; locked: boolean } & Partial<
  Pick<
    Lot,
    | "serial" | "description" | "qty" | "weight" | "weight_in" | "weight_before"
    | "tag" | "tag_fixed" | "tag_weight" | "tag_loss" | "q" | "due_date"
    | "raw_weight" | "note" | "prev_part_name" | "moved_at" | "moved_to_name"
  >
>;

async function sharedStrings(zip: JSZip): Promise<string[]> {
  const f = zip.file("xl/sharedStrings.xml");
  if (!f) return [];
  const xml = await f.async("string");
  const arr: string[] = [];
  for (const si of xml.matchAll(/<si>([\s\S]*?)<\/si>/g)) {
    let s = "";
    for (const t of si[1].matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)) s += t[1];
    arr.push(xmlUnesc(s));
  }
  return arr;
}

// 셀 한 칸 값(숫자/문자/null). 엑셀 저장 시 문자→sharedString(t="s")으로 바뀌므로 모두 처리.
function cellValue(attrs: string, inner: string, shared: string[]): number | string | null {
  const tm = /\st="(\w+)"/.exec(attrs);
  const t = tm ? tm[1] : "";
  if (t === "s") {
    const vm = /<v>(\d+)<\/v>/.exec(inner);
    return vm ? shared[Number(vm[1])] ?? null : null;
  }
  if (t === "inlineStr") {
    let s = "";
    for (const m of inner.matchAll(/<t[^>]*>([\s\S]*?)<\/t>/g)) s += m[1];
    return xmlUnesc(s);
  }
  if (t === "str") {
    const vm = /<v>([\s\S]*?)<\/v>/.exec(inner);
    return vm ? xmlUnesc(vm[1]) : null;
  }
  const vm = /<v>([\s\S]*?)<\/v>/.exec(inner);
  if (!vm) return null;
  const n = Number(vm[1]);
  return Number.isNaN(n) ? null : n;
}

function rowCells(rowInner: string, shared: string[]): Map<string, number | string> {
  const map = new Map<string, number | string>();
  for (const cm of rowInner.matchAll(/<c r="([A-Z]+)\d+"([^>]*?)(\/>|>([\s\S]*?)<\/c>)/g)) {
    const v = cellValue(cm[2], cm[4] ?? "", shared);
    if (v != null && v !== "") map.set(cm[1], v);
  }
  return map;
}

function normField(col: ColDef, raw: number | string): number | string | null {
  if (col.key === "raw_weight") return String(raw);
  if (col.kind === "int") { const n = Number(raw); return Number.isFinite(n) ? Math.round(n) : null; }
  if (col.kind === "weight") { const n = Number(raw); return Number.isFinite(n) ? n : null; }
  return String(raw);
}

function readBlock(
  cells: Map<string, number | string>,
  block: Block,
  schema: IoOrWork,
  name: string,
  side: "in" | "out",
): ParsedLot | null {
  const rec: Record<string, unknown> = { processName: name, side, locked: false };
  let has = false;
  block.cols.forEach((col, ci) => {
    if (col.computed) return;
    const raw = cells.get(colLetter(block.start + ci));
    if (raw == null || raw === "") return;
    has = true;
    rec[col.key] = normField(col, raw);
  });
  if (!has) return null;
  // 잠금 판정 (VBA 검증 규칙)
  if (schema === "io") {
    rec.locked = side === "in" ? rec.moved_at != null && rec.moved_at !== "" : false;
  } else {
    if (side === "in") {
      const st = block.statusCol ? cells.get(colLetter(block.statusCol)) : null;
      rec.locked = typeof st === "string" && st.trim() === "완료";
    } else {
      rec.locked = rec.moved_at != null && rec.moved_at !== "";
    }
  }
  return rec as ParsedLot;
}

// 업로드된 .xlsm → ParsedLot[] (공정명·side·잠금 + 필드)
export async function parseUploadXlsm(buf: Buffer, procs: ProcMeta[]): Promise<ParsedLot[]> {
  const zip = await JSZip.loadAsync(buf);
  const sheets = await sheetMap(zip);
  const shared = await sharedStrings(zip);
  const out: ParsedLot[] = [];
  for (const p of procs) {
    if (p.schema_type === "entry") continue;
    const sp = sheets.get(NFC(p.name));
    if (!sp) continue;
    const xml = await zip.file(sp)!.async("string");
    const lay = layout(p.schema_type);
    for (const rm of xml.matchAll(/<row r="(\d+)"[^>]*>([\s\S]*?)<\/row>/g)) {
      if (Number(rm[1]) < 13) continue;
      const cells = rowCells(rm[2], shared);
      const a = readBlock(cells, lay.in, p.schema_type, p.name, "in");
      if (a) out.push(a);
      const b = readBlock(cells, lay.out, p.schema_type, p.name, "out");
      if (b) out.push(b);
    }
  }
  return out;
}
