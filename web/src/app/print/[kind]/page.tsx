import { notFound } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { getWorkDate } from "@/lib/workDate";
import {
  COLUMNS, fmtWeight, fmtInt, shipWeight, lossOf, lossRateOf,
  type ColDef, type Lot, type Process,
} from "@/lib/types";
import { PRINT_KINDS, STOCK_GROUPS, type PrintKind } from "@/lib/printSets";
import { PrintShell } from "../PrintShell";

// 표시값(공정 화면 fmtCell과 동일 규칙)
function cellText(r: Lot, c: ColDef): string {
  if (c.computed === "ship") return fmtWeight(shipWeight(r));
  if (c.computed === "loss") return fmtWeight(lossOf(r));
  if (c.computed === "lossRate") { const x = lossRateOf(r); return x == null ? "" : (x * 100).toFixed(1) + "%"; }
  const v = r[c.key];
  if (v == null || v === "") return "";
  if (c.kind === "datetime") { const s = String(v); return `${s.slice(8, 10)} ${s.slice(11, 16)}`; }
  if (c.kind === "weight") return fmtWeight(v);
  if (c.kind === "int") return fmtInt(v);
  return String(v);
}

const isNum = (k: string) => k === "weight" || k === "int";

// 열 합계 (숫자/계산열만) — 엑셀 인쇄 합계행 재현
function colSum(rows: Lot[], c: ColDef): number | null {
  if (c.computed === "lossRate") return null;
  if (c.computed === "ship") return rows.reduce((a, r) => a + (shipWeight(r) ?? 0), 0);
  if (c.computed === "loss") return rows.reduce((a, r) => a + (lossOf(r) ?? 0), 0);
  if (c.kind === "weight" || c.kind === "int") return rows.reduce((a, r) => a + (Number(r[c.key]) || 0), 0);
  return null;
}

// 공정 한 묶음 표
function LedgerTable({ name, columns, rows }: { name: string; columns: ColDef[]; rows: Lot[] }) {
  const wSum = rows.reduce((a, r) => a + (Number(r.weight) || 0), 0);
  const blue = name.includes("14K");
  return (
    <section className="mb-4" style={{ breakInside: "avoid" }}>
      <div className="flex items-baseline justify-between border-b border-slate-400 pb-0.5">
        <h3 className={`text-sm font-bold ${blue ? "text-blue-600" : ""}`}>{name}</h3>
        <span className="text-[11px] text-slate-500">{rows.length}건 · 중량 합 {fmtWeight(wSum)}</span>
      </div>
      <table className="w-full border-collapse text-[10px]">
        <thead>
          <tr>
            <th className="border border-slate-300 bg-slate-100 px-1 py-0.5 text-center font-medium print:bg-slate-100">#</th>
            {columns.map((c, i) => (
              <th key={i} className="border border-slate-300 bg-slate-100 px-1 py-0.5 text-center font-medium print:bg-slate-100" style={{ width: c.width }}>{c.label}</th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.length === 0 ? (
            <tr><td colSpan={columns.length + 1} className="border border-slate-300 px-1 py-2 text-center text-slate-400">데이터 없음</td></tr>
          ) : rows.map((r, ri) => (
            <tr key={r.id}>
              <td className="border border-slate-300 px-1 py-0.5 text-center text-slate-400">{ri + 1}</td>
              {columns.map((c, i) => (
                <td key={i} className={`border border-slate-300 px-1 py-0.5 ${isNum(c.kind) || c.computed ? "text-right tabular-nums" : c.key === "due_date" ? "text-center" : ""}`}>
                  {cellText(r, c)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
        {rows.length > 0 && (
          <tfoot>
            <tr className="bg-slate-50 font-bold print:bg-slate-50">
              <td className="border border-slate-300 px-1 py-0.5 text-center">계</td>
              {columns.map((c, i) => {
                const s = colSum(rows, c);
                return (
                  <td key={i} className={`border border-slate-300 px-1 py-0.5 ${isNum(c.kind) || c.computed ? "text-right tabular-nums" : ""}`}>
                    {s == null ? "" : c.kind === "int" ? fmtInt(s) : fmtWeight(s)}
                  </td>
                );
              })}
            </tr>
          </tfoot>
        )}
      </table>
    </section>
  );
}

export default async function PrintKindPage({
  params, searchParams,
}: {
  params: Promise<{ kind: string }>;
  searchParams: Promise<{ group?: string }>;
}) {
  const { kind } = await params;
  const { group = "all" } = await searchParams;
  const workDate = await getWorkDate();
  const supabase = await createClient();

  // 종류 → 대상 공정·컬럼·블록 결정
  let title: string, side: "in" | "out", columns: ColDef[], paged: boolean;
  let blocks: { heading: string; names: string[] }[];
  let onlyUnlocked = false;
  let groups: { key: string; label: string }[] | undefined;

  if (kind === "stock") {
    title = "재고 장부";
    side = "in"; onlyUnlocked = true; paged = true;
    columns = COLUMNS.work.in;
    groups = [{ key: "all", label: "전체" }, ...Object.entries(STOCK_GROUPS).map(([k, g]) => ({ key: k, label: g.label }))];
    blocks = group === "all"
      ? Object.values(STOCK_GROUPS).map((g) => ({ heading: g.label, names: g.names }))
      : STOCK_GROUPS[group] ? [{ heading: STOCK_GROUPS[group].label, names: STOCK_GROUPS[group].names }] : [];
  } else if (kind in PRINT_KINDS) {
    const cfg = PRINT_KINDS[kind as Exclude<PrintKind, "stock">];
    title = cfg.title; side = cfg.side; paged = !cfg.continuous;
    columns = side === "in" ? COLUMNS.io.in : COLUMNS.io.out;
    blocks = cfg.continuous
      ? [{ heading: "", names: cfg.names }]              // 검수: 한 묶음 연속
      : cfg.names.map((n) => ({ heading: "", names: [n] })); // 입고/출고: 공정별 페이지
  } else {
    notFound();
  }

  // 대상 공정·lots 조회
  const allNames = [...new Set(blocks.flatMap((b) => b.names))];
  const { data: procData } = await supabase
    .from("processes").select("id, name").in("name", allNames);
  const idByName = new Map((procData ?? []).map((p) => [p.name as string, p.id as string]));
  const ids = allNames.map((n) => idByName.get(n)).filter(Boolean) as string[];

  const { data: lotData } = await supabase
    .from("lots").select("*").in("process_id", ids).eq("work_date", workDate).eq("side", side).order("created_at");
  let lots = (lotData ?? []) as Lot[];
  if (onlyUnlocked) lots = lots.filter((l) => !l.locked);
  const rowsOf = (procId?: string) => (procId ? lots.filter((l) => l.process_id === procId) : []);

  return (
    <PrintShell title={title} workDate={workDate} groups={groups} currentGroup={kind === "stock" ? group : undefined}>
      {blocks.map((b, bi) => (
        <div key={bi} style={bi > 0 && paged ? { breakBefore: "page" } : undefined}>
          {b.heading && <h2 className={`mb-1 mt-2 text-base font-bold ${b.heading.includes("14K") ? "text-blue-600" : ""}`}>{b.heading}</h2>}
          {b.names.map((n) => (
            <LedgerTable key={n} name={n} columns={columns} rows={rowsOf(idByName.get(n))} />
          ))}
        </div>
      ))}
    </PrintShell>
  );
}
