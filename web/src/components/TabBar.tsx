"use client";

import { usePathname, useRouter } from "next/navigation";
import { useTransition } from "react";
import { BookOpen, Check, ChevronUp, Home, PenLine } from "lucide-react";
import type { Process } from "@/lib/types";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { UpdateHistory } from "@/components/UpdateHistory";
import { LoadingOverlay } from "@/components/LoadingOverlay";
import { MenuScrim } from "@/components/MenuScrim";
import { useKarat, type Karat } from "@/components/KaratContext";
// 분류 버튼 — 누르면 위로 펼쳐지는 드롭다운(가로로 안 늘어남). 부서·검수 | 연마·빠우·뻥.
import { MENU_GROUPS, type MenuGroup } from "@/lib/menuGroups";
import { useHoverMenu } from "@/lib/useHoverMenu";
import { Seg } from "@/components/Seg";
import { LIQUID_GLASS, glassStyle } from "@/components/LiquidGlass";

export function TabBar({ processes }: { processes: Process[] }) {
  const pathname = usePathname();
  const router = useRouter();
  const [navPending, startNav] = useTransition();
  // <a href> 대신 클릭 이동 → 호버 시 브라우저 상태바에 URL(경로) 노출 안 됨.
  //  transition으로 감싸 대상 화면 서버 렌더가 끝날 때까지 중앙 '불러오는 중' 표시.
  const go = (href: string) => startNav(() => router.push(href));
  // 호버/포커스 시 라우트 prefetch → 클릭 시 콜드 렌더 대기 없이 즉시 전환(체감 속도 개선)
  const warm = (href: string) => router.prefetch(href);

  // 분류 메뉴(부서·검수·연마·빠우·뻥)는 호버로 펼치고 마우스가 나가면 닫음 — 공용 훅(useHoverMenu) 사용.
  const {
    openKey,
    setOpenKey,
    open: openGroup,
    cancelClose,
    scheduleClose,
  } = useHoverMenu();

  const entry = processes.find((p) => p.schema_type === "entry");
  const activeProcess = processes.find((p) => pathname === `/process/${p.id}`);

  // 18K/14K 선택은 KaratProvider가 단일 출처(우클릭 네비게이션과 공유, 공정 이동 시 동기화 포함)
  const { karat, setKarat } = useKarat();

  // 선택 강조색을 karat에 따라 이중화: 18K=빨강 / 14K=파랑
  const accentBg = karat === "18K" ? "bg-rose-600" : "bg-blue-600";

  // 대시보드/작성은 karat 강조색과 무관한 단독 중립색(진회색)으로 — karat 오해 방지
  const pill = (active: boolean) =>
    `inline-flex shrink-0 items-center gap-1 rounded-md px-2.5 py-1 text-xs font-medium transition-colors ${
      active
        ? "bg-slate-700 text-white dark:bg-slate-600"
        : "text-slate-600 hover:bg-slate-100 dark:text-neutral-300 dark:hover:bg-neutral-800"
    }`;
  const divider = (
    <span
      aria-hidden
      className="h-4 w-px shrink-0 bg-slate-200 dark:bg-neutral-700"
    />
  );

  // 분류 드롭다운(위로 펼침) — 현재 karat의 그 분류 공정 목록
  const groupMenu = (g: MenuGroup) => {
    const procs = processes.filter((p) => p.karat === karat && g.match(p));
    // 메뉴가 열리는 순간 그룹 공정 전체를 prefetch — 항목을 고르는 사이(수백 ms~수 초)에 서버
    //  렌더를 미리 끝내 클릭 시 대기 없이 전환. 항목 호버 warm은 클릭 직전이라 lead time이 짧았음.
    //  중복 prefetch는 라우터가 dedupe, 프록시는 prefetch 인증 검사를 스킵(updateSession)해 저비용.
    const warmGroup = () => procs.forEach((p) => warm(`/process/${p.id}`));
    const isActiveGroup =
      !!activeProcess &&
      activeProcess.karat === karat &&
      g.match(activeProcess);
    return (
      <DropdownMenu
        key={g.key}
        modal={false}
        open={openKey === g.key}
        onOpenChange={(o) => {
          setOpenKey(o ? g.key : null);
          if (o) warmGroup();
        }}
      >
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            disabled={procs.length === 0}
            onPointerEnter={(e) => {
              if (e.pointerType !== "touch") {
                openGroup(g.key);
                warmGroup();
              }
            }}
            onPointerLeave={(e) => {
              if (e.pointerType !== "touch") scheduleClose();
            }}
            className={`flex shrink-0 items-center justify-center gap-0.5 rounded-md border px-2 py-1 text-xs font-medium transition-colors disabled:opacity-40 ${
              g.wide ? "w-16" : "min-w-[3.25rem]"
            } ${
              isActiveGroup
                ? `${accentBg} border-transparent text-white`
                : "border-slate-300 bg-white text-slate-700 hover:bg-slate-100 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-200 dark:hover:bg-neutral-700"
            }`}
          >
            {g.label}
            <ChevronUp className="size-3 opacity-60" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          side="top"
          align="start"
          sideOffset={6}
          className="max-h-[60vh] overflow-y-auto"
          onCloseAutoFocus={(e) => e.preventDefault()}
          onPointerEnter={cancelClose}
          onPointerLeave={(e) => {
            if (e.pointerType !== "touch") scheduleClose();
          }}
        >
          <DropdownMenuLabel>
            {karat} · {g.label}
          </DropdownMenuLabel>
          {procs.map((p) => {
            const active = pathname === `/process/${p.id}`;
            return (
              <DropdownMenuItem
                key={p.id}
                onSelect={() => go(`/process/${p.id}`)}
                onMouseEnter={() => warm(`/process/${p.id}`)}
                onFocus={() => warm(`/process/${p.id}`)}
                className={`justify-between gap-3 ${
                  active
                    ? "font-bold text-rose-600 data-[highlighted]:text-rose-600 dark:text-rose-400"
                    : ""
                } ${p.karat === "14K" && !active ? "text-blue-600 dark:text-blue-400" : ""}`}
              >
                {p.name}
                {active && <Check className="size-3.5" />}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    );
  };

  // Liquid Glass(전역 토글) — backdrop 굴절은 공통 필터 #dsqc-liquid-glass(Chrome에 1회 마운트) 공유.
  const navGlassStyle = glassStyle();
  const navClass = LIQUID_GLASS
    ? "sticky bottom-0 z-[26] flex flex-wrap items-center gap-2 border-t border-white/60 bg-white/30 px-2 py-1.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.7),0_-6px_20px_rgba(0,0,0,0.12)] print:hidden dark:border-white/15 dark:bg-neutral-900/30"
    : "sticky bottom-0 z-[26] flex flex-wrap items-center gap-2 border-t border-slate-200 bg-white/90 px-2 py-1.5 shadow-[0_-1px_3px_rgba(0,0,0,0.05)] backdrop-blur print:hidden dark:border-neutral-800 dark:bg-neutral-900/90";

  // z-[26]: 메뉴 스크림(z-[25])보다 위 — 드롭다운 펼친 채 옆 버튼으로 이동할 때 탭바는 또렷하게
  return (
    <nav className={navClass} style={navGlassStyle}>
      {/* 윗변 광택(specular highlight) — 유리 두께감. 버튼보다 DOM 먼저라 뒤에 깔리고 클릭은 통과 */}
      {LIQUID_GLASS && (
        <div
          aria-hidden
          className="pointer-events-none absolute inset-x-0 top-0 h-1/2 bg-gradient-to-b from-white/45 to-transparent dark:from-white/10"
        />
      )}
      <button
        type="button"
        onClick={() => go("/")}
        onMouseEnter={() => warm("/")}
        onFocus={() => warm("/")}
        className={pill(pathname === "/")}
      >
        <Home className="size-3.5" />
        대시보드
      </button>
      {entry && (
        <button
          type="button"
          onClick={() => go(`/process/${entry.id}`)}
          onMouseEnter={() => warm(`/process/${entry.id}`)}
          onFocus={() => warm(`/process/${entry.id}`)}
          className={pill(pathname === `/process/${entry.id}`)}
        >
          <PenLine className="size-3.5" />
          작성
        </button>
      )}
      {divider}
      <Seg
        items={[
          { key: "18K", label: "18K" },
          { key: "14K", label: "14K" },
        ]}
        value={karat}
        onChange={(k) => setKarat(k as Karat)}
        activeBg={accentBg}
      />
      {divider}
      {MENU_GROUPS.slice(0, 2).map(groupMenu)}
      {divider}
      {MENU_GROUPS.slice(2).map(groupMenu)}
      {/* 오른쪽 그룹: (공정시트면 현재 공정 표시) + 업데이트 이력 — 제일 오른쪽 고정 */}
      <div className="ml-auto flex items-center gap-2">
        {activeProcess && activeProcess.schema_type !== "entry" && (
          <span className="flex items-center gap-1.5 text-sm text-slate-500 dark:text-neutral-400">
            <span
              className={`font-bold ${karat === "18K" ? "text-rose-600 dark:text-rose-400" : "text-blue-600 dark:text-blue-400"}`}
            >
              {karat}
            </span>
            <span className="text-slate-300 dark:text-neutral-600">›</span>
            <span className="text-base font-bold text-slate-800 dark:text-neutral-100">
              {activeProcess.name}
            </span>
          </span>
        )}
        <UpdateHistory />
        {/* 사용자 매뉴얼 — 새 탭 대신 앱 내 전체화면 뷰어(/manual)로 이동(public/manual.html을 iframe으로,
            자체 상단바에서 인쇄/닫기). 새 탭이 안 늘어나고 앱 안에 머무름. 원본은 직접 편집, 스크린샷은 public/shots/ */}
        <button
          type="button"
          onClick={() => go("/manual")}
          onMouseEnter={() => warm("/manual")}
          onFocus={() => warm("/manual")}
          title="사용자 매뉴얼"
          className="inline-flex shrink-0 items-center gap-1 rounded-md border border-slate-300 bg-white px-2.5 py-1 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-100 dark:border-neutral-600 dark:bg-neutral-800 dark:text-neutral-300 dark:hover:bg-neutral-700"
        >
          <BookOpen aria-hidden className="size-3.5" />
          매뉴얼
        </button>
      </div>
      {/* 분류 드롭다운이 펼쳐진 동안 본문 어둡게+흐리게 — 우클릭 메뉴와 동일 효과(body 포털이라 z-20 안 갇힘) */}
      <MenuScrim show={openKey !== null} />
      <LoadingOverlay show={navPending} />
    </nav>
  );
}
