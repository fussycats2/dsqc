"use client";

import { useEffect, useRef, useState } from "react";
import { CalendarDays, ChevronLeft, ChevronRight } from "lucide-react";
import { datesWithData } from "@/app/dateActions";

// 의존성 없는 가벼운 달력 팝오버. 네이티브 <input type="date">는 날짜별 강조가 불가하므로 직접 구현.
//  · 보고 있는 달의 '데이터가 있는 날'(lots·결산서 어느 쪽이든)을 서버 액션으로 받아 점·배경색으로 강조.
//  · UTC 기준 날짜 계산(프로젝트 다른 날짜 로직과 동일).

const pad = (n: number) => String(n).padStart(2, "0");
function todayKST(): string {
  return new Date(Date.now() + 9 * 3600 * 1000).toISOString().slice(0, 10);
}
const WD = ["일", "월", "화", "수", "목", "금", "토"];

export function DatePicker({
  value,
  onChange,
  disabled,
  locked,
  title,
  className,
}: {
  value: string; // yyyy-mm-dd
  onChange?: (v: string) => void;
  disabled?: boolean;
  locked?: boolean; // 작업일을 따라가는 자동 날짜(마감일·변경 원래날짜) — 표시 전용, 달력 안 열림
  title?: string;
  className?: string;
}) {
  const [open, setOpen] = useState(false);
  const [view, setView] = useState(() => value.slice(0, 7)); // "yyyy-mm"
  const [dataDays, setDataDays] = useState<Set<string>>(new Set());
  const ref = useRef<HTMLDivElement>(null);

  // 외부에서 value가 바뀌면 보는 달도 그 달로 맞춤(렌더 중 상태 조정 패턴)
  const [prevValue, setPrevValue] = useState(value);
  if (value !== prevValue) {
    setPrevValue(value);
    setView(value.slice(0, 7));
  }

  const [vy, vm] = view.split("-").map(Number);

  // 팝오버가 열려있을 때, 보는 달의 데이터-있는-날 조회(달 이동 시 갱신)
  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    const last = new Date(Date.UTC(vy, vm, 0)).getUTCDate();
    datesWithData(`${view}-01`, `${view}-${pad(last)}`).then((ds) => {
      if (!cancelled) setDataDays(new Set(ds));
    });
    return () => {
      cancelled = true;
    };
  }, [open, view, vy, vm]);

  // 바깥 클릭 / Esc 로 닫기
  useEffect(() => {
    if (!open) return;
    const onDown = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false);
    };
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", onDown);
    document.addEventListener("keydown", onKey);
    return () => {
      document.removeEventListener("mousedown", onDown);
      document.removeEventListener("keydown", onKey);
    };
  }, [open]);

  const today = todayKST();
  const firstDow = new Date(Date.UTC(vy, vm - 1, 1)).getUTCDay(); // 0=일
  const daysInMonth = new Date(Date.UTC(vy, vm, 0)).getUTCDate();
  const cells: (string | null)[] = [];
  for (let i = 0; i < firstDow; i++) cells.push(null);
  for (let d = 1; d <= daysInMonth; d++) cells.push(`${view}-${pad(d)}`);

  const shiftMonth = (delta: number) => {
    const d = new Date(Date.UTC(vy, vm - 1 + delta, 1));
    setView(`${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}`);
  };

  return (
    <div ref={ref} className="relative inline-block">
      <button
        type="button"
        disabled={disabled || locked}
        title={title}
        onClick={() => setOpen((o) => !o)}
        className={
          className ??
          (locked
            ? "flex items-center gap-1.5 rounded border border-slate-200 bg-slate-100 px-2 py-0.5 text-sm tabular-nums text-slate-500 cursor-not-allowed dark:border-neutral-700 dark:bg-neutral-800 dark:text-neutral-400"
            : "flex items-center gap-1.5 rounded border border-gray-300 px-2 py-0.5 text-sm tabular-nums hover:bg-gray-50 disabled:opacity-50 dark:border-neutral-600 dark:bg-neutral-900 dark:hover:bg-neutral-800")
        }
        aria-haspopup="dialog"
        aria-expanded={open}
      >
        <CalendarDays className="size-3.5 opacity-60" />
        {value}
      </button>

      {open && (
        <div
          role="dialog"
          className="absolute right-0 top-full z-50 mt-1 w-64 rounded-lg border border-slate-200 bg-white p-2 shadow-lg dark:border-neutral-700 dark:bg-neutral-900"
        >
          {/* 월 이동 헤더 */}
          <div className="mb-1.5 flex items-center justify-between">
            <button
              type="button"
              onClick={() => shiftMonth(-1)}
              className="rounded p-1 hover:bg-slate-100 dark:hover:bg-neutral-800"
              aria-label="이전 달"
            >
              <ChevronLeft className="size-4" />
            </button>
            <span className="text-sm font-semibold tabular-nums">
              {vy}년 {vm}월
            </span>
            <button
              type="button"
              onClick={() => shiftMonth(1)}
              className="rounded p-1 hover:bg-slate-100 dark:hover:bg-neutral-800"
              aria-label="다음 달"
            >
              <ChevronRight className="size-4" />
            </button>
          </div>

          {/* 요일 헤더 */}
          <div className="grid grid-cols-7 text-center text-[11px] text-slate-400 dark:text-neutral-500">
            {WD.map((w, i) => (
              <span
                key={w}
                className={
                  i === 0 ? "text-rose-400" : i === 6 ? "text-blue-400" : ""
                }
              >
                {w}
              </span>
            ))}
          </div>

          {/* 날짜 그리드 */}
          <div className="mt-0.5 grid grid-cols-7 gap-0.5">
            {cells.map((c, i) =>
              c === null ? (
                <span key={`b${i}`} />
              ) : (
                (() => {
                  const day = Number(c.slice(8));
                  const isSel = c === value;
                  const isToday = c === today;
                  const has = dataDays.has(c);
                  return (
                    <button
                      key={c}
                      type="button"
                      onClick={() => {
                        onChange?.(c);
                        setOpen(false);
                      }}
                      className={`relative flex h-8 flex-col items-center justify-center rounded text-xs tabular-nums transition-colors ${
                        isSel
                          ? "bg-[#4b3526] font-semibold text-white"
                          : has
                            ? "bg-emerald-50 font-semibold text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950/40 dark:text-emerald-300 dark:hover:bg-emerald-900/40"
                            : "hover:bg-slate-100 dark:hover:bg-neutral-800"
                      } ${isToday && !isSel ? "ring-1 ring-inset ring-slate-300 dark:ring-neutral-600" : ""}`}
                      title={has ? "데이터 있음" : undefined}
                    >
                      {day}
                      {has && (
                        <span
                          className={`absolute bottom-1 h-1 w-1 rounded-full ${
                            isSel ? "bg-white" : "bg-emerald-500"
                          }`}
                        />
                      )}
                    </button>
                  );
                })()
              ),
            )}
          </div>

          {/* 범례 */}
          <div className="mt-1.5 flex items-center gap-1 border-t border-slate-100 px-1 pt-1.5 text-[11px] text-slate-400 dark:border-neutral-800 dark:text-neutral-500">
            <span className="h-1.5 w-1.5 rounded-full bg-emerald-500" />
            데이터 있는 날
          </div>
        </div>
      )}
    </div>
  );
}
