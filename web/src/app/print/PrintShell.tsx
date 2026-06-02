"use client";

import Link from "next/link";
import { ArrowLeft, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";

// 인쇄 뷰 공용 셸 — 상단 툴바(인쇄 숨김) + 본문(인쇄 영역, 페이지 폭으로 제한)
export function PrintShell({
  title, workDate, groups, currentGroup, children,
}: {
  title: string;
  workDate: string;
  groups?: { key: string; label: string }[];
  currentGroup?: string;
  children: React.ReactNode;
}) {
  const is14 = title.includes("14K");
  return (
    <main className="p-6 print:p-0">
      <style dangerouslySetInnerHTML={{ __html: "@media print{@page{size:A4 portrait;margin:10mm 8mm}}" }} />
      {/* 툴바 (인쇄 시 숨김) */}
      <div className="mx-auto mb-3 flex max-w-[880px] flex-wrap items-center gap-2 print:hidden">
        <Button asChild size="sm" variant="outline">
          <Link href="/print"><ArrowLeft />인쇄 메뉴</Link>
        </Button>
        {groups && (
          <div className="flex flex-wrap gap-1">
            {groups.map((g) => (
              <Button key={g.key} asChild size="sm" variant={currentGroup === g.key ? "secondary" : "outline"}>
                <Link href={`/print/stock?group=${g.key}`}>{g.label}</Link>
              </Button>
            ))}
          </div>
        )}
        <Button size="sm" className="ml-auto bg-[#4b3526] text-white hover:bg-[#3a281c]" onClick={() => window.print()}>
          <Printer />인쇄
        </Button>
      </div>

      {/* 인쇄 영역 — A4 폭으로 제한·중앙정렬 (화면 프리뷰도 페이지처럼) */}
      <div className="mx-auto max-w-[880px] text-slate-900 dark:text-white">
        <div className="mb-2 flex items-baseline justify-between border-b-2 border-slate-600 pb-1">
          <h1 className={`text-base font-bold ${is14 ? "text-blue-600" : ""}`}>{title}</h1>
          <span className="text-[11px] text-slate-500">{workDate.replaceAll("-", "/")}</span>
        </div>
        {children}
      </div>
    </main>
  );
}
