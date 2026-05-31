"use client";

import { useState, useTransition } from "react";
import type { ColDef, Lot, Process } from "@/lib/types";
import { fmtWeight, lossOf, lossRateOf, shipWeight } from "@/lib/types";
import { NumberInput } from "@/components/NumberInput";
import {
  completeLots,
  transferInbound,
  transferOutbound,
  splitLot,
  deleteLots,
  updateLot,
} from "./actions";

type Edits = Record<string, Record<string, number | null>>;

function fmt(v: unknown, kind: string) {
  if (v === null || v === undefined || v === "") return "";
  if (kind === "date") return String(v).slice(0, 10);
  if (kind === "weight") return fmtWeight(v);
  return String(v);
}

function computedValue(c: ColDef, lot: Lot): string {
  if (c.computed === "loss") return fmtWeight(lossOf(lot));
  if (c.computed === "ship") return fmtWeight(shipWeight(lot));
  if (c.computed === "lossRate") {
    const r = lossRateOf(lot);
    return r == null ? "" : (r * 100).toFixed(1) + "%";
  }
  return "";
}

export function ProcessView({
  process,
  cols,
  inRows,
  outRows,
  targets,
}: {
  process: Process;
  cols: { in: ColDef[]; out: ColDef[] };
  inRows: Lot[];
  outRows: Lot[];
  targets: Process[];
}) {
  const isWork = process.schema_type === "work";
  const [selIn, setSelIn] = useState<Set<string>>(new Set());
  const [selOut, setSelOut] = useState<Set<string>>(new Set());
  const [edits, setEdits] = useState<Edits>({});
  const [targetId, setTargetId] = useState(targets[0]?.id ?? "");
  const [splitN, setSplitN] = useState(2);
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const toggle = (set: "in" | "out", id: string, on: boolean) => {
    const setter = set === "in" ? setSelIn : setSelOut;
    setter((prev) => {
      const next = new Set(prev);
      if (on) next.add(id);
      else next.delete(id);
      return next;
    });
  };

  const run = (
    fn: () => Promise<{ error?: string } & Record<string, unknown>>,
    ok: (r: Record<string, unknown>) => string,
  ) =>
    start(async () => {
      const res = await fn();
      if (res?.error) setMsg("오류: " + res.error);
      else {
        setMsg(ok(res));
        setSelIn(new Set());
        setSelOut(new Set());
      }
    });

  // 편집값이 반영된 lot
  const eff = (l: Lot): Lot => ({ ...l, ...(edits[l.id] ?? {}) });
  const editVal = (id: string, key: string, fallback: number | null) => {
    const e = edits[id];
    const v = e && key in e ? e[key] : fallback;
    return v == null ? "" : String(v);
  };
  const onEdit = (id: string, key: string, raw: string) =>
    setEdits((prev) => ({
      ...prev,
      [id]: { ...prev[id], [key]: raw === "" ? null : Number(raw) },
    }));
  const onEditBlur = (id: string, key: string) => {
    const v = edits[id]?.[key];
    start(async () => {
      await updateLot(process.id, id, { [key]: v ?? null });
    });
  };

  const nIn = selIn.size;
  const nOut = selOut.size;

  const Table = ({
    title,
    columns,
    rows,
    accent,
    side,
  }: {
    title: string;
    columns: ColDef[];
    rows: Lot[];
    accent: string;
    side: "in" | "out";
  }) => {
    const sel = side === "in" ? selIn : selOut;
    return (
      <div className="flex-1 min-w-0">
        <div className={`text-sm font-semibold mb-1 px-1 ${accent}`}>
          {title} <span className="text-gray-400">({rows.length})</span>
        </div>
        <div className="overflow-x-auto">
          <table className="text-xs border-collapse border border-gray-400 dark:border-neutral-600">
            <colgroup>
              <col style={{ width: 30 }} />
              {columns.map((c, i) => (
                <col key={i} style={{ width: c.width }} />
              ))}
            </colgroup>
            <thead>
              <tr className="bg-gray-100 dark:bg-neutral-800">
                <th className="border border-gray-400 px-1 dark:border-neutral-600" />
                {columns.map((c, i) => (
                  <th
                    key={i}
                    className="border border-gray-400 px-2 py-1 font-medium whitespace-nowrap dark:border-neutral-600"
                  >
                    {c.label}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {rows.length === 0 ? (
                <tr>
                  <td
                    colSpan={columns.length + 1}
                    className="border border-gray-300 px-2 py-4 text-center text-gray-400 dark:border-neutral-700 dark:text-neutral-500"
                  >
                    데이터 없음
                  </td>
                </tr>
              ) : (
                rows.map((r) => {
                  const checked = sel.has(r.id);
                  const e = eff(r);
                  return (
                    <tr
                      key={r.id}
                      className={`${
                        checked
                          ? "bg-blue-50 dark:bg-blue-950"
                          : "hover:bg-amber-50 dark:hover:bg-neutral-800"
                      } ${r.locked ? "opacity-40" : ""}`}
                    >
                      <td className="border border-gray-300 text-center dark:border-neutral-700">
                        {!r.locked && (
                          <input
                            type="checkbox"
                            checked={checked}
                            onChange={(ev) => toggle(side, r.id, ev.target.checked)}
                          />
                        )}
                      </td>
                      {columns.map((c, i) => {
                        const right =
                          c.kind === "weight" || c.kind === "int"
                            ? "text-right tabular-nums"
                            : "";
                        if (c.computed)
                          return (
                            <td
                              key={i}
                              className={`border border-gray-300 px-2 py-1 dark:border-neutral-700 bg-gray-50 dark:bg-neutral-900 text-gray-600 dark:text-neutral-400 ${right}`}
                            >
                              {computedValue(c, e)}
                            </td>
                          );
                        if (c.editable && !r.locked)
                          return (
                            <td key={i} className="border border-gray-300 p-0 dark:border-neutral-700">
                              <NumberInput
                                value={editVal(r.id, c.key as string, r[c.key] as number | null)}
                                kind="weight"
                                onChange={(v) => onEdit(r.id, c.key as string, v)}
                                className="w-full px-2 py-1 outline-none focus:bg-blue-50 dark:focus:bg-blue-950"
                              />
                            </td>
                          );
                        return (
                          <td
                            key={i}
                            className={`border border-gray-300 px-2 py-1 whitespace-nowrap dark:border-neutral-700 ${right}`}
                          >
                            {fmt(r[c.key], c.kind)}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2 border border-gray-200 rounded p-2 bg-gray-50 dark:bg-neutral-900 dark:border-neutral-700">
        <span className="text-xs text-gray-500 dark:text-neutral-400">
          작업중 {nIn} · 완료 {nOut} 선택
        </span>
        <span className="text-gray-300 dark:text-neutral-600">|</span>

        {/* 작업중(입고) 대상 액션 */}
        <button
          disabled={pending || nIn === 0}
          onClick={() =>
            run(
              () => completeLots(process.id, [...selIn]),
              (r) => `완료 처리 (${r.merged}건 → ${r.serial})`,
            )
          }
          className="text-xs rounded px-3 py-1 bg-teal-600 text-white disabled:opacity-40"
        >
          {nIn > 1 ? "집계(완료)" : "완료 처리"}
        </button>
        <button
          disabled={pending || nIn === 0 || !targetId}
          onClick={() =>
            run(
              () => transferInbound(process.id, targetId, [...selIn]),
              (r) => `${r.moved}건 투입`,
            )
          }
          className="text-xs rounded px-3 py-1 bg-indigo-600 text-white disabled:opacity-40"
        >
          투입 →
        </button>
        <div className="flex items-center gap-1">
          <button
            disabled={pending || nIn !== 1}
            onClick={() =>
              run(
                () => splitLot(process.id, [...selIn][0], splitN),
                (r) => `${r.parts}개로 분할`,
              )
            }
            className="text-xs rounded px-3 py-1 bg-amber-600 text-white disabled:opacity-40"
          >
            분할
          </button>
          <input
            type="number"
            min={2}
            value={splitN}
            onChange={(e) => setSplitN(Math.max(2, Number(e.target.value) || 2))}
            className="w-12 border border-gray-300 rounded px-1 py-1 text-xs text-right dark:border-neutral-600"
          />
        </div>

        <span className="text-gray-300 dark:text-neutral-600">|</span>
        {/* 완료(출고) 대상 액션 */}
        <select
          value={targetId}
          onChange={(e) => setTargetId(e.target.value)}
          className="border border-gray-300 rounded px-2 py-1 text-xs dark:border-neutral-600 dark:bg-neutral-900"
        >
          {targets.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <button
          disabled={pending || nOut === 0 || !targetId}
          onClick={() =>
            run(
              () => transferOutbound(process.id, targetId, [...selOut]),
              (r) => `${r.moved}건 이관`,
            )
          }
          className="text-xs rounded px-3 py-1 bg-rose-600 text-white disabled:opacity-40"
        >
          이관 →
        </button>

        <span className="text-gray-300 dark:text-neutral-600">|</span>
        <button
          disabled={pending || nIn + nOut === 0}
          onClick={() => {
            if (confirm(`${nIn + nOut}건을 삭제할까요?`))
              run(
                () => deleteLots(process.id, [...selIn, ...selOut]),
                (r) => `${r.deleted}건 삭제`,
              );
          }}
          className="text-xs rounded px-3 py-1 border border-rose-400 text-rose-600 disabled:opacity-40 dark:border-rose-800"
        >
          삭제
        </button>

        {msg && <span className="text-xs text-gray-600 dark:text-neutral-300">{msg}</span>}
      </div>

      <div className="flex gap-4">
        <Table
          title={isWork ? "작업중 (입고)" : "입고"}
          columns={cols.in}
          rows={inRows}
          accent="text-emerald-700 dark:text-emerald-400"
          side="in"
        />
        <Table
          title={isWork ? "완료 (출고)" : "출고"}
          columns={cols.out}
          rows={outRows}
          accent="text-rose-700 dark:text-rose-400"
          side="out"
        />
      </div>

      <p className="text-xs text-gray-400 dark:text-neutral-500">
        ※ 일련번호는 이동해도 그대로 유지(병합·분할 시에만 형태 변경). 처리된 행은 잠금(흐림)되어 재작업 불가.
        완료측 <b>작업후/실중량·Tag</b> 칸은 직접 입력 → 로스·로스율·출고중량 자동 계산.
      </p>
    </div>
  );
}
