"use client";

import { useState } from "react";
import { createClient } from "@/lib/supabase/client";

export function LogoutButton() {
  const [busy, setBusy] = useState(false);
  const logout = async () => {
    setBusy(true);
    await createClient().auth.signOut();
    window.location.assign("/login");
  };
  return (
    <button onClick={logout} disabled={busy}
      className="rounded-md border border-slate-300 px-2 py-1 text-xs text-slate-600 hover:bg-slate-100 disabled:opacity-50 dark:border-neutral-700 dark:text-neutral-300 dark:hover:bg-neutral-800">
      로그아웃
    </button>
  );
}
