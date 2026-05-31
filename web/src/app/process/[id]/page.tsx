import Link from "next/link";
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
      .neq("schema_type", "entry")
      .order("sort_order");
    const targets = (targetData ?? []) as Process[];
    return (
      <main className="p-6">
        <h1 className="text-xl font-bold mb-4">✏️ {process.name}</h1>
        <EntryGrid sourceProcessId={id} cols={cols.in} targets={targets} />
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

  // 이관 대상 후보: 자기 자신·작성 제외한 모든 공정
  const { data: targetData } = await supabase
    .from("processes")
    .select("*")
    .neq("schema_type", "entry")
    .neq("id", id)
    .order("sort_order");
  const targets = (targetData ?? []) as Process[];

  return (
    <main className="p-6">
      <div className="flex items-center gap-3 mb-4">
        <Link
          href="/"
          className="text-sm text-gray-500 hover:underline dark:text-neutral-400"
        >
          ← 목록
        </Link>
        <h1
          className={`text-xl font-bold ${
            process.is_blue ? "text-blue-600 dark:text-blue-400" : ""
          }`}
        >
          {process.name}
        </h1>
        <span className="text-xs rounded bg-gray-100 px-2 py-0.5 dark:bg-neutral-800">
          {process.schema_type} · {process.karat ?? "-"}
        </span>
      </div>

      <ProcessView
        process={process}
        cols={cols}
        inRows={inRows}
        outRows={outRows}
        targets={targets}
      />
    </main>
  );
}
