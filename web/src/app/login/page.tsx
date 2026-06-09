"use client";

import { useState, useSyncExternalStore } from "react";
import { Eye, EyeOff, Loader2 } from "lucide-react";
import { createClient } from "@/lib/supabase/client";
import { Button } from "@/components/ui/button";

// 단일 사업장 공용 계정 1개 — 이메일은 고정(env)하고 비밀번호만 입력
const DEFAULT_EMAIL = process.env.NEXT_PUBLIC_LOGIN_EMAIL ?? "";
// 빌드(배포) 시각·커밋 해시 — next.config.ts에서 빌드 순간 주입
const BUILD_TIME = process.env.NEXT_PUBLIC_BUILD_TIME ?? "";
const BUILD_SHA = process.env.NEXT_PUBLIC_BUILD_SHA ?? "";

// Supabase 인증 에러(영문) → 직원이 읽을 한글 안내로 매핑(원문 노출 방지)
function krLoginError(msg: string): string {
  const m = msg.toLowerCase();
  if (m.includes("invalid login credentials")) return "비밀번호가 올바르지 않습니다.";
  if (m.includes("email not confirmed")) return "계정 인증이 필요합니다. 관리자에게 문의하세요.";
  if (m.includes("rate limit") || m.includes("too many") || m.includes("for security purposes"))
    return "로그인 시도가 많습니다. 잠시 후 다시 시도해 주세요.";
  if (m.includes("failed to fetch") || m.includes("network")) return "네트워크 연결을 확인해 주세요.";
  return "로그인에 실패했습니다. 다시 시도해 주세요.";
}

export default function LoginPage() {
  const [pw, setPw] = useState("");
  const [showPw, setShowPw] = useState(false);
  const [caps, setCaps] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  // 유휴(5시간) 자동 로그아웃 복귀 안내 — URL 파라미터에서 1회 도출(effect 불필요, 변하지 않음)
  const notice = useSyncExternalStore(
    () => () => {},
    () => (new URLSearchParams(window.location.search).get("reason") === "timeout"
      ? "5시간 동안 활동이 없어 자동 로그아웃되었습니다. 다시 로그인해 주세요." : null),
    () => null,
  );

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    const supabase = createClient();
    // 이전 세션의 잔여 토큰(만료·무효)이 쿠키에 남아 있으면 첫 로그인 시도가 실패할 수 있어,
    //  로그인 직전에 로컬 세션을 비운다(scope:'local' = 이 브라우저만, 서버·다른 기기 세션엔 영향 없음).
    await supabase.auth.signOut({ scope: "local" });
    // 공용 계정 — 이메일은 고정값(DEFAULT_EMAIL), 비밀번호만 입력받는다
    const { error } = await supabase.auth.signInWithPassword({ email: DEFAULT_EMAIL, password: pw });
    if (error) {
      setErr(krLoginError(error.message));
      setBusy(false);
      return;
    }
    // 접속 시 작업일을 항상 오늘로 — 이전 세션에서 바꿔둔 작업일 쿠키 제거(없으면 서버가 오늘로 시작)
    document.cookie = "dsqc.workDate=; path=/; max-age=0";
    // 서버 컴포넌트가 새 세션 쿠키로 다시 렌더되도록 전체 새로고침
    window.location.assign("/");
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center bg-[#faf8f5] p-6 dark:bg-neutral-950">
      {/* 로그인 카드 */}
      <form onSubmit={submit}
        className="w-full max-w-sm space-y-4 rounded-2xl border border-[#e7ddd0] bg-white p-7 shadow-xl dark:border-neutral-800 dark:bg-neutral-900">
        {/* 상단 로고 */}
        <div aria-hidden
          className="mx-auto h-20 w-44 bg-contain bg-center bg-no-repeat dark:invert"
          style={{ backgroundImage: "url(/login-logo.png)" }} />

        <p className="text-center text-xs text-slate-400 dark:text-neutral-500">공용 계정으로 로그인</p>

        {notice && (
          <p role="alert" className="rounded-lg bg-amber-50 px-3 py-2 text-center text-xs text-amber-700 dark:bg-amber-950/40 dark:text-amber-400">
            {notice}
          </p>
        )}

        {/* 공용 계정(고정) — 표시 전용. 비밀번호만 입력받는다.
            autoComplete(브라우저 비번 저장)용 username은 hidden input으로 제공. */}
        {DEFAULT_EMAIL && (
          <div className="flex items-center justify-center gap-1.5 rounded-lg bg-slate-50 px-3 py-2 text-xs dark:bg-neutral-800">
            <span className="text-slate-400 dark:text-neutral-500">계정</span>
            <span className="font-medium text-slate-600 dark:text-neutral-300">{DEFAULT_EMAIL}</span>
          </div>
        )}
        <input type="email" value={DEFAULT_EMAIL} readOnly hidden autoComplete="username" />

        <label className="block">
          <span className="text-xs text-slate-500 dark:text-neutral-400">비밀번호</span>
          <div className="relative mt-1">
            <input type={showPw ? "text" : "password"} value={pw}
              onChange={(e) => setPw(e.target.value)} required autoFocus
              autoComplete="current-password"
              onKeyDown={(e) => setCaps(e.getModifierState("CapsLock"))}
              onKeyUp={(e) => setCaps(e.getModifierState("CapsLock"))}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 pr-10 text-sm outline-none focus:border-[#7a5c43] dark:border-neutral-700 dark:bg-neutral-900" />
            <button type="button" tabIndex={-1} onClick={() => setShowPw((v) => !v)}
              aria-label={showPw ? "비밀번호 숨기기" : "비밀번호 보기"}
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 transition-colors hover:text-slate-600 dark:hover:text-neutral-200">
              {showPw ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
            </button>
          </div>
        </label>

        {caps && (
          <p className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
            ⇪ Caps Lock이 켜져 있습니다.
          </p>
        )}

        {err && <p role="alert" className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-600 dark:bg-rose-950/40">{err}</p>}

        <Button type="submit" disabled={busy}
          className="w-full bg-[#4b3526] py-2.5 text-sm font-medium text-white hover:bg-[#3a281c]">
          {busy && <Loader2 className="animate-spin" />}
          {busy ? "로그인 중…" : "로그인"}
        </Button>
      </form>

      {/* 빌드(배포) 시각 — 좌하단 */}
      {BUILD_TIME && (
        <div className="absolute bottom-4 left-5 text-[10px] text-slate-400 dark:text-neutral-600">
          Build {BUILD_TIME} (KST){BUILD_SHA && <span className="ml-1 opacity-70">· {BUILD_SHA}</span>}
        </div>
      )}

      {/* 제작자 정보 (영문, 우하단) */}
      <div className="absolute bottom-4 right-5 text-right text-[10px] leading-relaxed text-slate-400 dark:text-neutral-600">
        <div>Created by <span className="font-semibold tracking-wide">chobr_</span></div>
        <div>Tel. 010-5248-9058</div>
        <div>Email. ds@deoksin.com</div>
      </div>
    </main>
  );
}
