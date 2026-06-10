import { type NextRequest, NextResponse } from "next/server";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/fetchAll";
import { fillUploadXlsm } from "@/lib/uploadXlsx";
import type { Lot, SchemaType } from "@/lib/types";

export const runtime = "nodejs"; // jszip + fs

// 한글 파일명 정규화(NFC/NFD) 불일치로 readFile 실패 방지 — readdir로 실제 바이트 경로 확보.
async function templatePath(): Promise<string> {
  const dir = path.join(process.cwd(), "templates");
  const files = await readdir(dir);
  const hit = files.find(
    (f) => f.toLowerCase().endsWith(".xlsm") && f.normalize("NFC").includes("업로드".normalize("NFC")),
  );
  if (!hit) throw new Error("templates/업로드.xlsm 템플릿을 찾을 수 없습니다.");
  return path.join(dir, hit);
}

// GET /api/upload/export?date=YYYY-MM-DD → 매크로 보존된 업로드.xlsm 다운로드(선택 작업일 전 공정)
export async function GET(req: NextRequest) {
  const date = req.nextUrl.searchParams.get("date") ?? "";
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) {
    return NextResponse.json({ error: "날짜(date)가 필요합니다." }, { status: 400 });
  }
  const supabase = await createClient();
  const [{ data: procs }, { data: lots, error: lotErr }] = await Promise.all([
    supabase.from("processes").select("id,name,schema_type"),
    fetchAll<Lot>((from, to) =>
      supabase
        .from("lots").select("*").eq("work_date", date)
        .order("created_at").order("id")
        .range(from, to),
    ),
  ]);
  // 백업은 전량이 생명 — 일부만 담긴 파일이 만들어지느니 실패가 낫다
  if (lotErr) {
    return NextResponse.json({ error: "백업 조회 실패: " + lotErr.message }, { status: 500 });
  }
  const tpl = await readFile(await templatePath());
  const buf = await fillUploadXlsm(
    tpl,
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
