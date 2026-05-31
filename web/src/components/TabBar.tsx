"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import type { Process } from "@/lib/types";

type Karat = "18K" | "14K";
type Group = "부서" | "공정" | "검수";
type Sub = "연마" | "빠우" | "뻥";

const GROUPS: Group[] = ["부서", "공정", "검수"];
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

const tabBase =
  "shrink-0 px-3 py-1.5 text-xs border-r border-gray-300 dark:border-neutral-700 whitespace-nowrap transition-colors";
const tabIdle =
  "bg-gray-100 hover:bg-gray-50 dark:bg-neutral-800 dark:hover:bg-neutral-700";
// 선택된 공정 탭: 파란 배경 + 흰 글씨로 확실히 강조
const tabActive = "bg-blue-600 text-white font-bold";

function Seg({
  items,
  value,
  onChange,
}: {
  items: { key: string; label: string }[];
  value: string;
  onChange: (k: string) => void;
}) {
  return (
    <div className="flex gap-1">
      {items.map((it) => (
        <button
          key={it.key}
          onClick={() => onChange(it.key)}
          className={`px-3 py-1 text-xs rounded font-medium transition-colors ${
            value === it.key
              ? "bg-blue-600 text-white"
              : `bg-gray-100 hover:bg-gray-200 dark:bg-neutral-800 dark:hover:bg-neutral-700 ${
                  it.key.includes("14K")
                    ? "text-blue-600 dark:text-blue-400"
                    : "text-gray-600 dark:text-neutral-300"
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

  const pill = (active: boolean) =>
    `rounded-md px-3 py-1 text-xs font-medium transition-colors ${
      active
        ? "bg-blue-600 text-white"
        : "bg-white text-gray-600 hover:bg-gray-100 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700"
    }`;

  return (
    <nav className="sticky bottom-0 z-20 border-t border-gray-300 bg-gray-200 print:hidden dark:border-neutral-700 dark:bg-neutral-900">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-gray-300 px-2 py-1 dark:border-neutral-700">
        <Link href="/" className={pill(pathname === "/")}>🏠 대시보드</Link>
        {entry && (
          <Link href={`/process/${entry.id}`} className={pill(pathname === `/process/${entry.id}`)}>✏️ 작성</Link>
        )}
        <span className="text-gray-300 dark:text-neutral-600">|</span>
        <Seg items={[{ key: "18K", label: "18K" }, { key: "14K", label: "14K" }]} value={karat} onChange={(k) => setKarat(k as Karat)} />
        <span className="text-gray-300 dark:text-neutral-600">|</span>
        <Seg items={GROUPS.map((g) => ({ key: g, label: g }))} value={group} onChange={(g) => setGroup(g as Group)} />
        {group === "공정" && (
          <>
            <span className="text-gray-300 dark:text-neutral-600">|</span>
            <Seg items={SUBS.map((s) => ({ key: s, label: s }))} value={sub} onChange={(s) => setSub(s as Sub)} />
          </>
        )}
      </div>

      <div className="flex overflow-x-auto min-h-[32px]">
        {tabs.length === 0 ? (
          <span className="px-3 py-1.5 text-xs text-gray-400 dark:text-neutral-500">
            해당 분류에 공정이 없습니다.
          </span>
        ) : (
          tabs.map((p) => {
            const active = pathname === `/process/${p.id}`;
            return (
              <Link
                key={p.id}
                href={`/process/${p.id}`}
                className={`${tabBase} ${
                  active
                    ? tabActive
                    : `${tabIdle} ${
                        p.karat === "14K"
                          ? "text-blue-600 dark:text-blue-400"
                          : "text-gray-700 dark:text-neutral-200"
                      }`
                }`}
              >
                {p.name}
              </Link>
            );
          })
        )}
      </div>
    </nav>
  );
}
