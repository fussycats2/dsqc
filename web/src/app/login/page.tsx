"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

// 단일 사업장 공용 계정 1개 — 이메일은 고정(env)하고 비밀번호만 입력
const DEFAULT_EMAIL = process.env.NEXT_PUBLIC_LOGIN_EMAIL ?? "";

export default function LoginPage() {
  const [email, setEmail] = useState(DEFAULT_EMAIL);
  const [pw, setPw] = useState("");
  const [err, setErr] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setErr(null);
    setBusy(true);
    const supabase = createClient();
    const { error } = await supabase.auth.signInWithPassword({ email, password: pw });
    if (error) {
      setErr(error.message);
      setBusy(false);
      return;
    }
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

        <label className="block">
          <span className="text-xs text-slate-500 dark:text-neutral-400">이메일</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
            autoComplete="username"
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-[#7a5c43] dark:border-neutral-700 dark:bg-neutral-900" />
        </label>

        <label className="block">
          <span className="text-xs text-slate-500 dark:text-neutral-400">비밀번호</span>
          <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} required autoFocus
            autoComplete="current-password"
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-[#7a5c43] dark:border-neutral-700 dark:bg-neutral-900" />
        </label>

        {err && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-600 dark:bg-rose-950/40">{err}</p>}

        <button type="submit" disabled={busy}
          className="w-full rounded-lg bg-[#4b3526] px-3 py-2.5 text-sm font-medium text-white transition-colors hover:bg-[#3a281c] disabled:opacity-50">
          {busy ? "로그인 중…" : "로그인"}
        </button>
      </form>

      {/* 제작자 정보 (영문, 우하단) */}
      <div className="absolute bottom-4 right-5 text-right text-[10px] leading-relaxed text-slate-400 dark:text-neutral-600">
        <div>Created by <span className="font-semibold tracking-wide">chobr_</span></div>
        <div>Tel. 010-5248-9058</div>
        <div>Email. ds@deoksin.com</div>
      </div>
    </main>
  );
}
