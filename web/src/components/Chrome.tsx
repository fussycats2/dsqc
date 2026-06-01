"use client";

import { usePathname } from "next/navigation";
import { TabBar } from "@/components/TabBar";
import { DateToggle } from "@/components/DateToggle";
import { ThemeToggle } from "@/components/ThemeToggle";
import { LogoutButton } from "@/components/LogoutButton";
import type { Process } from "@/lib/types";

// /login 에서는 헤더·탭바를 숨기고 본문만 렌더(로그인 화면 단독)
export function Chrome({ processes, children }: { processes: Process[]; children: React.ReactNode }) {
  const pathname = usePathname();
  if (pathname === "/login") return <div className="flex-1">{children}</div>;

  return (
    <>
      <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-gray-300 bg-white px-4 py-2 print:hidden dark:border-neutral-700 dark:bg-neutral-900">
        <span className="text-sm font-bold">dsqc · 제조공정 관리</span>
        <div className="flex items-center gap-4">
          <DateToggle />
          <ThemeToggle />
          <LogoutButton />
        </div>
      </header>
      <div className="flex-1">{children}</div>
      <TabBar processes={processes} />
    </>
  );
}
