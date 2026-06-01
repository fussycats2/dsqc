import { type NextRequest, NextResponse } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { fillUploadXlsm } from "@/lib/uploadXlsx";
import type { Lot, SchemaType } from "@/lib/types";

export const runtime = "nodejs"; // jszip + fs

// GET /api/upload/export?date=YYYY-MM-DD → 매크로 보존된 업로드.xlsm 다운로드(선택 작업일 전 공정)
export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get("date") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "날짜(date)가 필요합니다." }, { status: 400 });
  }
  const supabase = await createClient();
  const [{ data: procs }, { data: lots }] = await Promise.all([
    supabase.from("processes").select("id,name,schema_type"),
    supabase.from("lots").select("*").eq("work_date", date),
  ]);
  const buf = await fillUploadXlsm(
    (procs ?? []) as { id: string; name: string; schema_type: SchemaType }[],
    (lots ?? []) as Lot[],
  );
  const fname = encodeURIComponent(`업로드_${date}.xlsm`);
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.ms-excel.sheet.macroEnabled.12",
      "Content-Disposition": `attachment; filename*=UTF-8''${fname}`,
    },
  });
}
