"use client";

import Link from "next/link";

// 인쇄 뷰 공용 셸 — 상단 툴바(인쇄 숨김) + 본문(인쇄 영역)
export function PrintShell({
  title, workDate, groups, currentGroup, children,
}: {
  title: string;
  workDate: string;
  groups?: { key: string; label: string }[];
  currentGroup?: string;
  children: React.ReactNode;
}) {
  return (
    <main className="p-6 print:p-0">
      <style dangerouslySetInnerHTML={{ __html: "@media print{@page{size:A4 portrait;margin:10mm 8mm}}" }} />
      {/* 툴바 (인쇄 시 숨김) */}
      <div className="mb-3 flex flex-wrap items-center gap-2 print:hidden">
        <Link href="/print" className="rounded-md border border-slate-300 px-2.5 py-1.5 text-xs hover:bg-slate-100 dark:border-neutral-600 dark:hover:bg-neutral-800">← 인쇄 메뉴</Link>
        <h1 className="text-lg font-bold">{title} <span className="text-sm font-normal text-slate-400">{workDate.replaceAll("-", "/")}</span></h1>
        {groups && (
          <div className="flex flex-wrap gap-1">
            {groups.map((g) => (
              <Link key={g.key} href={`/print/stock?group=${g.key}`}
                className={`rounded-md border px-2.5 py-1 text-xs ${currentGroup === g.key ? "border-transparent bg-slate-700 text-white" : "border-slate-300 hover:bg-slate-100 dark:border-neutral-600 dark:hover:bg-neutral-800"}`}>
                {g.label}
              </Link>
            ))}
          </div>
        )}
        <button onClick={() => window.print()}
          className="ml-auto rounded-md bg-[#4b3526] px-4 py-1.5 text-xs font-medium text-white hover:bg-[#3a281c]">
          🖨 인쇄
        </button>
      </div>
      <div className="text-slate-900 dark:text-white">{children}</div>
    </main>
  );
}
