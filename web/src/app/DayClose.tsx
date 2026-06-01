"use client";

import { useState, useTransition } from "react";
import { closeDay, rescheduleCarry } from "./closeActions";
import { fmtWeight } from "@/lib/types";

type SnapRow = { process_id: string; name: string; karat: string | null; kind: string; inW: number; stock: number; outW: number; lossW: number };
type Snap = { date: string; rows: SnapRow[] } | null;
export type CloseHistory = { id: string; label: string; closed_at: string | null; snapshot: Snap };

const tomorrow = () => {
  const d = new Date();
  d.setDate(d.getDate() + 1);
  return d.toISOString().slice(0, 10);
};

export function DayClose({ carryDate, history }: { carryDate: string | null; history: CloseHistory[] }) {
  const [date, setDate] = useState(carryDate ?? tomorrow());
  const [reDate, setReDate] = useState(carryDate ?? tomorrow());
  const [open, setOpen] = useState<string | null>(null); // 펼친 이력 id
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, start] = useTransition();

  const doClose = () => {
    if (!confirm(`일마감을 진행할까요?\n· 공정 완료분은 오늘 마감으로 정리(숨김)\n· 미작업 재고는 ${date} 로 이월\n· 부서·검수는 그대로 유지`)) return;
    start(async () => {
      const r = await closeDay(date);
      setMsg(r.error ? `오류: ${r.error}` : `마감 완료 — 완료 ${r.completed}건 정리, 재고 ${r.carried}건 ${r.carryDate} 이월`);
    });
  };
  const doReschedule = () => {
    start(async () => {
      const r = await rescheduleCarry(reDate);
      setMsg(r.error ? `오류: ${r.error}` : `이월 날짜를 ${reDate} 로 변경`);
    });
  };

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-sm font-semibold">📅 일마감</span>

        <div className="flex items-center gap-1.5">
          <label className="text-xs text-slate-500 dark:text-neutral-400">이월 날짜</label>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)}
            className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-900" />
          <button onClick={doClose} disabled={pending}
            className="rounded-md bg-[#4b3526] px-3 py-1.5 text-xs font-medium text-white hover:bg-[#3a281c] disabled:opacity-50">
            마감 실행
          </button>
        </div>

        {carryDate && (
          <div className="flex items-center gap-1.5 border-l border-slate-200 pl-3 dark:border-neutral-700">
            <span className="text-xs text-slate-500 dark:text-neutral-400">현재 이월일 <b className="text-slate-700 dark:text-neutral-200">{carryDate}</b></span>
            <input type="date" value={reDate} onChange={(e) => setReDate(e.target.value)}
              className="rounded-md border border-slate-300 bg-white px-2 py-1 text-xs dark:border-neutral-700 dark:bg-neutral-900" />
            <button onClick={doReschedule} disabled={pending}
              className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs hover:bg-slate-100 disabled:opacity-50 dark:border-neutral-600 dark:hover:bg-neutral-800">
              날짜 변경
            </button>
          </div>
        )}

        {msg && <span className="text-xs text-slate-500 dark:text-neutral-400">{msg}</span>}
      </div>

      {history.length > 0 && (
        <div className="mt-3 border-t border-slate-100 pt-2 dark:border-neutral-800">
          <span className="text-[11px] font-medium text-slate-400 dark:text-neutral-500">마감 이력</span>
          <div className="mt-1 flex flex-wrap gap-1.5">
            {history.map((h) => (
              <button key={h.id} onClick={() => setOpen(open === h.id ? null : h.id)}
                className={`rounded-md border px-2 py-1 text-xs ${open === h.id ? "border-[#7a5c43] bg-[#f3ece2] dark:bg-neutral-800" : "border-slate-200 hover:bg-slate-50 dark:border-neutral-700 dark:hover:bg-neutral-800"}`}>
                {h.label}
              </button>
            ))}
          </div>
          {open && (() => {
            const h = history.find((x) => x.id === open);
            const rows = h?.snapshot?.rows ?? [];
            return (
              <div className="mt-2 overflow-x-auto">
                <table className="text-[11px]">
                  <thead className="text-slate-400 dark:text-neutral-500">
                    <tr>
                      <th className="px-2 py-1 text-left">{h?.label} 스냅샷</th>
                      <th className="px-2 py-1 text-right">입고</th>
                      <th className="px-2 py-1 text-right">재고</th>
                      <th className="px-2 py-1 text-right">출고</th>
                      <th className="px-2 py-1 text-right">로스</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-50 dark:divide-neutral-800/60">
                    {rows.length === 0 ? (
                      <tr><td colSpan={5} className="px-2 py-2 text-slate-300">스냅샷 없음</td></tr>
                    ) : rows.map((r) => (
                      <tr key={r.process_id}>
                        <td className={`px-2 py-1 ${r.karat === "14K" ? "text-blue-600 dark:text-blue-400" : ""}`}>{r.name}</td>
                        <td className="px-2 py-1 text-right tabular-nums">{fmtWeight(r.inW)}</td>
                        <td className="px-2 py-1 text-right tabular-nums">{fmtWeight(r.stock)}</td>
                        <td className="px-2 py-1 text-right tabular-nums">{fmtWeight(r.outW)}</td>
                        <td className="px-2 py-1 text-right tabular-nums text-slate-500">{fmtWeight(r.lossW)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            );
          })()}
        </div>
      )}
    </section>
  );
}
