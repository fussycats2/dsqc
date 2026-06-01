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
    <main className="flex min-h-[calc(100vh-49px)] items-center justify-center p-6">
      <form onSubmit={submit}
        className="w-full max-w-sm space-y-4 rounded-2xl border border-slate-200 bg-white p-6 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
        <div>
          <h1 className="text-lg font-bold">dsqc · 제조공정 관리</h1>
          <p className="mt-0.5 text-xs text-slate-400 dark:text-neutral-500">공용 계정으로 로그인</p>
        </div>

        <label className="block">
          <span className="text-xs text-slate-500 dark:text-neutral-400">이메일</span>
          <input type="email" value={email} onChange={(e) => setEmail(e.target.value)} required
            autoComplete="username"
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-neutral-700 dark:bg-neutral-900" />
        </label>

        <label className="block">
          <span className="text-xs text-slate-500 dark:text-neutral-400">비밀번호</span>
          <input type="password" value={pw} onChange={(e) => setPw(e.target.value)} required autoFocus
            autoComplete="current-password"
            className="mt-1 w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm outline-none focus:border-blue-500 dark:border-neutral-700 dark:bg-neutral-900" />
        </label>

        {err && <p className="rounded-lg bg-rose-50 px-3 py-2 text-xs text-rose-600 dark:bg-rose-950/40">{err}</p>}

        <button type="submit" disabled={busy}
          className="w-full rounded-lg bg-blue-600 px-3 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50">
          {busy ? "로그인 중…" : "로그인"}
        </button>
      </form>
    </main>
  );
}
