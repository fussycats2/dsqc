import { describe, it, expect } from "vitest";
import JSZip from "jszip";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fillUploadXlsm, parseUploadXlsm } from "./uploadXlsx";
import type { Lot, SchemaType } from "./types";

const procs: { id: string; name: string; schema_type: SchemaType }[] = [
  { id: "p-io", name: "기계", schema_type: "io" },
  { id: "p-wk", name: "연마(조립)", schema_type: "work" },
];

async function template(): Promise<Buffer> {
  const dir = path.join(process.cwd(), "templates");
  const files = await readdir(dir);
  const hit = files.find(
    (f) => f.toLowerCase().endsWith(".xlsm") && f.normalize("NFC").includes("업로드".normalize("NFC")),
  )!;
  return readFile(path.join(dir, hit));
}

const lot = (o: Partial<Lot>): Lot => ({
  id: o.id ?? Math.random().toString(36).slice(2),
  serial: null, process_id: "", side: "in",
  description: null, qty: null, weight: null, weight_in: null, weight_before: null,
  tag: null, tag_fixed: null, tag_weight: null, tag_loss: null, q: null,
  due_date: null, raw_weight: null, note: null, prev_part_name: null, prev_process_id: null,
  moved_at: null, moved_to_name: null, status: "대기", locked: false,
  work_date: "2026-06-01", period_id: null, created_at: "2026-06-01T00:00:00Z",
  completed_at: null, updated_at: "2026-06-01T00:00:00Z", version: 1,
  ...o,
});

describe("uploadXlsx 백업/복원 왕복", () => {
  it("io/work · in/out · 잠금 마커가 보존되고 VBA가 유지된다", async () => {
    const lots: Lot[] = [
      lot({ id: "1", process_id: "p-io", side: "in", serial: "M_260601_001", description: "반지", qty: 3, weight: 12.34, tag: 0.07, raw_weight: "5.2" }),
      lot({ id: "2", process_id: "p-io", side: "in", serial: "M_260601_002", weight: 8, moved_at: "2026-06-01 10:00:00", moved_to_name: "연마(조립)", locked: true }),
      lot({ id: "3", process_id: "p-io", side: "out", serial: "M_260601_003", weight: 9.99, tag: 0.035 }),
      lot({ id: "4", process_id: "p-wk", side: "in", serial: "A_260601_001", weight: 7.5, prev_part_name: "기계" }),
      lot({ id: "5", process_id: "p-wk", side: "in", serial: "A_260601_002", weight: 6, locked: true }), // 현황=완료
      lot({ id: "6", process_id: "p-wk", side: "out", serial: "A_260601_003", weight_before: 10, weight: 9.5, moved_at: "2026-06-01 11:00:00", moved_to_name: "빠우(양장볼)", locked: true }),
      lot({ id: "7", process_id: "p-wk", side: "out", serial: "A_260601_004", weight_before: 5, weight: 4.8 }), // 미이관 → unlocked
    ];

    const buf = await fillUploadXlsm(await template(), procs, lots);

    // 매크로(VBA) 보존
    const zip = await JSZip.loadAsync(buf);
    expect(zip.file("xl/vbaProject.bin")).not.toBeNull();

    const parsed = await parseUploadXlsm(buf, procs);
    const find = (serial: string) => parsed.find((p) => p.serial === serial)!;

    expect(parsed.length).toBe(7);
    expect(find("M_260601_001").qty).toBe(3);
    expect(find("M_260601_001").weight).toBeCloseTo(12.34);
    expect(find("M_260601_001").raw_weight).toBe("5.2");
    expect(find("M_260601_001").description).toBe("반지");

    // 잠금 판정(VBA 규칙)
    expect(find("M_260601_002").locked).toBe(true); // io입고 투입시간 채워짐
    expect(find("M_260601_003").locked).toBe(false); // io출고 완료개념 없음
    expect(find("A_260601_001").locked).toBe(false);
    expect(find("A_260601_002").locked).toBe(true); // work작업중 현황=완료
    expect(find("A_260601_003").locked).toBe(true); // work완료 이관/출고시간
    expect(find("A_260601_004").locked).toBe(false); // work완료 미이관

    expect(find("A_260601_003").weight_before).toBeCloseTo(10);
    expect(find("A_260601_003").moved_to_name).toBe("빠우(양장볼)");
  });

  it("엑셀이 시간/납기를 날짜 일련번호(숫자)로 바꿔도 가져오기 안전", async () => {
    const lots: Lot[] = [
      lot({ id: "1", process_id: "p-io", side: "in", serial: "M_LOCK", weight: 5, due_date: "4/5", moved_at: "2026-06-01T01:00:00.000Z", moved_to_name: "연마(조립)", locked: true }),
    ];
    const buf = await fillUploadXlsm(await template(), procs, lots);

    // 엑셀로 열었다 저장하면 날짜형 텍스트가 숫자 serial로 바뀐다 → 시뮬레이션(시간·납기 둘 다)
    const zip = await JSZip.loadAsync(buf);
    for (const name of Object.keys(zip.files)) {
      if (!/^xl\/worksheets\/sheet\d+\.xml$/.test(name)) continue;
      let xml = await zip.file(name)!.async("string");
      xml = xml.replace(
        /<c r="([A-Z]+\d+)"([^>]*?) t="inlineStr"><is><t[^>]*>2026-\d\d-\d\d[ T][^<]*<\/t><\/is><\/c>/g,
        '<c r="$1"$2><v>46079.5</v></c>',
      );
      xml = xml.replace(
        /<c r="([A-Z]+\d+)"([^>]*?) t="inlineStr"><is><t[^>]*>4\/5<\/t><\/is><\/c>/g,
        '<c r="$1"$2><v>46117</v></c>', // 46117 = 2026-04-05
      );
      zip.file(name, xml);
    }
    const buf2 = await zip.generateAsync({ type: "uint8array" });

    const rec = (await parseUploadXlsm(buf2, procs)).find((p) => p.serial === "M_LOCK")!;
    expect(rec.locked).toBe(true); // 시간(serial)이 있으면 잠금 유지
    expect(rec.moved_at).toBeTruthy();
    expect(Number.isNaN(Date.parse(rec.moved_at as string))).toBe(false); // "46079.5"가 아니라 유효 타임스탬프
    expect(rec.due_date).toBe("4/5"); // 납기 일련번호 → 월/일 복구(숫자 아님)
  });
});
