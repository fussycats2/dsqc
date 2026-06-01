"use client";

import { useEffect, useState, useTransition } from "react";
import { closeDay, moveDate } from "./closeActions";

const nextDay = (d: string) => {
  const x = new Date(d + "T00:00:00Z");
  x.setUTCDate(x.getUTCDate() + 1);
  return x.toISOString().slice(0, 10);
};
// 표시용: yyyy-mm-dd → yyyy/mm/dd
const fmtD = (s?: string | null) => (s ? s.replaceAll("-", "/") : "");

const inputCls = "rounded-md border border-slate-300 bg-white px-2 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-900";

type ConfirmBox = { title: string; lines: string[]; yesLabel: string; onYes: () => void };

export function DayClose({ workDate }: { workDate: string }) {
  const [src, setSrc] = useState(workDate);
  const [carry, setCarry] = useState(nextDay(workDate));
  const [from, setFrom] = useState(workDate);
  const [to, setTo] = useState(nextDay(workDate));
  const [msg, setMsg] = useState<string | null>(null);
  const [confirmBox, setConfirmBox] = useState<ConfirmBox | null>(null);
  const [pending, start] = useTransition();

  // 작업일 토글로 날짜가 바뀌면 기본값 동기화
  useEffect(() => {
    setSrc(workDate); setCarry(nextDay(workDate));
    setFrom(workDate); setTo(nextDay(workDate));
  }, [workDate]);

  const runClose = (overwrite: boolean) => start(async () => {
    const r = await closeDay(src, carry, overwrite);
    if (r.needConfirm) {
      setConfirmBox({
        title: "이미 이월 데이터 있음",
        lines: [`${fmtD(r.carryDate)} 에 이미 미작업 재고 ${r.existing}건이 있습니다.`, "덮어쓰고 이월할까요?"],
        yesLabel: "덮어쓰기",
        onYes: () => runClose(true),
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
      `· ${fmtD(src)} 현황을 스냅샷으로 저장`,
      `· 공정 미작업 재고를 ${fmtD(carry)} 로 복사 이월(원래 날짜에도 유지)`,
      "· 부서·검수는 그대로",
      "진행할까요?",
    ],
    yesLabel: "마감 실행",
    onYes: () => runClose(false),
  });

  const doMove = () => setConfirmBox({
    title: "🔁 날짜 변경",
    lines: [
      `${fmtD(from)} 의 데이터 전체를 ${fmtD(to)} 로 옮길까요?`,
      `(${fmtD(to)} 에 데이터가 있으면 합쳐집니다)`,
    ],
    yesLabel: "변경",
    onYes: () => start(async () => {
      const r = await moveDate(from, to);
      setMsg(r.error ? `오류: ${r.error}` : `${fmtD(r.fromDate)} → ${fmtD(r.toDate)} 로 ${r.moved}건 날짜 변경`);
    }),
  });

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        {/* 일마감 */}
        <span className="text-sm font-semibold">📅 일마감</span>
        <div className="flex items-center gap-1.5">
          <label className="text-xs text-slate-500 dark:text-neutral-400">마감일</label>
          <input type="date" value={src} onChange={(e) => setSrc(e.target.value)} className={inputCls} />
          <span className="text-slate-300 dark:text-neutral-600">→</span>
          <label className="text-xs text-slate-500 dark:text-neutral-400">이월일</label>
          <input type="date" value={carry} onChange={(e) => setCarry(e.target.value)} className={inputCls} />
          <button onClick={doClose} disabled={pending}
            className="rounded-md bg-[#4b3526] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#3a281c] disabled:opacity-50">
            마감 실행
          </button>
        </div>

        {/* 날짜 변경 */}
        <span className="text-slate-200 dark:text-neutral-700">|</span>
        <span className="text-sm font-semibold">🔁 날짜 변경</span>
        <div className="flex items-center gap-1.5">
          <input type="date" value={from} onChange={(e) => setFrom(e.target.value)} className={inputCls} />
          <span className="text-slate-300 dark:text-neutral-600">→</span>
          <input type="date" value={to} onChange={(e) => setTo(e.target.value)} className={inputCls} />
          <button onClick={doMove} disabled={pending}
            className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs hover:bg-slate-100 disabled:opacity-50 dark:border-neutral-600 dark:hover:bg-neutral-800">
            변경
          </button>
        </div>

        {msg && <span className="text-xs text-slate-500 dark:text-neutral-400">{msg}</span>}
      </div>

      {/* 확인 모달 (화면 정중앙 — 브라우저 confirm 대체, 앱 모달과 동일 디자인) */}
      {confirmBox && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/20"
          onClick={() => setConfirmBox(null)}>
          <div className="w-full max-w-md rounded-2xl bg-white p-6 shadow-2xl ring-1 ring-slate-200 dark:bg-neutral-800 dark:ring-neutral-700"
            onClick={(e) => e.stopPropagation()}>
            <h3 className="mb-3 text-base font-bold">{confirmBox.title}</h3>
            <div className="mb-4 space-y-1 text-sm text-slate-600 dark:text-neutral-300">
              {confirmBox.lines.map((l, i) => <p key={i}>{l}</p>)}
            </div>
            <div className="flex items-center justify-end gap-2">
              <button onClick={() => setConfirmBox(null)}
                className="rounded-lg border border-slate-300 px-4 py-2 text-sm dark:border-neutral-600">취소</button>
              <button disabled={pending}
                onClick={() => { const f = confirmBox.onYes; setConfirmBox(null); f(); }}
                className="rounded-lg bg-[#4b3526] px-4 py-2 text-sm font-medium text-white hover:bg-[#3a281c] disabled:opacity-50">
                {confirmBox.yesLabel}
              </button>
            </div>
          </div>
        </div>
      )}
    </section>
  );
}
