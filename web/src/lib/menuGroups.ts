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
