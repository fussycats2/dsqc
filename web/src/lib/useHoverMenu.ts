"use client";

import { useEffect, useRef, useState } from "react";

// 호버로 펼치는 드롭다운 묶음의 공용 상태 — 어느 메뉴가 열렸는지 key로 추적(한 번에 하나).
//  하단탭(TabBar)·공정 액션 툴바(ProcessView)·작성 전송 바(EntryGrid)가 공유 → 펼침 로직 단일화.
//  터치 기기엔 호버가 없으므로 호출부에서 pointerType === 'touch'를 걸러 기존 클릭(탭) 동작 유지.
export function useHoverMenu() {
  const [openKey, setOpenKey] = useState<string | null>(null);
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const cancelClose = () => {
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; }
  };
  const open = (key: string) => { cancelClose(); setOpenKey(key); };
  // 살짝 지연 후 닫기 — 버튼과 펼친 패널 사이 간극을 건너는 잠깐 동안 닫히지 않도록(유예 시간).
  const scheduleClose = () => {
    cancelClose();
    closeTimer.current = setTimeout(() => setOpenKey(null), 150);
  };
  useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current); }, []);
  return { openKey, setOpenKey, open, cancelClose, scheduleClose };
}

export type HoverMenu = ReturnType<typeof useHoverMenu>;
