"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download, Loader2, Printer, Save, Send, Upload } from "lucide-react";
import { fmtWeight } from "@/lib/types";
import { Button } from "@/components/ui/button";
import { DateStepper } from "@/components/DateStepper";
import { DatePicker } from "@/components/DatePicker";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { derive, CARRY, PRESERVE, type CellMap } from "@/lib/settlement";
import { useGridSheet } from "@/lib/useGridSheet";
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

// 작업일을 따라가는 '원래 날짜'(마감일·변경 원래날짜) 잠금 안내(대시보드와 동일)
const lockedTitle = "작업일에 따라 자동 설정 (상단 작업일에서 변경)";

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
    { title: string; lines: string[]; yesLabel: string; onYes: () => void; infoOnly?: boolean } | null
  >(null);
  const [pending, start] = useTransition();
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);

  // 자동저장: 사용자가 입력하면 1.5초 후 자동 저장(debounce). '저장' 버튼·나가기 경고는 보조.
  //  · 사용자 입력(set/붙여넣기)만 dirty로 표시 → 초기 로드·날짜 변경·결산전송·가져오기 등 프로그래밍 변경은 제외.
  const [dirty, setDirty] = useState(false); // UI 표시 + 자동저장 판정
  // 타이머·beforeunload의 동기 접근용 ref — 아래 effect로 dirty(state)에 동기화.
  //  (markDirty/clearDirty가 렌더 중 조정 블록에서도 불리므로 ref를 직접 쓰지 않고 state만 건드린다.)
  const dirtyRef = useRef(false);
  // 입력 세대 카운터 — 저장 요청이 '비행 중'일 때 새 입력이 있었는지 판별.
  //  저장 시작 시 세대를 캡처하고, 응답 시 세대가 그대로일 때만 dirty를 지운다.
  //  (없으면: 저장 비행 중 입력 → 응답의 clearDirty가 새 입력의 dirty까지 지워
  //   '저장됨'으로 표시되지만 실제로는 저장 안 된 값이 생김)
  const editGen = useRef(0);
  const [autosaving, setAutosaving] = useState(false);
  const [savedAt, setSavedAt] = useState<string | null>(null);
  const markDirty = () => { editGen.current += 1; setDirty(true); };
  const clearDirty = () => setDirty(false);
  useEffect(() => { dirtyRef.current = dirty; }, [dirty]);
  const stampNow = () => {
    const d = new Date();
    setSavedAt(`${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`);
  };

  // 엑셀식 격자 조작(방향키 이동·Enter·드래그 선택·복사·붙여넣기) — input[data-cell] 대상
  const gridRef = useRef<HTMLDivElement>(null);
  // 붙여넣기: 기준 주소(예: "B5")에서 열문자+1·행번호+1로 펴서 채움. 입력칸이 있는 주소만 반영.
  const onGridPaste = (anchorCell: string, matrix: string[][]) => {
    const m = anchorCell.match(/^([A-M])(\d+)$/);
    markDirty();
    setVals((prev) => {
      const next = { ...prev };
      if (!m) { next[anchorCell] = (matrix[0]?.[0] ?? "").replace(/,/g, ""); return next; }
      const c0 = COL.indexOf(m[1]), r0 = Number(m[2]);
      for (let dr = 0; dr < matrix.length; dr++) {
        for (let dc = 0; dc < matrix[dr].length; dc++) {
          const ci = c0 + dc;
          if (ci >= COL.length) break;
          const addr = COL[ci] + (r0 + dr);
          if (gridRef.current?.querySelector(`input[data-cell="${addr}"]`)) next[addr] = matrix[dr][dc].replace(/,/g, "");
        }
      }
      return next;
    });
  };
  useGridSheet(gridRef, { onPaste: onGridPaste });

  // initial/workDate(prop) 변경 시 입력값·기본 날짜 동기화 — effect 대신 "렌더 중 조정" 패턴
  const [prevKey, setPrevKey] = useState({ initial, workDate });
  if (prevKey.initial !== initial || prevKey.workDate !== workDate) {
    setPrevKey({ initial, workDate });
    setVals(toStr(initial));
    clearDirty(); // 작업일/데이터 prop 변경(서버 재조회·가져오기)은 자동저장 트리거 아님
    setSrc(workDate); setCarry(nextDay(workDate));
    setFrom(workDate); setTo(nextDay(workDate));
  }

  const set = (a: string, v: string) => { markDirty(); setVals((p) => ({ ...p, [a]: v })); };
  const numMap = useMemo(() => {
    const o: CellMap = {};
    for (const [k, v] of Object.entries(vals)) o[k] = v === "" ? null : Number(v);
    return o;
  }, [vals]);
  const f = useMemo(() => derive(numMap), [numMap]);
  // 계산칸은 0도 '0.00'으로 표시 — 빈칸(미계산)과 '계산 결과 0'을 명확히 구분
  const fmtCalc = (v: number | undefined) => (v == null ? "" : fmtWeight(v));

  // 자동저장 실행기 — 최신 스냅샷(stateRef)으로 저장하고, 비행 중 새 입력이 있었으면 이어서 재저장.
  //  · stateRef: 값과 날짜를 '같은 시점' 쌍으로 읽음 → 작업일 전환 직후 옛 날짜에 새 데이터가 저장되는 교차 오염 방지.
  //  · savingRef: 동시 저장 1건 제한 → 늦게 도착한 옛 요청이 새 값을 덮어쓰는 역전 방지.
  const stateRef = useRef({ numMap, workDate });
  useEffect(() => { stateRef.current = { numMap, workDate }; });
  const savingRef = useRef(false);
  const runSave = () => {
    if (savingRef.current) return; // 비행 중이면 스킵 — 응답 시 세대 검사로 이어서 저장됨
    const { numMap: payload, workDate: date } = stateRef.current;
    const gen = editGen.current;
    savingRef.current = true;
    setAutosaving(true);
    saveSettlement(date, payload).then((r) => {
      savingRef.current = false;
      setAutosaving(false);
      if (r?.error) return; // 실패 → dirty 유지(다음 입력·수동 저장에서 재시도)
      if (editGen.current === gen) { clearDirty(); stampNow(); }
      else if (dirtyRef.current) runSave(); // 비행 중 새 입력 → 최신 스냅샷으로 즉시 재저장
    });
  };

  // 자동저장(debounce 1.5초) — 입력이 이어지면 타이머가 갱신돼, 멈춘 뒤 1회만 저장.
  useEffect(() => {
    if (!dirtyRef.current) return;
    const t = setTimeout(() => {
      if (dirtyRef.current) runSave(); // 그새 수동저장/리셋되면 스킵(중복 저장 방지)
    }, 1500);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [numMap, workDate]);

  // 나가기 경고(보조) — 저장 안 된 변경이 있는 채로 새로고침·창닫기 시 브라우저 확인창.
  useEffect(() => {
    const h = (e: BeforeUnloadEvent) => { if (dirtyRef.current) { e.preventDefault(); e.returnValue = ""; } };
    window.addEventListener("beforeunload", h);
    return () => window.removeEventListener("beforeunload", h);
  }, []);

  // ───────── 셀 스타일 ─────────
  const bd = "border border-slate-400 dark:border-neutral-500";
  const thCls = `${bd} bg-slate-100 px-0.5 py-[3px] text-center text-[9px] font-medium leading-tight text-slate-600 dark:bg-neutral-800 dark:text-neutral-300 print:bg-slate-100`;
  const rhCls = `${bd} bg-slate-50 px-0.5 py-[3px] text-center text-[10px] font-semibold leading-tight dark:bg-neutral-800/60 print:bg-slate-50`;
  const tCls = `${bd} px-1 py-[3px] text-[10px] leading-tight`;
  const calcCls = `${bd} bg-slate-50/70 px-1 py-[3px] text-right text-[10px] font-medium tabular-nums dark:bg-neutral-800/40 print:bg-transparent`;

  // 전일값(이월=sky)·보존값(위탁·고정=amber) 셀 배경색.
  //  input(bg-transparent)이 아니라 감싼 <td>에 칠한다 — 둘 다 background-color라 input에 같이 주면
  //  bg-transparent가 tint를 덮어써 색이 안 보였음. td에 칠하고 input은 투명이라 비쳐 보인다.
  const tintOf = (a: string) =>
    preserveSet.has(a)
      ? "bg-amber-50 dark:bg-amber-900/15 print:bg-transparent"
      : carriedSet.has(a)
        ? "bg-sky-50 dark:bg-sky-900/15 print:bg-transparent"
        : "";

  const inEl = (a: string) => (
    <input value={commaFmt(vals[a] ?? "")} inputMode="decimal" data-cell={a}
      onChange={(e) => {
        const r = e.target.value.replace(/,/g, "");
        if (r === "" || r === "-" || /^-?\d*\.?\d{0,2}$/.test(r)) set(a, r);
      }}
      onBlur={(e) => {
        const r = e.target.value.replace(/,/g, "");
        if (r !== "" && r !== "-" && !isNaN(Number(r))) set(a, Number(r).toFixed(2));
      }}
      className="w-full bg-transparent px-1 py-[3px] text-right text-[10px] tabular-nums outline-none focus:bg-blue-100 dark:focus:bg-blue-950/40" />
  );

  const renderCell = (c: C, key: number) => {
    if (c.k === "e") return <td key={key} colSpan={c.span} className={c.b ? bd : "border-0 print:border-0"} />;
    if (c.k === "h") return <td key={key} colSpan={c.span} className={`${thCls} ${c.cls ?? ""}`}>{c.t}</td>;
    if (c.k === "rh") return <td key={key} colSpan={c.span} className={`${rhCls} ${c.cls ?? ""}`}>{c.t}</td>;
    if (c.k === "t") return <td key={key} colSpan={c.span} className={`${tCls} ${c.cls ?? ""}`}>{c.t}</td>;
    if (c.k === "in") return <td key={key} className={`${bd} p-0 ${tintOf(c.a)}`}>{inEl(c.a)}</td>;
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
    [{ k: "h", t: "K14" }, ...["분석업체", "조립", "캐스팅", "조립초광", "캐스팅초광", "땜", "2차작업", "고정값1", "고정값2", "실재고", "장부재고", "차중량"].map((t) => ({ k: "h", t } as C))],
    [{ k: "rh", t: "중량" }, { k: "calc", a: "B45" }, ...range("C", 8).map((c) => ({ k: "in", a: `${c}45` } as C)), { k: "calc", a: "K45" }, { k: "calc", a: "L45" }, { k: "calc", a: "M45" }],
  ];

  // ───────── 저장 / 이월 / 날짜변경 ─────────
  const doSave = () => start(async () => {
    const gen = editGen.current; // 저장 비행 중 새 입력이 있으면 dirty 유지(자동저장이 마저 저장)
    const r = await saveSettlement(workDate, numMap);
    if (!r.error && editGen.current === gen) { clearDirty(); stampNow(); }
    setMsg(r.error ? `오류: ${r.error}` : `${fmtD(workDate)} 결산서 저장됨`);
  });
  const doPush = () => start(async () => {
    const r = await pushFromLots(workDate, numMap);
    if (r.error) { setMsg(`오류: ${r.error}`); return; }
    if (r.data) setVals(toStr(r.data));
    clearDirty(); stampNow(); // 결산전송도 DB 저장(병합 upsert)이라 저장 완료 상태
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
  const runCarry = () => start(async () => {
    const r = await carrySettlement(src, carry);
    if (r.blocked) {
      setConfirmBox({
        title: "이월 취소 — 기존 데이터 있음",
        lines: [`${fmtD(r.carryDate)} 에 이미 결산 데이터가 있습니다.`, "그 데이터를 다른 날짜로 옮기거나 삭제한 뒤 다시 시도하세요.", "(덮어쓰지 않고 취소했습니다)"],
        yesLabel: "확인", onYes: () => {}, infoOnly: true,
      });
      return;
    }
    setMsg(r.error ? `오류: ${r.error}` : `${fmtD(r.date)} 마감값을 ${fmtD(r.carryDate)} 전일값으로 이월`);
  });
  const doCarry = () => setConfirmBox({ title: "📅 결산 마감·이월", lines: [`${fmtD(src)} 결산을 저장(스냅샷)하고`, `마감값을 ${fmtD(carry)} 의 전일값으로 이월합니다.`, "(위탁 분석중량·고정값은 유지)"], yesLabel: "마감·이월", onYes: () => runCarry() });
  const runMove = () => start(async () => {
    const r = await moveSettlement(from, to);
    if (r.blocked) {
      setConfirmBox({
        title: "날짜 변경 취소 — 기존 데이터 있음",
        lines: [`${fmtD(r.toDate)} 에 이미 결산서가 있습니다.`, "그 데이터를 다른 날짜로 옮기거나 삭제한 뒤 다시 시도하세요.", "(덮어쓰지 않고 취소했습니다)"],
        yesLabel: "확인", onYes: () => {}, infoOnly: true,
      });
      return;
    }
    setMsg(r.error ? `오류: ${r.error}` : `${fmtD(r.fromDate)} → ${fmtD(r.toDate)} 로 결산서 날짜 변경`);
  });
  const doMove = () => setConfirmBox({ title: "🔁 결산서 날짜 변경", lines: [`${fmtD(from)} 결산서를 ${fmtD(to)} 로 옮깁니다.`], yesLabel: "변경", onYes: () => runMove() });

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
          <Button size="sm" onClick={doPush} disabled={pending} className="bg-indigo-600 text-white hover:bg-indigo-700">
            {pending ? <Loader2 className="animate-spin" /> : <Send />}결산전송
          </Button>
          <span className="min-w-[68px] text-right text-xs text-slate-400 dark:text-neutral-500">
            {autosaving ? "저장 중…" : dirty ? "● 변경됨" : savedAt ? `저장됨 ${savedAt}` : ""}
          </span>
          <Button size="sm" onClick={doSave} disabled={pending} className="bg-[#4b3526] text-white hover:bg-[#3a281c]">
            {pending ? <Loader2 className="animate-spin" /> : <Save />}저장
          </Button>
          <Button size="sm" variant="outline" onClick={() => window.print()}><Printer />인쇄</Button>
          <span className="mx-1 text-slate-200 dark:text-neutral-700">|</span>
          <Button size="sm" variant="outline"
            onClick={() => { window.location.href = `/api/settlement/export?date=${workDate}`; }}>
            <Download />엑셀 백업
          </Button>
          <Button size="sm" variant="outline" onClick={() => fileRef.current?.click()} disabled={pending}>
            {pending ? <Loader2 className="animate-spin" /> : <Upload />}엑셀 가져오기
          </Button>
          <input ref={fileRef} type="file" accept=".xlsm,.xlsx" className="hidden"
            onChange={(e) => { const f = e.target.files?.[0]; if (f) onImportFile(f); e.target.value = ""; }} />
        </div>
      </div>

      <section className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-slate-200 bg-white p-3 shadow-sm print:hidden dark:border-neutral-800 dark:bg-neutral-900">
        <span className="text-sm font-semibold">📅 마감·이월</span>
        <div className="flex items-center gap-1.5">
          <label className="text-xs text-slate-500">마감일</label>
          <DatePicker value={src} locked title={lockedTitle} />
          <span className="text-slate-300">→</span>
          <label className="text-xs text-slate-500">이월일</label>
          <DateStepper value={carry} onChange={setCarry} />
          <Button size="sm" className="bg-[#4b3526] text-white hover:bg-[#3a281c]" onClick={doCarry} disabled={pending}>
            {pending && <Loader2 className="animate-spin" />}마감·이월
          </Button>
        </div>
        <span className="text-slate-200 dark:text-neutral-700">|</span>
        <span className="text-sm font-semibold">🔁 날짜 변경</span>
        <div className="flex items-center gap-1.5">
          <DatePicker value={from} locked title={lockedTitle} />
          <span className="text-slate-300">→</span>
          <DateStepper value={to} onChange={setTo} />
          <Button size="sm" variant="outline" onClick={doMove} disabled={pending}>변경</Button>
        </div>
        {msg && <span className="text-xs text-slate-500 dark:text-neutral-400">{msg}</span>}
      </section>

      <div className="flex flex-wrap gap-3 text-[11px] text-slate-500 print:hidden">
        <span className="flex items-center gap-1"><span className="inline-block h-3 w-4 rounded-sm bg-sky-50 ring-1 ring-sky-200" /> 전일값(이월)</span>
        <span className="flex items-center gap-1"><span className="inline-block h-3 w-4 rounded-sm bg-amber-50 ring-1 ring-amber-200" /> 보존값(위탁·고정)</span>
        <span>※ 입고·출고·분석투입량 등은 ‘결산전송’ 버튼을 누르면 자동으로 채워집니다(직접 입력한 칸은 그대로 둡니다).</span>
        <span>※ 엑셀처럼 Enter·방향키로 칸 이동, 드래그로 여러 칸 선택 후 Ctrl+C 복사, 엑셀 표를 붙여넣기(Ctrl+V)할 수 있습니다.</span>
      </div>

      {/* 인쇄 영역 — 엑셀 양식 그대로 */}
      <div ref={gridRef} className="mx-auto w-fit bg-white px-2 text-slate-900 dark:bg-white">
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

      <AlertDialog open={!!confirmBox} onOpenChange={(o) => { if (!o) setConfirmBox(null); }}>
        <AlertDialogContent className="print:hidden">
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmBox?.title}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-1">{confirmBox?.lines.map((l, i) => <p key={i}>{l}</p>)}</div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            {!confirmBox?.infoOnly && <AlertDialogCancel>취소</AlertDialogCancel>}
            <AlertDialogAction className="bg-[#4b3526] text-white hover:bg-[#3a281c]"
              onClick={() => { const fn = confirmBox?.onYes; fn?.(); }}>
              {confirmBox?.yesLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </main>
  );
}
