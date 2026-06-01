"use client";

import { useEffect, useRef } from "react";

const IDLE_MS = 5 * 60 * 60 * 1000; // 5시간 무활동 시 로그아웃
const MAX_AGE = 60 * 60 * 24 * 30; // 쿠키 수명(초) — 만료 판정은 타임스탬프로만, 쿠키는 넉넉히
const THROTTLE_MS = 60 * 1000; // last_seen 갱신은 최대 1분에 한 번

// 마지막 활동 시각(last_seen)을 사용자 활동마다 갱신하고, 5시간 무활동 시 로그인 화면으로 보낸다.
// 서버(proxy)도 같은 쿠키를 매 요청마다 갱신·검사하므로, 한 화면에서 입력만 오래 해도(요청 없이도)
// 활동만 있으면 세션이 유지된다 = 작업 중에는 끊기지 않는다.
export function SessionGuard() {
  const last = useRef(0);

  useEffect(() => {
    const secure = location.protocol === "https:" ? "; secure" : "";
    const bump = () => {
      const now = Date.now();
      if (now - last.current < THROTTLE_MS) return; // 과도한 쓰기 방지
      last.current = now;
      document.cookie = `last_seen=${now}; path=/; max-age=${MAX_AGE}; samesite=lax${secure}`;
    };
    // 만료면 로그인으로 보내고 true 반환
    const check = () => {
      const m = document.cookie.match(/(?:^|; )last_seen=(\d+)/);
      const seen = m ? Number(m[1]) : 0;
      if (seen && Date.now() - seen > IDLE_MS) {
        window.location.assign("/login?reason=timeout");
        return true;
      }
      return false;
    };

    bump(); // 진입 시 1회 기록
    const events = ["mousemove", "keydown", "click", "scroll", "touchstart"];
    events.forEach((e) => window.addEventListener(e, bump, { passive: true }));
    // 백그라운드에서 돌아왔을 때: 먼저 만료 검사, 살아있으면 그때 활동 갱신
    const onVisible = () => {
      if (!document.hidden && !check()) bump();
    };
    document.addEventListener("visibilitychange", onVisible);
    const iv = setInterval(check, 60 * 1000); // 1분마다 무활동 검사

    return () => {
      events.forEach((e) => window.removeEventListener(e, bump));
      document.removeEventListener("visibilitychange", onVisible);
      clearInterval(iv);
    };
  }, []);

  return null;
}
