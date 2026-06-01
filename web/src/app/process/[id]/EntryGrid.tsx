"use client";

import { useMemo, useState, useTransition } from "react";
import type { ColDef, Process } from "@/lib/types";
import { NumberInput } from "@/components/NumberInput";
import { focusNextInput } from "@/lib/enterNav";
import { sendRows, type EntryRow } from "./actions";

const FIELDS: (keyof EntryRow)[] = [
  "description", "qty", "weight", "tag", "q", "due_date", "raw_weight", "note",
];

const blank = (): EntryRow => ({});

export function EntryGrid({
  sourceProcessId,
  cols,
  targets,
  processName,
}: {
  sourceProcessId: string;
  cols: ColDef[];
  targets: Process[];
  processName: string;
}) {
  const [rows, setRows] = useState<EntryRow[]>(() => Array.from({ length: 8 }, blank));
  const targets18 = useMemo(() => targets.filter((t) => t.karat === "18K"), [targets]);
  const targets14 = useMemo(() => targets.filter((t) => t.karat === "14K"), [targets]);
  const [t18, setT18] = useState<string>(targets18[0]?.id ?? "");
  const [t14, setT14] = useState<string>(targets14[0]?.id ?? "");
  const [karat, setKarat] = useState<"18K" | "14K">("18K");
  const is18 = karat === "18K";
  const activeTargets = is18 ? targets18 : targets14;
  const activeTid = is18 ? t18 : t14;
  const setActiveTid = is18 ? setT18 : setT14;
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<{ kind: "ok" | "err"; text: string } | null>(null);

  const filled = useMemo(
    () => rows.filter((r) => r.description?.trim() || r.qty || r.weight || r.tag).length,
    [rows],
  );

  const update = (i: number, key: keyof EntryRow, v: string) =>
    setRows((prev) => {
      const next = [...prev];
      next[i] = { ...next[i], [key]: v };
      return next;
    });

  const submit = (targetId: string) => {
    if (!targetId) return setMsg({ kind: "err", text: "대상 공정/부서를 선택하세요." });
    if (filled === 0) return setMsg({ kind: "err", text: "입력된 행이 없습니다." });
    start(async () => {
      const res = await sendRows(sourceProcessId, targetId, rows);
      if (res?.error) setMsg({ kind: "err", text: res.error });
      else {
        const name = targets.find((t) => t.id === targetId)?.name;
        setMsg({ kind: "ok", text: `${name}(으)로 ${res?.sent}건 전송됨` });
        setRows(Array.from({ length: 8 }, blank));
      }
    });
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold tracking-tight">✏️ {processName}</h1>
        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-500 dark:bg-neutral-800 dark:text-neutral-400">
          입력 → 일괄 전송
        </span>
      </div>

      {/* 전송 바 — Karat 토글(18K 붉은/14K 파란) + 단일 보내기 */}
      <div className="flex flex-wrap items-center gap-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <div className="flex rounded-lg border border-slate-200 p-0.5 dark:border-neutral-700">
          {(["18K", "14K"] as const).map((k) => (
            <button key={k} onClick={() => setKarat(k)}
              className={`rounded-md px-3 py-1 text-sm font-bold transition-colors ${
                karat === k
                  ? k === "18K" ? "bg-rose-600 text-white" : "bg-blue-600 text-white"
                  : "text-slate-400 hover:text-slate-600 dark:hover:text-neutral-200"}`}>
              {k}
            </button>
          ))}
        </div>
        <span className="text-xs text-slate-400">대상</span>
        <select value={activeTid} onChange={(e) => setActiveTid(e.target.value)}
          className="min-w-[140px] rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-800">
          {activeTargets.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
        </select>
        <button onClick={() => submit(activeTid)} disabled={pending || filled === 0 || !activeTid}
          className={`rounded-lg px-4 py-1.5 text-sm font-medium text-white transition-colors disabled:opacity-40 ${
            is18 ? "bg-rose-600 hover:bg-rose-700" : "bg-blue-600 hover:bg-blue-700"}`}>
          {pending ? "전송 중…" : `보내기 (${filled}건)`}
        </button>
        <button onClick={() => setRows((r) => [...r, blank(), blank(), blank()])}
          className="rounded-lg border border-slate-300 px-3 py-1.5 text-sm text-slate-600 hover:bg-slate-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800">
          + 행 추가
        </button>
        {msg && (
          <span className={`ml-auto rounded-md px-2 py-1 text-xs ${
            msg.kind === "err" ? "bg-rose-50 text-rose-600 dark:bg-rose-950/40"
              : "bg-emerald-50 text-emerald-600 dark:bg-emerald-950/40"}`}>
            {msg.text}
          </span>
        )}
      </div>

      {/* 입력 그리드 (콘텐츠 폭 — 화면 가로로 늘어나지 않게) */}
      <div className="inline-block max-w-full overflow-x-auto rounded-xl border border-slate-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <table className="text-xs" onKeyDown={focusNextInput}>
          <thead>
            <tr className="text-slate-500 dark:text-neutral-400">
              <th className="bg-slate-50 px-3 py-2 dark:bg-neutral-800/60">#</th>
              {cols.map((c) => (
                <th key={String(c.key)} style={{ minWidth: c.width }}
                  className="whitespace-nowrap bg-slate-50 px-3 py-2 text-left font-medium dark:bg-neutral-800/60">
                  {c.label}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => (
              <tr key={i} className={`border-t border-slate-100 dark:border-neutral-800 ${i % 2 ? "bg-slate-50/40 dark:bg-neutral-900" : ""}`}>
                <td className="px-3 py-1 text-center text-slate-300 dark:text-neutral-600">{i + 1}</td>
                {cols.map((c) => {
                  const key = c.key as keyof EntryRow;
                  if (!FIELDS.includes(key)) return <td key={String(c.key)} />;
                  const val = r[key] ?? "";
                  const cls = "w-full rounded-md bg-transparent px-2 py-1 outline-none focus:bg-blue-50 focus:ring-1 focus:ring-blue-300 dark:focus:bg-blue-950/40";
                  return (
                    <td key={String(c.key)} className="px-1 py-0.5">
                      {c.kind === "int" || c.kind === "weight" ? (
                        <NumberInput value={val} kind={c.kind} align="left" onChange={(v) => update(i, key, v)} className={cls} />
                      ) : (
                        <input value={val} type="text"
                          placeholder={key === "due_date" ? "납기" : undefined}
                          onChange={(e) => update(i, key, e.target.value)}
                          className={`${cls} text-left`} />
                      )}
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-slate-400">
        ※ 내역·수량·중량·Tag 중 하나라도 입력된 행만 전송됩니다. 중량은 소수 2자리. 일련번호는 대상 공정 기준 자동 생성.
      </p>
    </div>
  );
}
