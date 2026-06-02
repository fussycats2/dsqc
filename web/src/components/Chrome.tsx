"use client";

import { usePathname, useRouter } from "next/navigation";
import { Printer, FileSpreadsheet } from "lucide-react";
import { TabBar } from "@/components/TabBar";
import { DateToggle } from "@/components/DateToggle";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LogoutButton } from "@/components/LogoutButton";
import { SessionGuard } from "@/components/SessionGuard";
import { Button } from "@/components/ui/button";
import { Toaster } from "@/components/ui/sonner";
import type { Process } from "@/lib/types";

// 인쇄·결산서 — 상단 헤더(작업일↔테마 사이). 클릭 이동 + 호버 prefetch.
function HeaderNav() {
  const pathname = usePathname();
  const router = useRouter();
  const items = [
    { href: "/print", label: "인쇄", Icon: Printer, active: pathname.startsWith("/print") },
    { href: "/settlement", label: "결산서", Icon: FileSpreadsheet, active: pathname === "/settlement" },
  ];
  return (
    <nav className="flex items-center gap-1">
      {items.map(({ href, label, Icon, active }) => (
        <Button
          key={href}
          type="button"
          size="sm"
          variant={active ? "secondary" : "ghost"}
          onClick={() => router.push(href)}
          onMouseEnter={() => router.prefetch(href)}
          onFocus={() => router.prefetch(href)}
        >
          <Icon />
          {label}
        </Button>
      ))}
    </nav>
  );
}

// /login 에서는 헤더·탭바를 숨기고 본문만 렌더(로그인 화면 단독)
export function Chrome({ processes, children }: { processes: Process[]; children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/login") return <div className="flex-1">{children}</div>;

  return (
    <>
      <SessionGuard />
      <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-gray-300 bg-white px-4 py-2 print:hidden dark:border-neutral-700 dark:bg-neutral-900">
        <span className="text-sm font-bold">dsqc · 제조공정 관리</span>
        <div className="flex items-center gap-4">
          <DateToggle />
          <HeaderNav />
          <ThemeToggle />
          <LogoutButton />
        </div>
      </header>
      <div className="flex-1">{children}</div>
      <TabBar processes={processes} />
      <Toaster position="top-center" richColors closeButton duration={3200} />
    </>
  );
}
