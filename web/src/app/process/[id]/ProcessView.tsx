"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import type { ColDef, Lot, Process } from "@/lib/types";
import { fmtWeight, fmtInt, round2, lossOf, lossRateOf, shipWeight } from "@/lib/types";
import { NumberInput } from "@/components/NumberInput";
import { focusNextInput } from "@/lib/enterNav";
import {
  completeLots, feedToWork, feedToOtherDept, relayToWork, shipToIo,
  splitLotCustom, deleteLots, unlockLots, updateLot, tagAdjust, tagConfirm,
} from "./actions";

type ActionResult = { error?: string } & Record<string, unknown>;
type Side = "in" | "out";

// ───────── 표시 헬퍼 (모듈 스코프 = 안정, 입력 포커스 유지) ─────────
function fmtCell(v: unknown, kind: string): string {
  if (v === null || v === undefined || v === "") return "";
  if (kind === "datetime") {                                   // 출고시간: 일 HH:MM (월 제거)
    const s = String(v);
    return `${s.slice(8, 10)} ${s.slice(11, 16)}`;
  }
  if (kind === "weight") return typeof v === "string" && v.includes(",") ? v : fmtWeight(v); // 원중량 집계 콤마결합은 그대로
  if (kind === "int") return fmtInt(v);
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
const isNumKind = (k: string) => k === "weight" || k === "int";

// 목표 중량에 가장 근사한 조합(2개 이상) 찾기 — 작업중 weight(중량) 기준
//  분기한정 DFS(오름차순 정렬 + 초과 가지치기 + 노드/크기 상한)로 상위 N개 반환
type Combo = { ids: string[]; sum: number; diff: number };
function findCombos(
  items: { id: string; w: number }[],
  target: number,
  topN = 5,
  maxSize = 10,
): Combo[] {
  const arr = items.filter((it) => it.w > 0).sort((a, b) => a.w - b.w);
  const n = arr.length;
  const best: Combo[] = [];
  let worst = Infinity;
  let nodes = 0;
  const CAP = 1_500_000;
  const cur: number[] = [];

  const consider = (sum: number) => {
    if (cur.length < 2) return;
    const diff = Math.abs(sum - target);
    if (best.length < topN || diff < worst) {
      best.push({ ids: cur.map((i) => arr[i].id), sum: round2(sum), diff: round2(diff) });
      best.sort((a, b) => a.diff - b.diff || a.ids.length - b.ids.length);
      if (best.length > topN) best.pop();
      worst = best[best.length - 1].diff;
    }
  };
  const dfs = (i: number, sum: number) => {
    if (nodes++ > CAP || i >= n) return;
    if (cur.length < maxSize) {
      const ns = sum + arr[i].w;
      cur.push(i);
      consider(ns);
      // 초과 가지치기: 이미 target+worst 초과면 더 더해도 악화 → 포함 분기 중단
      if (!(ns - target > worst && ns >= target)) dfs(i + 1, ns);
      cur.pop();
    }
    dfs(i + 1, sum); // 미포함
  };
  dfs(0, 0);
  return best.sort((a, b) => a.diff - b.diff || a.ids.length - b.ids.length);
}
const CIRCLED = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩"];

// ───────── 한 블록 테이블 카드 (표시 전용 — 수정은 모달에서만) ─────────
function LotTable({
  title, accent, columns, rows, selected, onToggle, onToggleAll, headTop,
}: {
  title: string;
  accent: string;
  columns: ColDef[];
  rows: Lot[];
  selected: Set<string>;
  onToggle: (id: string, on: boolean) => void;
  onToggleAll: (on: boolean) => void;
  headTop: number;        // 표 헤더 sticky top(px) = 전역헤더+툴바 높이
}) {
  const weightSum = rows.reduce((a, r) => a + (Number(r.weight) || 0), 0);
  const allSel = rows.length > 0 && rows.every((r) => selected.has(r.id));
  // 체크박스 포함 모든 열을 비율(%)로 → table-fixed가 카드 폭에 정확히 맞춰 가로 스크롤 제거
  const CHK_W = 22;
  const totalW = CHK_W + columns.reduce((a, c) => a + (c.width ?? 60), 0);
  const pct = (w: number) => `${(w / totalW) * 100}%`;

  return (
    // flex-grow를 열 합폭(totalW)에 비례 → 열 많은 완료/출고 카드가 더 넓게 배분되어 같은 항목 열이 좌우 동일 px
    <section style={{ flexGrow: totalW, flexBasis: 0 }}
      className="min-w-0 rounded-xl border border-slate-200 bg-white shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <header className="flex items-center justify-between gap-2 border-b border-slate-100 px-3 py-2 dark:border-neutral-800">
        <div className="flex items-center gap-2">
          <span className={`h-2.5 w-2.5 rounded-full ${accent}`} />
          <h3 className="text-sm font-semibold">{title}</h3>
          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[11px] text-slate-500 dark:bg-neutral-800 dark:text-neutral-400">
            {rows.length}건
          </span>
        </div>
        <span className="text-[11px] tabular-nums text-slate-400">중량 합 {fmtWeight(weightSum)}</span>
      </header>
      {/* 내부 스크롤 없음 — 페이지가 통째로 스크롤되고, 헤더만 툴바 아래에 sticky로 고정.
          overflow-* 를 주면 스크롤 컨테이너가 생겨 sticky가 다시 갇히므로 금지(table-fixed라 가로 넘침 없음) */}
      <div>
        <table className="w-full table-fixed text-[11px] leading-tight" onKeyDown={focusNextInput}>
          <colgroup>
            <col style={{ width: pct(CHK_W) }} />
            {columns.map((c, i) => <col key={i} style={{ width: pct(c.width ?? 60) }} />)}
          </colgroup>
          <thead>
            <tr className="text-slate-500 dark:text-neutral-400">
              <th style={{ top: headTop }} className="sticky z-10 bg-slate-100 px-1 py-1.5 dark:bg-neutral-800">
                <input type="checkbox" checked={allSel} onChange={(e) => onToggleAll(e.target.checked)} />
              </th>
              {columns.map((c, i) => {
                // Tag수정/Tag중량/Tag로스 헤더는 폭이 좁아 줄바꿈 → 글자만 축소
                const tight = c.key === "tag_fixed" || c.key === "tag_weight" || c.key === "tag_loss";
                return (
                  <th key={i} style={{ top: headTop }}
                    className={`sticky z-10 bg-slate-100 py-1.5 text-center font-medium dark:bg-neutral-800 ${
                      tight ? "whitespace-nowrap px-0.5 text-[9px]" : "px-1.5"}`}>
                    {c.label}
                  </th>
                );
              })}
            </tr>
          </thead>
          <tbody>
            {rows.length === 0 ? (
              <tr><td colSpan={columns.length + 1}
                className="px-3 py-8 text-center text-slate-300 dark:text-neutral-600">데이터 없음</td></tr>
            ) : (
              rows.map((r, ri) => {
                const checked = selected.has(r.id);
                return (
                  <tr key={r.id}
                    onClick={() => onToggle(r.id, !checked)}
                    className={`cursor-pointer border-t border-slate-100 dark:border-neutral-800 ${
                      checked ? "bg-blue-50/70 dark:bg-blue-950/40"
                        : ri % 2 ? "bg-slate-50/40 dark:bg-neutral-900/60" : ""
                    } ${r.locked ? "opacity-50" : "hover:bg-amber-50/60 dark:hover:bg-neutral-800/60"}`}>
                    {/* 체크박스 칸은 네이티브 토글이 처리 → 행 onClick과 중복 방지 위해 전파 중단 */}
                    <td className="px-1 py-0.5 text-center" onClick={(e) => e.stopPropagation()}>
                      <input type="checkbox" checked={checked}
                        onChange={(ev) => onToggle(r.id, ev.target.checked)} />
                    </td>
                    {columns.map((c, i) => {
                      const numeric = isNumKind(c.kind) || !!c.computed;
                      const align = numeric ? "text-right tabular-nums" : c.key === "due_date" ? "text-center" : "";
                      if (c.computed)
                        return (
                          <td key={i} className={`break-words px-1.5 py-1 text-slate-500 dark:text-neutral-400 ${align}`}>
                            {computedValue(c, r)}
                          </td>
                        );
                      const isSerial = c.key === "serial";
                      const locked = isSerial && r.locked;
                      // 일련번호는 줄바꿈 없이 길면 …처리(호버 title로 전체 표시), 나머지는 줄바꿈 허용
                      const cellCls = isSerial ? "truncate" : "break-words";
                      return (
                        <td key={i} className={`${cellCls} px-1.5 py-1 ${align}`} title={fmtCell(r[c.key], c.kind)}>
                          {locked && <span className="mr-1">🔒</span>}
                          {fmtCell(r[c.key], c.kind)}
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
    </section>
  );
}

// ───────── 인라인 수정 패널 (새창 아님, 카드형) ─────────
function EditPanel({
  row, columns, onSave, onClose, pending,
}: {
  row: Lot; columns: ColDef[];
  onSave: (patch: Record<string, number | string | null>) => void;
  onClose: () => void; pending: boolean;
}) {
  // 모달에서는 모든 입력 칸 수정 가능(표 인라인만 잠금). 계산칸·시간·현황만 제외.
  const fields = columns.filter(
    (c) => !c.computed && c.kind !== "datetime" && c.kind !== "status",
  );
  const computedCols = columns.filter((c) => c.computed); // 출고중량 / 로스 / 로스율
  const init: Record<string, string> = {};
  for (const c of fields) {
    const v = row[c.key];
    init[c.key as string] = v == null ? ""
      : c.kind === "weight" && !isNaN(Number(v)) ? Number(v).toFixed(2) // 소수 2자리 일관 표시
      : String(v);
  }
  const [vals, setVals] = useState<Record<string, string>>(init);
  const set = (k: string, v: string) => setVals((p) => ({ ...p, [k]: v }));

  // 현재 입력값을 반영한 가상 Lot → 출고중량/로스 실시간 계산
  const eff = { ...row } as unknown as Record<string, unknown>;
  for (const c of fields) {
    const raw = vals[c.key as string];
    eff[c.key as string] =
      raw === "" || raw == null ? null : isNumKind(c.kind) ? Number(raw) : raw;
  }

  const save = () => {
    const patch: Record<string, number | string | null> = {};
    for (const c of fields) {
      const raw = vals[c.key as string];
      patch[c.key as string] = raw === "" ? null : isNumKind(c.kind) ? Number(raw) : raw;
    }
    onSave(patch);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-[1100px] overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl dark:bg-neutral-900"
        onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-base font-bold">✏️ 행 수정 <span className="font-normal text-slate-400">· {row.serial ?? "(번호없음)"}</span></h3>
          <div className="flex gap-2">
            <button onClick={onClose} className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs dark:border-neutral-600">취소</button>
            <button onClick={save} disabled={pending}
              className="rounded-lg bg-blue-600 px-3 py-1.5 text-xs font-medium text-white disabled:opacity-40">저장</button>
          </div>
        </div>
        {/* 칸 폭을 원본 표 열폭(c.width)에 맞추고 한 줄로 흐르게 배치 — 표와 동일한 감각 */}
        <div className="flex flex-wrap items-end gap-x-2 gap-y-2" onKeyDown={focusNextInput}>
        {fields.map((c) => {
          const key = c.key as string;
          const cls = "w-full rounded-md border border-slate-200 bg-white px-1.5 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-900";
          return (
            <label key={key} className="flex flex-col gap-0.5"
              style={{ width: Math.max(c.width ?? 60, 48) }}>
              <span className="truncate text-center text-[11px] text-slate-500 dark:text-neutral-400">{c.label}</span>
              {isNumKind(c.kind) ? (
                <NumberInput value={vals[key]} kind={c.kind as "int" | "weight"} onChange={(v) => set(key, v)} className={cls} />
              ) : (
                <input value={vals[key]} type="text"
                  onChange={(e) => set(key, e.target.value)} className={cls} />
              )}
            </label>
          );
        })}
        </div>
        {/* 자동 계산 미리보기 — 수정값 기준 (출고중량 / 로스 / 로스율) */}
        {computedCols.length > 0 && (
          <div className="mt-3 flex flex-wrap gap-2 border-t border-slate-100 pt-3 dark:border-neutral-800">
            {computedCols.map((c, i) => (
              <div key={i} className="rounded-lg bg-slate-50 px-3 py-1.5 text-sm dark:bg-neutral-800">
                <span className="text-[11px] text-slate-400">{c.label}</span>{" "}
                <b className="tabular-nums">{computedValue(c, eff as unknown as Lot) || "—"}</b>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}

// ───────── 나누기 모달 (어두운 배경 크게보기, 합계 강제 검증) ─────────
function SplitModal({
  row, initialN, onConfirm, onClose, pending,
}: {
  row: Lot; initialN: number;
  onConfirm: (parts: { qty: number | null; weight: number | null }[]) => void;
  onClose: () => void; pending: boolean;
}) {
  const origQty = row.qty, origWeight = row.weight;
  const [parts, setParts] = useState<{ qty: string; weight: string }[]>(
    () => Array.from({ length: Math.max(2, initialN) }, () => ({ qty: "", weight: "" })),
  );
  const set = (i: number, k: "qty" | "weight", v: string) =>
    setParts((p) => p.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const add = () => setParts((p) => [...p, { qty: "", weight: "" }]);
  const del = (i: number) => setParts((p) => (p.length > 2 ? p.filter((_, j) => j !== i) : p));

  const qtySum = parts.reduce((a, p) => a + (Number(p.qty) || 0), 0);
  const wSum = round2(parts.reduce((a, p) => a + (Number(p.weight) || 0), 0));
  const qtyOK = origQty == null || qtySum === Number(origQty);
  const wOK = origWeight == null || wSum === round2(Number(origWeight));
  const canSave = !pending && parts.length >= 2 && qtyOK && wOK;
  const qtyRemain = origQty == null ? null : Number(origQty) - qtySum;
  const wRemain = origWeight == null ? null : round2(Number(origWeight) - wSum);

  const save = () =>
    onConfirm(parts.map((p) => ({
      qty: p.qty === "" ? null : Number(p.qty),
      weight: p.weight === "" ? null : Number(p.weight),
    })));
  const inp = "w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl dark:bg-neutral-900"
        onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-bold">나누기</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>
        {/* 원본 */}
        <div className="mb-4 rounded-xl bg-slate-50 p-3 dark:bg-neutral-800">
          <div className="text-xs text-slate-400">원래 내역</div>
          <div className="mt-1 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm">
            <span className="font-semibold">{row.serial ?? "(번호없음)"}</span>
            <span>{row.description ?? ""}</span>
            <span>수량 <b>{fmtInt(origQty)}</b></span>
            <span>중량 <b>{fmtWeight(origWeight)}</b></span>
          </div>
        </div>
        {/* 분할행 */}
        <div className="space-y-2" onKeyDown={focusNextInput}>
          {parts.map((p, i) => (
            <div key={i} className="flex items-end gap-2">
              <span className="w-6 pb-2 text-center text-sm text-slate-400">{i + 1}</span>
              <label className="flex-1">
                <span className="text-[11px] text-slate-400">수량</span>
                <NumberInput value={p.qty} kind="int" onChange={(v) => set(i, "qty", v)} className={inp} />
              </label>
              <label className="flex-1">
                <span className="text-[11px] text-slate-400">중량</span>
                <NumberInput value={p.weight} kind="weight" onChange={(v) => set(i, "weight", v)} className={inp} />
              </label>
              <button onClick={() => del(i)} disabled={parts.length <= 2}
                className="pb-2 text-slate-300 hover:text-rose-500 disabled:opacity-30">✕</button>
            </div>
          ))}
        </div>
        <button onClick={add} className="mt-2 text-xs text-slate-500 hover:underline">+ 행 추가</button>
        {/* 합계 검증 */}
        <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
          <div className={`rounded-lg p-2 ${qtyOK ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40" : "bg-rose-50 text-rose-700 dark:bg-rose-950/40"}`}>
            수량 합 {fmtInt(qtySum)} / {fmtInt(origQty)}{qtyRemain != null && qtyRemain !== 0 ? ` (잔여 ${fmtInt(qtyRemain)})` : ""}
          </div>
          <div className={`rounded-lg p-2 ${wOK ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40" : "bg-rose-50 text-rose-700 dark:bg-rose-950/40"}`}>
            중량 합 {fmtWeight(wSum)} / {fmtWeight(origWeight)}{wRemain != null && wRemain !== 0 ? ` (잔여 ${fmtWeight(wRemain)})` : ""}
          </div>
        </div>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm dark:border-neutral-600">취소</button>
          <button onClick={save} disabled={!canSave}
            className="rounded-lg bg-amber-500 px-4 py-2 text-sm font-medium text-white disabled:opacity-40">나누기 저장</button>
        </div>
      </div>
    </div>
  );
}

// ───────── 작업완료(집계) 모달 — 작업후 중량 입력 ─────────
//  작업전(P) = 선택 작업중행 중량(K) 합. 작업후(Q) 입력 → 로스 = 작업전 − 작업후.
function CompleteModal({
  rows, onConfirm, onClose, pending,
}: {
  rows: Lot[];
  onConfirm: (after: number | null) => void;
  onClose: () => void; pending: boolean;
}) {
  const before = round2(rows.reduce((a, r) => a + (Number(r.weight) || 0), 0));
  const [after, setAfter] = useState("");
  const a = after === "" ? null : Number(after);
  const loss = a == null ? null : round2(before - a);
  const lossRate = a == null || !before ? null : (1 - a / before) * 100;
  const inp = "w-full rounded-md border border-slate-200 px-2 py-1.5 text-base dark:border-neutral-700 dark:bg-neutral-900";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="w-full max-w-md rounded-2xl bg-white p-5 shadow-2xl dark:bg-neutral-900"
        onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-bold">작업완료(집계)</h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>
        <div className="mb-4 rounded-xl bg-slate-50 p-3 text-sm dark:bg-neutral-800">
          <div className="flex justify-between"><span className="text-slate-400">집계 건수</span><b>{rows.length}건</b></div>
          <div className="mt-1 flex justify-between"><span className="text-slate-400">작업전(중량 합)</span><b className="tabular-nums">{fmtWeight(before)}</b></div>
        </div>
        <label className="block" onKeyDown={focusNextInput}>
          <span className="text-[11px] text-slate-400">작업후 중량</span>
          <NumberInput value={after} kind="weight" onChange={setAfter} className={inp} />
        </label>
        <div className="mt-3 grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-lg bg-slate-50 p-2 dark:bg-neutral-800">
            로스 <b className="tabular-nums">{loss == null ? "—" : fmtWeight(loss)}</b>
          </div>
          <div className="rounded-lg bg-slate-50 p-2 dark:bg-neutral-800">
            로스율 <b className="tabular-nums">{lossRate == null ? "—" : lossRate.toFixed(1) + "%"}</b>
          </div>
        </div>
        <p className="mt-2 text-[11px] text-slate-400">※ 작업후를 비워두면 나중에 행 수정에서 입력할 수 있습니다.</p>
        <div className="mt-4 flex justify-end gap-2">
          <button onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm dark:border-neutral-600">취소</button>
          <button onClick={() => onConfirm(a)} disabled={pending}
            className="rounded-lg bg-teal-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40">집계 완료</button>
        </div>
      </div>
    </div>
  );
}

// ───────── Tag 보정 모달 (Module14) — 행별 잔여 Tag 수량 입력 ─────────
//  Tag중량 = ROUNDDOWN(잔여수량 × 0.035, 2), Tag로스 = Tag − Tag중량, 출고중량 = 수식 자동
function TagAdjustModal({
  rows, onConfirm, onClose, pending,
}: {
  rows: Lot[];
  onConfirm: (items: { id: string; qty: number }[]) => void;
  onClose: () => void; pending: boolean;
}) {
  const [qtys, setQtys] = useState<Record<string, string>>({});
  const set = (id: string, v: string) => setQtys((p) => ({ ...p, [id]: v }));
  const twOf = (q: number) => Math.floor(q * 0.035 * 100) / 100;       // ROUNDDOWN 2자리
  const items = rows
    .map((r) => ({ id: r.id, qty: qtys[r.id] === "" || qtys[r.id] == null ? NaN : Number(qtys[r.id]) }))
    .filter((it) => !Number.isNaN(it.qty));
  const inp = "w-24 rounded-md border border-slate-200 px-2 py-1 text-sm dark:border-neutral-700 dark:bg-neutral-900";

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 p-4" onClick={onClose}>
      <div className="max-h-[90vh] w-full max-w-2xl overflow-y-auto rounded-2xl bg-white p-5 shadow-2xl dark:bg-neutral-900"
        onClick={(e) => e.stopPropagation()}>
        <div className="mb-3 flex items-center justify-between">
          <h3 className="text-lg font-bold">Tag 보정 <span className="text-sm font-normal text-slate-400">· 잔여 Tag 수량 입력</span></h3>
          <button onClick={onClose} className="text-slate-400 hover:text-slate-600">✕</button>
        </div>
        <table className="w-full text-sm" onKeyDown={focusNextInput}>
          <thead>
            <tr className="text-[11px] text-slate-400">
              <th className="px-2 py-1 text-left">일련번호</th>
              <th className="px-2 py-1 text-left">내역</th>
              <th className="px-2 py-1 text-right">Tag</th>
              <th className="px-2 py-1 text-center">잔여 수량</th>
              <th className="px-2 py-1 text-right">Tag중량</th>
              <th className="px-2 py-1 text-right">Tag로스</th>
              <th className="px-2 py-1 text-right">출고중량</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => {
              const raw = qtys[r.id];
              const has = raw !== "" && raw != null && !Number.isNaN(Number(raw));
              const tw = has ? twOf(Number(raw)) : null;
              const tl = tw == null ? null : round2(Number(r.tag ?? 0) - tw);
              const ship = tw == null ? null
                : shipWeight({ ...r, tag_weight: tw, tag_loss: tl } as Lot);
              return (
                <tr key={r.id} className="border-t border-slate-100 dark:border-neutral-800">
                  <td className="px-2 py-1">{r.serial ?? "(번호없음)"}</td>
                  <td className="px-2 py-1 text-slate-500">{r.description ?? ""}</td>
                  <td className="px-2 py-1 text-right tabular-nums">{fmtWeight(r.tag)}</td>
                  <td className="px-2 py-1 text-center">
                    <NumberInput value={raw ?? ""} kind="weight" onChange={(v) => set(r.id, v)} className={inp} />
                  </td>
                  <td className="px-2 py-1 text-right tabular-nums">{tw == null ? "—" : fmtWeight(tw)}</td>
                  <td className="px-2 py-1 text-right tabular-nums">{tl == null ? "—" : fmtWeight(tl)}</td>
                  <td className="px-2 py-1 text-right font-medium tabular-nums">{ship == null ? "—" : fmtWeight(ship)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <div className="mt-4 flex items-center justify-end gap-2">
          <span className="mr-auto text-xs text-slate-400">{items.length}/{rows.length}건 입력됨</span>
          <button onClick={onClose} className="rounded-lg border border-slate-300 px-4 py-2 text-sm dark:border-neutral-600">취소</button>
          <button onClick={() => onConfirm(items)} disabled={pending || items.length === 0}
            className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white disabled:opacity-40">보정 적용</button>
        </div>
      </div>
    </div>
  );
}

// ───────── 버튼 ─────────
function Btn({
  children, onClick, disabled, tone = "default",
}: {
  children: React.ReactNode; onClick: () => void; disabled?: boolean;
  tone?: "default" | "primary" | "indigo" | "rose" | "amber" | "ghost";
}) {
  const tones: Record<string, string> = {
    default: "bg-slate-700 text-white hover:bg-slate-800",
    primary: "bg-teal-600 text-white hover:bg-teal-700",
    indigo: "bg-indigo-600 text-white hover:bg-indigo-700",
    rose: "bg-rose-600 text-white hover:bg-rose-700",
    amber: "bg-amber-500 text-white hover:bg-amber-600",
    ghost: "border border-slate-300 text-slate-600 hover:bg-slate-100 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800",
  };
  return (
    <button onClick={onClick} disabled={disabled}
      className={`rounded-lg px-2.5 py-1.5 text-xs font-medium transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${tones[tone]}`}>
      {children}
    </button>
  );
}

function TargetAction({
  label, tone, targets, disabled, onRun,
}: {
  label: string; tone: "indigo" | "rose" | "amber" | "primary" | "default";
  targets: Process[]; disabled: boolean; onRun: (targetId: string) => void;
}) {
  const [tid, setTid] = useState(targets[0]?.id ?? "");
  if (targets.length === 0) return null;
  return (
    <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-neutral-800">
      <select value={tid} onChange={(e) => setTid(e.target.value)}
        className="max-w-[120px] rounded-md bg-white px-2 py-1 text-xs dark:bg-neutral-900">
        {targets.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
      </select>
      <Btn tone={tone} disabled={disabled || !tid} onClick={() => onRun(tid)}>{label}</Btn>
    </div>
  );
}

export function ProcessView({
  process, cols, inRows, outRows, allProcesses,
}: {
  process: Process; cols: { in: ColDef[]; out: ColDef[] };
  inRows: Lot[]; outRows: Lot[]; allProcesses: Process[];
}) {
  const isWork = process.schema_type === "work";
  const [selIn, setSelIn] = useState<Set<string>>(new Set());
  const [selOut, setSelOut] = useState<Set<string>>(new Set());
  const [splitN, setSplitN] = useState(2);
  const [editId, setEditId] = useState<string | null>(null);
  const [target, setTarget] = useState("");
  const [combos, setCombos] = useState<Combo[]>([]);
  const [splitRowId, setSplitRowId] = useState<string | null>(null);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [tagAdjustOpen, setTagAdjustOpen] = useState(false);
  const [pending, start] = useTransition();

  // 토스트 + 확인 토스트
  const [toast, setToast] = useState<{ kind: "ok" | "err" | "info"; text: string; id: number } | null>(null);
  const [confirmBox, setConfirmBox] = useState<
    { text: string; onYes: () => void; yesLabel?: string; altLabel?: string; onAlt?: () => void } | null
  >(null);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  // 표 헤더 sticky 위치 = 전역헤더(49px) + 액션 툴바 실측 높이.
  // 툴바가 1~2줄로 감겨 높이가 달라져도 겹치지 않게 런타임 측정(데스크톱 전용).
  const toolbarRef = useRef<HTMLDivElement>(null);
  const [headTop, setHeadTop] = useState(96);
  useEffect(() => {
    const el = toolbarRef.current;
    if (!el) return;
    const update = () => setHeadTop(49 + el.offsetHeight);
    update();
    const ro = new ResizeObserver(update);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);

  const notify = (kind: "ok" | "err" | "info", text: string) =>
    setToast({ kind, text, id: Date.now() });
  useEffect(() => {
    if (!toast) return;
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setToast(null), 3200);
    return () => { if (timer.current) clearTimeout(timer.current); };
  }, [toast]);

  const workTargets = useMemo(
    () => allProcesses.filter((p) => p.schema_type === "work" && p.karat === process.karat),
    [allProcesses, process.karat]);
  const otherIoTargets = useMemo(
    () => allProcesses.filter((p) => p.schema_type === "io" && p.karat === process.karat && p.id !== process.id),
    [allProcesses, process.id, process.karat]);
  const ioFieldTargets = useMemo(
    () => allProcesses.filter((p) => p.schema_type === "io" && !p.is_inspection && p.karat === process.karat),
    [allProcesses, process.karat]);
  const ioInspTargets = useMemo(
    () => allProcesses.filter((p) => p.schema_type === "io" && p.is_inspection && p.karat === process.karat),
    [allProcesses, process.karat]);

  const lockedSet = useMemo(
    () => new Set([...inRows, ...outRows].filter((r) => r.locked).map((r) => r.id)),
    [inRows, outRows]);

  // ── 좌/우 배타 선택: 한쪽을 켜면 반대쪽 비움 ──
  const toggle = (side: Side) => (id: string, on: boolean) => {
    const [setThis, clearOther] = side === "in" ? [setSelIn, setSelOut] : [setSelOut, setSelIn];
    setThis((prev) => {
      const n = new Set(prev);
      if (on) { n.add(id); clearOther(new Set()); }
      else n.delete(id);
      return n;
    });
  };
  const toggleAll = (side: Side, rows: Lot[]) => (on: boolean) => {
    const [setThis, clearOther] = side === "in" ? [setSelIn, setSelOut] : [setSelOut, setSelIn];
    if (on) { setThis(new Set(rows.map((r) => r.id))); clearOther(new Set()); }
    else setThis(new Set());
  };
  const clearSel = () => { setSelIn(new Set()); setSelOut(new Set()); };

  const run = (fn: () => Promise<ActionResult>, ok: (r: ActionResult) => string) =>
    start(async () => {
      const res = await fn();
      if (res?.error) notify("err", res.error);
      else { notify("ok", ok(res)); clearSel(); }
    });
  const askConfirm = (text: string, onYes: () => void) => setConfirmBox({ text, onYes });

  const inIds = [...selIn], outIds = [...selOut];
  const nIn = inIds.length, nOut = outIds.length;
  const selectedLocked = [...inIds, ...outIds].filter((id) => lockedSet.has(id));
  const selInRows = inRows.filter((r) => selIn.has(r.id));
  const selOutRows = outRows.filter((r) => selOut.has(r.id));

  // 선택 행들의 중량 합 (좌·우 배타라 한쪽만 값)
  const selWeight = round2(
    selInRows.reduce((a, r) => a + (Number(r.weight) || 0), 0) +
    selOutRows.reduce((a, r) => a + (Number(r.weight) || 0), 0),
  );

  // 목표 중량 조합 찾기 (작업중/입고 미완료 행 대상)
  const runFind = () => {
    const t = Number(target.replace(/,/g, ""));
    if (!t) { notify("info", "목표 중량을 입력하세요."); return; }
    const items = inRows
      .filter((r) => !r.locked && Number(r.weight) > 0)
      .map((r) => ({ id: r.id, w: Number(r.weight) }));
    if (items.length < 2) { notify("info", "조합할 행이 부족합니다."); return; }
    const res = findCombos(items, t, 7);
    setCombos(res);
    if (res.length === 0) notify("info", "조합을 찾지 못했습니다.");
  };
  const pickCombo = (c: Combo) => { setSelIn(new Set(c.ids)); setSelOut(new Set()); };
  const editRow = editId
    ? [...inRows, ...outRows].find((r) => r.id === editId) ?? null
    : null;
  const splitRow = splitRowId ? inRows.find((r) => r.id === splitRowId) ?? null : null;
  const saveEdit = (patch: Record<string, number | string | null>) =>
    start(async () => {
      const res = await updateLot(process.id, editId!, patch);
      if (res?.error) notify("err", res.error);
      else { notify("ok", "수정 저장됨"); setEditId(null); clearSel(); }
    });

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-3">
        <Link href="/" className="text-sm text-slate-400 hover:text-slate-600">← 대시보드</Link>
        <h1 className={`text-2xl font-bold tracking-tight ${process.karat === "14K" ? "text-blue-600 dark:text-blue-400" : ""}`}>
          {process.name}
        </h1>
        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-500 dark:bg-neutral-800 dark:text-neutral-400">
          {isWork ? "공정" : process.is_inspection ? "검수" : "부서"} · {process.karat ?? "-"}
        </span>
      </div>

      {/* 액션 툴바 */}
      <div ref={toolbarRef} className="sticky top-[49px] z-20 rounded-xl border border-slate-200 bg-white/90 p-2.5 shadow-sm backdrop-blur print:hidden dark:border-neutral-800 dark:bg-neutral-900/90">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-400">
            선택 {isWork ? "작업중" : "입고"} <b className="text-slate-600 dark:text-neutral-200">{nIn}</b> · {isWork ? "완료" : "출고"} <b className="text-slate-600 dark:text-neutral-200">{nOut}</b>
          </span>
          {selWeight > 0 && (
            <span className="rounded-md bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
              선택 중량 합 {fmtWeight(selWeight)}
            </span>
          )}
          <span className="text-slate-200 dark:text-neutral-700">|</span>

          {isWork ? (
            <>
              <Btn tone="primary" disabled={pending || nIn === 0}
                onClick={() => setCompleteOpen(true)}>
                작업완료(집계)
              </Btn>
            </>
          ) : (
            <>
              <TargetAction label="투입 →" tone="indigo" targets={workTargets} disabled={pending || nIn === 0}
                onRun={(t) => run(() => feedToWork(process.id, t, inIds), (r) => `${r.moved}건 투입`)} />
              <TargetAction label="타부서투입 →" tone="default" targets={otherIoTargets} disabled={pending || nIn === 0}
                onRun={(t) => run(() => feedToOtherDept(process.id, t, inIds), (r) => `${r.moved}건 타부서투입`)} />
            </>
          )}
          {/* 나누기 (작업중/입고 단건) */}
          <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-neutral-800">
            <input type="number" min={2} value={splitN}
              onChange={(e) => setSplitN(Math.max(2, Number(e.target.value) || 2))}
              className="w-12 rounded-md bg-white px-1.5 py-1 text-right text-xs dark:bg-neutral-900" />
            <Btn tone="amber" disabled={pending || nIn !== 1}
              onClick={() => setSplitRowId(inIds[0])}>나누기</Btn>
          </div>
          {/* 목표중량 조합 찾기 (공정 전용) */}
          {isWork && (
            <div className="flex items-center gap-1 rounded-lg bg-slate-100 p-1 dark:bg-neutral-800">
              <input value={target} inputMode="decimal" placeholder="목표중량"
                onChange={(e) => {
                  const raw = e.target.value.replace(/,/g, "");
                  if (raw === "" || /^\d*\.?\d{0,2}$/.test(raw)) setTarget(raw);
                }}
                onBlur={() => {
                  const n = Number(target.replace(/,/g, ""));
                  if (target !== "" && !isNaN(n)) setTarget(fmtWeight(n));
                }}
                className="w-24 rounded-md bg-white px-2 py-1 text-center text-xs tabular-nums dark:bg-neutral-900" />
              <Btn tone="primary" disabled={pending} onClick={runFind}>조합 찾기</Btn>
            </div>
          )}
          <Btn tone="ghost" disabled={pending || nIn === 0}
            onClick={() => askConfirm(`${isWork ? "작업중" : "입고"} ${nIn}건을 삭제할까요?`,
              () => run(() => deleteLots(process.id, inIds), (r) => `${r.deleted}건 삭제`))}>
            {isWork ? "작업중 삭제" : "입고 삭제"}
          </Btn>

          <span className="text-slate-200 dark:text-neutral-700">|</span>

          {isWork ? (
            <>
              <TargetAction label="이관 →" tone="rose" targets={workTargets} disabled={pending || nOut === 0}
                onRun={(t) => run(() => relayToWork(process.id, t, outIds), (r) => `${r.moved}건 이관`)} />
              <TargetAction label="현장출고 →" tone="default" targets={ioFieldTargets} disabled={pending || nOut === 0}
                onRun={(t) => run(() => shipToIo(process.id, t, outIds), (r) => `${r.moved}건 현장출고`)} />
              <TargetAction label="검수출고 →" tone="default" targets={ioInspTargets} disabled={pending || nOut === 0}
                onRun={(t) => run(() => shipToIo(process.id, t, outIds), (r) => `${r.moved}건 검수출고`)} />
            </>
          ) : (
            <>
              <Btn tone="indigo" disabled={pending || nOut === 0}
                onClick={() => setTagAdjustOpen(true)}>
                Tag 보정
              </Btn>
              {process.is_inspection && (
                <Btn tone="default" disabled={pending}
                  onClick={() => run(() => tagConfirm(process.id), (r) => `Tag 확정 ${r.filled}건`)}>
                  Tag 확정
                </Btn>
              )}
            </>
          )}
          <Btn tone="ghost" disabled={pending || nOut === 0}
            onClick={() => askConfirm(`${isWork ? "완료" : "출고"} ${nOut}건을 삭제할까요?`,
              () => run(() => deleteLots(process.id, outIds), (r) => `${r.deleted}건 삭제`))}>
            {isWork ? "완료 삭제" : "출고 삭제"}
          </Btn>

          {/* 수정 + 잠금행 해제·삭제 (맨 오른쪽) */}
          <div className="ml-auto flex items-center gap-2">
            <Btn tone="default" disabled={pending || nIn + nOut !== 1}
              onClick={() => setEditId(inIds[0] ?? outIds[0])}>✏️ 수정</Btn>
            <Btn tone="rose" disabled={pending || selectedLocked.length === 0}
              onClick={() => setConfirmBox({
                text: `잠긴 ${selectedLocked.length}건을 어떻게 할까요?`,
                altLabel: "잠금 해제",
                onAlt: () => run(() => unlockLots(process.id, selectedLocked), (r) => `${r.unlocked}건 잠금 해제`),
                yesLabel: "삭제",
                onYes: () => run(() => deleteLots(process.id, selectedLocked), (r) => `잠금행 ${r.deleted}건 삭제`),
              })}>
              🔓 잠금 해제·삭제
            </Btn>
          </div>
        </div>

        {/* 조합 찾기 결과 (공정 전용) */}
        {isWork && combos.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2 dark:border-neutral-800">
            <span className="text-xs text-slate-400">목표 {fmtWeight(target.replace(/,/g, ""))} 근사 조합</span>
            {combos.map((c, i) => (
              <button key={i} onClick={() => pickCombo(c)}
                className="rounded-lg border border-teal-300 bg-teal-50 px-2.5 py-1 text-xs text-teal-800 hover:bg-teal-100 dark:border-teal-800 dark:bg-teal-950/40 dark:text-teal-200">
                <b>{CIRCLED[i]}</b> {fmtWeight(c.sum)}
                <span className="text-slate-400"> ({c.ids.length}건{c.diff > 0 ? `, 오차 ${fmtWeight(c.diff)}` : ", 정확"})</span>
              </button>
            ))}
            <button onClick={() => setCombos([])}
              className="rounded-lg border border-slate-300 px-2 py-1 text-xs text-slate-500 dark:border-neutral-700">지우기</button>
          </div>
        )}
      </div>

      {/* 수정 패널 */}
      {editRow && (
        <EditPanel key={editRow.id} row={editRow}
          columns={editRow.side === "in" ? cols.in : cols.out}
          pending={pending} onSave={saveEdit} onClose={() => setEditId(null)} />
      )}

      {/* 나누기 모달 */}
      {splitRow && (
        <SplitModal key={splitRow.id} row={splitRow} initialN={splitN} pending={pending}
          onClose={() => setSplitRowId(null)}
          onConfirm={(parts) => start(async () => {
            const res = await splitLotCustom(process.id, splitRow.id, parts);
            if (res?.error) notify("err", res.error);
            else { notify("ok", `${res.parts}개로 나눔`); setSplitRowId(null); clearSel(); }
          })} />
      )}

      {/* 작업완료(집계) 모달 — 작업후 중량 입력 */}
      {completeOpen && (
        <CompleteModal rows={selInRows} pending={pending}
          onClose={() => setCompleteOpen(false)}
          onConfirm={(after) => start(async () => {
            const res = await completeLots(process.id, inIds, after);
            if (res?.error) notify("err", res.error);
            else { notify("ok", `작업완료 (${res.merged}건 → ${res.serial})`); setCompleteOpen(false); clearSel(); }
          })} />
      )}

      {/* Tag 보정 모달 — 잔여 Tag 수량 입력 */}
      {tagAdjustOpen && (
        <TagAdjustModal rows={selOutRows} pending={pending}
          onClose={() => setTagAdjustOpen(false)}
          onConfirm={(items) => start(async () => {
            const res = await tagAdjust(process.id, items);
            if (res?.error) notify("err", res.error);
            else { notify("ok", `Tag 보정 ${res.adjusted}건`); setTagAdjustOpen(false); clearSel(); }
          })} />
      )}

      {/* 두 블록 (적응형: 좁으면 세로, 27"급은 가로) */}
      <div className="flex flex-col gap-3 2xl:flex-row">
        <LotTable title={isWork ? "작업중" : "입고"} accent="bg-emerald-500"
          columns={cols.in} rows={inRows} selected={selIn} headTop={headTop}
          onToggle={toggle("in")} onToggleAll={toggleAll("in", inRows)} />
        <LotTable title={isWork ? "완료" : "출고"} accent="bg-rose-500"
          columns={cols.out} rows={outRows} selected={selOut} headTop={headTop}
          onToggle={toggle("out")} onToggleAll={toggleAll("out", outRows)} />
      </div>

      <p className="text-[11px] text-slate-400 print:hidden">
        ※ 좌·우는 동시 선택 불가(흐름 로직이 다름). 일련번호는 이동해도 유지(집계·분할 시에만 형태 변경).
        처리행은 🔒 잠금 — 맨 오른쪽 버튼으로 해제·삭제. 표는 보기 전용 — 수정은 ✏️ 행 수정·Tag 보정 모달에서만.
        작업후=집계 모달 입력, 실중량=이전 파트 이월, Tag중량/로스/출고중량=자동 계산.
      </p>

      {/* 토스트 (화면 정중앙, 크게) */}
      {toast && (
        <div className="pointer-events-none fixed inset-0 z-50 flex items-center justify-center">
          <div className={`rounded-2xl px-8 py-5 text-lg font-medium shadow-2xl ${
            toast.kind === "err" ? "bg-rose-600 text-white"
              : toast.kind === "ok" ? "bg-emerald-600 text-white"
                : "bg-slate-800 text-white"}`}>
            {toast.text}
          </div>
        </div>
      )}
      {/* 확인 (화면 정중앙) */}
      {confirmBox && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20"
          onClick={() => setConfirmBox(null)}>
          <div className="rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-slate-200 dark:bg-neutral-800 dark:ring-neutral-700"
            onClick={(e) => e.stopPropagation()}>
            <p className="mb-4 text-base">{confirmBox.text}</p>
            <div className="flex items-center gap-2">
              {confirmBox.onAlt && (
                <button onClick={() => { const f = confirmBox.onAlt!; setConfirmBox(null); f(); }}
                  className="rounded-lg bg-indigo-600 px-4 py-2 text-sm font-medium text-white">
                  {confirmBox.altLabel ?? "잠금 해제"}
                </button>
              )}
              <button onClick={() => setConfirmBox(null)}
                className="ml-auto rounded-lg border border-slate-300 px-4 py-2 text-sm dark:border-neutral-600">취소</button>
              <button onClick={() => { const f = confirmBox.onYes; setConfirmBox(null); f(); }}
                className="rounded-lg bg-rose-600 px-4 py-2 text-sm font-medium text-white">{confirmBox.yesLabel ?? "확인"}</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
