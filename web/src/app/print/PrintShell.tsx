"use client";

import { useEffect } from "react";
import { ArrowLeft, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import { ClientLink } from "@/components/ClientLink";

// 인쇄 뷰 공용 셸 — 본문(인쇄 영역, 페이지 폭으로 제한).
//  · embed: 모달 iframe 임베드 모드 — 자체 툴바 숨김(모달이 인쇄/닫기 제공).
//  · autoPrint: 인쇄 팝업(?print=1) — 로드되면 window.print()(여백이 A4로 정확) 후 닫힘.
export function PrintShell({
  title, workDate, groups, currentGroup, embed, autoPrint, children,
}: {
  title: string;
  workDate: string;
  groups?: { key: string; label: string }[];
  currentGroup?: string;
  embed?: boolean;
  autoPrint?: boolean;
  children: React.ReactNode;
}) {
  // 인쇄 팝업: 레이아웃·폰트 안정 후 window.print(). 인쇄/취소(afterprint) 시 창 닫기.
  //  iframe.print()가 iframe 폭을 인쇄폭으로 써 짤리던 문제 → 단독 문서 window.print()로 A4 정확 재현.
  useEffect(() => {
    if (!autoPrint) return;
    const t = setTimeout(() => window.print(), 350);
    const close = () => window.close();
    window.addEventListener("afterprint", close);
    return () => { clearTimeout(t); window.removeEventListener("afterprint", close); };
  }, [autoPrint]);

  const is14 = title.includes("14K");
  return (
    <main className="p-6">
      {/* 인쇄 여백: 상하=@page(페이지마다), 좌우=콘텐츠 패딩(브라우저 '여백 없음'이어도 안 잘림).
          '기본'이면 상하10mm·좌우8mm로 기존과 동일, '여백 없음'이어도 좌우는 8mm 유지. */}
      <style dangerouslySetInnerHTML={{ __html: "@media print{@page{size:A4 portrait;margin:10mm 0}main{padding:0 8mm !important}}" }} />
      {/* 툴바 (인쇄 시 숨김 / 임베드 시 숨김 — 모달이 인쇄·닫기 제공). 링크는 클릭 이동(호버 경로 미노출). */}
      {!embed && (
        <div className="mx-auto mb-3 flex max-w-[880px] flex-wrap items-center gap-2 print:hidden">
          <ClientLink href="/print" className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2.5 py-1.5 text-xs hover:bg-slate-100 dark:border-neutral-600 dark:hover:bg-neutral-800">
            <ArrowLeft className="size-3.5" />인쇄 메뉴
          </ClientLink>
          {groups && (
            <div className="flex flex-wrap gap-1">
              {groups.map((g) => (
                <ClientLink key={g.key} href={`/print/stock?group=${g.key}`}
                  className={`rounded-md border px-2.5 py-1 text-xs ${currentGroup === g.key ? "border-transparent bg-slate-700 text-white" : "border-slate-300 hover:bg-slate-100 dark:border-neutral-600 dark:hover:bg-neutral-800"}`}>
                  {g.label}
                </ClientLink>
              ))}
            </div>
          )}
          <Button size="sm" className="ml-auto bg-[#4b3526] text-white hover:bg-[#3a281c]" onClick={() => window.print()}>
            <Printer />인쇄
          </Button>
        </div>
      )}

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
