"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { fmtWeight } from "@/lib/types";
import { derive, CARRY, PRESERVE, type CellMap } from "@/lib/settlement";
import { saveSettlement, carrySettlement, moveSettlement, pushFromLots } from "./settlementActions";

const fmtD = (s?: string | null) => (s ? s.replaceAll("-", "/") : "");
const nextDay = (d: string) => {
  const x = new Date(d + "T00:00:00Z");
  x.setUTCDate(x.getUTCDate() + 1);
  return x.toISOString().slice(0, 10);
};
const COL = "ABCDEFGHIJKLM";
const range = (start: string, n: number) =>
  Array.from({ length: n }, (_, i) => COL[COL.indexOf(start) + i]);

const carriedSet = new Set(CARRY.map(([to]) => to));
const preserveSet = new Set(PRESERVE);

// 천단위 콤마 표시(소수점·자릿수는 입력 그대로 유지). 저장값은 콤마 없는 원문.
const commaFmt = (raw: string) => {
  if (raw === "" || raw === "-") return raw;
  const neg = raw.startsWith("-");
  const s = neg ? raw.slice(1) : raw;
  const dot = s.indexOf(".");
  const int = dot >= 0 ? s.slice(0, dot) : s;
  const dec = dot >= 0 ? s.slice(dot) : "";
  return (neg ? "-" : "") + int.replace(/\B(?=(\d{3})+(?!\d))/g, ",") + dec;
};

// 셀 스펙: h=헤더 rh=행머리 t=텍스트 in=입력 calc=계산 e=빈칸(b=테두리)
type C =
  | { k: "h"; t: string; span?: number; cls?: string }
  | { k: "rh"; t: string; span?: number; cls?: string }
  | { k: "t"; t: string; span?: number; cls?: string }
  | { k: "in"; a: string }
  | { k: "calc"; a: string; span?: number; cls?: string }
  | { k: "e"; span?: number; b?: boolean };

const dateInputCls =
  "rounded-md border border-slate-300 bg-white px-2 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-900";

