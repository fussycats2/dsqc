"use client";

import { useState } from "react";
import {
  Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { LATEST } from "@/lib/changelog";
import { EntryCard } from "./UpdateHistory";

// 공용 계정이라 '다시 보지 않기'는 서버가 아닌 기기(브라우저)별 저장으로 처리.
//  · SEEN_KEY(localStorage): 이 버전은 이 기기에서 영구적으로 안 띄움
//  · SHOWN_KEY(sessionStorage): 이번 세션(로그인)에서 이미 띄웠으면 재방문 시 안 띄움 — 닫을 때 기록
// 새 버전(LATEST.version)이 배포되면 키가 안 맞아 다시 안내된다.
const SEEN_KEY = "dsqc.update.seen";
const SHOWN_KEY = "dsqc.update.shown";

// 초기 표시 여부 — 서버에선 false, 클라이언트에선 저장값으로 판단(effect 없이 렌더 1회 결정)
function initialOpen(): boolean {
  if (typeof window === "undefined") return false;
  try {
    if (localStorage.getItem(SEEN_KEY) === LATEST.version) return false; // 영구 닫음
    if (sessionStorage.getItem(SHOWN_KEY) === LATEST.version) return false; // 이번 세션 이미 안내
    return true;
  } catch {
    return false; // 스토리지 사용 불가 시 안 띄움
  }
}

export function UpdateNotice() {
  const [open, setOpen] = useState(initialOpen);

  const close = () => {
    try { sessionStorage.setItem(SHOWN_KEY, LATEST.version); } catch { /* 무시 */ }
    setOpen(false);
  };
  const dontShowAgain = () => {
    try { localStorage.setItem(SEEN_KEY, LATEST.version); } catch { /* 무시 */ }
    close();
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o) close(); }}>
      <DialogContent className="max-h-[85vh] overflow-y-auto sm:max-w-[min(64rem,calc(100%-2rem))]">
        <DialogHeader>
          <DialogTitle>🆕 새로운 업데이트 안내</DialogTitle>
          <DialogDescription>
            최근 변경된 내용입니다. 전체 이력은 하단 탭의 ‘🆕 업데이트’에서 볼 수 있습니다.
          </DialogDescription>
        </DialogHeader>
        <EntryCard entry={LATEST} highlight />
        <DialogFooter>
          <Button variant="outline" onClick={close}>닫기</Button>
          <Button onClick={dontShowAgain} className="bg-[#4b3526] text-white hover:bg-[#3a281c]">
            다시 보지 않기
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
