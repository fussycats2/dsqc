"use client";

import { useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { FileSpreadsheet } from "lucide-react";
import { LoadingOverlay } from "@/components/LoadingOverlay";
import { TabBar } from "@/components/TabBar";
import { KaratProvider } from "@/components/KaratContext";
import { NavContextMenu } from "@/components/NavContextMenu";
import { DateToggle } from "@/components/DateToggle";
import { FontSizeToggle } from "@/components/FontSizeToggle";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LogoutButton } from "@/components/LogoutButton";
import { SessionGuard } from "@/components/SessionGuard";
import { PrintModal } from "@/components/PrintModal";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import { LiquidGlassFilter, LIQUID_GLASS, glassStyle } from "@/components/LiquidGlass";
import type { Process } from "@/lib/types";

// 인쇄(모달)·결산서 — 상단 헤더(작업일↔테마 사이).
function HeaderNav() {
  const pathname = usePathname();
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <nav className="flex items-center gap-1">
      <PrintModal />
      <Button
        type="button"
        size="sm"
        variant={pathname === "/settlement" ? "secondary" : "ghost"}
        onClick={() => start(() => router.push("/settlement"))}
        onMouseEnter={() => router.prefetch("/settlement")}
        onFocus={() => router.prefetch("/settlement")}
      >
        <FileSpreadsheet />결산서
      </Button>
      <LoadingOverlay show={pending} />
    </nav>
  );
}

// /login·인쇄 surface(/print/*)·매뉴얼 뷰어(/manual)에서는 헤더·탭바를 숨기고 본문만 풀스크린으로 렌더
//  (매뉴얼은 자체 상단바로 인쇄/닫기를 제공 — manual/page.tsx)
export function Chrome({ processes, children }: { processes: Process[]; children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/login" || pathname === "/manual" || pathname.startsWith("/print")) return <div className="flex-1">{children}</div>;

  // 헤더도 글래스 표면으로 — 본문이 위로 스크롤돼 들어올 때 유리 너머처럼 비침(LIQUID_GLASS 토글).
  const headerClass = LIQUID_GLASS
    ? "sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-white/40 bg-white/55 px-4 py-2 shadow-[inset_0_-1px_0_rgba(255,255,255,0.5)] print:hidden dark:border-white/10 dark:bg-neutral-900/45"
    : "sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-2 print:hidden dark:border-neutral-700 dark:bg-neutral-900";

  return (
    <KaratProvider processes={processes}>
      <SessionGuard />
      <LiquidGlassFilter />
      {/* z-30: 본문 화면의 sticky 툴바(z-20)보다 위 — 헤더 작업일 달력 팝오버가 안 가리게 */}
      <header className={headerClass} style={glassStyle()}>
        <span className="text-sm font-bold">dsqc · 제조공정 관리</span>
        <div className="flex items-center gap-4">
          <DateToggle />
          <HeaderNav />
          <FontSizeToggle />
          <ThemeToggle />
          <LogoutButton />
        </div>
      </header>
      {/* 본문 우클릭 → 네비게이션 메뉴(flex-1 래퍼는 NavContextMenu가 렌더) */}
      <NavContextMenu processes={processes}>{children}</NavContextMenu>
      <TabBar processes={processes} />
      <Toaster position="top-center" richColors closeButton duration={3200} />
    </KaratProvider>
  );
}
