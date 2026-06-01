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

export function DayClose({ workDate }: { workDate: string }) {
  const [src, setSrc] = useState(workDate);
  const [carry, setCarry] = useState(nextDay(workDate));
  const [from, setFrom] = useState(workDate);
  const [to, setTo] = useState(nextDay(workDate));
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  // 작업일 토글로 날짜가 바뀌면 기본값 동기화
  useEffect(() => {
    setSrc(workDate); setCarry(nextDay(workDate));
    setFrom(workDate); setTo(nextDay(workDate));
  }, [workDate]);

  const runClose = (overwrite: boolean) => start(async () => {
    const r = await closeDay(src, carry, overwrite);
    if (r.needConfirm) {
      if (confirm(`${fmtD(r.carryDate)} 에 이미 미작업 재고 ${r.existing}건이 있습니다.\n덮어쓰고 이월할까요?`)) runClose(true);
      return;
    }
    setMsg(
      r.error ? `오류: ${r.error}`
        : r.snapshotOnly ? `${fmtD(r.date)} 스냅샷 저장 (이월할 공정 재고 없음)`
        : `${fmtD(r.date)} 마감 — 공정 재고 ${r.carried}건을 ${fmtD(r.carryDate)} 로 복사 이월`,
    );
  });

  const doClose = () => {
    if (!confirm(`일마감\n· ${fmtD(src)} 현황을 스냅샷으로 저장\n· 공정 미작업 재고를 ${fmtD(carry)} 로 복사 이월(원래 날짜에도 유지)\n· 부서·검수는 그대로\n진행할까요?`)) return;
    runClose(false);
  };

  const doMove = () => {
    if (!confirm(`${fmtD(from)} 의 데이터 전체를 ${fmtD(to)} 로 옮길까요?\n(${fmtD(to)} 에 데이터가 있으면 합쳐집니다)`)) return;
    start(async () => {
      const r = await moveDate(from, to);
      setMsg(r.error ? `오류: ${r.error}` : `${fmtD(r.fromDate)} → ${fmtD(r.toDate)} 로 ${r.moved}건 날짜 변경`);
    });
  };

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
    </section>
  );
}
