"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/fetchAll";
import { carryData, type CellMap } from "@/lib/settlement";
import { round2, shipWeight, type Lot } from "@/lib/types";

// 결산서 데이터 조회 (없으면 빈 객체)
export async function getSettlement(workDate: string): Promise<CellMap> {
  const supabase = await createClient();
  const { data } = await supabase
    .from("settlements").select("data").eq("work_date", workDate).maybeSingle();
  return (data?.data as CellMap) ?? {};
}

// 결산서 저장 (upsert)
export async function saveSettlement(workDate: string, cells: CellMap) {
  const supabase = await createClient();
  const { error } = await supabase
    .from("settlements")
    .upsert({ work_date: workDate, data: cells, updated_at: new Date().toISOString() });
  if (error) return { error: error.message };
  revalidatePath("/settlement");
  return { ok: true };
}

const hasData = (d: CellMap | null | undefined) =>
  !!d && Object.values(d).some((v) => v != null && v !== 0);

// 이월: 마감일(src) 마감값 → 이월일(carry) 전일값으로 복사(전일 데이터는 그대로 보존)
export async function carrySettlement(src: string, carry: string) {
  if (!src || !carry) return { error: "마감일과 이월일을 선택하세요." };
  if (src === carry) return { error: "이월일은 마감일과 달라야 합니다." };
  const supabase = await createClient();

  const { data: srcRow } = await supabase
    .from("settlements").select("data").eq("work_date", src).maybeSingle();
  const srcData = (srcRow?.data as CellMap) ?? {};

  const { data: dstRow } = await supabase
    .from("settlements").select("data").eq("work_date", carry).maybeSingle();
  if (hasData(dstRow?.data as CellMap))
    return { blocked: true, carryDate: carry };

  const next = carryData(srcData);
  const { error } = await supabase
    .from("settlements")
    .upsert({ work_date: carry, data: next, updated_at: new Date().toISOString() });
  if (error) return { error: "이월 실패: " + error.message };
  revalidatePath("/settlement");
  return { ok: true, date: src, carryDate: carry };
}

// 날짜 변경: from 결산서를 to로 옮김(to에 데이터 있으면 덮어쓰기 확인)
export async function moveSettlement(from: string, to: string) {
  if (!from || !to) return { error: "날짜를 선택하세요." };
  if (from === to) return { error: "같은 날짜입니다." };
  const supabase = await createClient();

  const { data: fromRow } = await supabase
    .from("settlements").select("data").eq("work_date", from).maybeSingle();
  if (!fromRow) return { error: `${from} 결산서가 없습니다.` };

  const { data: toRow } = await supabase
    .from("settlements").select("data").eq("work_date", to).maybeSingle();
  if (hasData(toRow?.data as CellMap))
    return { blocked: true, toDate: to };

  const { error } = await supabase
    .from("settlements")
    .upsert({ work_date: to, data: fromRow.data, updated_at: new Date().toISOString() });
  if (error) return { error: "날짜 변경 실패: " + error.message };
  await supabase.from("settlements").delete().eq("work_date", from);
  revalidatePath("/settlement");
  return { ok: true, fromDate: from, toDate: to };
}

// ───────── 결산전송 (Module37): lots 집계 → 결산서 자동칸 채움 ─────────
//  · 부서 입고=Σ(io side=in 중량), 출고=Σ(io side=out 출고중량Y=실중량+Tag-Tag중량)
//  · 분석투입량=Σ(work side=out 로스: 작업전-작업후), 바코드=Σ(검수 side=out Tag로스)
//  · 분석중량(재고)=Σ(work 미완료 side=in 실중량: 중량-Tag-Q-원중량)
//  · 자동칸만 덮어쓰고 수동칸(현재 입력값)은 그대로 유지 → 클라이언트 current와 병합
type Ag = { inW: number; ship: number; tagLoss: number; loss: number; stock: number };

