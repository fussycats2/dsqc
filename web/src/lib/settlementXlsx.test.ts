import { describe, it, expect } from "vitest";
import { fillSettlementXlsm, parseSettlementXlsm } from "./settlementXlsx";

describe("결산서 엑셀 백업/복원 라운드트립", () => {
  it("채우기 → 파싱 시 입력셀 + 현분잔량(별칭) 값 보존", async () => {
    const data = { B5: 10, C5: 20.5, B18: 9937.85, C19: 3516.43, C9: 1.2, B42: 1159.88, C45: 5.5, hbjr18: 120.5, hbjr14: 33.2 };
    const buf = await fillSettlementXlsm(data, "2026-05-20");
    const back = await parseSettlementXlsm(buf);
    for (const [k, v] of Object.entries(data)) expect(back[k]).toBe(v);
  });

  it("빈 셀 제외, 매크로 보존, 날짜·fullCalcOnLoad 반영", async () => {
    const JSZip = (await import("jszip")).default;
    const buf = await fillSettlementXlsm({ B5: 1 }, "2026-05-20");
    const back = await parseSettlementXlsm(buf);
    expect(back.C5).toBeUndefined();
    const zip = await JSZip.loadAsync(buf);
    expect(zip.file("xl/vbaProject.bin")).not.toBeNull();               // VBA 보존
    const wbx = await zip.file("xl/workbook.xml")!.async("string");
    expect(wbx).toContain("fullCalcOnLoad");                             // 재계산 강제
    expect(zip.file("xl/calcChain.xml")).toBeNull();                    // calcChain 제거(복구경고 방지)
    const ct = await zip.file("[Content_Types].xml")!.async("string");
    expect(ct).not.toContain("calcChain");                              // content-type 정리
    const rels = await zip.file("xl/_rels/workbook.xml.rels")!.async("string");
    expect(rels).not.toContain("calcChain");                            // rels 정리(댕글링 없음)
    const sheet = await zip.file("xl/worksheets/sheet20.xml")!.async("string");
    expect(sheet).toMatch(/<c r="A2"[^>]*><v>46162<\/v><\/c>/);          // 2026-05-20 일련번호
  });
});
