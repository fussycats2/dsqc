import { type NextRequest, NextResponse } from "next/server";
import { revalidatePath } from "next/cache";
import { createClient } from "@/lib/supabase/server";
import type { ParsedLot } from "@/lib/uploadXlsx";

export const runtime = "nodejs";

// POST /api/upload/import  (JSON: { date, lots: ParsedLot[] })
//  · 파싱은 브라우저에서 수행(5MB 업로드 한도 회피) → 여기는 작은 JSON만 받아 삽입.
//  · 그 작업일에 이미 lots가 있으면 덮어쓰지 않고 취소(409). 일련번호 유지, 계보(lot_links) 생성 안 함.
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const date = String(body?.date ?? "");
  const parsed = Array.isArray(body?.lots) ? (body.lots as ParsedLot[]) : null;
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) return NextResponse.json({ error: "날짜가 올바르지 않습니다." }, { status: 400 });
  if (!parsed || parsed.length === 0) return NextResponse.json({ error: "파일에서 작업 데이터를 찾지 못했습니다." }, { status: 400 });

  const supabase = await createClient();
  const { data: procs } = await supabase.from("processes").select("id,name");
  const nameToId = new Map((procs ?? []).map((p) => [String(p.name).normalize("NFC"), p.id]));

  // 충돌: 그 작업일에 이미 데이터가 있으면 덮어쓰지 않고 취소
  const { count } = await supabase
    .from("lots")
    .select("id", { count: "exact", head: true })
    .eq("work_date", date);
  if ((count ?? 0) > 0) {
    return NextResponse.json(
      {
        error: `${date.replaceAll("-", "/")} 에 이미 작업 데이터가 있습니다.\n그 데이터를 다른 날짜로 옮기거나 삭제한 뒤 다시 시도하세요. (덮어쓰지 않고 취소했습니다)`,
      },
      { status: 409 },
    );
  }

  const rows = [];
  for (const p of parsed) {
    const pid = nameToId.get(String(p.processName).normalize("NFC"));
    if (!pid) continue;
    rows.push({
      process_id: pid,
      side: p.side,
      serial: p.serial ?? null,
      description: p.description ?? null,
      qty: p.qty ?? null,
      weight: p.weight ?? null,
      weight_in: p.weight_in ?? null,
      weight_before: p.weight_before ?? null,
      tag: p.tag ?? null,
      tag_fixed: p.tag_fixed ?? null,
      tag_weight: p.tag_weight ?? null,
      tag_loss: p.tag_loss ?? null,
      q: p.q ?? null,
      due_date: p.due_date ?? null,
      raw_weight: p.raw_weight ?? null,
      note: p.note ?? null,
      prev_part_name: p.prev_part_name ?? null,
      moved_at: p.moved_at ?? null,
      moved_to_name: p.moved_to_name ?? null,
      status: p.side === "in" ? (p.locked ? "완료" : "작업중") : "완료",
      locked: p.locked,
      work_date: date,
    });
  }
  if (rows.length === 0) {
    return NextResponse.json({ error: "파일의 시트와 매칭되는 공정이 없습니다." }, { status: 400 });
  }

  const { error } = await supabase.from("lots").insert(rows);
  if (error) return NextResponse.json({ error: error.message }, { status: 500 });
  revalidatePath("/");
  return NextResponse.json({ ok: true, date, count: rows.length });
}
