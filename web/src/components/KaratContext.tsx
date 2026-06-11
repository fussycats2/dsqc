"use client";

import { createContext, useContext, useState } from "react";
import { usePathname } from "next/navigation";
import type { Process } from "@/lib/types";

export type Karat = "18K" | "14K";

const KaratContext = createContext<{ karat: Karat; setKarat: (k: Karat) => void } | null>(null);

// 하단탭의 18K/14K 선택을 우클릭 네비게이션과 공유하는 단일 출처.
export function KaratProvider({ processes, children }: { processes: Process[]; children: React.ReactNode }) {
  const pathname = usePathname();
  const activeProcess = processes.find((p) => pathname === `/process/${p.id}`);

  const [karat, setKarat] = useState<Karat>((activeProcess?.karat as Karat) ?? "18K");
  // 다른 공정으로 이동하면 karat을 그 공정에 맞춰 동기화 — 렌더 중 상태 조정 패턴(이동 시 1회).
  const [syncedId, setSyncedId] = useState(activeProcess?.id);
  if (activeProcess && activeProcess.schema_type !== "entry" && activeProcess.id !== syncedId) {
    setSyncedId(activeProcess.id);
    if (activeProcess.karat) setKarat(activeProcess.karat as Karat);
  }

  return <KaratContext.Provider value={{ karat, setKarat }}>{children}</KaratContext.Provider>;
}

export function useKarat() {
  const ctx = useContext(KaratContext);
  if (!ctx) throw new Error("useKarat은 KaratProvider 안에서만 사용할 수 있습니다");
  return ctx;
}
