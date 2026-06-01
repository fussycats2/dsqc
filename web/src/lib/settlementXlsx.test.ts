import { describe, it, expect } from "vitest";
import { fillSettlementXlsm, parseSettlementXlsm } from "./settlementXlsx";

describe("결산서 엑셀 백업/복원 라운드트립", () => {
  it("채우기 → 파싱 시 입력셀 값 보존", async () => {
    const data = { B5: 10, C5: 20.5, B18: 9937.85, C19: 3516.43, C9: 1.2, B42: 1159.88, C45: 5.5 };
    const buf = await fillSettlementXlsm(data);
    const back = await parseSettlementXlsm(buf);
    for (const [k, v] of Object.entries(data)) expect(back[k]).toBe(v);
  });

  it("빈 셀은 파싱 결과에 없음, 매크로(.xlsm) 보존", async () => {
    const JSZip = (await import("jszip")).default;
    const buf = await fillSettlementXlsm({ B5: 1 });
    const back = await parseSettlementXlsm(buf);
    expect(back.C5).toBeUndefined();
    const zip = await JSZip.loadAsync(buf);
    expect(zip.file("xl/vbaProject.bin")).not.toBeNull(); // VBA 보존
  });
});
