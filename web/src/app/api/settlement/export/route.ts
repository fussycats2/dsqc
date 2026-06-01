import { type NextRequest, NextResponse } from "next/server";
import { getSettlement } from "@/app/settlement/settlementActions";
import { fillSettlementXlsm } from "@/lib/settlementXlsx";

export const runtime = "nodejs"; // jszip + fs

// GET /api/settlement/export?date=YYYY-MM-DD → 매크로 보존된 .xlsm 다운로드
export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get("date") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "날짜(date)가 필요합니다." }, { status: 400 });
  }
  const data = await getSettlement(date);
  const buf = await fillSettlementXlsm(data, date);
  const fname = encodeURIComponent(`품질결산서_${date}.xlsm`);
  return new NextResponse(new Uint8Array(buf), {
    headers: {
      "Content-Type": "application/vnd.ms-excel.sheet.macroEnabled.12",
      "Content-Disposition": `attachment; filename*=UTF-8''${fname}`,
    },
  });
}
