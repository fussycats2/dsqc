"use client";

import { useTransition } from "react";
import { usePathname, useRouter } from "next/navigation";
import { FileSpreadsheet } from "lucide-react";
import { LoadingOverlay } from "@/components/LoadingOverlay";
import { TabBar } from "@/components/TabBar";
import { KaratProvider } from "@/components/KaratContext";
import { NavContextMenu } from "@/components/NavContextMenu";
import { DateToggle } from "@/components/DateToggle";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LogoutButton } from "@/components/LogoutButton";
import { SessionGuard } from "@/components/SessionGuard";
import { PrintModal } from "@/components/PrintModal";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
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

// /login·인쇄 surface(/print/*)에서는 헤더·탭바를 숨기고 본문만 렌더(인쇄 미리보기는 모달 iframe으로 임베드)
export function Chrome({ processes, children }: { processes: Process[]; children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/login" || pathname.startsWith("/print")) return <div className="flex-1">{children}</div>;

  return (
    <KaratProvider processes={processes}>
      <SessionGuard />
      {/* z-30: 본문 화면의 sticky 툴바(z-20)보다 위 — 헤더 작업일 달력 팝오버가 안 가리게 */}
      <header className="sticky top-0 z-30 flex items-center justify-between gap-3 border-b border-gray-300 bg-white px-4 py-2 print:hidden dark:border-neutral-700 dark:bg-neutral-900">
        <span className="text-sm font-bold">dsqc · 제조공정 관리</span>
        <div className="flex items-center gap-4">
          <DateToggle />
          <HeaderNav />
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
