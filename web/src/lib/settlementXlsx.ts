// 품질결산서.xlsm 백업/복원 — .xlsm zip을 직접 열어 '일일결산서' 입력셀만 주입/파싱.
//  · 수식·스타일·VBA(vbaProject.bin)·다른 시트 전부 그대로 보존(바이트 복사).
//  · 서버 전용(node fs + jszip).
import JSZip from "jszip";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { INPUT_CELLS, CELL_ALIAS, type CellMap } from "./settlement";

// 엑셀 날짜 일련번호(1899-12-30 기준)
function excelSerial(date: string): number {
  const [y, m, d] = date.split("-").map(Number);
  return Math.round((Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000);
}

const TEMPLATE_PATH = path.join(process.cwd(), "templates", "품질결산서.xlsm");
const SHEET_NAME = "일일결산서";

// workbook.xml + rels로 시트 이름 → worksheets/sheetN.xml 경로 해석
async function resolveSheetPath(zip: JSZip): Promise<string> {
  const wb = await zip.file("xl/workbook.xml")!.async("string");
  const m = new RegExp(`<sheet [^>]*name="${SHEET_NAME}"[^>]*r:id="(rId\\d+)"`).exec(wb);
  if (!m) throw new Error(`'${SHEET_NAME}' 시트를 찾을 수 없습니다.`);
  const rels = await zip.file("xl/_rels/workbook.xml.rels")!.async("string");
  const t = new RegExp(`<Relationship [^>]*Id="${m[1]}"[^>]*Target="([^"]+)"`).exec(rels);
  if (!t) throw new Error("시트 관계(rels)를 해석할 수 없습니다.");
  return "xl/" + t[1].replace(/^\/?xl\//, "");
}

// <c r="REF" .../> 또는 <c r="REF" ...>...</c> → 스타일(s) 보존하고 <v>val</v> 주입
function injectCell(xml: string, ref: string, val: number): string {
  const re = new RegExp(`<c r="${ref}"([^>]*?)(/>|>.*?</c>)`);
  return xml.replace(re, (_m, attrs: string) => {
    const s = /\ss="\d+"/.exec(attrs);
    return `<c r="${ref}"${s ? s[0] : ""}><v>${val}</v></c>`;
  });
}

// 결산 데이터 → 채워진 .xlsm 버퍼 (다운로드용)
export async function fillSettlementXlsm(data: CellMap, workDate: string): Promise<Buffer> {
  const tpl = await readFile(TEMPLATE_PATH);
  const zip = await JSZip.loadAsync(tpl);
  const sheetPath = await resolveSheetPath(zip);
  let xml = await zip.file(sheetPath)!.async("string");
  for (const ref of INPUT_CELLS) {
    const v = data[ref];
    if (v != null) xml = injectCell(xml, ref, v);
  }
  // 현분잔량 등 웹 전용 키 → 매핑된 빈 셀
  for (const [key, cell] of Object.entries(CELL_ALIAS)) {
    const v = data[key];
    if (v != null) xml = injectCell(xml, cell, v);
  }
  // 날짜(A2) = 작업일 (스타일=날짜서식 보존)
  xml = injectCell(xml, "A2", excelSerial(workDate));
  zip.file(sheetPath, xml);

  // 열 때 전체 재계산 강제 — SUM 등 외부편집 셀의 캐시 미갱신(더블클릭해야 계산) 방지
  let wbx = await zip.file("xl/workbook.xml")!.async("string");
  if (!/fullCalcOnLoad/.test(wbx)) {
    wbx = /<calcPr\b/.test(wbx)
      ? wbx.replace(/<calcPr\b/, '<calcPr fullCalcOnLoad="1"')
      : wbx.replace("</workbook>", '<calcPr fullCalcOnLoad="1"/></workbook>');
    zip.file("xl/workbook.xml", wbx);
  }

  // calcChain.xml 제거(외부편집으로 실제 셀과 어긋나 '복구' 경고 유발) — 관련 rels·content-type까지 정리.
  //  fullCalcOnLoad로 엑셀이 열 때 계산체인을 새로 만든다.
  if (zip.file("xl/calcChain.xml")) {
    zip.remove("xl/calcChain.xml");
    const ct = await zip.file("[Content_Types].xml")!.async("string");
    zip.file("[Content_Types].xml", ct.replace(/<Override PartName="\/xl\/calcChain\.xml"[^>]*\/>/, ""));
    const rels = await zip.file("xl/_rels/workbook.xml.rels")!.async("string");
    zip.file("xl/_rels/workbook.xml.rels", rels.replace(/<Relationship [^>]*Target="calcChain\.xml"[^>]*\/>/, ""));
  }
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

// 업로드된 .xlsm → 결산 데이터(입력셀 값만)
export async function parseSettlementXlsm(buf: Buffer): Promise<CellMap> {
  const zip = await JSZip.loadAsync(buf);
  const sheetPath = await resolveSheetPath(zip);
  const xml = await zip.file(sheetPath)!.async("string");
  const data: CellMap = {};
  const read = (cell: string): number | null => {
    // 입력셀은 t 속성 없는 숫자(<v>). 비어있으면 self-closing → 매칭 안 됨(건너뜀).
    const m = new RegExp(`<c r="${cell}"(?![^>]*t=")[^>]*><v>([^<]*)</v></c>`).exec(xml);
    if (!m) return null;
    const n = Number(m[1]);
    return Number.isNaN(n) ? null : n;
  };
  for (const ref of INPUT_CELLS) {
    const v = read(ref);
    if (v != null) data[ref] = v;
  }
  for (const [key, cell] of Object.entries(CELL_ALIAS)) {
    const v = read(cell);
    if (v != null) data[key] = v;
  }
  return data;
}
