"use client";

import { Fragment, useEffect, useMemo, useRef, useState, useTransition } from "react";
import { ChevronDown, GitBranch, Inbox, Loader2, Lock, LockOpen, Pencil, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import type { ColDef, Lot, Process, TraceResult, TraceNode, TraceEdge } from "@/lib/types";
import { fmtWeight, fmtInt, fmtKstDayTime, round2, lossOf, lossRateOf, shipWeight, stageLabel, RELATION_LABEL } from "@/lib/types";
import { cn } from "@/lib/utils";
import { NumberInput } from "@/components/NumberInput";
import { focusNextInput } from "@/lib/enterNav";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { Skeleton } from "@/components/ui/skeleton";
import { Checkbox } from "@/components/ui/checkbox";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { ClientLink } from "@/components/ClientLink";
import { MenuScrim } from "@/components/MenuScrim";
import { workGroupOf, ioGroupOf } from "@/lib/menuGroups";
import { useHoverMenu, type HoverMenu } from "@/lib/useHoverMenu";
import {
  completeLots, feedToWork, feedToOtherDept, relayToWork, shipToIo,
  splitLotCustom, deleteLots, unlockLots, updateLot, tagAdjust, tagConfirm, traceLot,
} from "./actions";

type ActionResult = { error?: string } & Record<string, unknown>;
type Side = "in" | "out";

// 색 버튼 톤 → shadcn Button className (tailwind-merge가 bg/text 충돌 해소)
const TONE: Record<string, string> = {
  default: "bg-slate-700 text-white hover:bg-slate-800",
  primary: "bg-teal-600 text-white hover:bg-teal-700",
  indigo: "bg-indigo-600 text-white hover:bg-indigo-700",
  rose: "bg-rose-600 text-white hover:bg-rose-700",
  amber: "bg-amber-500 text-white hover:bg-amber-600",
};
type Tone = keyof typeof TONE | "ghost";
function ActionBtn({
  tone = "default", className, ...props
}: React.ComponentProps<typeof Button> & { tone?: Tone }) {
  if (tone === "ghost")
    return <Button size="sm" variant="outline" className={className} {...props} />;
  return <Button size="sm" className={cn(TONE[tone], className)} {...props} />;
}

// ───────── 표시 헬퍼 (모듈 스코프 = 안정, 입력 포커스 유지) ─────────
function fmtCell(v: unknown, kind: string): string {
  if (v === null || v === undefined || v === "") return "";
  if (kind === "datetime") return fmtKstDayTime(v);            // 투입/이관·출고시간: KST '일 HH:MM'
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

// 셀 폭에 맞춰 줄바꿈 없이 글자를 자동 축소 (autoFit 칸: 투입부서·이전파트·이관파트).
//  natural(내용 폭) > avail(셀 폭)이면 transform:scale 로 가로 비율만큼 축소(최소 0.55배).
//  scrollWidth/clientWidth 는 transform 영향을 안 받아 측정이 안정적 → 재귀 리사이즈 없음.
function AutoFitText({ text, align }: { text: string; align: "left" | "center" }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const spanRef = useRef<HTMLSpanElement>(null);
  const [scale, setScale] = useState(1);
  // 하한 배율(0.55)로도 안 들어가는 초과분 — 중앙 정렬을 유지하면 앞부분이 왼쪽 바깥으로
  // 잘려 나가 텍스트가 안 보이므로, 이때는 왼쪽 기준으로 전환해 앞부분부터 보여준다(뒷부분만 클립)
  const [overflowed, setOverflowed] = useState(false);
  useEffect(() => {
    const wrap = wrapRef.current, span = spanRef.current;
    if (!wrap || !span) return;
    const fit = () => {
      const avail = wrap.clientWidth, natural = span.scrollWidth;
      // avail>0 일 때만 축소(레이아웃 전 0폭 측정으로 인한 깜빡임 방지)
      const s = avail > 0 && natural > avail ? Math.max(0.55, avail / natural) : 1;
      setScale(s);
      setOverflowed(avail > 0 && natural * s > avail + 1);
    };
    fit();
    const ro = new ResizeObserver(fit);
    ro.observe(wrap);
    return () => ro.disconnect();
  }, [text]);
  const centered = align === "center" && !overflowed;
  return (
    <div ref={wrapRef} className={`overflow-hidden ${centered ? "text-center" : "text-left"}`}>
      <span ref={spanRef} className="inline-block whitespace-nowrap align-middle"
        style={{ transformOrigin: centered ? "center" : "left center", transform: `scale(${scale})` }}>
        {text}
      </span>
    </div>
  );
}

// 목표 중량에 가장 근사한 조합(2개 이상) 찾기 — 작업중 weight(중량) 기준
//  · required: 반드시 포함되는 항목(사용자가 체크한 미완료 행) — 그 항목들을 포함한 조합만 반환
//  · pool: 보완용 후보(나머지 미잠금 행). pool 부분합이 (target−required합)에 근사하도록 탐색
//  분기한정 DFS(오름차순 정렬 + 초과 가지치기 + 노드/크기 상한)로 상위 N개 반환
type Combo = { ids: string[]; sum: number; diff: number };
function findCombos(
  pool: { id: string; w: number }[],
  target: number,
  topN = 5,
  required: { id: string; w: number }[] = [],
  maxSize = 10,
): Combo[] {
  const reqIds = required.map((r) => r.id);
  const reqSum = required.reduce((a, r) => a + r.w, 0);
  const reqCount = required.length;
  const poolTarget = target - reqSum; // pool 부분합이 근사할 목표
  const arr = pool.filter((it) => it.w > 0).sort((a, b) => a.w - b.w);
  const n = arr.length;
  const cap = Math.max(0, maxSize - reqCount); // pool에서 추가로 고를 수 있는 최대 개수
  const best: Combo[] = [];
  let worst = Infinity;
  let nodes = 0;
  const CAP = 1_500_000;
  const cur: number[] = [];

  const consider = (poolSum: number) => {
    if (reqCount + cur.length < 2) return; // 전체 조합은 2개 이상
    const full = reqSum + poolSum;
    const diff = Math.abs(full - target);
    if (best.length < topN || diff < worst) {
      best.push({ ids: [...reqIds, ...cur.map((i) => arr[i].id)], sum: round2(full), diff: round2(diff) });
      best.sort((a, b) => a.diff - b.diff || a.ids.length - b.ids.length);
      if (best.length > topN) best.pop();
      worst = best[best.length - 1].diff;
    }
  };
  const dfs = (i: number, sum: number) => {
    if (nodes++ > CAP || i >= n) return;
    if (cur.length < cap) {
      const ns = sum + arr[i].w;
      cur.push(i);
      consider(ns);
      // 초과 가지치기: 이미 poolTarget+worst 초과면 더 더해도 악화 → 포함 분기 중단
      if (!(ns - poolTarget > worst && ns >= poolTarget)) dfs(i + 1, ns);
      cur.pop();
    }
    dfs(i + 1, sum); // 미포함
  };
  consider(0); // required만으로 이미 2개 이상이면 그 자체도 후보
  dfs(0, 0);
  return best.sort((a, b) => a.diff - b.diff || a.ids.length - b.ids.length);
}
const CIRCLED = ["①", "②", "③", "④", "⑤", "⑥", "⑦", "⑧", "⑨", "⑩"];
const COMBO_INIT = 7; // 처음 보여줄 조합 수
const COMBO_STEP = 5; // 더보기 1회당 추가
const COMBO_MAX = 30; // findCombos가 계산할 최대 조합 수(= 더보기 상한)

// ───────── 한 블록 테이블 카드 (표시 전용 — 수정은 모달에서만) ─────────
function LotTable({
  title, accent, columns, rows, selected, onToggle, onToggleAll, onTrace, headTop,
}: {
  title: string;
  accent: string;
  columns: ColDef[];
  rows: Lot[];
  selected: Set<string>;
  onToggle: (id: string, on: boolean) => void;
  onToggleAll: (on: boolean) => void;
  onTrace: (id: string) => void;   // 일련번호 클릭 → 계보 추적
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
                <Checkbox checked={allSel} onCheckedChange={(v) => onToggleAll(v === true)} />
              </th>
              {columns.map((c, i) => {
                // Tag수정/중량/로스 + 시간(투입시간·이관/출고시간) 헤더는 폭이 좁아 줄바꿈 → 글자만 축소·한 줄 고정
                const tight = c.key === "tag_fixed" || c.key === "tag_weight" || c.key === "tag_loss"
                  || c.kind === "datetime";
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
                className="px-3 py-8 text-center text-slate-300 dark:text-neutral-600">
                <Inbox aria-hidden className="mx-auto mb-1 size-4 opacity-60" />데이터 없음
              </td></tr>
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
                      <Checkbox checked={checked}
                        onCheckedChange={(v) => onToggle(r.id, v === true)} />
                    </td>
                    {columns.map((c, i) => {
                      const numeric = isNumKind(c.kind) || !!c.computed;
                      // 수량만 중앙 정렬(숫자라 tabular-nums 유지).
                      // 내역·비고는 중앙 정렬 시 긴 텍스트 앞부분이 잘려 보여 왼쪽 정렬로 변경(요청).
                      const centered = c.key === "qty";
                      const align = centered
                        ? `text-center${c.key === "qty" ? " tabular-nums" : ""}`
                        : numeric ? "text-right tabular-nums"
                          : c.key === "due_date" ? "text-center" : "";
                      if (c.computed)
                        return (
                          <td key={i} className={`break-words px-1.5 py-1 ${align} ${
                            c.bold ? "font-bold" : "text-slate-500 dark:text-neutral-400"}`}>
                            {computedValue(c, r)}
                          </td>
                        );
                      const isSerial = c.key === "serial";
                      const locked = isSerial && r.locked;
                      // 일련번호는 줄바꿈 없이 길면 …처리(호버 title로 전체 표시), 나머지는 줄바꿈 허용
                      const cellCls = isSerial ? "truncate" : "break-words";
                      // 일련번호 셀: 클릭=계보 추적(행 체크박스 토글과 분리 → 전파 중단)
                      if (isSerial)
                        return (
                          <td key={i} className={`${cellCls} px-1.5 py-1 ${align}`}
                            onClick={(e) => e.stopPropagation()}>
                            <Tooltip delayDuration={300}>
                              <TooltipTrigger asChild>
                                <button type="button" onClick={() => onTrace(r.id)}
                                  className="group/serial -mx-1 inline-flex max-w-full items-center gap-1 rounded-md px-1 py-0.5 transition-colors hover:bg-slate-200/60 dark:hover:bg-neutral-700/60">
                                  {locked && <Lock aria-hidden className="size-3 shrink-0 text-slate-400" />}
                                  <span className="min-w-0 truncate font-medium tabular-nums text-slate-700 transition-colors group-hover/serial:text-blue-600 dark:text-neutral-200 dark:group-hover/serial:text-blue-400">
                                    {fmtCell(r[c.key], c.kind) || "(번호없음)"}
                                  </span>
                                  {/* 계보(분기) 아이콘 — 평소엔 옅게, 호버 시 블루로 강조 */}
                                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={2}
                                    strokeLinecap="round" strokeLinejoin="round" aria-hidden
                                    className="h-3 w-3 shrink-0 text-slate-300 transition-colors group-hover/serial:text-blue-500 dark:text-neutral-600 dark:group-hover/serial:text-blue-400">
                                    <line x1="6" x2="6" y1="3" y2="15" />
                                    <circle cx="18" cy="6" r="3" />
                                    <circle cx="6" cy="18" r="3" />
                                    <path d="M18 9a9 9 0 0 1-9 9" />
                                  </svg>
                                </button>
                              </TooltipTrigger>
                              <TooltipContent>계보 추적{r.serial ? ` · ${r.serial}` : ""}</TooltipContent>
                            </Tooltip>
                          </td>
                        );
                      // autoFit 칸: 줄바꿈 없이 셀 폭에 맞춰 글자 자동 축소
                      if (c.autoFit) {
                        const text = fmtCell(r[c.key], c.kind);
                        return (
                          <td key={i} className={`px-1.5 py-1 ${align}`} title={text}>
                            <AutoFitText text={text} align={centered ? "center" : "left"} />
                          </td>
                        );
                      }
                      return (
                        <td key={i} className={`${cellCls} px-1.5 py-1 ${align} ${c.bold ? "font-bold" : ""}`} title={fmtCell(r[c.key], c.kind)}>
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
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-[1100px]" onKeyDown={focusNextInput}>
        <DialogHeader>
          <DialogTitle className="flex items-center gap-1.5">
            <Pencil aria-hidden className="size-4 text-slate-400" />행 수정
            <span className="font-normal text-slate-400">· {row.serial ?? "(번호없음)"}</span>
          </DialogTitle>
          <DialogDescription className="sr-only">선택한 행의 값을 수정합니다.</DialogDescription>
        </DialogHeader>
        {/* 칸 폭을 원본 표 열폭(c.width)에 맞추고 한 줄로 흐르게 배치 — 표와 동일한 감각 */}
        <div className="flex flex-wrap items-end gap-x-2 gap-y-2">
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
          <div className="mt-1 flex flex-wrap gap-2 border-t border-slate-100 pt-3 dark:border-neutral-800">
            {computedCols.map((c, i) => (
              <div key={i} className="rounded-lg bg-slate-50 px-3 py-1.5 text-sm dark:bg-neutral-800">
                <span className="text-[11px] text-slate-400">{c.label}</span>{" "}
                <b className="tabular-nums">{computedValue(c, eff as unknown as Lot) || "—"}</b>
              </div>
            ))}
          </div>
        )}
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>취소</Button>
          <Button onClick={save} disabled={pending} className="bg-blue-600 text-white hover:bg-blue-700">
            {pending && <Loader2 className="animate-spin" />}저장
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ───────── 나누기 모달 — 앞 행만 입력, 마지막 '잔량' 행은 자동(원본 − 입력합) ─────────
//  · 행 추가로 N개 분할(2,3,4…). 마지막 행은 항상 잔량으로 자동 채워져 합이 원본과 정확히 일치.
function SplitModal({
  row, onConfirm, onClose, pending,
}: {
  row: Lot;
  onConfirm: (parts: { qty: number | null; weight: number | null }[]) => void;
  onClose: () => void; pending: boolean;
}) {
  const origQty = row.qty, origWeight = row.weight;
  // 편집행(앞부분만). 마지막 잔량 행은 자동 계산이라 state에 없음 → 최소 1개 편집행(+잔량=총 2개).
  const [parts, setParts] = useState<{ qty: string; weight: string }[]>(() => [{ qty: "", weight: "" }]);
  const set = (i: number, k: "qty" | "weight", v: string) =>
    setParts((p) => p.map((r, j) => (j === i ? { ...r, [k]: v } : r)));
  const add = () => setParts((p) => [...p, { qty: "", weight: "" }]);
  const del = (i: number) => setParts((p) => (p.length > 1 ? p.filter((_, j) => j !== i) : p));

  const sumQ = parts.reduce((a, p) => a + (Number(p.qty) || 0), 0);
  const sumW = round2(parts.reduce((a, p) => a + (Number(p.weight) || 0), 0));
  // 잔량(마지막 행) = 원본 − 편집행 합
  const remQ = origQty == null ? null : Number(origQty) - sumQ;
  const remW = origWeight == null ? null : round2(Number(origWeight) - sumW);
  const remOK = (remQ == null || remQ >= 0) && (remW == null || remW >= 0); // 입력합이 원본 초과 X
  // 잔량 행이 비면 안 됨(중량 기준, 없으면 수량 기준) — 마지막 행에 남길 값이 있어야 진짜 분할
  const remNonEmpty = origWeight != null ? remW != null && remW > 0
    : origQty != null ? remQ != null && remQ > 0 : true;
  const canSave = !pending && remOK && remNonEmpty;
  const totalParts = parts.length + 1;

  const save = () =>
    onConfirm([
      ...parts.map((p) => ({
        qty: p.qty === "" ? null : Number(p.qty),
        weight: p.weight === "" ? null : Number(p.weight),
      })),
      { qty: remQ, weight: remW }, // 마지막 = 잔량 자동
    ]);
  const inp = "w-full rounded-md border border-slate-200 px-2 py-1.5 text-sm dark:border-neutral-700 dark:bg-neutral-900";
  const autoBox = "w-full rounded-md border border-amber-200 bg-amber-50 px-2 py-1.5 text-right text-sm tabular-nums text-amber-800 dark:border-amber-800/60 dark:bg-amber-950/30 dark:text-amber-300";

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-xl" onKeyDown={focusNextInput}>
        <DialogHeader>
          <DialogTitle>나누기</DialogTitle>
          <DialogDescription className="sr-only">앞 행만 입력하면 마지막 행은 잔량으로 자동 채워집니다. 행 추가로 갯수를 늘립니다.</DialogDescription>
        </DialogHeader>
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
        {/* 편집 분할행 + 마지막 잔량(자동) */}
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
              <button onClick={() => del(i)} disabled={parts.length <= 1}
                className="pb-2 text-slate-300 hover:text-rose-500 disabled:opacity-30">✕</button>
            </div>
          ))}
          {/* 잔량 행 (자동, 수정 불가) */}
          <div className="flex items-end gap-2">
            <span className="w-6 pb-2 text-center text-sm text-amber-500">{parts.length + 1}</span>
            <label className="flex-1">
              <span className="text-[11px] text-amber-600 dark:text-amber-400">수량 (잔량)</span>
              <div className={autoBox}>{remQ == null ? "—" : fmtInt(remQ)}</div>
            </label>
            <label className="flex-1">
              <span className="text-[11px] text-amber-600 dark:text-amber-400">중량 (잔량)</span>
              <div className={autoBox}>{remW == null ? "—" : fmtWeight(remW)}</div>
            </label>
            <span className="w-4 pb-2 text-center text-[10px] text-amber-500">자동</span>
          </div>
        </div>
        <button onClick={add} className="mt-2 text-xs text-slate-500 hover:underline">+ 행 추가</button>
        {/* 검증 안내 */}
        <div className={`mt-3 rounded-lg p-2 text-sm ${
          canSave ? "bg-emerald-50 text-emerald-700 dark:bg-emerald-950/40"
            : "bg-rose-50 text-rose-700 dark:bg-rose-950/40"}`}>
          {!remOK
            ? "입력한 행의 합이 원본을 초과했습니다 — 잔량이 음수입니다."
            : !remNonEmpty
              ? "잔량이 0입니다 — 마지막 행에 남길 값이 있어야 합니다(행을 줄이거나 입력값을 낮추세요)."
              : `${totalParts}개로 나눔 · 마지막 행에 잔량(중량 ${remW == null ? "—" : fmtWeight(remW)}) 자동 배정`}
        </div>
        <DialogFooter className="mt-4">
          <Button variant="outline" onClick={onClose}>취소</Button>
          <Button onClick={save} disabled={!canSave} className="bg-amber-500 text-white hover:bg-amber-600">
            {pending && <Loader2 className="animate-spin" />}나누기 저장 ({totalParts}개)
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="sm:max-w-md" onKeyDown={focusNextInput}>
        <DialogHeader>
          <DialogTitle>작업완료(집계)</DialogTitle>
          <DialogDescription className="sr-only">
            선택한 작업중 행을 집계하고 작업후 중량을 입력해 로스를 계산합니다.
          </DialogDescription>
        </DialogHeader>
        <div className="rounded-xl bg-slate-50 p-3 text-sm dark:bg-neutral-800">
          <div className="flex justify-between"><span className="text-slate-400">집계 건수</span><b>{rows.length}건</b></div>
          <div className="mt-1 flex justify-between"><span className="text-slate-400">작업전(중량 합)</span><b className="tabular-nums">{fmtWeight(before)}</b></div>
        </div>
        <label className="block">
          <span className="text-[11px] text-slate-400">작업후 중량</span>
          <NumberInput value={after} kind="weight" onChange={setAfter} className={inp} />
        </label>
        <div className="grid grid-cols-2 gap-2 text-sm">
          <div className="rounded-lg bg-slate-50 p-2 dark:bg-neutral-800">
            로스 <b className="tabular-nums">{loss == null ? "—" : fmtWeight(loss)}</b>
          </div>
          <div className="rounded-lg bg-slate-50 p-2 dark:bg-neutral-800">
            로스율 <b className="tabular-nums">{lossRate == null ? "—" : lossRate.toFixed(1) + "%"}</b>
          </div>
        </div>
        <p className="text-[11px] text-slate-400">※ 작업후 중량을 비워두면 나중에 ‘수정’ 버튼으로 입력할 수 있습니다.</p>
        <DialogFooter>
          <Button variant="outline" onClick={onClose}>취소</Button>
          <Button onClick={() => onConfirm(a)} disabled={pending}
            className="bg-teal-600 text-white hover:bg-teal-700">
            {pending && <Loader2 className="animate-spin" />}집계 완료
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
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
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl" onKeyDown={focusNextInput}>
        <DialogHeader>
          <DialogTitle>Tag 보정 <span className="text-sm font-normal text-slate-400">· 잔여 Tag 수량 입력</span></DialogTitle>
          <DialogDescription className="sr-only">출고행별 잔여 Tag 수량을 입력해 Tag중량·Tag로스·출고중량을 보정합니다.</DialogDescription>
        </DialogHeader>
        <table className="w-full text-sm">
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
                    <NumberInput value={raw ?? ""} kind="int" onChange={(v) => set(r.id, v)} className={inp} />
                  </td>
                  <td className="px-2 py-1 text-right tabular-nums">{tw == null ? "—" : fmtWeight(tw)}</td>
                  <td className="px-2 py-1 text-right tabular-nums">{tl == null ? "—" : fmtWeight(tl)}</td>
                  <td className="px-2 py-1 text-right font-medium tabular-nums">{ship == null ? "—" : fmtWeight(ship)}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
        <DialogFooter className="mt-4 sm:items-center">
          <span className="mr-auto text-xs text-slate-400">{items.length}/{rows.length}건 입력됨</span>
          <Button variant="outline" onClick={onClose}>취소</Button>
          <Button onClick={() => onConfirm(items)} disabled={pending || items.length === 0}
            className="bg-indigo-600 text-white hover:bg-indigo-700">
            {pending && <Loader2 className="animate-spin" />}보정 적용
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

// ───────── 계보 추적 모달 (일련번호 클릭) — 관계도(트리) 표현 ─────────
//  기준 행을 맨 위에 두고 '어디서 왔나(이전)' / '어디로 갔나(이후)'를 들여쓰기 가지로 표시.
//  · 집계는 출처 여러 개가 같은 깊이의 가지로 나란히 → 따로 오다 합쳐지는 모양이 드러남.
//  · 함께 나눠진 형제 조각은 기준 경로에 직접 나오지 않음 — '나누기 전 원본' 카드를 클릭해
//    그 행 기준으로 갈아타면(타고 들어가면) 이후 경로에서 조각 전체가 보임.
// 노드 시각은 KST 고정(+9h) — 기기 시간대 설정과 무관하게 표의 '일 HH:MM'(KST)과 일치.
function fmtStamp(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return "";
  const k = new Date(d.getTime() + 9 * 3600 * 1000); // UTC → KST
  const p = (n: number) => String(n).padStart(2, "0");
  return `${k.getUTCMonth() + 1}/${k.getUTCDate()} ${p(k.getUTCHours())}:${p(k.getUTCMinutes())}`;
}

// 분할 가상원본 합성 — 나누기는 원본 행이 첫 조각(-1)으로 갱신되므로 그래프에 '나누기 전' 행이 없음.
//  표시용으로 '나누기 전 원본'(예: 001) 가상 노드를 만들어 원본→모든 조각(-1 포함)을 'split'로 연결.
//  수량/중량은 조각 합(재분할이면 재귀 합산) = 나누기 전 값. -1 일련번호 패턴이 안 맞는
//  데이터(옛 방식·번호 없는 행)는 변형하지 않고 그대로 둠.
const isVirtualId = (id: string) => id.startsWith("virtual-");
function synthesizeSplitOriginals(g: TraceResult): { nodes: TraceNode[]; edges: TraceEdge[] } {
  const byId = new Map(g.nodes.map((n) => [n.id, n] as const));
  const outSplit = new Map<string, TraceEdge[]>();
  for (const e of g.edges) {
    if (e.relation !== "split") continue;
    const a = outSplit.get(e.from) ?? []; a.push(e); outSplit.set(e.from, a);
  }
  const nodes = [...g.nodes];
  let edges = [...g.edges];
  for (const v of g.nodes) {
    const splits = outSplit.get(v.id) ?? [];
    if (splits.length === 0 || !v.serial || !v.serial.endsWith("-1")) continue;
    const prefix = v.serial.replace(/-1$/, "");
    const kids = splits.map((e) => byId.get(e.to));
    if (!kids.every((k) => k?.serial?.startsWith(prefix + "-"))) continue;
    const vid = `virtual-${v.id}`;
    nodes.push({ ...v, id: vid, serial: prefix, locked: false });
    // 원본으로 들어오던 상류 → 가상 원본으로, 조각으로 나가던 split → 가상 원본에서 출발로 재배선
    edges = edges.map((e) =>
      e.to === v.id ? { ...e, to: vid }
        : e.from === v.id && e.relation === "split" ? { ...e, from: vid }
          : e);
    edges.push({ from: vid, to: v.id, relation: "split" }); // 가상 원본 → 첫 조각(-1)
  }
  // 가상 원본의 수량/중량 = 조각 합(조각이 또 가상 원본이면 재귀) — 나누기 전 값 복원
  const kidsOf = new Map<string, string[]>();
  for (const e of edges) {
    if (e.relation !== "split" || !isVirtualId(e.from)) continue;
    const a = kidsOf.get(e.from) ?? []; a.push(e.to); kidsOf.set(e.from, a);
  }
  const all = new Map(nodes.map((n) => [n.id, n] as const));
  const sumOf = (id: string, key: "qty" | "weight"): number | null => {
    const n = all.get(id);
    if (!n) return null;
    if (!isVirtualId(id)) return n[key];
    const vals = (kidsOf.get(id) ?? []).map((k) => sumOf(k, key)).filter((x): x is number => x != null);
    return vals.length ? round2(vals.reduce((a, b) => a + b, 0)) : null;
  };
  for (const n of nodes) {
    if (!isVirtualId(n.id)) continue;
    n.qty = sumOf(n.id, "qty");
    n.weight = sumOf(n.id, "weight");
  }
  return { nodes, edges };
}

function TraceNodeCard({ n, isRoot, onClick }: { n: TraceNode; isRoot?: boolean; onClick?: () => void }) {
  const is14 = n.karat === "14K";
  return (
    <div
      role={onClick ? "button" : undefined}
      tabIndex={onClick ? 0 : undefined}
      onClick={onClick}
      onKeyDown={onClick ? (e) => { if (e.key === "Enter" || e.key === " ") { e.preventDefault(); onClick(); } } : undefined}
      title={onClick ? "클릭하면 이 행을 기준으로 다시 추적합니다" : undefined}
      className={`rounded-xl border p-2.5 ${
        isRoot
          ? "border-blue-400 bg-blue-50/70 ring-1 ring-blue-300 dark:border-blue-700 dark:bg-blue-950/40"
          : "border-slate-200 bg-white dark:border-neutral-800 dark:bg-neutral-900"
      } ${onClick ? "cursor-pointer transition-colors hover:border-blue-400 hover:bg-blue-50/50 dark:hover:border-blue-600 dark:hover:bg-blue-950/30" : ""}`}
    >
      <div className="flex items-center gap-2">
        <span className={`text-sm font-semibold ${is14 ? "text-blue-600 dark:text-blue-400" : ""}`}>
          {n.process_name}
        </span>
        <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500 dark:bg-neutral-800 dark:text-neutral-400">
          {stageLabel(n.schema_type, n.side)}
        </span>
        {n.locked && <Lock aria-hidden className="size-3 shrink-0 text-slate-400" />}
        {isVirtualId(n.id) && (
          <span className="rounded-full bg-amber-100 px-2 py-0.5 text-[10px] font-medium text-amber-700 dark:bg-amber-950/50 dark:text-amber-300">나누기 전 원본</span>
        )}
        {isRoot && <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-medium text-white">기준 행</span>}
        <span className="ml-auto text-[10px] tabular-nums text-slate-400">{fmtStamp(n.moved_at ?? n.created_at)}</span>
      </div>
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs">
        <span className="font-medium tabular-nums">{n.serial ?? "(번호없음)"}</span>
        {n.description && <span className="text-slate-500 dark:text-neutral-400">{n.description}</span>}
        <span className="text-slate-400">수량 <b className="text-slate-600 tabular-nums dark:text-neutral-200">{fmtInt(n.qty) || "-"}</b></span>
        <span className="text-slate-400">중량 <b className="text-slate-600 tabular-nums dark:text-neutral-200">{fmtWeight(n.weight) || "-"}</b></span>
      </div>
    </div>
  );
}

// 한 방향(up=이전/down=이후)의 인접 행들을 재귀로 그리는 가지 — 들여쓰기+세로선이 관계도 역할.
//  같은 깊이의 형제 가지 = 집계의 출처들/분할의 조각들이 나란히 보이는 부분.
function TraceTree({ id, dir, byId, edgesOf, onGoto, seen }: {
  id: string;
  dir: "up" | "down";
  byId: Map<string, TraceNode>;
  edgesOf: Map<string, TraceEdge[]>; // up=들어오는(부모) / down=나가는(자식) edge 맵
  onGoto: (id: string) => void;
  seen: Set<string>; // 현재 경로의 방문 노드 — 순환 방어
}) {
  const items = (edgesOf.get(id) ?? [])
    .map((e) => ({ e, n: byId.get(dir === "up" ? e.from : e.to) }))
    .filter((x): x is { e: TraceEdge; n: TraceNode } => !!x.n && !seen.has(x.n.id))
    // 분할 조각들은 created_at이 같아(원본 승계) 일련번호로 2차 정렬 — X-1, X-2, … 순
    .sort((a, b) => a.n.created_at.localeCompare(b.n.created_at)
      || (a.n.serial ?? "").localeCompare(b.n.serial ?? ""));
  if (items.length === 0) return null;
  return (
    <ul className="ml-3 space-y-1.5 border-l-2 border-slate-200 pl-2.5 pt-1.5 dark:border-neutral-700">
      {items.map(({ e, n }) => (
        <li key={n.id} className="space-y-1">
          <span className="inline-block rounded-full bg-slate-100 px-2 py-0.5 text-[10px] text-slate-500 dark:bg-neutral-800 dark:text-neutral-400">
            {dir === "up" ? "↑" : "↓"} {RELATION_LABEL[e.relation]}
          </span>
          <TraceNodeCard n={n} onClick={() => onGoto(n.id)} />
          <TraceTree id={n.id} dir={dir} byId={byId} edgesOf={edgesOf} onGoto={onGoto} seen={new Set(seen).add(n.id)} />
        </li>
      ))}
    </ul>
  );
}

function GenealogyModal({
  trace, loading, onClose,
}: {
  trace: TraceResult | null; loading: boolean; onClose: () => void;
}) {
  // 기준 행(루트) — 카드 클릭으로 갈아타고(타고 들어가기), 스택으로 '뒤로' 지원.
  //  같은 연결망 안에서는 그래프가 동일하므로 서버 재조회 없이 루트만 바꿈.
  //  초기값은 마운트 시 1회 — 호출부에서 key={trace.rootId}로 결과 도착 시 리마운트됨.
  const [rootId, setRootId] = useState<string | null>(trace?.rootId ?? null);
  const [stack, setStack] = useState<string[]>([]);

  // 가상 '나누기 전 원본' 노드 합성 — 001 → (분할) → 001-1..-n 형태로 표시되게
  const graph = useMemo(
    () => (trace ? synthesizeSplitOriginals(trace) : { nodes: [] as TraceNode[], edges: [] as TraceEdge[] }),
    [trace]);
  const byId = useMemo(
    () => new Map(graph.nodes.map((n) => [n.id, n] as const)), [graph]);
  const parentsOf = useMemo(() => {
    const m = new Map<string, TraceEdge[]>();
    for (const e of graph.edges) { const a = m.get(e.to) ?? []; a.push(e); m.set(e.to, a); }
    return m;
  }, [graph]);
  const childrenOf = useMemo(() => {
    const m = new Map<string, TraceEdge[]>();
    for (const e of graph.edges) { const a = m.get(e.from) ?? []; a.push(e); m.set(e.from, a); }
    return m;
  }, [graph]);

  const root = rootId ? byId.get(rootId) : undefined;
  const goto = (id: string) => {
    if (!rootId || id === rootId) return;
    setStack((s) => [...s, rootId]);
    setRootId(id);
  };
  const back = () => {
    const prev = stack[stack.length - 1];
    if (!prev) return;
    setStack(stack.slice(0, -1));
    setRootId(prev);
  };

  return (
    <Dialog open onOpenChange={(o) => { if (!o) onClose(); }}>
      <DialogContent className="max-h-[88vh] overflow-y-auto sm:max-w-xl">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-1.5">
            <GitBranch aria-hidden className="size-4 text-slate-400" />계보 추적
            {root?.serial && <span className="font-normal text-slate-400">· {root.serial}</span>}
          </DialogTitle>
          <DialogDescription className="sr-only">선택한 일련번호가 거쳐온/거쳐갈 공정 흐름입니다.</DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="space-y-2 py-2">
            <Skeleton className="h-16 w-full rounded-xl" />
            <Skeleton className="mx-4 h-4 w-24 rounded-full" />
            <Skeleton className="h-16 w-full rounded-xl" />
            <Skeleton className="mx-4 h-4 w-24 rounded-full" />
            <Skeleton className="h-16 w-full rounded-xl" />
          </div>
        ) : !trace || !root || trace.nodes.length <= 1 ? (
          <p className="py-10 text-center text-sm text-slate-400">
            연결된 이전·이후 공정 기록이 없습니다.<br />
            <span className="text-xs">(보내기·집계·이동·나누기 시 계보가 기록됩니다.)</span>
          </p>
        ) : (
          <div className="space-y-3">
            {stack.length > 0 && (
              <Button variant="outline" size="sm" className="h-7 w-fit px-2 text-xs" onClick={back}>
                ← 뒤로
              </Button>
            )}
            <TraceNodeCard n={root} isRoot />
            {(parentsOf.get(root.id)?.length ?? 0) > 0 && (
              <div>
                <div className="mb-1 text-[11px] font-medium text-slate-400">⬑ 어디서 왔나 — 이전 경로</div>
                <TraceTree id={root.id} dir="up" byId={byId} edgesOf={parentsOf} onGoto={goto} seen={new Set([root.id])} />
              </div>
            )}
            {(childrenOf.get(root.id)?.length ?? 0) > 0 && (
              <div>
                <div className="mb-1 text-[11px] font-medium text-slate-400">⬐ 어디로 갔나 — 이후 경로</div>
                <TraceTree id={root.id} dir="down" byId={byId} edgesOf={childrenOf} onGoto={goto} seen={new Set([root.id])} />
              </div>
            )}
            <p className="text-[11px] text-slate-400">
              카드를 클릭하면 그 행을 기준으로 다시 추적합니다 — 함께 나눠진 조각은 ‘나누기 전 원본’ 카드를 타고 들어가면 보입니다.
            </p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}

// ───────── 대상 선택 액션 (호버 시 바로 펼침 — 하단탭과 동일 로직·스크림, 터치는 기존 탭 동작 유지) ─────────
// 펼침 상태는 툴바 전체가 useHoverMenu 하나를 공유(한 번에 하나만 열림, label이 key).
function TargetAction({
  label, tone, targets, disabled, onRun, groupOf, menu,
}: {
  label: string; tone: Tone;
  targets: Process[]; disabled: boolean; onRun: (targetId: string) => void;
  groupOf?: (t: Process) => number; // 구분선 그룹 — 번호가 바뀌는 지점에 구분선
  menu: HoverMenu;
}) {
  if (targets.length === 0) return null;
  const sorted = groupOf ? [...targets].sort((a, b) => groupOf(a) - groupOf(b)) : targets;
  return (
    <DropdownMenu modal={false} open={menu.openKey === label} onOpenChange={(o) => menu.setOpenKey(o ? label : null)}>
      <DropdownMenuTrigger asChild>
        <ActionBtn
          tone={tone}
          disabled={disabled}
          onPointerEnter={(e) => { if (e.pointerType !== "touch" && !disabled) menu.open(label); }}
          onPointerLeave={(e) => { if (e.pointerType !== "touch") menu.scheduleClose(); }}
        >{label}<ChevronDown /></ActionBtn>
      </DropdownMenuTrigger>
      <DropdownMenuContent
        align="start"
        className="max-h-[60vh] overflow-y-auto"
        onCloseAutoFocus={(e) => e.preventDefault()}
        onPointerEnter={menu.cancelClose}
        onPointerLeave={(e) => { if (e.pointerType !== "touch") menu.scheduleClose(); }}
      >
        <DropdownMenuLabel>{label} 대상</DropdownMenuLabel>
        {sorted.map((t, i) => (
          <Fragment key={t.id}>
            {groupOf && i > 0 && groupOf(sorted[i - 1]) !== groupOf(t) && <DropdownMenuSeparator />}
            <DropdownMenuItem onSelect={() => onRun(t.id)}>
              {t.name}
            </DropdownMenuItem>
          </Fragment>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
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
  const [editId, setEditId] = useState<string | null>(null);
  const [target, setTarget] = useState("");
  const [combos, setCombos] = useState<Combo[]>([]);
  const [visibleCombos, setVisibleCombos] = useState(COMBO_INIT); // 더보기로 늘어남
  const [comboReq, setComboReq] = useState(0); // 이번 조합에 강제 포함된 체크 건수(표시용)
  const [splitRowId, setSplitRowId] = useState<string | null>(null);
  const [completeOpen, setCompleteOpen] = useState(false);
  const [tagAdjustOpen, setTagAdjustOpen] = useState(false);
  const [trace, setTrace] = useState<TraceResult | null>(null);
  const [traceOpen, setTraceOpen] = useState(false);
  const [traceLoading, setTraceLoading] = useState(false);
  const [pending, start] = useTransition();

  // 툴바 대상 드롭다운(공정투입·타부서출고·공정이관·현장출고·검수출고) 호버 펼침 — 하단탭과 동일 로직
  const menu = useHoverMenu();

  // 확인 모달(AlertDialog) 상태 — 알림은 sonner toast()로 직접 호출
  const [confirmBox, setConfirmBox] = useState<
    { text: React.ReactNode; onYes: () => void; yesLabel?: string; altLabel?: string; onAlt?: () => void } | null
  >(null);

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
    kind === "err" ? toast.error(text) : kind === "ok" ? toast.success(text) : toast.message(text);

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

  // 일련번호 클릭 → 계보 추적 (행 선택과 무관, 모달 즉시 오픈 후 비동기 로드)
  const openTrace = (lotId: string) => {
    setTrace(null);
    setTraceLoading(true);
    setTraceOpen(true);
    (async () => {
      const res = await traceLot(lotId);
      setTraceLoading(false);
      if (res?.error) { setTraceOpen(false); notify("err", res.error); return; }
      setTrace(res as TraceResult);
    })();
  };

  const inIds = [...selIn], outIds = [...selOut];
  const nIn = inIds.length, nOut = outIds.length;
  const selectedLocked = [...inIds, ...outIds].filter((id) => lockedSet.has(id));
  // 잠금행이 하나라도 선택되면 수정·잠금해제·삭제를 뺀 모든 선택 액션 비활성
  //  → 잠금행은 맨 오른쪽 "잠금 해제·삭제"로만 삭제 가능(일반 삭제로 안 지워짐)
  const hasLocked = selectedLocked.length > 0;
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
    // 체크한 작업중(미완료·미잠금) 행은 반드시 포함 — 나머지(pool)에서 목표에 맞게 보완
    const required = items.filter((it) => selIn.has(it.id));
    const pool = items.filter((it) => !selIn.has(it.id));
    const res = findCombos(pool, t, COMBO_MAX, required);
    setCombos(res);
    setVisibleCombos(COMBO_INIT);
    setComboReq(required.length);
    if (res.length === 0)
      notify("info", required.length > 0 ? "선택 항목을 포함하는 조합을 찾지 못했습니다." : "조합을 찾지 못했습니다.");
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
        <ClientLink href="/" className="text-sm text-slate-400 hover:text-slate-600">← 대시보드</ClientLink>
        <h1 className={`text-2xl font-bold tracking-tight ${process.karat === "14K" ? "text-blue-600 dark:text-blue-400" : ""}`}>
          {process.name}
        </h1>
        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs text-slate-500 dark:bg-neutral-800 dark:text-neutral-400">
          {isWork ? "공정" : process.is_inspection ? "검수" : "부서"} · {process.karat ?? "-"}
        </span>
      </div>

      {/* 액션 툴바 — 대상 메뉴가 펼쳐진 동안 스크림(z-25) 위(z-26)로 올려 하단탭처럼 또렷하게 */}
      <div ref={toolbarRef} className={`sticky top-[49px] ${menu.openKey !== null ? "z-[26]" : "z-20"} rounded-xl border border-slate-200 bg-white/90 p-2.5 shadow-sm backdrop-blur print:hidden dark:border-neutral-800 dark:bg-neutral-900/90`}>
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-slate-400">
            선택 {isWork ? "작업중" : "입고"} <b className="text-slate-600 dark:text-neutral-200">{nIn}</b> · {isWork ? "완료" : "출고"} <b className="text-slate-600 dark:text-neutral-200">{nOut}</b>
          </span>
          {pending && (
            <span className="flex items-center gap-1 text-xs text-slate-400">
              <Loader2 className="size-3.5 animate-spin" />처리 중…
            </span>
          )}
          {selWeight > 0 && (
            <span className="rounded-md bg-emerald-50 px-2 py-1 text-xs font-semibold text-emerald-700 dark:bg-emerald-950/40 dark:text-emerald-300">
              선택 중량 합 {fmtWeight(selWeight)}
            </span>
          )}
          {/* 선택 0건 안내 — 버튼들이 왜 비활성인지 한 줄로 */}
          {nIn + nOut === 0 && !pending && (
            <span className="text-[11px] text-slate-300 dark:text-neutral-600">
              행을 체크하면 작업 버튼이 켜집니다
            </span>
          )}

          {/* 왼쪽 표(작업중/입고) 대상 액션 그룹 — 어느 쪽 선택에 적용되는지 박스+라벨로 구분 */}
          <div className="flex flex-wrap items-center gap-1.5 rounded-lg bg-slate-100/80 py-1 pl-2 pr-1 dark:bg-neutral-800/60">
            <span className="text-[10px] font-bold tracking-wide text-slate-400 dark:text-neutral-500">
              {isWork ? "작업중" : "입고"}
            </span>
            {isWork ? (
              <ActionBtn tone="primary" disabled={pending || nIn === 0 || hasLocked}
                onClick={() => setCompleteOpen(true)}>
                작업완료(집계)
              </ActionBtn>
            ) : (
              <>
                <TargetAction label="공정투입" tone="indigo" targets={workTargets} groupOf={workGroupOf} menu={menu} disabled={pending || nIn === 0 || hasLocked}
                  onRun={(t) => run(() => feedToWork(process.id, t, inIds), (r) => `${r.moved}건 공정투입`)} />
                <TargetAction label="타부서출고" tone="default" targets={otherIoTargets} groupOf={ioGroupOf} menu={menu} disabled={pending || nIn === 0 || hasLocked}
                  onRun={(t) => run(() => feedToOtherDept(process.id, t, inIds), (r) => `${r.moved}건 타부서출고`)} />
              </>
            )}
            {/* 나누기 (작업중/입고 단건) — 갯수는 모달 안에서 행 추가로 조절 */}
            <ActionBtn tone="amber" disabled={pending || nIn !== 1 || hasLocked}
              onClick={() => setSplitRowId(inIds[0])}>나누기</ActionBtn>
            {/* 목표중량 조합 찾기 (공정 전용) */}
            {isWork && (
              <div className="flex items-center gap-1 rounded-lg border border-slate-200 bg-white p-1 dark:border-neutral-700 dark:bg-neutral-900">
                <input value={target} inputMode="decimal" placeholder="목표중량"
                  onChange={(e) => {
                    const raw = e.target.value.replace(/,/g, "");
                    if (raw === "" || /^\d*\.?\d{0,2}$/.test(raw)) setTarget(raw);
                  }}
                  onBlur={() => {
                    const n = Number(target.replace(/,/g, ""));
                    if (target !== "" && !isNaN(n)) setTarget(fmtWeight(n));
                  }}
                  className="w-24 rounded-md bg-slate-100 px-2 py-1 text-center text-xs tabular-nums dark:bg-neutral-800" />
                <ActionBtn tone="primary" disabled={pending || hasLocked || nOut > 0}
                  title={hasLocked || nOut > 0 ? "작업중(미완료) 행만 체크한 상태에서 사용할 수 있습니다" : undefined}
                  onClick={runFind}>조합 찾기</ActionBtn>
              </div>
            )}
            <ActionBtn tone="ghost" disabled={pending || nIn === 0 || hasLocked}
              onClick={() => askConfirm(`${isWork ? "작업중" : "입고"} ${nIn}건을 삭제할까요?`,
                () => run(() => deleteLots(process.id, inIds), (r) => `${r.deleted}건 삭제`))}>
              삭제
            </ActionBtn>
          </div>

          {/* 오른쪽 표(완료/출고) 대상 액션 그룹 */}
          <div className="flex flex-wrap items-center gap-1.5 rounded-lg bg-slate-100/80 py-1 pl-2 pr-1 dark:bg-neutral-800/60">
            <span className="text-[10px] font-bold tracking-wide text-slate-400 dark:text-neutral-500">
              {isWork ? "완료" : "출고"}
            </span>
            {isWork ? (
              <>
                <TargetAction label="공정이관" tone="rose" targets={workTargets} groupOf={workGroupOf} menu={menu} disabled={pending || nOut === 0 || hasLocked}
                  onRun={(t) => run(() => relayToWork(process.id, t, outIds), (r) => `${r.moved}건 공정이관`)} />
                <TargetAction label="현장출고" tone="default" targets={ioFieldTargets} menu={menu} disabled={pending || nOut === 0 || hasLocked}
                  onRun={(t) => run(() => shipToIo(process.id, t, outIds), (r) => `${r.moved}건 현장출고`)} />
                <TargetAction label="검수출고" tone="default" targets={ioInspTargets} menu={menu} disabled={pending || nOut === 0 || hasLocked}
                  onRun={(t) => run(() => shipToIo(process.id, t, outIds), (r) => `${r.moved}건 검수출고`)} />
              </>
            ) : (
              <>
                <ActionBtn tone="indigo" disabled={pending || nOut === 0 || hasLocked}
                  onClick={() => setTagAdjustOpen(true)}>
                  Tag 보정
                </ActionBtn>
                {process.is_inspection && (
                  <ActionBtn tone="default" disabled={pending}
                    onClick={() => setConfirmBox({
                      text: (
                        <>
                          <TriangleAlert aria-hidden className="mr-1 inline size-4 align-[-2px] text-amber-500" />
                          Tag 확정은 이 시트만이 아니라 ‘검수 모든 파트’의 현재 작업일 출고행에 일괄 적용됩니다.
                          (실중량이 있고 Tag중량이 빈 행의 Tag중량을 Tag값으로 채움) 실행할까요?
                        </>
                      ),
                      yesLabel: "검수 전체 적용",
                      onYes: () => run(() => tagConfirm(), (r) => `Tag 확정 ${r.filled}건`),
                    })}>
                    Tag 확정
                  </ActionBtn>
                )}
              </>
            )}
            <ActionBtn tone="ghost" disabled={pending || nOut === 0 || hasLocked}
              onClick={() => askConfirm(`${isWork ? "완료" : "출고"} ${nOut}건을 삭제할까요?`,
                () => run(() => deleteLots(process.id, outIds), (r) => `${r.deleted}건 삭제`))}>
              삭제
            </ActionBtn>
          </div>

          {/* 수정 + 잠금행 해제·삭제 (맨 오른쪽) */}
          <div className="ml-auto flex items-center gap-2">
            <ActionBtn tone="default" disabled={pending || nIn + nOut !== 1}
              onClick={() => setEditId(inIds[0] ?? outIds[0])}><Pencil />수정</ActionBtn>
            <ActionBtn tone="rose" disabled={pending || selectedLocked.length === 0}
              onClick={() => setConfirmBox({
                text: `잠긴 ${selectedLocked.length}건을 어떻게 할까요?`,
                altLabel: "잠금 해제",
                onAlt: () => run(() => unlockLots(process.id, selectedLocked), (r) => `${r.unlocked}건 잠금 해제`),
                yesLabel: "삭제",
                onYes: () => run(() => deleteLots(process.id, selectedLocked, true), (r) => `잠금행 ${r.deleted}건 삭제`),
              })}>
              <LockOpen />잠금 해제·삭제
            </ActionBtn>
          </div>
        </div>

        {/* 조합 찾기 결과 (공정 전용) */}
        {isWork && combos.length > 0 && (
          <div className="mt-2 flex flex-wrap items-center gap-2 border-t border-slate-100 pt-2 dark:border-neutral-800">
            <span className="text-xs text-slate-400">
              목표 {fmtWeight(target.replace(/,/g, ""))} 근사 조합
              {comboReq > 0 && <span className="text-teal-600 dark:text-teal-400"> · 선택 {comboReq}건 포함</span>}
            </span>
            {combos.slice(0, visibleCombos).map((c, i) => (
              <button key={i} onClick={() => pickCombo(c)}
                className="rounded-lg border border-teal-300 bg-teal-50 px-2.5 py-1 text-xs text-teal-800 hover:bg-teal-100 dark:border-teal-800 dark:bg-teal-950/40 dark:text-teal-200">
                <b>{CIRCLED[i] ?? `${i + 1}`}</b> {fmtWeight(c.sum)}
                <span className="text-slate-400"> ({c.ids.length}건{c.diff > 0 ? `, 오차 ${fmtWeight(c.diff)}` : ", 정확"})</span>
              </button>
            ))}
            <button onClick={() => setVisibleCombos((v) => Math.min(v + COMBO_STEP, combos.length))}
              disabled={visibleCombos >= combos.length}
              className="rounded-lg border border-teal-300 px-2 py-1 text-xs text-teal-700 hover:bg-teal-50 disabled:cursor-not-allowed disabled:opacity-40 dark:border-teal-800 dark:text-teal-300 dark:hover:bg-teal-950/40">
              더보기
            </button>
            <button onClick={() => { setCombos([]); setComboReq(0); }}
              className="rounded-lg border border-slate-300 px-2 py-1 text-xs text-slate-500 dark:border-neutral-700">지우기</button>
          </div>
        )}
        {/* 대상 메뉴가 펼쳐진 동안 본문 어둡게+흐리게 — 하단탭·우클릭 메뉴와 동일 효과 */}
        <MenuScrim show={menu.openKey !== null} />
      </div>

      {/* 수정 패널 */}
      {editRow && (
        <EditPanel key={editRow.id} row={editRow}
          columns={editRow.side === "in" ? cols.in : cols.out}
          pending={pending} onSave={saveEdit} onClose={() => setEditId(null)} />
      )}

      {/* 나누기 모달 */}
      {splitRow && (
        <SplitModal key={splitRow.id} row={splitRow} pending={pending}
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
          onToggle={toggle("in")} onToggleAll={toggleAll("in", inRows)} onTrace={openTrace} />
        <LotTable title={isWork ? "완료" : "출고"} accent="bg-rose-500"
          columns={cols.out} rows={outRows} selected={selOut} headTop={headTop}
          onToggle={toggle("out")} onToggleAll={toggleAll("out", outRows)} onTrace={openTrace} />
      </div>

      <div className="space-y-1 rounded-lg border border-slate-100 bg-slate-50/50 p-3 text-[11px] leading-relaxed text-slate-500 print:hidden dark:border-neutral-800 dark:bg-neutral-900/40 dark:text-neutral-400">
        <p>· 행을 누르면 <b>선택(체크)</b>, <b className="text-blue-500">일련번호</b>를 누르면 그 품목이 <b>거쳐온 공정 이력</b>을 볼 수 있습니다.</p>
        <p>· 왼쪽·오른쪽 표는 <b>동시에 선택할 수 없습니다</b> (처리 방식이 다릅니다).</p>
        <p>· 일련번호는 공정을 옮겨도 <b>그대로 유지</b>됩니다 (작업완료·나누기 때만 형태가 바뀝니다).</p>
        <p>· 처리가 끝난 행은 <Lock aria-hidden className="inline size-3 align-[-1px]" /> 로 <b>잠깁니다</b> — 맨 오른쪽 ‘잠금 해제·삭제’로만 풀거나 지울 수 있습니다.</p>
        <p>· 표는 보기 전용입니다 — 값 수정은 ‘수정’·‘Tag 보정’ 버튼으로 뜨는 입력 창에서만 합니다.</p>
        <p>· 작업후 중량은 작업완료(집계) 창에서 입력, 실중량은 이전 공정에서 넘어오고, Tag중량·로스·출고중량은 <b>자동 계산</b>됩니다.</p>
      </div>

      {/* 계보 추적 모달 (일련번호 클릭) — key: 추적 결과가 도착하면 리마운트되어 기준 행 초기화 */}
      {traceOpen && (
        <GenealogyModal key={trace?.rootId ?? "loading"} trace={trace} loading={traceLoading} onClose={() => setTraceOpen(false)} />
      )}

      {/* 확인 모달 (AlertDialog) */}
      <AlertDialog open={!!confirmBox} onOpenChange={(o) => { if (!o) setConfirmBox(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>확인</AlertDialogTitle>
            <AlertDialogDescription>{confirmBox?.text}</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            {confirmBox?.onAlt && (
              <Button
                className="bg-indigo-600 text-white hover:bg-indigo-700 sm:mr-auto"
                onClick={() => { const f = confirmBox.onAlt!; setConfirmBox(null); f(); }}
              >
                {confirmBox.altLabel ?? "잠금 해제"}
              </Button>
            )}
            <AlertDialogCancel>취소</AlertDialogCancel>
            <AlertDialogAction
              className="bg-rose-600 text-white hover:bg-rose-700"
              onClick={() => { const f = confirmBox?.onYes; f?.(); }}
            >
              {confirmBox?.yesLabel ?? "확인"}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
