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
  if (m.includes("invalid login credentials"))
    return "비밀번호가 올바르지 않습니다.";
  if (m.includes("email not confirmed"))
    return "계정 인증이 필요합니다. 관리자에게 문의하세요.";
  if (
    m.includes("rate limit") ||
    m.includes("too many") ||
    m.includes("for security purposes")
  )
    return "로그인 시도가 많습니다. 잠시 후 다시 시도해 주세요.";
  if (m.includes("failed to fetch") || m.includes("network"))
    return "네트워크 연결을 확인해 주세요.";
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
    () =>
      new URLSearchParams(window.location.search).get("reason") === "timeout"
        ? "5시간 동안 활동이 없어 자동 로그아웃되었습니다. 다시 로그인해 주세요."
        : null,
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
    const { error } = await supabase.auth.signInWithPassword({
      email: DEFAULT_EMAIL,
      password: pw,
    });
    if (error) {
      setErr(krLoginError(error.message));
      setBusy(false);
      return;
    }
    // 유휴 판정 기준(last_seen)을 로그인 시각으로 초기화.
    //  컴퓨터를 오래 꺼뒀다 켜면 인증 쿠키는 사라져도 last_seen(30일)은 옛 값으로 남는데,
    //  그 상태로 로그인하면 직후 첫 요청에서 proxy가 '5시간 무활동'으로 오인해 방금 만든
    //  세션을 지워버려 두 번 로그인해야 했다 — 로그인 성공 = 활동 시작으로 기록.
    const secure = location.protocol === "https:" ? "; secure" : "";
    document.cookie = `last_seen=${Date.now()}; path=/; max-age=${60 * 60 * 24 * 30}; samesite=lax${secure}`;
    // 접속 시 작업일을 항상 오늘로 — 이전 세션에서 바꿔둔 작업일 쿠키 제거(없으면 서버가 오늘로 시작)
    document.cookie = "dsqc.workDate=; path=/; max-age=0";
    // 서버 컴포넌트가 새 세션 쿠키로 다시 렌더되도록 전체 새로고침
    window.location.assign("/");
  };

  return (
    <main className="relative flex min-h-screen items-center justify-center overflow-hidden bg-gradient-to-br from-[#faf8f5] via-[#f6f1e9] to-[#efe6d8] p-6 dark:from-neutral-950 dark:via-neutral-950 dark:to-[#1a140e]">
      {/* 배경 장식 — 귀금속 느낌의 은은한 금빛·브랜드 블롭(클릭 통과, 장식 전용) */}
      <div aria-hidden className="pointer-events-none absolute inset-0">
        <div className="absolute -left-32 -top-32 size-96 rounded-full bg-amber-200/50 blur-3xl dark:bg-amber-500/10" />
        <div className="absolute -bottom-40 -right-28 size-[30rem] rounded-full bg-[#7a5c43]/25 blur-3xl dark:bg-[#7a5c43]/20" />
        <div className="absolute left-1/2 top-1/4 size-80 -translate-x-1/2 rounded-full bg-rose-100/60 blur-3xl dark:bg-rose-500/5" />
      </div>

      {/* 로그인 카드 — 반투명+블러, 부드러운 등장 */}
      <form
        onSubmit={submit}
        className="relative w-full max-w-sm space-y-4 rounded-3xl border border-white/70 bg-white/80 p-8 shadow-2xl shadow-amber-900/15 backdrop-blur-xl duration-500 animate-in fade-in-0 slide-in-from-bottom-3 dark:border-neutral-800 dark:bg-neutral-900/85 dark:shadow-black/50"
      >
        {/* 골드 포인트 라인 + 상단 로고 */}
        <div
          aria-hidden
          className="mx-auto h-1 w-16 rounded-full bg-gradient-to-r from-amber-300 via-yellow-500 to-amber-600"
        />
        <div
          aria-hidden
          className="mx-auto h-20 w-44 bg-contain bg-center bg-no-repeat dark:invert"
          style={{ backgroundImage: "url(/login-logo.png)" }}
        />

        <div className="space-y-0.5 text-center">
          <p className="text-sm font-semibold tracking-wide text-[#4b3526] dark:text-neutral-200">
            제조공정 관리 시스템
          </p>
          <p className="text-xs text-slate-400 dark:text-neutral-500">
            공용 계정으로 로그인
          </p>
        </div>

        {notice && (
          <p
            role="alert"
            className="rounded-xl bg-amber-50 px-3 py-2 text-center text-xs text-amber-700 dark:bg-amber-950/40 dark:text-amber-400"
          >
            {notice}
          </p>
        )}

        {/* 공용 계정(고정) — 표시 전용. 비밀번호만 입력받는다.
            autoComplete(브라우저 비번 저장)용 username은 hidden input으로 제공. */}
        {DEFAULT_EMAIL && (
          <div className="mx-auto flex w-fit items-center gap-1.5 rounded-full bg-slate-100/80 px-4 py-1.5 text-xs ring-1 ring-slate-200/80 dark:bg-neutral-800 dark:ring-neutral-700">
            <span className="text-slate-400 dark:text-neutral-500">계정</span>
            <span className="font-medium text-slate-600 dark:text-neutral-300">
              {DEFAULT_EMAIL}
            </span>
          </div>
        )}
        <input
          type="email"
          value={DEFAULT_EMAIL}
          readOnly
          hidden
          autoComplete="username"
        />

        <label className="block">
          <span className="text-xs font-medium text-slate-500 dark:text-neutral-400">
            비밀번호
          </span>
          <div className="relative mt-1.5">
            <input
              type={showPw ? "text" : "password"}
              value={pw}
              onChange={(e) => setPw(e.target.value)}
              required
              autoFocus
              autoComplete="current-password"
              onKeyDown={(e) => setCaps(e.getModifierState("CapsLock"))}
              onKeyUp={(e) => setCaps(e.getModifierState("CapsLock"))}
              className="w-full rounded-xl border border-slate-300 bg-white/90 px-3.5 py-2.5 pr-10 text-sm outline-none transition-shadow focus:border-[#7a5c43] focus:ring-2 focus:ring-[#7a5c43]/20 dark:border-neutral-700 dark:bg-neutral-900 dark:focus:ring-[#7a5c43]/40"
            />
            <button
              type="button"
              tabIndex={-1}
              onClick={() => setShowPw((v) => !v)}
              aria-label={showPw ? "비밀번호 숨기기" : "비밀번호 보기"}
              className="absolute right-2.5 top-1/2 -translate-y-1/2 rounded p-1 text-slate-400 transition-colors hover:text-slate-600 dark:hover:text-neutral-200"
            >
              {showPw ? (
                <EyeOff className="size-4" />
              ) : (
                <Eye className="size-4" />
              )}
            </button>
          </div>
        </label>

        {caps && (
          <p className="flex items-center gap-1 text-xs text-amber-600 dark:text-amber-400">
            ⇪ Caps Lock이 켜져 있습니다.
          </p>
        )}

        {err && (
          <p
            role="alert"
            className="rounded-xl bg-rose-50 px-3 py-2 text-xs text-rose-600 dark:bg-rose-950/40"
          >
            {err}
          </p>
        )}

        <Button
          type="submit"
          disabled={busy}
          className="h-11 w-full rounded-xl bg-gradient-to-b from-[#5d4332] to-[#3a281c] text-sm font-semibold text-white shadow-md shadow-amber-900/20 transition-all hover:brightness-110 active:scale-[0.99]"
        >
          {busy && <Loader2 className="animate-spin" />}
          {busy ? "로그인 중…" : "로그인"}
        </Button>
      </form>

      {/* 좌하단 — 제작자·빌드 정보를 한 카드로 통합(좌측 정렬).
          우하단은 어두운 브라운 블롭 위라 밝은 유리 카드가 떠 보여 배경이 밝은 좌측에만 둔다. */}
      <div className="absolute bottom-4 left-5 rounded-xl bg-white/60 px-3.5 py-2 text-[11px] leading-relaxed text-slate-500 shadow-sm ring-1 ring-white/70 backdrop-blur-md dark:bg-neutral-900/70 dark:text-neutral-400 dark:ring-neutral-800">
        <div>
          Created by{" "}
          <span className="font-semibold tracking-wide text-[#7a5c43] dark:text-amber-300/90">
            ChoBR_
          </span>
        </div>
        <div className="opacity-80">Tel. 010-5248-9058 · ds@deoksin.com</div>
        {BUILD_TIME && (
          <div className="mt-1 border-t border-slate-300/50 pt-1 text-[10px] opacity-80 dark:border-neutral-700/70">
            Build {BUILD_TIME} <span className="opacity-70">(KST)</span>
            {BUILD_SHA && (
              <span className="ml-1 opacity-70">· {BUILD_SHA}</span>
            )}
          </div>
        )}
      </div>
    </main>
  );
}
