import { Printer } from "lucide-react";
import { ClientLink } from "@/components/ClientLink";
import { getWorkDate } from "@/lib/workDate";
import { PRINT_MENU, STOCK_GROUPS } from "@/lib/printSets";

export default async function PrintMenu() {
  const workDate = await getWorkDate();
  return (
    <main className="flex min-h-[78vh] flex-col items-center justify-center gap-4 p-6">
      <div className="text-center">
        <h1 className="flex items-center justify-center gap-2 text-xl font-bold">
          <Printer aria-hidden className="size-5 text-slate-400" />인쇄
          <span className="text-sm font-normal text-slate-400">{workDate.replaceAll("-", "/")}</span>
        </h1>
        <p className="mt-1 text-xs text-slate-500 dark:text-neutral-400">인쇄할 장부 종류를 고르세요. (선택한 작업일 기준)</p>
      </div>
      <div className="grid w-full max-w-md grid-cols-2 gap-3 sm:grid-cols-3">
        {PRINT_MENU.map((m) => (
          <ClientLink key={m.kind} href={`/print/${m.kind}`}
            className="rounded-xl border border-slate-200 bg-white p-4 text-center text-sm font-semibold shadow-sm hover:bg-slate-50 dark:border-neutral-800 dark:bg-neutral-900 dark:hover:bg-neutral-800">
            {m.label}
          </ClientLink>
        ))}
      </div>
      <div className="flex flex-col items-center gap-1 border-t border-slate-100 pt-3 dark:border-neutral-800">
        <div className="text-xs text-slate-400">재고 그룹 바로가기</div>
        <div className="flex flex-wrap justify-center gap-2">
          <ClientLink href="/print/stock?group=all" className="rounded-md border border-slate-300 px-2.5 py-1 text-xs hover:bg-slate-100 dark:border-neutral-600 dark:hover:bg-neutral-800">재고 전체</ClientLink>
          {Object.entries(STOCK_GROUPS).map(([k, g]) => (
            <ClientLink key={k} href={`/print/stock?group=${k}`} className="rounded-md border border-slate-300 px-2.5 py-1 text-xs hover:bg-slate-100 dark:border-neutral-600 dark:hover:bg-neutral-800">{g.label}</ClientLink>
          ))}
        </div>
      </div>
    </main>
  );
}
