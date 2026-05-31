"use client";

import { useMemo, useState, useTransition } from "react";
import type { ColDef, Process } from "@/lib/types";
import { TAG_PER_GRAM } from "@/lib/types";
import { NumberInput } from "@/components/NumberInput";
import { sendRows, type EntryRow } from "./actions";

const FIELDS: (keyof EntryRow)[] = [
  "description",
  "qty",
  "weight",
  "tag",
  "q",
  "due_date",
  "raw_weight",
  "note",
];

function tagCheck(qty?: string, tag?: string): "" | "OK" | "NG" {
  if (!qty || tag === undefined || tag === "") return "";
  const expect = Math.floor(Number(qty) * TAG_PER_GRAM * 100) / 100;
  return expect === Number(tag) ? "OK" : "NG";
}

const blank = (): EntryRow => ({});

export function EntryGrid({
  sourceProcessId,
  cols,
  targets,
}: {
  sourceProcessId: string;
  cols: ColDef[];
  targets: Process[];
}) {
  const [rows, setRows] = useState<EntryRow[]>(() =>
    Array.from({ length: 8 }, blank),
  );
  const [targetId, setTargetId] = useState<string>(targets[0]?.id ?? "");
  const [pending, start] = useTransition();
  const [msg, setMsg] = useState<string | null>(null);

  const filled = useMemo(
    () =>
      rows.filter((r) => r.description?.trim() || r.qty || r.weight || r.tag)
        .length,
    [rows],
  );

  const update = (i: number, key: keyof EntryRow, v: string) =>
    setRows((prev) => {
      const next = [...prev];
      next[i] = { ...next[i], [key]: v };
      return next;
    });

  const submit = () => {
    if (!targetId) return setMsg("대상 공정을 선택하세요.");
    start(async () => {
      const res = await sendRows(sourceProcessId, targetId, rows);
      if (res?.error) setMsg("오류: " + res.error);
      else {
        const name = targets.find((t) => t.id === targetId)?.name;
        setMsg(`${name}(으)로 ${res?.sent}건 전송됨`);
        setRows(Array.from({ length: 8 }, blank));
      }
    });
  };

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 flex-wrap">
        <span className="text-sm text-gray-500">대상 공정/부서</span>
        <select
          value={targetId}
          onChange={(e) => setTargetId(e.target.value)}
          className="border border-gray-300 rounded px-2 py-1 text-sm dark:border-neutral-600 dark:bg-neutral-900"
        >
          {targets.map((t) => (
            <option key={t.id} value={t.id}>
              {t.name}
            </option>
          ))}
        </select>
        <button
          onClick={submit}
          disabled={pending || filled === 0}
          className="bg-blue-600 text-white text-sm rounded px-4 py-1.5 disabled:opacity-50"
        >
          {pending ? "전송 중…" : `보내기 (${filled}건)`}
        </button>
        <button
          onClick={() => setRows((r) => [...r, blank(), blank(), blank()])}
          className="text-sm text-gray-600 border border-gray-300 rounded px-3 py-1.5 dark:text-neutral-300 dark:border-neutral-600"
        >
          + 행 추가
        </button>
        {msg && <span className="text-xs text-gray-600">{msg}</span>}
      </div>

      <div className="overflow-x-auto">
        <table className="text-xs border-collapse border border-gray-400 dark:border-neutral-600">
          <colgroup>
            <col style={{ width: 36 }} />
            {cols.map((c) => (
              <col key={String(c.key)} style={{ width: c.width }} />
            ))}
            <col style={{ width: 70 }} />
          </colgroup>
          <thead>
            <tr className="bg-gray-100 dark:bg-neutral-800">
              <th className="border border-gray-400 px-2 py-1 dark:border-neutral-600">#</th>
              {cols.map((c) => (
                <th
                  key={String(c.key)}
                  className="border border-gray-400 px-2 py-1 font-medium whitespace-nowrap dark:border-neutral-600"
                >
                  {c.label}
                </th>
              ))}
              <th className="border border-gray-400 px-2 py-1">Tag검증</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r, i) => {
              const chk = tagCheck(r.qty, r.tag);
              return (
                <tr key={i}>
                  <td className="border border-gray-300 px-2 py-0.5 text-center text-gray-400 dark:border-neutral-700 dark:text-neutral-500">
                    {i + 1}
                  </td>
                  {cols.map((c) => {
                    const key = c.key as keyof EntryRow;
                    if (!FIELDS.includes(key))
                      return (
                        <td
                          key={String(c.key)}
                          className="border border-gray-300 dark:border-neutral-700"
                        />
                      );
                    const val = r[key] ?? "";
                    return (
                      <td
                        key={String(c.key)}
                        className="border border-gray-300 p-0 dark:border-neutral-700"
                      >
                        {c.kind === "int" || c.kind === "weight" ? (
                          <NumberInput
                            value={val}
                            kind={c.kind}
                            onChange={(v) => update(i, key, v)}
                            className="w-full px-2 py-1 outline-none focus:bg-blue-50 dark:focus:bg-blue-950"
                          />
                        ) : (
                          <input
                            value={val}
                            type={c.kind === "date" ? "date" : "text"}
                            onChange={(e) => update(i, key, e.target.value)}
                            className="w-full px-2 py-1 outline-none focus:bg-blue-50 dark:focus:bg-blue-950"
                          />
                        )}
                      </td>
                    );
                  })}
                  <td
                    className={`border border-gray-300 px-2 py-1 text-center font-semibold dark:border-neutral-700 ${
                      chk === "OK"
                        ? "text-emerald-600"
                        : chk === "NG"
                          ? "text-rose-600"
                          : "text-gray-300 dark:text-neutral-600"
                    }`}
                  >
                    {chk || "—"}
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
      <p className="text-xs text-gray-400">
        ※ 내역·수량·중량·Tag 중 하나라도 입력된 행만 전송됩니다. 중량은 소수 2자리(셋째 자리 입력 불가).
        일련번호는 대상 공정 기준 자동 생성.
      </p>
    </div>
  );
}
