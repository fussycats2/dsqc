// 품질결산서.xlsm 백업/복원 — .xlsm zip을 직접 열어 '일일결산서' 입력셀만 주입/파싱.
//  · 수식·스타일·VBA(vbaProject.bin)·다른 시트 전부 그대로 보존(바이트 복사).
//  · 서버 전용(node fs + jszip).
import JSZip from "jszip";
import { readFile } from "node:fs/promises";
import path from "node:path";
import { INPUT_CELLS, type CellMap } from "./settlement";

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
export async function fillSettlementXlsm(data: CellMap): Promise<Buffer> {
  const tpl = await readFile(TEMPLATE_PATH);
  const zip = await JSZip.loadAsync(tpl);
  const sheetPath = await resolveSheetPath(zip);
  let xml = await zip.file(sheetPath)!.async("string");
  for (const ref of INPUT_CELLS) {
    const v = data[ref];
    if (v == null) continue;
    xml = injectCell(xml, ref, v);
  }
  zip.file(sheetPath, xml);
  return zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
}

// 업로드된 .xlsm → 결산 데이터(입력셀 값만)
export async function parseSettlementXlsm(buf: Buffer): Promise<CellMap> {
  const zip = await JSZip.loadAsync(buf);
  const sheetPath = await resolveSheetPath(zip);
  const xml = await zip.file(sheetPath)!.async("string");
  const data: CellMap = {};
  for (const ref of INPUT_CELLS) {
    // 입력셀은 t 속성 없는 숫자(<v>). 비어있으면 self-closing → 매칭 안 됨(건너뜀).
    const m = new RegExp(`<c r="${ref}"(?![^>]*t=")[^>]*><v>([^<]*)</v></c>`).exec(xml);
    if (m) {
      const n = Number(m[1]);
      if (!Number.isNaN(n)) data[ref] = n;
    }
  }
  return data;
}
