"use server";

import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { carryData, type CellMap } from "@/lib/settlement";

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
export async function carrySettlement(src: string, carry: string, overwrite = false) {
  if (!src || !carry) return { error: "마감일과 이월일을 선택하세요." };
  if (src === carry) return { error: "이월일은 마감일과 달라야 합니다." };
  const supabase = await createClient();

  const { data: srcRow } = await supabase
    .from("settlements").select("data").eq("work_date", src).maybeSingle();
  const srcData = (srcRow?.data as CellMap) ?? {};

  const { data: dstRow } = await supabase
    .from("settlements").select("data").eq("work_date", carry).maybeSingle();
  if (hasData(dstRow?.data as CellMap) && !overwrite)
    return { needConfirm: true, carryDate: carry };

  const next = carryData(srcData);
  const { error } = await supabase
    .from("settlements")
    .upsert({ work_date: carry, data: next, updated_at: new Date().toISOString() });
  if (error) return { error: "이월 실패: " + error.message };
  revalidatePath("/settlement");
  return { ok: true, date: src, carryDate: carry };
}

// 날짜 변경: from 결산서를 to로 옮김(to에 데이터 있으면 덮어쓰기 확인)
export async function moveSettlement(from: string, to: string, overwrite = false) {
  if (!from || !to) return { error: "날짜를 선택하세요." };
  if (from === to) return { error: "같은 날짜입니다." };
  const supabase = await createClient();

  const { data: fromRow } = await supabase
    .from("settlements").select("data").eq("work_date", from).maybeSingle();
  if (!fromRow) return { error: `${from} 결산서가 없습니다.` };

  const { data: toRow } = await supabase
    .from("settlements").select("data").eq("work_date", to).maybeSingle();
  if (hasData(toRow?.data as CellMap) && !overwrite)
    return { needConfirm: true, toDate: to };

  const { error } = await supabase
    .from("settlements")
    .upsert({ work_date: to, data: fromRow.data, updated_at: new Date().toISOString() });
  if (error) return { error: "날짜 변경 실패: " + error.message };
  await supabase.from("settlements").delete().eq("work_date", from);
  revalidatePath("/settlement");
  return { ok: true, fromDate: from, toDate: to };
}