export function SettlementView({ workDate, initial }: { workDate: string; initial: CellMap }) {
  const toStr = (d: CellMap): Record<string, string> => {
    const o: Record<string, string> = {};
    for (const [k, v] of Object.entries(d)) o[k] = v == null ? "" : typeof v === "number" ? v.toFixed(2) : String(v);
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
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

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

  // ───────── 셀 스타일 ─────────
  const bd = "border border-slate-400 dark:border-neutral-500";
  const thCls = `${bd} bg-slate-100 px-0.5 py-[3px] text-center text-[9px] font-medium leading-tight text-slate-600 dark:bg-neutral-800 dark:text-neutral-300 print:bg-slate-100`;
  const rhCls = `${bd} bg-slate-50 px-0.5 py-[3px] text-center text-[10px] font-semibold leading-tight dark:bg-neutral-800/60 print:bg-slate-50`;
  const tCls = `${bd} px-1 py-[3px] text-[10px] leading-tight`;
  const calcCls = `${bd} bg-slate-50/70 px-1 py-[3px] text-right text-[10px] font-medium tabular-nums dark:bg-neutral-800/40 print:bg-transparent`;

  const inEl = (a: string) => {
    const tint = preserveSet.has(a)
      ? "bg-amber-50 dark:bg-amber-900/15 print:bg-transparent"
      : carriedSet.has(a)
        ? "bg-sky-50 dark:bg-sky-900/15 print:bg-transparent"
        : "";
    return (
      <input value={commaFmt(vals[a] ?? "")} inputMode="decimal"
        onChange={(e) => {
          const r = e.target.value.replace(/,/g, "");
          if (r === "" || r === "-" || /^-?\d*\.?\d{0,2}$/.test(r)) set(a, r);
        }}
        onBlur={(e) => {
          const r = e.target.value.replace(/,/g, "");
          if (r !== "" && r !== "-" && !isNaN(Number(r))) set(a, Number(r).toFixed(2));
        }}
        className={`w-full bg-transparent px-1 py-[3px] text-right text-[10px] tabular-nums outline-none focus:bg-blue-100 dark:focus:bg-blue-950/40 ${tint}`} />
    );
  };

  const renderCell = (c: C, key: number) => {
    if (c.k === "e") return <td key={key} colSpan={c.span} className={c.b ? bd : "border-0 print:border-0"} />;
    if (c.k === "h") return <td key={key} colSpan={c.span} className={`${thCls} ${c.cls ?? ""}`}>{c.t}</td>;
    if (c.k === "rh") return <td key={key} colSpan={c.span} className={`${rhCls} ${c.cls ?? ""}`}>{c.t}</td>;
    if (c.k === "t") return <td key={key} colSpan={c.span} className={`${tCls} ${c.cls ?? ""}`}>{c.t}</td>;
    if (c.k === "in") return <td key={key} className={`${bd} p-0`}>{inEl(c.a)}</td>;
    return <td key={key} colSpan={c.span} className={`${calcCls} ${c.cls ?? ""}`}>{fmtCalc(f[c.a]) || " "}</td>;
  };

  // 공유 13열 그리드 — 모든 서브표가 같은 열에 정렬(엑셀과 동일)
  const widths = [60, 56, ...Array(11).fill(50)]; // A, B, C..M
  const sheet = (title: React.ReactNode, rows: C[][]) => (
    <table className="border-collapse" style={{ tableLayout: "fixed" }}>
      <colgroup>{widths.map((w, i) => <col key={i} style={{ width: w }} />)}</colgroup>
      <tbody>
        <tr><td colSpan={13} className="border-0 pb-0.5 pt-1.5 text-left text-[13px] font-bold">{title}</td></tr>
        {rows.map((r, i) => <tr key={i}>{r.map(renderCell)}</tr>)}
      </tbody>
    </table>
  );
  const gap: C[] = [{ k: "e", span: 13 }];
  const titleRow = (t: string): C[] => [{ k: "t", t, span: 13, cls: "border-0 text-center text-[12px] font-bold tracking-wider py-1" }];

  // ───────── K18 ─────────
  const block18: C[][] = [
    [{ k: "h", t: "부서별거래" }, ...["관리", "기계", "양장", "캐스팅부", "개발부", "컷팅", "분석", "검수", "계"].map((t) => ({ k: "h", t } as C)), { k: "e", span: 3 }],
    [{ k: "rh", t: "입고" }, ...range("B", 8).map((c) => ({ k: "in", a: `${c}5` } as C)), { k: "calc", a: "J5" }, { k: "e", span: 3 }],
    [{ k: "rh", t: "출고" }, ...range("B", 8).map((c) => ({ k: "in", a: `${c}6` } as C)), { k: "calc", a: "J6" }, { k: "e", span: 3 }],
    gap,
    [{ k: "h", t: "분석투입량" }, ...["전일누계", "조립양장", "조립기계", "캐.패션", "캐.양장체인", "조립초광", "캐.초광", "소매", "재작업", "바코드", "계", "누계"].map((t) => ({ k: "h", t } as C))],
    ...[9, 10, 11].map((r, i): C[] => [{ k: "rh", t: ["연마", "스트립핑", "빠우"][i] }, { k: "in", a: `B${r}` }, ...range("C", 9).map((c) => ({ k: "in", a: `${c}${r}` } as C)), { k: "calc", a: `L${r}` }, { k: "calc", a: `M${r}` }]),
    [{ k: "rh", t: "계" }, ...range("B", 10).map((c) => ({ k: "calc", a: `${c}12` } as C)), { k: "calc", a: "L12" }, { k: "calc", a: "M12" }],
    [{ k: "e", span: 7 }, { k: "t", t: "전일누계", cls: "text-right text-slate-500" }, { k: "in", a: "I13" }, { k: "t", t: "당일누계", cls: "text-right text-slate-500" }, { k: "calc", a: "K13" }, { k: "e", span: 2 }],
    gap,
    [{ k: "h", t: "돌가랑" }, ...["전일재고", "입고", "출고", "계"].map((t) => ({ k: "h", t } as C)), { k: "e", span: 8 }],
    [{ k: "rh", t: "중량" }, { k: "in", a: "B15" }, { k: "in", a: "C15" }, { k: "in", a: "D15" }, { k: "calc", a: "E15" }, { k: "e", span: 8 }],
    gap,
    titleRow("K18 재 고 결 산"),
    [{ k: "rh", t: "전일재고" }, { k: "in", a: "B18" }, { k: "e", span: 8 }, { k: "t", t: "현분잔량 18", span: 2, cls: "border-0 text-right text-slate-500" }, { k: "in", a: "hbjr18" }],
    [{ k: "rh", t: "분석중량" }, { k: "rh", t: "위탁" }, ...range("C", 5).map((c) => ({ k: "in", a: `${c}19` } as C)), { k: "t", t: "현분대체", cls: "text-center text-[9px] text-slate-400" }, ...range("I", 4).map((c) => ({ k: "in", a: `${c}19` } as C)), { k: "e", span: 1, b: true }],
    [{ k: "h", t: "K18" }, ...["분석업체", "기계", "양장", "캐스팅", "조립초광", "캐.초광", "땜", "조립2차", "캐스팅2차", "고정값1", "고정값2"].map((t) => ({ k: "h", t } as C)), { k: "e", span: 1, b: true }],
    [{ k: "rh", t: "중량" }, { k: "calc", a: "B21" }, ...range("C", 10).map((c) => ({ k: "in", a: `${c}21` } as C)), { k: "e", span: 1, b: true }],
    gap,
    [{ k: "h", t: "실재고" }, { k: "h", t: "장부재고" }, { k: "h", t: "차중량" }, { k: "e", span: 10 }],
    [{ k: "calc", a: "A24" }, { k: "calc", a: "B24" }, { k: "calc", a: "C24" }, { k: "e", span: 10 }],
  ];

  // ───────── K14 ─────────
  const block14: C[][] = [
    [{ k: "h", t: "부서별거래" }, ...["관리", "조립부", "캐스팅부", "개발부", "컷팅", "분석", "검수", "계"].map((t) => ({ k: "h", t } as C)), { k: "e", span: 4 }],
    [{ k: "rh", t: "입고" }, ...range("B", 7).map((c) => ({ k: "in", a: `${c}29` } as C)), { k: "calc", a: "I29" }, { k: "e", span: 4 }],
    [{ k: "rh", t: "출고" }, ...range("B", 7).map((c) => ({ k: "in", a: `${c}30` } as C)), { k: "calc", a: "I30" }, { k: "e", span: 4 }],
    gap,
    [{ k: "h", t: "분석투입량" }, ...["전일누계", "조립", "조립초광", "캐스팅", "캐스팅초광", "초광", "기타", "기타", "재작업", "바코드", "계", "누계"].map((t) => ({ k: "h", t } as C))],
    ...[33, 34, 35].map((r, i): C[] => [{ k: "rh", t: ["연마", "스트립핑", "빠우"][i] }, { k: "in", a: `B${r}` }, ...range("C", 9).map((c) => ({ k: "in", a: `${c}${r}` } as C)), { k: "calc", a: `L${r}` }, { k: "calc", a: `M${r}` }]),
    [{ k: "rh", t: "계" }, ...range("B", 10).map((c) => ({ k: "calc", a: `${c}36` } as C)), { k: "calc", a: "L36" }, { k: "calc", a: "M36" }],
    [{ k: "e", span: 7 }, { k: "t", t: "전일누계", cls: "text-right text-slate-500" }, { k: "in", a: "I37" }, { k: "t", t: "당일누계", cls: "text-right text-slate-500" }, { k: "calc", a: "K37" }, { k: "e", span: 2 }],
    gap,
    [{ k: "h", t: "돌가랑" }, ...["전일재고", "입고", "출고", "계"].map((t) => ({ k: "h", t } as C)), { k: "e", span: 8 }],
    [{ k: "rh", t: "중량" }, { k: "in", a: "B39" }, { k: "in", a: "C39" }, { k: "in", a: "D39" }, { k: "calc", a: "E39" }, { k: "e", span: 8 }],
    gap,
    titleRow("K14 재 고 결 산"),
    [{ k: "rh", t: "전일재고" }, { k: "in", a: "B42" }, { k: "e", span: 8 }, { k: "t", t: "현분잔량", span: 2, cls: "border-0 text-right text-slate-500" }, { k: "in", a: "hbjr14" }],
    [{ k: "rh", t: "분석중량" }, { k: "rh", t: "위탁" }, ...range("C", 5).map((c) => ({ k: "in", a: `${c}43` } as C)), { k: "t", t: "현분대체", cls: "text-center text-[9px] text-slate-400" }, ...range("I", 4).map((c) => ({ k: "in", a: `${c}43` } as C)), { k: "e", span: 1, b: true }],
    [{ k: "h", t: "K18" }, ...["분석업체", "조립", "캐스팅", "조립초광", "캐스팅초광", "땜", "2차작업", "고정값1", "고정값2", "실재고", "장부재고", "차중량"].map((t) => ({ k: "h", t } as C))],
    [{ k: "rh", t: "중량" }, { k: "calc", a: "B45" }, ...range("C", 8).map((c) => ({ k: "in", a: `${c}45` } as C)), { k: "calc", a: "K45" }, { k: "calc", a: "L45" }, { k: "calc", a: "M45" }],
  ];

  // ───────── 저장 / 이월 / 날짜변경 ─────────
  const doSave = () => start(async () => {
    const r = await saveSettlement(workDate, numMap);
    setMsg(r.error ? `오류: ${r.error}` : `${fmtD(workDate)} 결산서 저장됨`);
  });
  const doPush = () => start(async () => {
    const r = await pushFromLots(workDate, numMap);
    if (r.error) { setMsg(`오류: ${r.error}`); return; }
    if (r.data) setVals(toStr(r.data));
    setMsg(`${fmtD(workDate)} 결산전송 완료 — 입고·출고·분석투입량 자동 반영`);
  });
  // 엑셀 가져오기 — 현재 작업일로 업로드(그 날짜에 데이터 있으면 서버가 취소)
  const onImportFile = (file: File) => start(async () => {
    const fd = new FormData();
    fd.append("file", file);
    fd.append("date", workDate);
    const res = await fetch("/api/settlement/import", { method: "POST", body: fd });
    const r = await res.json();
    if (r.error) { setConfirmBox({ title: "가져오기 취소", lines: String(r.error).split("\n"), yesLabel: "확인", onYes: () => {} }); return; }
    setMsg(`${fmtD(workDate)} 로 엑셀 결산서 가져옴 (${r.count}칸)`);
    router.refresh();
  });
  const runCarry = (overwrite: boolean) => start(async () => {
    const r = await carrySettlement(src, carry, overwrite);
    if (r.needConfirm) {
      setConfirmBox({ title: "이미 이월 데이터 있음", lines: [`${fmtD(r.carryDate)} 에 이미 결산 데이터가 있습니다.`, "덮어쓰고 이월할까요?"], yesLabel: "덮어쓰기", onYes: () => runCarry(true) });
      return;
    }
    setMsg(r.error ? `오류: ${r.error}` : `${fmtD(r.date)} 마감값을 ${fmtD(r.carryDate)} 전일값으로 이월`);
  });
  const doCarry = () => setConfirmBox({ title: "📅 결산 마감·이월", lines: [`${fmtD(src)} 결산을 저장(스냅샷)하고`, `마감값을 ${fmtD(carry)} 의 전일값으로 이월합니다.`, "(위탁 분석중량·고정값은 유지)"], yesLabel: "마감·이월", onYes: () => runCarry(false) });
  const runMove = (overwrite: boolean) => start(async () => {
    const r = await moveSettlement(from, to, overwrite);
    if (r.needConfirm) {
      setConfirmBox({ title: "기존 데이터 있음", lines: [`${fmtD(r.toDate)} 에 이미 결산서가 있습니다.`, "덮어쓰고 옮길까요?"], yesLabel: "덮어쓰기", onYes: () => runMove(true) });
      return;
    }
    setMsg(r.error ? `오류: ${r.error}` : `${fmtD(r.fromDate)} → ${fmtD(r.toDate)} 로 결산서 날짜 변경`);
  });
  const doMove = () => setConfirmBox({ title: "🔁 결산서 날짜 변경", lines: [`${fmtD(from)} 결산서를 ${fmtD(to)} 로 옮깁니다.`, `${fmtD(to)} 의 기존 결산서는 덮어씁니다.`], yesLabel: "변경", onYes: () => runMove(false) });

  // 결재란
  const approval = (cols: string[]) => (
    <table className="border-collapse text-[10px]">
      <tbody>
        <tr>
          <td rowSpan={2} className={`${bd} w-6 px-1 text-center font-semibold`}>결<br />재</td>
          {cols.map((c) => <td key={c} className={`${bd} w-16 px-1 py-[3px] text-center`}>{c}</td>)}
        </tr>
        <tr>{cols.map((c) => <td key={c} className={`${bd} h-11`} />)}</tr>
      </tbody>
    </table>
  );

  return (
    <main className="space-y-3 p-6 print:p-0">
      {/* 인쇄 여백: 위 넉넉히 / 아래 최소 */}
      <style dangerouslySetInnerHTML={{ __html: "@media print{@page{size:A4;margin:16mm 8mm 4mm 8mm}}" }} />
      {/* 상단 바 (인쇄 숨김) */}
      <div className="flex flex-wrap items-center justify-between gap-3 print:hidden">
        <h1 className="text-xl font-bold tracking-tight">결산서 <span className="text-sm font-normal text-slate-400">{fmtD(workDate)}</span></h1>
        <div className="flex items-center gap-2">
          <button onClick={doPush} disabled={pending} className="rounded-md bg-indigo-600 px-3 py-1.5 text-xs font-medium text-white hover:bg-indigo-700 disabled:opacity-50">결산전송</button>
          <button onClick={doSave} disabled={pending} className="rounded-md bg-[#4b3526] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#3a281c] disabled:opacity-50">저장</button>
          <button onClick={() => window.print()} className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs hover:bg-slate-100 dark:border-neutral-600 dark:hover:bg-neutral-800">인쇄</button>
          <span className="mx-1 text-slate-200 dark:text-neutral-700">|</span>
          <a href={`/api/settlement/export?date=${workDate}`}
            className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs hover:bg-slate-100 dark:border-neutral-600 dark:hover:bg-neutral-800">📥 엑셀 백업</a>
          <button onClick={() => fileRef.current?.click()} disabled={pending}
            className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs hover:bg-slate-100 disabled:opacity-50 dark:border-neutral-600 dark:hover:bg-neutral-800">📤 엑셀 가져오기</button>
          <input ref={fileRef} type="file" accept=".xlsm,.xlsx" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onImportFile(f); e.target.value = ""; }} />
        </div>
      </div>

      <section className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm print:hidden dark:border-neutral-800 dark:bg-neutral-900">
        <span className="text-sm font-semibold">📅 마감·이월</span>
        <div className="flex items-center gap-1.5">
          <label className="text-xs text-slate-500">마감일</label>
          <input type="date" value={src} onChange={(e) => setSrc(e.target.value)} className={dateInputCls} />
          <span className="text-slate-300">→</span>
          <label className="text-xs text-slate-500">이월일</label>
          <input type="date" value={carry} onChange={(e) => setCarry(e.target.value)} className={dateInputCls} />
          <button onClick={doCarry} disabled={pending} className="rounded-md bg-[#4b3526] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#3a281c] disabled:opacity-50">마감·이월</button>
        </div>
        <span className="text-slate-200 dark:text-neutral-700">|</span>
        <span className="text-sm font-semibold">🔁 날짜 변경</span>
        <div className="flex items-center gap-1.5">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={dateInputCls} />
          <span className="text-slate-300">→</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={dateInputCls} />
          <button onClick={doMove} disabled={pending} className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs hover:bg-slate-100 disabled:opacity-50 dark:border-neutral-600 dark:hover:bg-neutral-800">변경</button>
        </div>
        {msg && <span className="text-xs text-slate-500 dark:text-neutral-400">{msg}</span>}
      </section>

      <div className="flex flex-wrap gap-3 text-[11px] text-slate-500 print:hidden">
        <span className="flex items-center gap-1"><span className="inline-block h-3 w-4 rounded-sm bg-sky-50 ring-1 ring-sky-200" /> 전일값(이월)</span>
        <span className="flex items-center gap-1"><span className="inline-block h-3 w-4 rounded-sm bg-amber-50 ring-1 ring-amber-200" /> 보존값(위탁·고정)</span>
        <span>※ 입고·출고·분석투입량은 추후 ‘결산전송’으로 자동 채움(B단계).</span>
      </div>

      {/* 인쇄 영역 — 엑셀 양식 그대로 */}
      <div className="mx-auto w-fit bg-white px-2 text-slate-900 dark:bg-white">
        <div className="py-1 text-center text-[15px] font-bold tracking-wide">품질관리부 일일 결산서</div>
        <div className="pb-1 text-right text-[11px] text-slate-600">{fmtD(workDate)}</div>
        {sheet(<span className="text-rose-600">K18</span>, block18)}
        <div className="h-3" />
        {sheet(<span className="text-blue-600">K14</span>, block14)}
        <div className="mt-3 flex justify-end gap-4 pb-2">
          {approval(["담당", "공장장"])}
          {approval(["담당", "관리이사", "대표이사"])}
        </div>
      </div>

      {confirmBox && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20 print:hidden" onClick={() => setConfirmBox(null)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-slate-200 dark:bg-neutral-800 dark:ring-neutral-700" onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-3 text-base font-bold">{confirmBox.title}</h3>
            <div className="mb-4 space-y-1 text-sm text-slate-600 dark:text-neutral-300">{confirmBox.lines.map((l, i) => <p key={i}>{l}</p>)}</div>
            <div className="flex items-center justify-end gap-2">
              <button onClick={() => setConfirmBox(null)} className="rounded-lg border border-slate-300 px-4 py-2 text-sm dark:border-neutral-600">취소</button>
              <button disabled={pending} onClick={() => { const fn = confirmBox.onYes; setConfirmBox(null); fn(); }} className="rounded-lg bg-[#4b3526] px-4 py-2 text-sm font-medium text-white hover:bg-[#3a281c] disabled:opacity-50">{confirmBox.yesLabel}</button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
