"use client";

import { useEffect, useMemo, useState, useTransition } from "react";
import { NumberInput } from "@/components/NumberInput";
import { fmtWeight } from "@/lib/types";
import { derive, CARRY, PRESERVE, type CellMap } from "@/lib/settlement";
import { saveSettlement, carrySettlement, moveSettlement } from "./settlementActions";

const fmtD = (s?: string | null) => (s ? s.replaceAll("-", "/") : "");
const nextDay = (d: string) => {
  const x = new Date(d + "T00:00:00Z");
  x.setUTCDate(x.getUTCDate() + 1);
  return x.toISOString().slice(0, 10);
};

const COL = "ABCDEFGHIJKLM";
const cols = (start: string, n: number) =>
  Array.from({ length: n }, (_, i) => COL[COL.indexOf(start) + i]);

const carriedSet = new Set(CARRY.map(([to]) => to));
const preserveSet = new Set(PRESERVE);

type Cell = { label: string } | { in: string } | { calc: string } | { blank: true };

const dateInputCls =
  "rounded-md border border-slate-300 bg-white px-2 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-900";

export function SettlementView({ workDate, initial }: { workDate: string; initial: CellMap }) {
  const toStr = (d: CellMap): Record<string, string> => {
    const o: Record<string, string> = {};
    for (const [k, v] of Object.entries(d)) o[k] = v == null ? "" : String(v);
    return o;
  };
  const [vals, setVals] = useState<Record<string, string>>(() => toStr(initial));
  const [src, setSrc] = useState(workDate);
  const [carry, setCarry] = useState(nextDay(workDate));
  const [from, setFrom] = useState(workDate);
  const [to, setTo] = useState(nextDay(workDate));
  const [msg, setMsg] = useState<string | null>(null);
  const [confirmBox, setConfirmBox] = useState<
    { title: string; lines: string[]; yesLabel: string; onYes: () => void } | null
  >(null);
  const [pending, start] = useTransition();

  useEffect(() => {
    setVals(toStr(initial));
    setSrc(workDate); setCarry(nextDay(workDate));
    setFrom(workDate); setTo(nextDay(workDate));
  }, [initial, workDate]);

  const set = (a: string, v: string) => setVals((p) => ({ ...p, [a]: v }));
  const numMap = useMemo(() => {
    const o: CellMap = {};
    for (const [k, v] of Object.entries(vals)) o[k] = v === "" ? null : Number(v);
    return o;
  }, [vals]);
  const f = useMemo(() => derive(numMap), [numMap]);
  const fmtCalc = (v: number | undefined) => (v ? fmtWeight(v) : "");

  // ───────── 셀 렌더(컴포넌트 아님 — 포커스 유지) ─────────
  const inCell = (a: string) => {
    const tint = preserveSet.has(a)
      ? "bg-amber-50 dark:bg-amber-900/15"
      : carriedSet.has(a)
        ? "bg-sky-50 dark:bg-sky-900/15"
        : "";
    return (
      <NumberInput value={vals[a] ?? ""} kind="weight" align="right"
        onChange={(v) => set(a, v)}
        className={`w-full bg-transparent px-1 py-0.5 outline-none focus:bg-blue-100 dark:focus:bg-blue-950/40 ${tint}`} />
    );
  };
  const calcCell = (a: string) => (
    <span className="block bg-slate-50 px-1 py-0.5 text-right font-medium tabular-nums text-slate-700 dark:bg-neutral-800/60 dark:text-neutral-200">
      {fmtCalc(f[a])}
    </span>
  );
  const renderCell = (c: Cell) => {
    if ("label" in c) return <span className="block px-1 py-0.5 text-center text-slate-500 dark:text-neutral-400">{c.label}</span>;
    if ("in" in c) return inCell(c.in);
    if ("calc" in c) return calcCell(c.calc);
    return null;
  };

  const tdCls = "border border-slate-200 p-0 dark:border-neutral-700";
  const thCls = "border border-slate-200 bg-slate-100 px-1 py-0.5 text-center text-[10px] font-medium text-slate-500 dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-400";
  const rowHeadCls = "border border-slate-200 bg-slate-50 px-1.5 py-0.5 text-center text-[11px] font-semibold whitespace-nowrap dark:border-neutral-700 dark:bg-neutral-800/60";

  // 표 렌더: head[0]=코너라벨, rows[].label=행머리 (컴포넌트 아닌 함수 — 리마운트/포커스유실 방지)
  const renderGrid = (head: string[], rows: { label: string; cells: Cell[] }[]) => (
    <table className="border-collapse text-[11px]">
      <thead>
        <tr>{head.map((h, i) => <th key={i} className={thCls}>{h}</th>)}</tr>
      </thead>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            <th className={rowHeadCls}>{r.label}</th>
            {r.cells.map((c, j) => <td key={j} className={`${tdCls} min-w-[44px]`}>{renderCell(c)}</td>)}
          </tr>
        ))}
      </tbody>
    </table>
  );

  // ───────── 저장 / 이월 / 날짜변경 ─────────
  const doSave = () => start(async () => {
    const r = await saveSettlement(workDate, numMap);
    setMsg(r.error ? `오류: ${r.error}` : `${fmtD(workDate)} 결산서 저장됨`);
  });

  const runCarry = (overwrite: boolean) => start(async () => {
    const r = await carrySettlement(src, carry, overwrite);
    if (r.needConfirm) {
      setConfirmBox({
        title: "이미 이월 데이터 있음",
        lines: [`${fmtD(r.carryDate)} 에 이미 결산 데이터가 있습니다.`, "덮어쓰고 이월할까요?"],
        yesLabel: "덮어쓰기", onYes: () => runCarry(true),
      });
      return;
    }
    setMsg(r.error ? `오류: ${r.error}` : `${fmtD(r.date)} 마감값을 ${fmtD(r.carryDate)} 전일값으로 이월`);
  });
  const doCarry = () => setConfirmBox({
    title: "📅 결산 마감·이월",
    lines: [
      `${fmtD(src)} 결산을 저장(스냅샷)하고`,
      `마감값을 ${fmtD(carry)} 의 전일값으로 이월합니다.`,
      "(위탁 분석중량·고정값은 유지)",
    ],
    yesLabel: "마감·이월", onYes: () => runCarry(false),
  });

  const runMove = (overwrite: boolean) => start(async () => {
    const r = await moveSettlement(from, to, overwrite);
    if (r.needConfirm) {
      setConfirmBox({
        title: "기존 데이터 있음",
        lines: [`${fmtD(r.toDate)} 에 이미 결산서가 있습니다.`, "덮어쓰고 옮길까요?"],
        yesLabel: "덮어쓰기", onYes: () => runMove(true),
      });
      return;
    }
    setMsg(r.error ? `오류: ${r.error}` : `${fmtD(r.fromDate)} → ${fmtD(r.toDate)} 로 결산서 날짜 변경`);
  });
  const doMove = () => setConfirmBox({
    title: "🔁 결산서 날짜 변경",
    lines: [`${fmtD(from)} 결산서를 ${fmtD(to)} 로 옮깁니다.`, `${fmtD(to)} 의 기존 결산서는 덮어씁니다.`],
    yesLabel: "변경", onYes: () => runMove(false),
  });

  // ───────── 한 블록(K18/K14) ─────────
  const Block18 = (
    <section className="space-y-2">
      <h3 className="text-sm font-bold text-rose-600 dark:text-rose-400">K18</h3>
      {/* 부서별거래 */}
      {renderGrid(
        ["부서별거래", "관리", "기계", "양장", "캐스팅부", "개발부", "컷팅", "분석", "검수", "계"],
        [
          { label: "입고", cells: [...cols("B", 8).map((c) => ({ in: `${c}5` })), { calc: "J5" }] },
          { label: "출고", cells: [...cols("B", 8).map((c) => ({ in: `${c}6` })), { calc: "J6" }] },
        ],
      )}
      {/* 분석투입량 */}
      {renderGrid(
        ["분석투입량", "전일누계", "조립양장", "조립기계", "캐.패션", "캐.양장체인", "조립초광", "캐.초광", "소매", "재작업", "바코드", "계", "누계"],
        [9, 10, 11].map((r, i) => ({
          label: ["연마", "스트립핑", "빠우"][i],
          cells: [{ in: `B${r}` }, ...cols("C", 9).map((c) => ({ in: `${c}${r}` })), { calc: `L${r}` }, { calc: `M${r}` }] as Cell[],
        })).concat([{
          label: "계",
          cells: [...cols("B", 11).map((c) => ({ calc: `${c}12` })), { calc: "L12" }, { calc: "M12" }] as Cell[],
        }]),
      )}
      <div className="flex items-center gap-2 text-[11px]">
        <span className={rowHeadCls}>분석</span>
        <span className="text-slate-500">전일누계</span><div className="w-24 border border-slate-200 dark:border-neutral-700">{inCell("I13")}</div>
        <span className="text-slate-500">당일누계</span><div className="w-24">{calcCell("K13")}</div>
      </div>
      {/* 돌가랑 */}
      {renderGrid(
        ["돌가랑", "전일재고", "입고", "출고", "계"],
        [{ label: "중량", cells: [{ in: "B15" }, { in: "C15" }, { in: "D15" }, { calc: "E15" }] }],
      )}
      {/* K18 재고결산 */}
      <div className="space-y-1 rounded-lg border border-slate-200 p-2 dark:border-neutral-700">
        <div className="text-[11px] font-semibold">K18 재고결산</div>
        <div className="flex items-center gap-2 text-[11px]">
          <span className="text-slate-500">전일재고</span><div className="w-28 border border-slate-200 dark:border-neutral-700">{inCell("B18")}</div>
          <span className="text-slate-400">현분잔량 18</span>
        </div>
        {renderGrid(
          ["분석중량", "기계", "양장", "캐스팅", "조립초광", "캐.초광", "땜", "조립2차", "캐스팅2차", "고정값1", "고정값2", "계"],
          [
            { label: "위탁", cells: [...cols("C", 10).map((c) => ({ in: `${c}19` })), { calc: "B21" }] },
            { label: "업체별", cells: [...cols("C", 10).map((c) => ({ in: `${c}21` })), { blank: true }] },
          ],
        )}
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <span className="text-slate-500">실재고</span><div className="w-28">{calcCell("A24")}</div>
          <span className="text-slate-500">장부재고</span><div className="w-28">{calcCell("B24")}</div>
          <span className="text-slate-500">차중량</span><div className="w-28">{calcCell("C24")}</div>
        </div>
      </div>
    </section>
  );

  const Block14 = (
    <section className="space-y-2">
      <h3 className="text-sm font-bold text-blue-600 dark:text-blue-400">K14</h3>
      {renderGrid(
        ["부서별거래", "관리", "조립부", "캐스팅부", "개발부", "컷팅", "분석", "검수", "계"],
        [
          { label: "입고", cells: [...cols("B", 7).map((c) => ({ in: `${c}29` })), { calc: "I29" }] },
          { label: "출고", cells: [...cols("B", 7).map((c) => ({ in: `${c}30` })), { calc: "I30" }] },
        ],
      )}
      {renderGrid(
        ["분석투입량", "전일누계", "조립", "조립초광", "캐스팅", "캐스팅초광", "초광", "기타", "기타", "재작업", "바코드", "계", "누계"],
        [33, 34, 35].map((r, i) => ({
          label: ["연마", "스트립핑", "빠우"][i],
          cells: [{ in: `B${r}` }, ...cols("C", 9).map((c) => ({ in: `${c}${r}` })), { calc: `L${r}` }, { calc: `M${r}` }] as Cell[],
        })).concat([{
          label: "계",
          cells: [...cols("B", 11).map((c) => ({ calc: `${c}36` })), { calc: "L36" }, { calc: "M36" }] as Cell[],
        }]),
      )}
      <div className="flex items-center gap-2 text-[11px]">
        <span className={rowHeadCls}>분석</span>
        <span className="text-slate-500">전일누계</span><div className="w-24 border border-slate-200 dark:border-neutral-700">{inCell("I37")}</div>
        <span className="text-slate-500">당일누계</span><div className="w-24">{calcCell("K37")}</div>
      </div>
      {renderGrid(
        ["돌가랑", "전일재고", "입고", "출고", "계"],
        [{ label: "중량", cells: [{ in: "B39" }, { in: "C39" }, { in: "D39" }, { calc: "E39" }] }],
      )}
      <div className="space-y-1 rounded-lg border border-slate-200 p-2 dark:border-neutral-700">
        <div className="text-[11px] font-semibold">K14 재고결산</div>
        <div className="flex items-center gap-2 text-[11px]">
          <span className="text-slate-500">전일재고</span><div className="w-28 border border-slate-200 dark:border-neutral-700">{inCell("B42")}</div>
          <span className="text-slate-400">현분잔량</span>
        </div>
        {renderGrid(
          ["분석중량", "조립", "캐스팅", "조립초광", "캐스팅초광", "땜", "2차작업", "고정값1", "고정값2", "계"],
          [
            { label: "위탁", cells: [...cols("C", 8).map((c) => ({ in: `${c}43` })), { calc: "B45" }] },
            { label: "업체별", cells: [...cols("C", 8).map((c) => ({ in: `${c}45` })), { blank: true }] },
          ],
        )}
        <div className="flex flex-wrap items-center gap-2 text-[11px]">
          <span className="text-slate-500">실재고</span><div className="w-28">{calcCell("K45")}</div>
          <span className="text-slate-500">장부재고</span><div className="w-28">{calcCell("L45")}</div>
          <span className="text-slate-500">차중량</span><div className="w-28">{calcCell("M45")}</div>
        </div>
      </div>
    </section>
  );

  return (
    <main className="space-y-4 p-6">
      {/* 헤더 */}
      <div className="flex flex-wrap items-center justify-between gap-3 print:block">
        <div className="flex items-baseline gap-3">
          <h1 className="text-2xl font-bold tracking-tight">품질관리부 일일 결산서</h1>
          <span className="text-sm text-slate-500 dark:text-neutral-400">{fmtD(workDate)}</span>
        </div>
        <div className="flex items-center gap-2 print:hidden">
          <button onClick={doSave} disabled={pending}
            className="rounded-md bg-[#4b3526] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#3a281c] disabled:opacity-50">
            저장
          </button>
          <button onClick={() => window.print()}
            className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs hover:bg-slate-100 dark:border-neutral-600 dark:hover:bg-neutral-800">
            인쇄
          </button>
        </div>
      </div>

      {/* 마감·이월 / 날짜변경 바 */}
      <section className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm print:hidden dark:border-neutral-800 dark:bg-neutral-900">
        <span className="text-sm font-semibold">📅 마감·이월</span>
        <div className="flex items-center gap-1.5">
          <label className="text-xs text-slate-500">마감일</label>
          <input type="date" value={src} onChange={(e) => setSrc(e.target.value)} className={dateInputCls} />
          <span className="text-slate-300">→</span>
          <label className="text-xs text-slate-500">이월일</label>
          <input type="date" value={carry} onChange={(e) => setCarry(e.target.value)} className={dateInputCls} />
          <button onClick={doCarry} disabled={pending}
            className="rounded-md bg-[#4b3526] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#3a281c] disabled:opacity-50">
            마감·이월
          </button>
        </div>
        <span className="text-slate-200 dark:text-neutral-700">|</span>
        <span className="text-sm font-semibold">🔁 날짜 변경</span>
        <div className="flex items-center gap-1.5">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={dateInputCls} />
          <span className="text-slate-300">→</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={dateInputCls} />
          <button onClick={doMove} disabled={pending}
            className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs hover:bg-slate-100 disabled:opacity-50 dark:border-neutral-600 dark:hover:bg-neutral-800">
            변경
          </button>
        </div>
        {msg && <span className="text-xs text-slate-500 dark:text-neutral-400">{msg}</span>}
      </section>

      {/* 범례 */}
      <div className="flex flex-wrap gap-3 text-[11px] text-slate-500 print:hidden">
        <span className="flex items-center gap-1"><span className="inline-block h-3 w-4 rounded-sm bg-sky-50 ring-1 ring-sky-200 dark:bg-sky-900/15" /> 전일값(이월)</span>
        <span className="flex items-center gap-1"><span className="inline-block h-3 w-4 rounded-sm bg-amber-50 ring-1 ring-amber-200 dark:bg-amber-900/15" /> 보존값(위탁·고정)</span>
        <span className="flex items-center gap-1"><span className="inline-block h-3 w-4 rounded-sm bg-slate-50 ring-1 ring-slate-200 dark:bg-neutral-800" /> 자동계산</span>
        <span>※ 입고·출고·분석투입량은 추후 ‘결산전송’으로 자동 채움(B단계).</span>
      </div>

      {/* 두 블록 */}
      <div className="overflow-x-auto">
        <div className="flex flex-col gap-6 xl:flex-row">{Block18}{Block14}</div>
      </div>

      {/* 확인 모달 */}
      {confirmBox && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20" onClick={() => setConfirmBox(null)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-slate-200 dark:bg-neutral-800 dark:ring-neutral-700" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-3 text-base font-bold">{confirmBox.title}</h3>
            <div className="mb-4 space-y-1 text-sm text-slate-600 dark:text-neutral-300">
              {confirmBox.lines.map((l, i) => <p key={i}>{l}</p>)}
            </div>
            <div className="flex items-center justify-end gap-2">
              <button onClick={() => setConfirmBox(null)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm dark:border-neutral-600">취소</button>
              <button disabled={pending} onClick={() => { const fn = confirmBox.onYes; setConfirmBox(null); fn(); }}
                className="rounded-lg bg-[#4b3526] px-4 py-2 text-sm font-medium text-white hover:bg-[#3a281c] disabled:opacity-50">
                {confirmBox.yesLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
