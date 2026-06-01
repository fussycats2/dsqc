import { describe, it, expect } from "vitest";
import { derive, carryData, type CellMap } from "./settlement";

describe("결산서 수식(derive)", () => {
  it("부서별거래 계 = 입고/출고 합", () => {
    const d: CellMap = { B5: 10, C5: 20, D5: 5, E6: 3, F6: 7 };
    const f = derive(d);
    expect(f.J5).toBe(35);   // 10+20+5
    expect(f.J6).toBe(10);   // 3+7
  });

  it("분석투입량 L=SUM(C:J)-K, M=B+L, 계/누계", () => {
    // 연마(9): 전일누계 B9=100, 항목 C9..J9 합=50, 바코드 K9=8 → L9=42, M9=142
    const d: CellMap = { B9: 100, C9: 30, D9: 20, K9: 8 };
    const f = derive(d);
    expect(f.L9).toBe(42);
    expect(f.M9).toBe(142);
    // 계행은 9~11 합 (여기선 9행만)
    expect(f.M12).toBe(142);
    // 당일누계 K13 = I13 + 바코드계 K12(=8)
    expect(derive({ ...d, I13: 5 }).K13).toBe(13);
  });

  it("재고결산: 장부재고=전일재고+입고-출고, 차중량=실재고-장부재고", () => {
    const d: CellMap = { B18: 1000, B5: 200, C6: 50 };
    const f = derive(d);
    expect(f.J5).toBe(200);
    expect(f.J6).toBe(50);
    expect(f.B24).toBe(1150);           // 1000+200-50
    expect(f.C24).toBe(f.A24 - 1150);   // 차중량
  });

  it("위탁 분석중량 B21 = (C+D+E+F19) - (I+J+K+L19)", () => {
    const d: CellMap = { C19: 100, D19: 50, I19: 30, K19: 20 };
    expect(derive(d).B21).toBe(100);    // 150 - 50
  });
});

describe("결산서 이월(carryData)", () => {
  it("오늘 마감값 → 내일 전일값 8개 매핑", () => {
    const prev: CellMap = { B9: 100, C9: 30, D9: 20, K9: 8, B18: 1000, B5: 200, C6: 50, I13: 5 };
    const f = derive(prev);
    const next = carryData(prev);
    expect(next.B9).toBe(f.M9);    // 분석투입 전일누계 ← 오늘 누계
    expect(next.B18).toBe(f.B24);  // 전일재고 ← 오늘 장부재고
    expect(next.I13).toBe(f.K13);  // 분석 전일누계 ← 오늘 당일누계
  });

  it("보존값(위탁 분석중량·고정값)은 그대로 유지, 나머지는 비움", () => {
    const prev: CellMap = { C19: 3516.43, K21: 99, B5: 200 };
    const next = carryData(prev);
    expect(next.C19).toBe(3516.43); // 보존
    expect(next.K21).toBe(99);      // 고정값 보존
    expect(next.B5).toBeUndefined(); // 일반 입력은 비워짐
  });
});
