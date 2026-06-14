"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { BookOpen, Loader2, Printer, X } from "lucide-react";
import { Button } from "@/components/ui/button";

// 사용자 매뉴얼 뷰어 — public/manual.html(자체완결 인쇄용 단일 문서)을 앱 내 전체화면 iframe으로 띄운다.
//  새 탭을 열지 않고 앱 안에 머물며(탭 안 늘어남), 상단 [인쇄] 버튼이 iframe 문서만 콕 집어 인쇄한다
//  (페이지에서 그냥 Ctrl+P를 누르면 매뉴얼이 아니라 앱 화면이 인쇄되는 문제를 피함). [닫기]·Esc·뒤로가기로 복귀.
//  Chrome.tsx가 /manual 경로에선 헤더·탭바를 숨겨 본문만 풀스크린으로 렌더한다. (예전엔 새 탭 방식이었음)
export default function ManualPage() {
  const router = useRouter();
  const iframeRef = useRef<HTMLIFrameElement>(null);
  const [loaded, setLoaded] = useState(false);

  const close = () => router.back();
  const print = () => iframeRef.current?.contentWindow?.print();

  // Esc로 닫기(모달처럼). 부모 창에 포커스가 있을 때 동작 — iframe 안에 포커스가 들어간 경우는
  //  같은 출처(/manual.html)라 onLoad에서 iframe 문서에도 같은 핸들러를 달아 어느 쪽이든 닫히게 한다.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === "Escape") router.back(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [router]);

  const onLoad = () => {
    setLoaded(true);
    iframeRef.current?.contentWindow?.addEventListener("keydown", (e) => {
      if (e.key === "Escape") router.back();
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-white dark:bg-neutral-950">
      {/* 얇은 상단바 — 제목 + 인쇄/닫기. 본문(iframe)이 나머지 영역을 모두 채움 */}
      <div className="flex shrink-0 items-center justify-between gap-3 border-b border-slate-200 bg-white px-4 py-2 dark:border-neutral-800 dark:bg-neutral-900">
        <span className="flex items-center gap-1.5 text-sm font-bold text-slate-800 dark:text-neutral-100">
          <BookOpen aria-hidden className="size-4 text-slate-400" />사용자 매뉴얼
        </span>
        <div className="flex items-center gap-2">
          <Button type="button" size="sm" onClick={print}>
            <Printer aria-hidden />인쇄
          </Button>
          <Button type="button" size="sm" variant="outline" onClick={close}>
            <X aria-hidden />닫기
          </Button>
        </div>
      </div>
      <div className="relative min-h-0 flex-1">
        {!loaded && (
          <div className="absolute inset-0 flex items-center justify-center text-slate-400">
            <Loader2 aria-hidden className="size-6 animate-spin" />
          </div>
        )}
        <iframe
          ref={iframeRef}
          src="/manual.html"
          title="사용자 매뉴얼"
          onLoad={onLoad}
          className="size-full border-0"
        />
      </div>
    </div>
  );
}
