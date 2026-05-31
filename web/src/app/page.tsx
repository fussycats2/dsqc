import { createClient } from "@/lib/supabase/server";
import { envMissing } from "@/lib/getProcesses";
import { fmtWeight, type Process } from "@/lib/types";

interface Balance {
  process_id: string;
  name: string;
  karat: string | null;
  in_qty: number | null;
  in_weight: number | null;
  out_qty: number | null;
  out_weight: number | null;
}

function num(v: number | null) {
  return v ?? 0;
}

function BalanceTable({
  title,
  rows,
  procs,
}: {
  title: string;
  rows: Balance[];
  procs: Map<string, Process>;
}) {
  const tIn = rows.reduce((a, r) => a + num(r.in_weight), 0);
  const tOut = rows.reduce((a, r) => a + num(r.out_weight), 0);
  return (
    <section className="flex-1 min-w-[320px]">
      <h2 className="text-sm font-semibold mb-2">{title}</h2>
      <table className="text-xs border-collapse border border-gray-400 dark:border-neutral-600 w-full">
        <thead>
          <tr className="bg-gray-100 dark:bg-neutral-800">
            <th className="border border-gray-400 px-2 py-1 text-left dark:border-neutral-600">공정</th>
            <th className="border border-gray-400 px-2 py-1 dark:border-neutral-600">입고수량</th>
            <th className="border border-gray-400 px-2 py-1 dark:border-neutral-600">입고중량</th>
            <th className="border border-gray-400 px-2 py-1 dark:border-neutral-600">출고수량</th>
            <th className="border border-gray-400 px-2 py-1 dark:border-neutral-600">출고중량</th>
            <th className="border border-gray-400 px-2 py-1 dark:border-neutral-600">재고(중량)</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => {
            const stock = num(r.in_weight) - num(r.out_weight);
            const blue = procs.get(r.process_id)?.is_blue;
            return (
              <tr key={r.process_id} className="hover:bg-amber-50 dark:hover:bg-neutral-800">
                <td className={`border border-gray-300 px-2 py-1 dark:border-neutral-700 ${blue ? "text-blue-600 dark:text-blue-400" : ""}`}>
                  {r.name}
                </td>
                <td className="border border-gray-300 px-2 py-1 text-right tabular-nums dark:border-neutral-700">{num(r.in_qty) || ""}</td>
                <td className="border border-gray-300 px-2 py-1 text-right tabular-nums dark:border-neutral-700">{fmtWeight(r.in_weight) || ""}</td>
                <td className="border border-gray-300 px-2 py-1 text-right tabular-nums dark:border-neutral-700">{num(r.out_qty) || ""}</td>
                <td className="border border-gray-300 px-2 py-1 text-right tabular-nums dark:border-neutral-700">{fmtWeight(r.out_weight) || ""}</td>
                <td className={`border border-gray-300 px-2 py-1 text-right tabular-nums dark:border-neutral-700 ${stock < 0 ? "text-rose-600 font-semibold" : ""}`}>
                  {fmtWeight(stock)}
                </td>
              </tr>
            );
          })}
          <tr className="bg-gray-50 dark:bg-neutral-900 font-semibold">
            <td className="border border-gray-400 px-2 py-1 dark:border-neutral-600">계</td>
            <td className="border border-gray-400 dark:border-neutral-600" />
            <td className="border border-gray-400 px-2 py-1 text-right tabular-nums dark:border-neutral-600">{fmtWeight(tIn)}</td>
            <td className="border border-gray-400 dark:border-neutral-600" />
            <td className="border border-gray-400 px-2 py-1 text-right tabular-nums dark:border-neutral-600">{fmtWeight(tOut)}</td>
            <td className="border border-gray-400 px-2 py-1 text-right tabular-nums dark:border-neutral-600">{fmtWeight(tIn - tOut)}</td>
          </tr>
        </tbody>
      </table>
    </section>
  );
}

export default async function Home() {
  if (envMissing()) {
    return (
      <main className="p-8 max-w-2xl mx-auto">
        <h1 className="text-2xl font-bold mb-4">dsqc — 제조공정 관리</h1>
        <div className="rounded border border-amber-400 bg-amber-50 p-4 text-sm dark:bg-amber-950/40">
          <p className="font-semibold mb-2">⚙️ Supabase 연결이 아직 설정되지 않았습니다.</p>
          <ol className="list-decimal ml-5 space-y-1">
            <li>supabase.com에서 무료 프로젝트 생성</li>
            <li>SQL Editor에 <code>0001_init.sql</code> → <code>seed.sql</code> 실행</li>
            <li><code>web/.env.local</code>에 URL/anon key 입력 후 재시작</li>
          </ol>
        </div>
      </main>
    );
  }

  const supabase = await createClient();
  const [{ data: balData }, { data: procData }] = await Promise.all([
    supabase.from("v_process_balance").select("*"),
    supabase.from("processes").select("*").order("sort_order"),
  ]);

  const procs = new Map((procData ?? []).map((p) => [p.id, p as Process]));
  const balances = (balData ?? []) as Balance[];
  // sort_order 순으로 정렬
  balances.sort(
    (a, b) =>
      (procs.get(a.process_id)?.sort_order ?? 0) -
      (procs.get(b.process_id)?.sort_order ?? 0),
  );

  const isInsp = (id: string) => procs.get(id)?.is_inspection;
  const isEntry = (id: string) => procs.get(id)?.schema_type === "entry";
  const process18 = balances.filter((b) => !isInsp(b.process_id) && !isEntry(b.process_id) && procs.get(b.process_id)?.karat === "18K");
  const process14 = balances.filter((b) => !isInsp(b.process_id) && !isEntry(b.process_id) && procs.get(b.process_id)?.karat === "14K");
  const inspection = balances.filter((b) => isInsp(b.process_id));

  return (
    <main className="p-6">
      <h1 className="text-xl font-bold mb-4">대시보드 · 파트별 입출고 현황</h1>
      <div className="flex flex-wrap gap-6">
        <BalanceTable title="18K 공정" rows={process18} procs={procs} />
        <BalanceTable title="14K 공정" rows={process14} procs={procs} />
        <BalanceTable title="검수 현황" rows={inspection} procs={procs} />
      </div>
      <p className="mt-4 text-xs text-gray-400 dark:text-neutral-500">
        ※ 재고(중량) = 입고중량 − 출고중량. 음수(빨강)는 출고가 입고를 초과한 이상치.
        정밀 중량오류(입고 − 출고 − 로스) 경고는 출고/로스 입력 기능 추가 후 실시간(Realtime)으로 붙습니다.
      </p>
    </main>
  );
}
