"use client";

import { useMemo, useState, useTransition } from "react";
import { ChevronDown, Loader2, Plus } from "lucide-react";
import { toast } from "sonner";
import type { ColDef, Process } from "@/lib/types";
import { NumberInput } from "@/components/NumberInput";
import { Button } from "@/components/ui/button";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
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
  const [karat, setKarat] = useState<"18K" | "14K">("18K");
  const is18 = karat === "18K";
  const activeTargets = is18 ? targets18 : targets14;
  const [pending, start] = useTransition();

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

  // 대상 공정을 메뉴에서 고르면 그 즉시 입고/출고 전송 (셀렉트+버튼 분리 → 메뉴 단일 동작)
  const send = (target: Process, side: "in" | "out") => {
    if (filled === 0) { toast.error("입력된 행이 없습니다."); return; }
    start(async () => {
      const res = await sendRows(sourceProcessId, target.id, rows, side);
      if (res?.error) toast.error(res.error);
      else {
        toast.success(`${target.name}(으)로 ${side === "in" ? "입고" : "출고"} ${res?.sent}건 전송됨`);
        setRows(Array.from({ length: 8 }, blank));
      }
    });
  };

  // 입고/출고 드롭다운 — 현재 karat 대상 목록을 보여주고 선택 즉시 실행.
  //  컴포넌트가 아닌 렌더 함수(호출) — render 중 컴포넌트 정의 금지 규칙 회피.
  const sendMenu = (side: "in" | "out", label: string) => (
    <DropdownMenu key={side}>
      <DropdownMenuTrigger asChild>
        <Button
          size="sm"
          variant={side === "in" ? "default" : "outline"}
          disabled={pending || filled === 0 || activeTargets.length === 0}
          className={
            side === "in"
              ? is18
                ? "bg-rose-600 text-white hover:bg-rose-700"
                : "bg-blue-600 text-white hover:bg-blue-700"
              : is18
                ? "border-rose-300 text-rose-700 hover:bg-rose-50 dark:border-rose-800 dark:text-rose-300 dark:hover:bg-rose-950/40"
                : "border-blue-300 text-blue-700 hover:bg-blue-50 dark:border-blue-800 dark:text-blue-300 dark:hover:bg-blue-950/40"
          }
        >
          {pending ? <Loader2 className="animate-spin" /> : null}
          {label}
          <ChevronDown />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="start" className="max-h-[60vh] overflow-y-auto">
        <DropdownMenuLabel>{karat} · {label} 대상 선택</DropdownMenuLabel>
        {activeTargets.map((t) => (
          <DropdownMenuItem key={t.id} onSelect={() => send(t, side)}>
            {t.name}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-3">
        <h1 className="text-2xl font-bold tracking-tight">✏️ {processName}</h1>
        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-500 dark:bg-neutral-800 dark:text-neutral-400">
          입력 → 입고/출고 전송
        </span>
      </div>

      {/* 전송 바 — Karat 토글(18K 붉은/14K 파란) + 입고/출고 메뉴 버튼 */}
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
        {sendMenu("in", "입고")}
        {sendMenu("out", "출고")}
        <span className="rounded-md bg-slate-100 px-2 py-1 text-xs text-slate-500 dark:bg-neutral-800 dark:text-neutral-400">
          입력 <b className="text-slate-700 dark:text-neutral-200">{filled}</b>건
        </span>
        <Button size="sm" variant="outline"
          onClick={() => setRows((r) => [...r, blank(), blank(), blank()])}>
          <Plus />행 추가
        </Button>
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
        ※ 내역·수량·중량·Tag 중 하나라도 입력된 행만 전송됩니다. 입고는 일련번호 자동 생성, 출고는 번호 없이 출고블록으로 들어갑니다. 중량은 소수 2자리.
      </p>
    </div>
  );
}
