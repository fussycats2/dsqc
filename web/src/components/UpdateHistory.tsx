"use client";

import { useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { CHANGELOG, type ChangelogEntry } from "@/lib/changelog";

// 빌드(배포) 시각·커밋 해시 — next.config.ts에서 주입(로그인 화면과 동일 소스)
const BUILD_TIME = process.env.NEXT_PUBLIC_BUILD_TIME ?? "";
const BUILD_SHA = process.env.NEXT_PUBLIC_BUILD_SHA ?? "";

// 변경로그 한 항목 카드 — 이력 모달·로그인 안내([[UpdateNotice]])가 공용으로 사용
export function EntryCard({ entry, highlight }: { entry: ChangelogEntry; highlight?: boolean }) {
  return (
    <section className={`rounded-xl border p-3 ${
      highlight
        ? "border-blue-300 bg-blue-50/50 dark:border-blue-800 dark:bg-blue-950/30"
        : "border-slate-200 dark:border-neutral-800"}`}>
      <header className="flex items-center gap-2">
        <span className="rounded-full bg-slate-800 px-2 py-0.5 text-xs font-bold text-white dark:bg-slate-600">{entry.version}</span>
        <span className="text-xs tabular-nums text-slate-400">{entry.date}</span>
        {highlight && <span className="rounded-full bg-blue-600 px-2 py-0.5 text-[10px] font-medium text-white">최신</span>}
      </header>
      <h3 className="mt-1.5 text-sm font-semibold">{entry.title}</h3>
      <ul className="mt-1.5 space-y-1">
        {entry.items.map((it, i) => (
          <li key={i} className="flex gap-1.5 text-xs leading-relaxed text-slate-600 dark:text-neutral-300">
            <span className="mt-1.5 inline-block h-1 w-1 shrink-0 rounded-full bg-slate-300 dark:bg-neutral-600" />
            <span>{it}</span>
          </li>
        ))}
      </ul>
    </section>
  );
}

// 하단 탭 오른쪽 버튼 + 전체 이력 모달(최신이 위, 과거가 아래)
export function UpdateHistory() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}
        className="shrink-0 rounded-md border border-gray-300 bg-white px-2.5 py-1 text-xs font-medium text-gray-600 transition-colors hover:bg-gray-100 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700">
        🆕 업데이트
      </button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-[min(64rem,calc(100%-2rem))]">
          <DialogHeader>
            <DialogTitle>📋 업데이트 이력</DialogTitle>
            <DialogDescription>
              {BUILD_TIME
                ? `현재 배포 ${BUILD_TIME} (KST)${BUILD_SHA ? ` · ${BUILD_SHA}` : ""}`
                : "앱 변경 내역 — 최근이 위, 과거가 아래"}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-2.5">
            {CHANGELOG.map((e, i) => <EntryCard key={e.version} entry={e} highlight={i === 0} />)}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
}
