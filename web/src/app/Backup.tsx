"use client";

import { useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { Download, Loader2, Upload } from "lucide-react";
import { Button } from "@/components/ui/button";
import {
  AlertDialog, AlertDialogAction, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import type { SchemaType } from "@/lib/types";

const fmtD = (s: string) => s.replaceAll("-", "/");

// 작업 데이터(전 공정) 엑셀 백업/복원 — 매크로(VBA)·수식 보존, 가져오기는 충돌 시 취소(덮어쓰기 금지).
//  · 파싱은 브라우저에서 수행(5MB 업로드 한도 회피) → 작은 JSON만 서버로 전송.
export function Backup({
  workDate,
  procs,
}: {
  workDate: string;
  procs: { name: string; schema_type: SchemaType }[];
}) {
  const router = useRouter();
  const fileRef = useRef<HTMLInputElement>(null);
  const [pending, start] = useTransition();
  const [box, setBox] = useState<{ title: string; lines: string[] } | null>(null);

  const onImport = (file: File) =>
    start(async () => {
      let lots;
      try {
        const { parseUploadXlsm } = await import("@/lib/uploadXlsx");
        lots = await parseUploadXlsm(await file.arrayBuffer(), procs);
      } catch (e) {
        setBox({ title: "가져오기 실패", lines: ["엑셀 해석 실패: " + (e as Error).message] });
        return;
      }
      if (lots.length === 0) {
        setBox({ title: "가져오기 취소", lines: ["파일에서 작업 데이터를 찾지 못했습니다."] });
        return;
      }
      const res = await fetch("/api/upload/import", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ date: workDate, lots }),
      });
      const r = await res.json().catch(() => ({ error: "서버 응답을 읽지 못했습니다." }));
      if (r.error) {
        setBox({ title: "가져오기 취소", lines: String(r.error).split("\n") });
        return;
      }
      setBox({ title: "가져오기 완료", lines: [`${r.count}건을 ${fmtD(workDate)} 작업일로 복원했습니다.`] });
      router.refresh();
    });

  return (
    <section className="rounded-xl border border-slate-200 bg-white p-3 shadow-sm dark:border-neutral-800 dark:bg-neutral-900">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
        <span className="text-sm font-semibold">💾 작업 데이터 백업/복원 (엑셀)</span>
        <span className="text-xs text-slate-400 dark:text-neutral-500">
          선택 작업일 {fmtD(workDate)} · 전 공정 시트
        </span>
        <div className="flex items-center gap-1.5">
          <Button asChild size="sm" variant="outline">
            <a href={`/api/upload/export?date=${workDate}`}>
              <Download />엑셀 백업
            </a>
          </Button>
          <Button size="sm" variant="outline" disabled={pending} onClick={() => fileRef.current?.click()}>
            {pending ? <Loader2 className="animate-spin" /> : <Upload />}
            {pending ? "가져오는 중…" : "엑셀 가져오기"}
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".xlsm,.xlsx"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onImport(f);
              e.target.value = "";
            }}
          />
        </div>
        <span className="text-[11px] text-slate-400 dark:text-neutral-500">
          ※ 매크로(VBA)·수식 보존. 가져오기는 그 작업일에 데이터가 있으면 취소(덮어쓰기 안 함).
        </span>
      </div>

      <AlertDialog open={!!box} onOpenChange={(o) => { if (!o) setBox(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{box?.title}</AlertDialogTitle>
            <AlertDialogDescription asChild>
              <div className="space-y-1">{box?.lines.map((l, i) => <p key={i}>{l}</p>)}</div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogAction className="bg-[#4b3526] text-white hover:bg-[#3a281c]">확인</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </section>
  );
}