export async function pushFromLots(workDate: string, current: CellMap) {
  const supabase = await createClient();
  const [{ data: procData }, { data: lotData, error: lotErr }] = await Promise.all([
    supabase.from("processes").select("id, name, schema_type"),
    fetchAll<Lot>((from, to) =>
      supabase.from("lots").select("*").eq("work_date", workDate).order("id").range(from, to),
    ),
  ]);
  if (lotErr) return { error: "결산전송 실패(조회): " + lotErr.message };
  const nameOf = new Map((procData ?? []).map((p) => [p.id as string, p.name as string]));
  const schemaOf = new Map((procData ?? []).map((p) => [p.id as string, p.schema_type as string]));

  const ag = new Map<string, Ag>();
  const get = (n: string) => {
    let a = ag.get(n);
    if (!a) { a = { inW: 0, ship: 0, tagLoss: 0, loss: 0, stock: 0 }; ag.set(n, a); }
    return a;
  };
  const N = (v: unknown) => Number(v) || 0;
  for (const l of (lotData ?? []) as Lot[]) {
    const name = nameOf.get(l.process_id); if (!name) continue;
    const a = get(name);
    const w = N(l.weight);
    if (schemaOf.get(l.process_id) === "work") {
      if (l.side === "out") a.loss += N(l.weight_before) - w;                 // 로스(R)
      else if (!l.locked) a.stock += w - N(l.tag) - N(l.q) - N(l.raw_weight); // 재고 실중량(O)
    } else {
      if (l.side === "in") a.inW += w;                                        // 입고중량(C)
      else { a.ship += shipWeight(l) ?? 0; a.tagLoss += N(l.tag_loss); }      // 출고중량(L)·Tag로스(K)
    }
  }
  const E: Ag = { inW: 0, ship: 0, tagLoss: 0, loss: 0, stock: 0 };
  const g = (n: string) => ag.get(n) ?? E;
  const In = (n: string) => g(n).inW, Ship = (n: string) => g(n).ship;
  const Loss = (...ns: string[]) => ns.reduce((s, n) => s + g(n).loss, 0);
  const Stock = (...ns: string[]) => ns.reduce((s, n) => s + g(n).stock, 0);
  const Tag = (...ns: string[]) => ns.reduce((s, n) => s + g(n).tagLoss, 0);

  const patch: CellMap = {};
  const put = (c: string, v: number) => { patch[c] = v ? round2(v) : null; };

  // ── K18 부서별거래 (입고 C5:G5←O3:O7, 출고 C6:G6←P3:P7) ──
  put("C5", In("기계")); put("D5", In("양장")); put("E5", In("캐스팅")); put("F5", In("개발")); put("G5", In("컷팅"));
  put("C6", Ship("기계")); put("D6", Ship("양장")); put("E6", Ship("캐스팅")); put("F6", Ship("개발")); put("G6", Ship("컷팅"));
  // ── K14 부서별거래 (C29←S3·D29←S4·F29←S5 / C30←T3·D30←T4·F30←T5) ──
  put("C29", In("조립14K")); put("D29", In("캐스팅14K")); put("F29", In("컷팅14K"));
  put("C30", Ship("조립14K")); put("D30", Ship("캐스팅14K")); put("F30", Ship("컷팅14K"));

  // ── K18 분석투입량(로스) ──
  put("C9", Loss("연마(조립)")); put("F9", Loss("연마(캐스팅)"));                                  // 연마
  put("C10", Loss("뻥(기계)")); put("D10", Loss("뻥(양장)")); put("H10", Loss("뻥(캐스팅)")); put("I10", Loss("뻥(개발)")); // 스트립핑(뻥)
  put("C11", Loss("빠우(양장볼)")); put("D11", Loss("빠우(할로우)", "빠우(기계)")); put("E11", Loss("빠우(패션반지)"));
  put("F11", Loss("빠우(캐스팅양장)", "빠우(캐스팅체인)")); put("G11", Loss("빠우(초광-조립)")); put("H11", Loss("빠우(초광-캐스팅)")); put("I11", Loss("빠우(개발)"));
  put("K11", Tag("검수(기계)", "검수(볼)", "검수(양장)", "검수(캐스팅)")); // 바코드 = 검수 Tag로스
  // ── K18 분석중량(재고 실중량) row21 ──
  put("C21", Stock("빠우(할로우)", "빠우(기계)", "뻥(기계)", "연마(조립)"));
  put("D21", Stock("빠우(양장볼)", "뻥(양장)"));
  put("E21", Stock("빠우(패션반지)", "빠우(캐스팅양장)", "빠우(캐스팅체인)", "뻥(캐스팅)", "연마(캐스팅)"));
  put("F21", Stock("빠우(초광-조립)"));
  put("G21", Stock("빠우(초광-캐스팅)", "빠우(개발)"));

  // ── K14 분석투입량(로스) ──
  put("C33", Loss("연마(조립)14K")); put("E33", Loss("연마(캐스팅)14K"));
  put("C34", Loss("뻥(조립)14K")); put("F34", Loss("뻥(캐스팅)14K"));
  put("C35", Loss("빠우(조립)14K")); put("D35", Loss("빠우(초광-조립)14K")); put("F35", Loss("빠우(초광-캐스팅)14K"));
  put("E35", Loss("빠우(패션반지)14K", "빠우(캐스팅양장)14K", "빠우(캐스팅체인)14K"));
  put("K35", Tag("검수(조립)14K", "검수(캐스팅)14K"));
  // ── K14 분석중량(재고 실중량) row45 ──
  put("C45", Stock("빠우(조립)14K", "뻥(조립)14K", "연마(조립)14K"));
  put("D45", Stock("빠우(패션반지)14K", "빠우(캐스팅양장)14K", "빠우(캐스팅체인)14K", "뻥(캐스팅)14K", "연마(캐스팅)14K"));
  put("E45", Stock("빠우(초광-조립)14K"));
  put("F45", Stock("빠우(초광-캐스팅)14K"));

  const merged: CellMap = { ...current, ...patch };
  const { error } = await supabase
    .from("settlements")
    .upsert({ work_date: workDate, data: merged, updated_at: new Date().toISOString() });
  if (error) return { error: "결산전송 실패: " + error.message };
  revalidatePath("/settlement");
  return { ok: true, data: merged };
}
