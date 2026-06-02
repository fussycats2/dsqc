"use client";

import { useState } from "react";
import { ChevronDown, Info, Printer } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { PRINT_MENU, STOCK_GROUPS } from "@/lib/printSets";

const GROUP_OPTS = [
  { key: "all", label: "전체" },
  ...Object.entries(STOCK_GROUPS).map(([k, g]) => ({ key: k, label: g.label })),
];

// 인쇄 — 페이지 이동 없이 모달 안의 iframe으로 기존 인쇄뷰를 띄움(페이지나눔 정상, 닫기로 복귀).
export function PrintModal() {
  const [open, setOpen] = useState<{ kind: string; label: string } | null>(null);
  const [group, setGroup] = useState("all");

  const start = (kind: string, label: string) => { setGroup("all"); setOpen({ kind, label }); };
  const isStock = open?.kind === "stock";
  const src = open
    ? `/print/${open.kind}?embed=1${isStock ? `&group=${group}` : ""}`
    : "";

  // 실제 인쇄 = 단독 문서를 잠깐 팝업으로 열어 window.print()(여백이 A4로 정확) → 인쇄 후 자동 닫힘.
  //  (iframe.print()는 iframe 폭을 인쇄폭으로 써 상하좌우가 짤렸음)
  const doPrint = () => {
    if (!open) return;
    const url = `/print/${open.kind}?print=1${isStock ? `&group=${group}` : ""}`;
    window.open(url, "dsqc-print", "width=900,height=1000,menubar=no,toolbar=no");
  };

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="ghost">
            <Printer />인쇄<ChevronDown />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuLabel>인쇄 장부</DropdownMenuLabel>
          {PRINT_MENU.map((m) => (
            <DropdownMenuItem key={m.kind} onSelect={() => start(m.kind, m.label)}>
              {m.label}
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog open={!!open} onOpenChange={(o) => { if (!o) setOpen(null); }}>
        <DialogContent className="flex h-[92vh] flex-col gap-3 sm:max-w-[min(980px,96vw)]">
          <DialogHeader>
            <div className="flex items-center gap-2 pr-8">
              <DialogTitle>{open?.label} 장부 · 인쇄 미리보기</DialogTitle>
              {isStock && (
                <DropdownMenu>
                  <DropdownMenuTrigger asChild>
                    <Button size="sm" variant="outline">
                      {GROUP_OPTS.find((g) => g.key === group)?.label ?? "전체"}<ChevronDown />
                    </Button>
                  </DropdownMenuTrigger>
                  <DropdownMenuContent align="start">
                    <DropdownMenuLabel>재고 그룹</DropdownMenuLabel>
                    {GROUP_OPTS.map((g) => (
                      <DropdownMenuItem key={g.key} onSelect={() => setGroup(g.key)}>
                        {g.label}
                      </DropdownMenuItem>
                    ))}
                  </DropdownMenuContent>
                </DropdownMenu>
              )}
              <Button size="sm" className="ml-auto bg-[#4b3526] text-white hover:bg-[#3a281c]" onClick={doPrint}>
                <Printer />인쇄
              </Button>
            </div>
            <DialogDescription className="flex items-center gap-1.5 text-xs text-amber-700 dark:text-amber-400">
              <Info className="size-3.5 shrink-0" />
              인쇄 창에서 여백을 <b className="font-semibold">“기본”</b>으로 설정해야 정상 출력됩니다.
            </DialogDescription>
          </DialogHeader>
          {open && (
            <iframe
              src={src}
              title="인쇄 미리보기"
              className="min-h-0 w-full flex-1 rounded-md border border-slate-200 bg-white dark:border-neutral-700"
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
