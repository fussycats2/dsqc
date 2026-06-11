"use client";

// 18K/14K 세그먼트 토글 — TabBar와 우클릭 네비게이션(NavContextMenu)이 공유.
export function Seg({
  items, value, onChange, activeBg,
}: {
  items: { key: string; label: string }[];
  value: string;
  onChange: (k: string) => void;
  activeBg: string;
}) {
  return (
    <div className="flex gap-1">
      {items.map((it) => (
        <button
          key={it.key}
          onClick={() => onChange(it.key)}
          className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors ${
            value === it.key
              ? `${activeBg} border-transparent text-white`
              : `bg-white hover:bg-slate-100 dark:bg-neutral-800 dark:hover:bg-neutral-700 ${
                  it.key === "18K"
                    ? "border-rose-300 text-rose-600 dark:border-rose-700 dark:text-rose-400"
                    : "border-blue-300 text-blue-600 dark:border-blue-700 dark:text-blue-400"
                }`
          }`}
        >
          {it.label}
        </button>
      ))}
    </div>
  );
}
