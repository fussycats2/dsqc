import type { Process } from "@/lib/types";

// 분류 메뉴(부서·검수·연마·빠우·뻥) — 하단탭(TabBar)과 우클릭 네비게이션(NavContextMenu)이 공유.
export type MenuGroup = { key: string; label: string; match: (p: Process) => boolean; wide?: boolean };
export const MENU_GROUPS: MenuGroup[] = [
  { key: "부서", label: "부서", match: (p) => p.schema_type === "io" && !p.is_inspection },
  { key: "검수", label: "검수", match: (p) => p.is_inspection },
  { key: "연마", label: "연마", match: (p) => p.schema_type === "work" && p.category.includes("연마"), wide: true },
  { key: "빠우", label: "빠우", match: (p) => p.schema_type === "work" && p.category.includes("빠우"), wide: true },
  { key: "뻥", label: "뻥", match: (p) => p.schema_type === "work" && p.category.includes("뻥"), wide: true },
];

// 대상 드롭다운 구분선 그룹 — 번호가 바뀌는 지점에 구분선(ProcessView·EntryGrid 공유).
//  공정 대상: 연마 | 빠우 | 뻥, 부서 대상: 부서 | 검수 — 위 MENU_GROUPS 분류와 동일 기준.
export const workGroupOf = (p: Process) =>
  p.category.includes("연마") ? 0 : p.category.includes("빠우") ? 1 : p.category.includes("뻥") ? 2 : 3;
export const ioGroupOf = (p: Process) => (p.is_inspection ? 1 : 0);
