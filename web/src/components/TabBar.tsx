"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { Process } from "@/lib/types";

type Karat = "18K" | "14K";
type Group = "부서" | "공정" | "검수";
type Sub = "연마" | "빠우" | "뻥";

// 공정은 별도 토글 없이 연마/빠우/뻥을 항상 노출(한 번 클릭으로 공정+서브 선택)
const GROUPS: Group[] = ["부서", "검수"];
const SUBS: Sub[] = ["연마", "빠우", "뻥"];

function groupOf(p: Process): Group {
  if (p.is_inspection) return "검수";
  if (p.schema_type === "work") return "공정";
  return "부서";
}
function subOf(p: Process): Sub | null {
  for (const s of SUBS) if (p.category.includes(s)) return s;
  return null;
}

// 둥근 칩 스타일 + 상단 2px 라인(활성 표시용, idle은 투명)
const tabBase =
  "shrink-0 rounded-md border-t-2 border-transparent px-3 py-1.5 text-xs whitespace-nowrap transition-colors";
const tabIdle =
  "bg-gray-100 hover:bg-gray-200 dark:bg-neutral-800 dark:hover:bg-neutral-700";

function Seg({
  items,
  value,
  onChange,
  activeBg,
}: {
  items: { key: string; label: string }[];
  value: string;
  onChange: (k: string) => void;
  activeBg: string; // karat에 따른 활성 배경(18K=빨강 / 14K=파랑)
}) {
  return (
    <div className="flex gap-1">
      {items.map((it) => (
        <button
          key={it.key}
          onClick={() => onChange(it.key)}
          className={`rounded border px-3 py-1 text-xs font-medium transition-colors ${
            value === it.key
              ? `${activeBg} border-transparent text-white`
              : `bg-gray-100 hover:bg-gray-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 ${
                  it.key === "18K"
                    ? "border-rose-300 text-rose-600 dark:border-rose-700 dark:text-rose-400"
                    : it.key.includes("14K")
                      ? "border-blue-300 text-blue-600 dark:border-blue-700 dark:text-blue-400"
                      : "border-transparent text-gray-600 dark:text-neutral-300"
                }`
          }`}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}

export function TabBar({ processes }: { processes: Process[] }) {
  const pathname = usePathname();
  const router = useRouter();
  // <a href> 대신 클릭 이동 → 호버 시 브라우저 상태바에 URL(경로) 노출 안 됨
  const go = (href: string) => router.push(href);
  const entry = processes.find((p) => p.schema_type === "entry");
  const activeProcess = processes.find((p) => pathname === `/process/${p.id}`);

  const [karat, setKarat] = useState<Karat>(
    (activeProcess?.karat as Karat) ?? "18K",
  );
  const [group, setGroup] = useState<Group>(
    activeProcess ? groupOf(activeProcess) : "부서",
  );
  const [sub, setSub] = useState<Sub>(
    (activeProcess && subOf(activeProcess)) || "빠우",
  );

  useEffect(() => {
    if (!activeProcess || activeProcess.schema_type === "entry") return;
    if (activeProcess.karat) setKarat(activeProcess.karat as Karat);
    setGroup(groupOf(activeProcess));
    const s = subOf(activeProcess);
    if (s) setSub(s);
  }, [activeProcess]);

  const tabs = useMemo(() => {
    return processes.filter((p) => {
      if (p.schema_type === "entry") return false;
      if (p.karat !== karat) return false;
      if (groupOf(p) !== group) return false;
      if (group === "공정" && subOf(p) !== sub) return false;
      return true;
    });
  }, [processes, karat, group, sub]);

  // 선택 강조색을 karat에 따라 이중화: 18K=빨강 / 14K=파랑
  const accentBg = karat === "18K" ? "bg-rose-600" : "bg-blue-600";

  // 대시보드/작성은 karat 강조색과 무관한 단독 중립색(진회색)으로 — karat 오해 방지
  const pill = (active: boolean) =>
    `rounded-md px-3 py-1 text-xs font-medium transition-colors ${
      active
        ? "bg-slate-700 text-white dark:bg-slate-600"
        : "bg-white text-gray-600 hover:bg-gray-100 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700"
    }`;

  return (
    <nav className="sticky bottom-0 z-20 border-t border-gray-300 bg-gray-200 shadow-[0_-1px_3px_rgba(0,0,0,0.06)] print:hidden dark:border-neutral-700 dark:bg-neutral-900">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-gray-300 px-2 py-1 dark:border-neutral-700">
        <button type="button" onClick={() => go("/")} className={pill(pathname === "/")}>🏠 대시보드</button>
        {entry && (
          <button type="button" onClick={() => go(`/process/${entry.id}`)} className={pill(pathname === `/process/${entry.id}`)}>✏️ 작성</button>
        )}
        <span className="text-gray-300 dark:text-neutral-600">|</span>
        <Seg items={[{ key: "18K", label: "18K" }, { key: "14K", label: "14K" }]} value={karat} onChange={(k) => setKarat(k as Karat)} activeBg={accentBg} />
        <span className="text-gray-300 dark:text-neutral-600">|</span>
        <Seg items={GROUPS.map((g) => ({ key: g, label: g }))} value={group === "공정" ? "" : group} onChange={(g) => setGroup(g as Group)} activeBg={accentBg} />
        <span className="text-gray-300 dark:text-neutral-600">|</span>
        <span className="text-xs font-medium text-gray-500 dark:text-neutral-400">공정</span>
        <Seg items={SUBS.map((s) => ({ key: s, label: s }))} value={group === "공정" ? sub : ""}
          onChange={(s) => { setGroup("공정"); setSub(s as Sub); }} activeBg={accentBg} />
        {/* 현재 위치 경로 — 같은 줄 맨 오른쪽 */}
        <div className="ml-auto flex items-center gap-1 text-[11px] text-gray-500 dark:text-neutral-400">
          <span className={`font-semibold ${karat === "18K" ? "text-rose-600 dark:text-rose-400" : "text-blue-600 dark:text-blue-400"}`}>{karat}</span>
          <span className="text-gray-300 dark:text-neutral-600">›</span>
          <span>{group}</span>
          {group === "공정" && (
            <><span className="text-gray-300 dark:text-neutral-600">›</span><span>{sub}</span></>
          )}
          {activeProcess && activeProcess.schema_type !== "entry" && (
            <><span className="text-gray-300 dark:text-neutral-600">›</span>
            <span className="font-medium text-gray-700 dark:text-neutral-200">{activeProcess.name}</span></>
          )}
        </div>
      </div>

      <div className="flex min-h-[36px] gap-1 overflow-x-auto px-2 py-1.5">
        {tabs.length === 0 ? (
          <span className="px-3 py-1.5 text-xs text-gray-400 dark:text-neutral-500">
            해당 분류에 공정이 없습니다.
          </span>
        ) : (
          tabs.map((p) => {
            const active = pathname === `/process/${p.id}`;
            return (
              <button
                type="button"
                key={p.id}
                onClick={() => go(`/process/${p.id}`)}
                className={`${tabBase} ${
                  active
                    ? `${accentBg} border-t-white/80 font-bold text-white`
                    : `${tabIdle} ${
                        p.karat === "14K"
                          ? "text-blue-600 dark:text-blue-400"
                          : "text-gray-700 dark:text-neutral-200"
                      }`
                }`}
              >
                {p.name}
              </button>
            );
          })
        )}
      </div>
    </nav>
  );
}
