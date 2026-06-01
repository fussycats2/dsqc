import { describe, it, expect } from "vitest";
import { buildGroupedSerial } from "@/lib/serial";

describe("buildGroupedSerial (집계 일련번호 병합 표기, Module7)", () => {
  it("단건이면 원본 그대로 유지", () => {
    expect(buildGroupedSerial(["M_260521_001"])).toBe("M_260521_001");
  });

  it("같은 접두부 2건 → (001,004) 묶음·정렬", () => {
    expect(buildGroupedSerial(["M_260521_004", "M_260521_001"])).toBe("M_260521_(001,004)");
  });

  it("분할 접미(-n)도 유효 접미로 묶음", () => {
    expect(buildGroupedSerial(["M_260521_001-2", "M_260521_001-1"])).toBe("M_260521_(001-1,001-2)");
  });

  it("null 값은 무시", () => {
    expect(buildGroupedSerial(["M_260521_001", null])).toBe("M_260521_001");
  });

  it("서로 다른 접두부는 정렬 후 ';'로 연결", () => {
    expect(buildGroupedSerial(["Y_260521_002", "M_260521_001"])).toBe("M_260521_001;Y_260521_002");
  });

  it("형식 불일치 값은 그대로 보존", () => {
    expect(buildGroupedSerial(["임의값"])).toBe("임의값");
  });

  it("중복 접미는 1개로", () => {
    expect(buildGroupedSerial(["M_260521_001", "M_260521_001"])).toBe("M_260521_001");
  });

  it("빈 배열 → 빈 문자열", () => {
    expect(buildGroupedSerial([])).toBe("");
  });
});
