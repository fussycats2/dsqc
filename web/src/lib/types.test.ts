import { describe, it, expect } from "vitest";
import {
  round2, fmtWeight, fmtInt, shipWeight, lossOf, lossRateOf, TAG_PER_GRAM, type Lot,
} from "@/lib/types";

// 최소 Lot 팩토리 (계산에 쓰는 필드만 채우고 나머지는 캐스팅)
const lot = (p: Partial<Lot>): Lot => p as Lot;

describe("round2 (부동소수점 2자리)", () => {
  it("0.1+0.2 → 0.3", () => expect(round2(0.1 + 0.2)).toBe(0.3));
  it("올림/내림", () => {
    expect(round2(1.236)).toBe(1.24);
    expect(round2(1.234)).toBe(1.23);
  });
  it("누적 합 오차 제거", () => expect(round2(0.07 * 3)).toBe(0.21));
});

describe("fmtWeight (천단위콤마+소수2자리)", () => {
  it("천단위·소수", () => expect(fmtWeight(1234.5)).toBe("1,234.50"));
  it("정수도 2자리", () => expect(fmtWeight(1000)).toBe("1,000.00"));
  it("빈값/널 → ''", () => {
    expect(fmtWeight(null)).toBe("");
    expect(fmtWeight("")).toBe("");
    expect(fmtWeight(undefined)).toBe("");
  });
});

describe("fmtInt (천단위콤마 정수)", () => {
  it("천단위", () => expect(fmtInt(1234)).toBe("1,234"));
  it("반올림", () => expect(fmtInt(1234.6)).toBe("1,235"));
  it("널 → ''", () => expect(fmtInt(null)).toBe(""));
});

describe("shipWeight (io 출고중량 Y=IF(O=0,'',IF(X=0,O,O+P-W)))", () => {
  it("실중량(O) 0 → null", () => {
    expect(shipWeight(lot({ weight: 0, tag: 1, tag_weight: 0.03, tag_loss: 0.005 }))).toBeNull();
  });
  it("Tag로스(X)=0 → 실중량 그대로(O)", () => {
    expect(shipWeight(lot({ weight: 10, tag: 1, tag_weight: 0.03, tag_loss: 0 }))).toBe(10);
  });
  it("Tag로스 있으면 O+P-W", () => {
    // 10 + 1 - 0.03 = 10.97
    expect(shipWeight(lot({ weight: 10, tag: 1, tag_weight: 0.03, tag_loss: 0.005 }))).toBe(10.97);
  });
});

describe("lossOf (work 로스 R = 작업전 P − 작업후 Q)", () => {
  it("작업전−작업후", () => expect(lossOf(lot({ weight_before: 10, weight: 9.5 }))).toBe(0.5));
  it("부동소수 보정", () => expect(lossOf(lot({ weight_before: 0.3, weight: 0.1 }))).toBe(0.2));
  it("작업전/후 null → null", () => {
    expect(lossOf(lot({ weight_before: null, weight: 9 }))).toBeNull();
    expect(lossOf(lot({ weight_before: 10, weight: null }))).toBeNull();
  });
});

describe("lossRateOf (S = 1 − 작업후/작업전)", () => {
  it("로스율", () => expect(lossRateOf(lot({ weight_before: 10, weight: 9 }))).toBeCloseTo(0.1, 10));
  it("작업전 0 → null(0 나눗셈 방지)", () => expect(lossRateOf(lot({ weight_before: 0, weight: 9 }))).toBeNull());
  it("작업후 null → null", () => expect(lossRateOf(lot({ weight_before: 10, weight: null }))).toBeNull());
});

describe("상수", () => {
  it("1 Tag = 0.035g", () => expect(TAG_PER_GRAM).toBe(0.035));
});
