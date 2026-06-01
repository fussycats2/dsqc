import { type NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import { parseSettlementXlsm } from "@/lib/settlementXlsx";
import type { CellMap } from "@/lib/settlement";

export const runtime = "nodejs";

const hasData = (d: CellMap | null | undefined) =>
  !!d && Object.values(d).some((v) => v != null && v !== 0);

// POST /api/settlement/import  (multipart: file, date)
//  · date에 이미 데이터 있으면 덮어쓰지 않고 취소(경고). 없으면 upsert.
export async function POST(req: NextRequest) {
  const form = await req.formData();
  const file = form.get("file");
  const date = String(form.get("date") ?? "");
  if (!(file instanceof File)) return NextResponse.json({ error: "파일이 없습니다." }, { status: 400 });
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: "날짜가 올바르지 않습니다." }, { status: 400 });

  let data: CellMap;
  try {
    data = await parseSettlementXlsm(Buffer.from(await file.arrayBuffer()));
  } catch (e) {
    return NextResponse.json({ error: "엑셀 해석 실패: " + (e as Error).message }, { status: 400 });
  }
  if (!hasData(data)) return NextResponse.json({ error: "파일에서 결산 데이터를 찾지 못했습니다." }, { status: 400 });

  const supabase = await createClient();
  const { data: ex } = await supabase.from("settlements").select("data").eq("work_date", date).maybeSingle();
  if (hasData(ex?.data as CellMap)) {
    return NextResponse.json({
      error: `${date.replaceAll("-", "/")} 에 이미 결산 데이터가 있습니다.\n그 데이터를 다른 날짜로 옮기거나, 다른 날짜를 선택하세요. (덮어쓰지 않고 취소했습니다)`,
    }, { status: 409 });
  }

  const { error } = await supabase
    .from("settlements")
    .upsert({ work_date: date, data, updated_at: new Date().toISOString() });
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  revalidatePath("/settlement");
  return NextResponse.json({ ok: true, date, count: Object.keys(data).length });
}
