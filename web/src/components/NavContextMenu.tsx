"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, useTransition } from "react";
import { Check } from "lucide-react";
import type { Process } from "@/lib/types";
import { MENU_GROUPS, type MenuGroup } from "@/lib/menuGroups";
import { useKarat } from "@/components/KaratContext";
import {
  ContextMenu, ContextMenuContent, ContextMenuItem,
  ContextMenuSeparator, ContextMenuSub, ContextMenuSubContent,
  ContextMenuSubTrigger, ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { LoadingOverlay } from "@/components/LoadingOverlay";
import { MenuScrim } from "@/components/MenuScrim";
import { Seg } from "@/components/Seg";
import type { Karat } from "@/components/KaratContext";

// 우클릭 메뉴 전용 그룹 순서 — 공정(연마·빠우·뻥) 먼저, 부서·검수는 그 아래(하단탭 순서와 별개)
const pickGroups = (keys: string[]) => keys.flatMap((k) => MENU_GROUPS.filter((g) => g.key === k));

// 입력 필드 위·드래그 선택한 텍스트 위 우클릭은 브라우저 기본 메뉴 유지(복사/붙여넣기 등)
function keepNativeMenu(e: React.MouseEvent) {
  const t = e.target as HTMLElement;
  if (t.closest("input, textarea, select") || t.isContentEditable) return true;
  const sel = window.getSelection();
  return !!sel && !sel.isCollapsed && sel.containsNode(t, true);
}

// 본문 어디서나 우클릭 → 커서 위치에 네비게이션 메뉴(PC 전용 UX).
//  공정 목록은 하단탭에서 선택한 karat(18K/14K)을 그대로 따라간다.
export function NavContextMenu({ processes, children }: { processes: Process[]; children: React.ReactNode }) {
  const pathname = usePathname();
  const router = useRouter();
  const [navPending, startNav] = useTransition();
  // TabBar와 동일한 이동 패턴 — transition으로 감싸 서버 렌더 동안 중앙 '불러오는 중' 표시
  const go = (href: string) => startNav(() => router.push(href));
  // 항목 하이라이트(포커스) 시 prefetch → 클릭 시 즉시 전환
  const warm = (href: string) => router.prefetch(href);
  const { karat, setKarat } = useKarat();

  // Radix는 메뉴가 열린 채 다른 곳을 우클릭하면 좌표만 갱신하고 재배치하지 않음 —
  //  우클릭마다 content를 리마운트(key 변경)시켜 새 커서 위치로 따라오게 한다.
  const [reopenKey, setReopenKey] = useState(0);
  // 열림 상태 — 데이터 위에서도 메뉴가 또렷하게 보이도록 본문을 어둡게+흐리게 하는 스크림용
  const [open, setOpen] = useState(false);

  // 메뉴에 마우스가 들어왔다 벗어나면 자동 닫기 — 500ms 유예
  //  (루트↔서브메뉴 사이를 건너는 동안 닫히지 않도록 양쪽이 타이머를 공유).
  //  Radix ContextMenu는 제어형 open이 없어 Escape 키 합성 발사로 닫는다(레이어 전체 닫힘).
  const closeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const openedAtRef = useRef(0);
  const cancelClose = () => {
    if (closeTimer.current) { clearTimeout(closeTimer.current); closeTimer.current = null; }
  };
  const scheduleClose = () => {
    // 우클릭 직후엔 커서가 메뉴 가장자리에 걸친 채 열릴 수 있음(화면 끝에서 위치 반전) —
    //  이때 스치듯 발생하는 leave로 바로 닫히지 않도록 열린 직후 400ms의 leave는 무시
    if (Date.now() - openedAtRef.current < 400) return;
    cancelClose();
    closeTimer.current = setTimeout(() => {
      document.dispatchEvent(new KeyboardEvent("keydown", { key: "Escape" }));
    }, 500);
  };
  useEffect(() => () => { if (closeTimer.current) clearTimeout(closeTimer.current); }, []);

  const entry = processes.find((p) => p.schema_type === "entry");
  const accentText =
    karat === "18K"
      ? "text-rose-600 data-[highlighted]:text-rose-600 dark:text-rose-400"
      : "text-blue-600 data-[highlighted]:text-blue-600 dark:text-blue-400";

  const topItem = (href: string, label: string) => {
    const active = pathname === href;
    return (
      <ContextMenuItem
        onSelect={() => go(href)}
        onFocus={() => warm(href)}
        className={`justify-between gap-3 ${active ? "font-bold" : ""}`}
      >
        {label}
        {active && <Check className="size-3.5" />}
      </ContextMenuItem>
    );
  };

  const groupSub = (g: MenuGroup) => {
    const procs = processes.filter((p) => p.karat === karat && g.match(p));
    return (
      <ContextMenuSub key={g.key}>
        <ContextMenuSubTrigger disabled={procs.length === 0}>{g.label}</ContextMenuSubTrigger>
        <ContextMenuSubContent
          className="max-h-[60vh] overflow-y-auto"
          onPointerEnter={cancelClose}
          onPointerLeave={scheduleClose}
        >
          {procs.map((p) => {
            const href = `/process/${p.id}`;
            const active = pathname === href;
            return (
              <ContextMenuItem
                key={p.id}
                onSelect={() => go(href)}
                onFocus={() => warm(href)}
                className={`justify-between gap-3 ${active ? `font-bold ${accentText}` : ""}`}
              >
                {p.name}
                {active && <Check className="size-3.5" />}
              </ContextMenuItem>
            );
          })}
        </ContextMenuSubContent>
      </ContextMenuSub>
    );
  };

  return (
    <>
      <ContextMenu modal={false} onOpenChange={(o) => { setOpen(o); if (!o) cancelClose(); }}>
        <ContextMenuTrigger asChild>
          <div
            className="flex-1"
            onContextMenuCapture={(e) => {
              if (keepNativeMenu(e)) e.stopPropagation();
              else { cancelClose(); openedAtRef.current = Date.now(); setReopenKey((k) => k + 1); }
            }}
          >
            {children}
          </div>
        </ContextMenuTrigger>
        <ContextMenuContent
          key={reopenKey}
          className="min-w-0"
          onPointerEnter={cancelClose}
          onPointerLeave={scheduleClose}
          // 서브메뉴는 루트 content의 자식이라 서브→루트로 되돌아올 때 루트 enter가 다시
          //  발생하지 않음 — 메뉴 내부의 모든 move(서브에서도 버블링)로 닫기 타이머를 취소
          onPointerMove={cancelClose}
        >
          {pickGroups(["연마", "빠우", "뻥"]).map(groupSub)}
          <ContextMenuSeparator />
          {pickGroups(["부서", "검수"]).map(groupSub)}
          <ContextMenuSeparator />
          {/* 클릭 시 위 공정 목록이 즉시 전환 — 메뉴는 닫히지 않고, 하단탭의 선택과 연동(같은 상태) */}
          <div className="px-2 py-1.5">
            <Seg
              items={[{ key: "18K", label: "18K" }, { key: "14K", label: "14K" }]}
              value={karat}
              onChange={(k) => setKarat(k as Karat)}
              activeBg={karat === "18K" ? "bg-rose-600" : "bg-blue-600"}
            />
          </div>
          <ContextMenuSeparator />
          {topItem("/", "🏠 대시보드")}
          {entry && topItem(`/process/${entry.id}`, "✏️ 작성")}
        </ContextMenuContent>
      </ContextMenu>
      <MenuScrim show={open} />
      <LoadingOverlay show={navPending} />
    </>
  );
}
