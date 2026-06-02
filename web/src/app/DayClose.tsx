"use client";

import { useState, useTransition } from "react";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { closeDay, moveDate } from "./closeActions";

const nextDay = (d: string) => {
  const x = new Date(d + "T00:00:00Z");
  x.setUTCDate(x.getUTCDate() + 1);
  return x.toISOString().slice(0, 10);
};
// 표시용: yyyy-mm-dd → yyyy/mm/dd
const fmtD = (s?: string | null) => (s ? s.replaceAll("-", "/") : "");

const inputCls = "rounded-md border border-slate-300 bg-white px-2 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-900";
// 작업일을 따라가는 '원래 날짜'(마감일·변경 원래날짜)는 직접 수정 불가 — 오입력 방지
const lockedCls = "rounded-md border border-slate-200 bg-slate-100 px-2 py-1 text-xs text-slate-500 cursor-not-allowed dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-400";
const brand = "bg-[#4b3526] text-white hover:bg-[#3a281c]";

type ConfirmBox = { title: string; lines: string[]; yesLabel: string; onYes: () => void; infoOnly?: boolean };

export function DayClose({ workDate, stock18, stock14 }: { workDate: string; stock18: string; stock14: string }) {
  const [src, setSrc] = useState(workDate);
  const [carry, setCarry] = useState(nextDay(workDate));
  const [from, setFrom] = useState(workDate);
  const [to, setTo] = useState(nextDay(workDate));
  const [msg, setMsg] = useState<string | null>(null);
  const [confirmBox, setConfirmBox] = useState<ConfirmBox | null>(null);
  const [pending, start] = useTransition();

  // 작업일 토글로 날짜(prop)가 바뀌면 기본값 동기화 — effect 대신 React 공식 "렌더 중 조정" 패턴
  const [prevWorkDate, setPrevWorkDate] = useState(workDate);
  if (workDate !== prevWorkDate) {
    setPrevWorkDate(workDate);
    setSrc(workDate); setCarry(nextDay(workDate));
    setFrom(workDate); setTo(nextDay(workDate));
  }

  const runClose = () => start(async () => {
    const r = await closeDay(src, carry);
    if (r.blocked) {
      setConfirmBox({
        title: "이월 취소 — 기존 데이터 있음",
        lines: [
          `${fmtD(r.carryDate)} 에 이미 공정 미작업 재고 ${r.existing}건이 있습니다.`,
          "그 데이터를 다른 날짜로 옮기거나 삭제한 뒤 다시 시도하세요.",
          "(덮어쓰지 않고 취소했습니다)",
        ],
        yesLabel: "확인",
        onYes: () => {},
        infoOnly: true,
      });
      return;
    }
    setMsg(
      r.error ? `오류: ${r.error}`
        : r.snapshotOnly ? `${fmtD(r.date)} 스냅샷 저장 (이월할 공정 재고 없음)`
        : `${fmtD(r.date)} 마감 — 공정 재고 ${r.carried}건을 ${fmtD(r.carryDate)} 로 복사 이월`,
    );
  });

  const doClose = () => setConfirmBox({
    title: "📅 일마감",
    lines: [
      `${fmtD(src)} 현황을 저장하고`,
      `공정 미작업 재고를 ${fmtD(carry)} 로 이월합니다.`,
    ],
    yesLabel: "마감 실행",
    onYes: () => runClose(),
  });

  const runMove = () => start(async () => {
    const r = await moveDate(from, to);
    if (r.blocked) {
      setConfirmBox({
        title: "날짜 변경 취소 — 기존 데이터 있음",
        lines: [
          `${fmtD(r.toDate)} 에 이미 데이터 ${r.existing}건이 있습니다.`,
          "그 데이터를 다른 날짜로 옮기거나 삭제한 뒤 다시 시도하세요.",
          "(덮어쓰지 않고 취소했습니다)",
        ],
        yesLabel: "확인",
        onYes: () => {},
        infoOnly: true,
      });
      return;
    }
    setMsg(r.error ? `오류: ${r.error}` : `${fmtD(r.fromDate)} → ${fmtD(r.toDate)} 로 ${r.moved}건 날짜 변경`);
  });

  const doMove = () => setConfirmBox({
    title: "🔁 날짜 변경",
    lines: [`${fmtD(from)} 의 데이터를 ${fmtD(to)} 로 옮깁니다.`],
    yesLabel: "변경",
    onYes: () => runMove(),
  });

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {/* 일마감 */}
        <span className="text-sm font-semibold">📅 일마감</span>
        <div className="flex items-center gap-1.5">
          <label className="text-xs text-slate-500 dark:text-neutral-400">마감일</label>
          <input type="date" value={src} disabled readOnly title="작업일에 따라 자동 설정 (상단 작업일에서 변경)" className={lockedCls} />
          <span className="text-slate-300 dark:text-neutral-600">→</span>
          <label className="text-xs text-slate-500 dark:text-neutral-400">이월일</label>
          <input type="date" value={carry} onChange={(e) => setCarry(e.target.value)} className={inputCls} />
          <Button size="sm" className={brand} onClick={doClose} disabled={pending}>
            {pending && <Loader2 className="animate-spin" />}마감 실행
          </Button>
        </div>

        {/* 날짜 변경 */}
        <span className="text-slate-200 dark:text-neutral-700">|</span>
        <span className="text-sm font-semibold">🔁 날짜 변경</span>
        <div className="flex items-center gap-1.5">
          <input type="date" value={from} disabled readOnly title="작업일에 따라 자동 설정 (상단 작업일에서 변경)" className={lockedCls} />
          <span className="text-slate-300 dark:text-neutral-600">→</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputCls} />
          <Button size="sm" variant="outline" onClick={doMove} disabled={pending}>변경</Button>
        </div>

        {msg && <span className="text-xs text-slate-500 dark:text-neutral-400">{msg}</span>}

        {/* 18K·14K 재고 — 오른쪽 정렬(상단 KPI 박스 대체) */}
        <div className="ml-auto flex items-center gap-4 text-sm">
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full bg-rose-500" />
            <span className="text-slate-500 dark:text-neutral-400">18K 재고</span>
            <b className="text-base tabular-nums">{stock18}</b>
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-full bg-blue-500" />
            <span className="text-slate-500 dark:text-neutral-400">14K 재고</span>
            <b className="text-base tabular-nums">{stock14}</b>
          </span>
        </div>
      </div>

      {/* 확인 모달 (AlertDialog — 브라우저 confirm 대체) */}
      <AlertDialog open={!!confirmBox} onOpenChange={(o) => { if (!o) setConfirmBox(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{confirmBox?.title}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-1">{confirmBox?.lines.map((l, i) => <p key={i}>{l}</p>)}</div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            {!confirmBox?.infoOnly && <AlertDialogCancel>취소</AlertDialogCancel>}
            <AlertDialogAction className={brand} onClick={() => { const f = confirmBox?.onYes; f?.(); }}>
              {confirmBox?.yesLabel}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
