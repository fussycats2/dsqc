import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { fetchAll } from "@/lib/fetchAll";
import { COLUMNS, type Lot } from "@/lib/types";
import { getWorkDate } from "@/lib/workDate";
import { getProcesses } from "@/lib/getProcesses";
import { EntryGrid } from "./EntryGrid";
import { ProcessView } from "./ProcessView";

export default async function ProcessPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  // 공정목록은 레이아웃(TabBar)과 같은 요청 내 React cache로 공유(중복 조회 0) + 작업일 쿠키 병렬
  const [processes, workDate] = await Promise.all([getProcesses(), getWorkDate()]);
  const process = processes.find((p) => p.id === id);
  if (!process) notFound();
  const cols = COLUMNS[process.schema_type];

  // 작성(entry) 시트 = 다중행 입력 → 대상 공정 일괄 전송
  if (process.schema_type === "entry") {
    const targets = processes.filter((p) => p.schema_type === "io");
    return (
      <main className="p-6">
        <EntryGrid sourceProcessId={id} cols={cols.in} targets={targets} processName={process.name} />
      </main>
    );
  }

  // 선택한 작업일(쿠키)의 데이터만 표시 — 날짜별 조회·수정 (페이지 고유 조회는 lots 1건뿐)
  //  · 동시 일괄전송 행들은 created_at이 같아 serial(발번순)→id로 순서를 고정(페이지 경계 안정화 겸)
  const supabase = await createClient();
  const { data: lotData } = await fetchAll<Lot>((from, to) =>
    supabase
      .from("lots").select("*").eq("process_id", id).eq("work_date", workDate)
      .order("created_at").order("serial").order("id")
      .range(from, to),
  );
  const lots = (lotData ?? []) as Lot[];
  const inRows = lots.filter((l) => l.side === "in");
  const outRows = lots.filter((l) => l.side === "out");

  // 액션 대상 후보 전체(작성 제외) — ProcessView가 액션별로 필터
  const allProcesses = processes.filter((p) => p.schema_type !== "entry");

  return (
    <main className="p-6">
      <ProcessView
        process={process}
        cols={cols}
        inRows={inRows}
        outRows={outRows}
        allProcesses={allProcesses}
      />
    </main>
  );
}
