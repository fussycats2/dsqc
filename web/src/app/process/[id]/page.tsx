import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { COLUMNS, type Lot, type Process } from "@/lib/types";
import { EntryGrid } from "./EntryGrid";
import { ProcessView } from "./ProcessView";

export default async function ProcessPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const supabase = await createClient();

  const { data: proc } = await supabase
    .from("processes")
    .select("*")
    .eq("id", id)
    .single();
  if (!proc) notFound();
  const process = proc as Process;
  const cols = COLUMNS[process.schema_type];

  // 작성(entry) 시트 = 다중행 입력 → 대상 공정 일괄 전송
  if (process.schema_type === "entry") {
    const { data: targetData } = await supabase
      .from("processes")
      .select("*")
      .eq("schema_type", "io")
      .order("sort_order");
    const targets = (targetData ?? []) as Process[];
    return (
      <main className="p-6">
        <EntryGrid sourceProcessId={id} cols={cols.in} targets={targets} processName={process.name} />
      </main>
    );
  }

  const { data: lotData } = await supabase
    .from("lots")
    .select("*")
    .eq("process_id", id)
    .order("created_at");
  const lots = (lotData ?? []) as Lot[];
  const inRows = lots.filter((l) => l.side === "in");
  const outRows = lots.filter((l) => l.side === "out");

  // 액션 대상 후보 전체(작성 제외) — ProcessView가 액션별로 필터
  const { data: targetData } = await supabase
    .from("processes")
    .select("*")
    .neq("schema_type", "entry")
    .order("sort_order");
  const allProcesses = (targetData ?? []) as Process[];

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
