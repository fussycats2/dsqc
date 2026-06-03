import { useEffect, useRef, type RefObject } from "react";

// 엑셀식 표 조작을 input[data-cell] 격자에 부여하는 훅.
//  · 화살표 이동: ↑↓ 항상 셀 이동, ←→ 는 캐럿이 양끝일 때만 셀 이동(아니면 글자 편집)
//  · Enter: 다음 칸(읽기 순서), Shift+Enter: 이전 칸
//  · 드래그: 사각 범위 선택 / Shift+클릭·Shift+화살표: 범위 확장
//  · Ctrl/⌘+C: 선택 범위를 TSV로 복사(엑셀 붙여넣기 호환)
//  · 붙여넣기: 탭/줄바꿈 있는 TSV면 onPaste(기준셀, 행렬)로 위임(각 격자가 자기 상태에 반영)
// 컨테이너 ref에 위임 방식으로 리스너를 달아 React 재렌더와 무관하게 동작한다.

type PasteFn = (anchorCell: string, matrix: string[][]) => void;

const SEL = "input[data-cell]";
const RING = "inset 0 0 0 2px #3b82f6";
const TINT = "rgba(59,130,246,0.14)";

type Cell = HTMLInputElement;
type Dir = "up" | "down" | "left" | "right";
interface Box { el: Cell; cx: number; cy: number; left: number; right: number; top: number; bottom: number }

const boxOf = (el: Cell): Box => {
  const r = el.getBoundingClientRect();
  return { el, cx: r.left + r.width / 2, cy: r.top + r.height / 2, left: r.left, right: r.right, top: r.top, bottom: r.bottom };
};

export function useGridSheet<T extends HTMLElement>(
  ref: RefObject<T | null>,
  opts?: { onPaste?: PasteFn },
) {
  const optsRef = useRef(opts);
  useEffect(() => { optsRef.current = opts; }); // 최신 콜백 유지(매 렌더 갱신)

  useEffect(() => {
    const root = ref.current;
    if (!root) return;

    const cells = (): Cell[] =>
      Array.from(root.querySelectorAll<Cell>(SEL)).filter((el) => !el.disabled && el.offsetParent !== null);

    // ── 방향 이웃: 같은 행/열을 강하게 선호(직교거리×3 가중) ──
    const neighbor = (cur: Cell, dir: Dir, list: Cell[]): Cell | null => {
      const boxes = list.map(boxOf);
      const c = boxes.find((b) => b.el === cur);
      if (!c) return null;
      let best: Box | null = null, bestScore = Infinity;
      for (const b of boxes) {
        if (b.el === cur) continue;
        let primary: number, cross: number;
        if (dir === "right") { if (b.cx <= c.cx + 1) continue; primary = b.cx - c.cx; cross = Math.abs(b.cy - c.cy); }
        else if (dir === "left") { if (b.cx >= c.cx - 1) continue; primary = c.cx - b.cx; cross = Math.abs(b.cy - c.cy); }
        else if (dir === "down") { if (b.cy <= c.cy + 1) continue; primary = b.cy - c.cy; cross = Math.abs(b.cx - c.cx); }
        else { if (b.cy >= c.cy - 1) continue; primary = c.cy - b.cy; cross = Math.abs(b.cx - c.cx); }
        const score = primary + cross * 3;
        if (score < bestScore) { bestScore = score; best = b; }
      }
      return best?.el ?? null;
    };

    const rangeBetween = (a: Cell, b: Cell, list: Cell[]): Cell[] => {
      const boxes = list.map(boxOf);
      const ba = boxes.find((x) => x.el === a), bb = boxes.find((x) => x.el === b);
      if (!ba || !bb) return [a];
      const minX = Math.min(ba.left, bb.left) - 0.5, maxX = Math.max(ba.right, bb.right) + 0.5;
      const minY = Math.min(ba.top, bb.top) - 0.5, maxY = Math.max(ba.bottom, bb.bottom) + 0.5;
      return boxes.filter((x) => x.cx >= minX && x.cx <= maxX && x.cy >= minY && x.cy <= maxY).map((x) => x.el);
    };

    const cellAt = (boxes: Box[], x: number, y: number): Cell | null => {
      let hit: Cell | null = null, nearest: Cell | null = null, nd = Infinity;
      for (const b of boxes) {
        if (x >= b.left && x <= b.right && y >= b.top && y <= b.bottom) { hit = b.el; break; }
        const d = (b.cx - x) ** 2 + (b.cy - y) ** 2;
        if (d < nd) { nd = d; nearest = b.el; }
      }
      return hit ?? nearest;
    };

    const focusCell = (el: Cell) => {
      el.focus();
      try { el.select(); } catch { /* 일부 타입 select 미지원 */ }
    };
    const atStart = (el: Cell) => el.selectionStart == null || (el.selectionStart === 0 && el.selectionEnd === 0);
    const atEnd = (el: Cell) => el.selectionStart == null || (el.selectionStart === el.value.length && el.selectionEnd === el.value.length);

    // ── 선택 하이라이트(인라인 스타일로 직접 칠함) ──
    let anchor: Cell | null = null;
    let selected: Cell[] = [];
    let painted: Cell[] = [];
    const unpaint = () => { for (const el of painted) { el.style.boxShadow = ""; el.style.background = ""; } painted = []; };
    const paint = (els: Cell[]) => {
      unpaint();
      if (els.length > 1) for (const el of els) { el.style.boxShadow = RING; el.style.background = TINT; painted.push(el); }
    };
    const clearSel = () => { selected = []; unpaint(); };

    const copyTSV = () => {
      if (selected.length < 2) return false;
      const rows = new Map<HTMLElement, Cell[]>();
      for (const el of selected) {
        const tr = el.closest("tr") ?? (el.parentElement as HTMLElement);
        const arr = rows.get(tr); if (arr) arr.push(el); else rows.set(tr, [el]);
      }
      const trs = [...rows.keys()].sort((a, b) => a.getBoundingClientRect().top - b.getBoundingClientRect().top);
      const tsv = trs.map((tr) =>
        rows.get(tr)!
          .sort((a, b) => a.getBoundingClientRect().left - b.getBoundingClientRect().left)
          .map((el) => el.value.replace(/,/g, ""))
          .join("\t"),
      ).join("\n");
      const fallback = () => {
        const ta = document.createElement("textarea");
        ta.value = tsv; ta.style.position = "fixed"; ta.style.opacity = "0";
        document.body.appendChild(ta); ta.select();
        try { document.execCommand("copy"); } catch { /* noop */ }
        document.body.removeChild(ta);
      };
      const p = navigator.clipboard?.writeText(tsv);
      if (p) p.catch(fallback); else fallback();
      return true;
    };

    // ── 키보드 ──
    const onKeyDown = (e: KeyboardEvent) => {
      const t = e.target;
      if (!(t instanceof HTMLInputElement) || t.dataset.cell == null || !root.contains(t)) return;
      const k = e.key;

      if ((e.ctrlKey || e.metaKey) && (k === "c" || k === "C")) { if (copyTSV()) e.preventDefault(); return; }
      if (k === "Enter") {
        e.preventDefault();
        const list = cells(); const i = list.indexOf(t);
        const n = list[i + (e.shiftKey ? -1 : 1)];
        if (n) focusCell(n);
        clearSel(); anchor = n ?? t; return;
      }
      if (k === "Escape") { clearSel(); return; }

      let dir: Dir | null = null;
      if (k === "ArrowUp") dir = "up";
      else if (k === "ArrowDown") dir = "down";
      else if (k === "ArrowLeft") { if (!atStart(t)) return; dir = "left"; }
      else if (k === "ArrowRight") { if (!atEnd(t)) return; dir = "right"; }
      else { if (!e.ctrlKey && !e.metaKey && !e.altKey && k.length === 1) clearSel(); return; }

      const list = cells();
      const next = neighbor(t, dir, list);
      if (!next) { e.preventDefault(); return; }
      e.preventDefault();
      if (e.shiftKey) {
        const a = anchor ?? t;
        selected = rangeBetween(a, next, list);
        paint(selected);
        next.focus();
        anchor = a;
      } else {
        clearSel(); anchor = next; focusCell(next);
      }
    };

    // ── 마우스 드래그 선택 ──
    let downEl: Cell | null = null;
    let dragging = false;
    let dragBoxes: Box[] = [];
    let downX = 0, downY = 0;

    const onMouseDown = (e: MouseEvent) => {
      const el = (e.target as HTMLElement).closest<Cell>(SEL);
      if (!el || !root.contains(el)) { clearSel(); downEl = null; return; }
      if (e.shiftKey && anchor) {
        e.preventDefault();
        selected = rangeBetween(anchor, el, cells());
        paint(selected);
        return;
      }
      anchor = el; clearSel();
      downEl = el; dragging = false; dragBoxes = []; downX = e.clientX; downY = e.clientY;
    };
    const onMouseMove = (e: MouseEvent) => {
      if (!downEl) return;
      if (!dragging && Math.hypot(e.clientX - downX, e.clientY - downY) < 4) return;
      if (!dragBoxes.length) dragBoxes = cells().map(boxOf);
      const target = cellAt(dragBoxes, e.clientX, e.clientY);
      if (!target || target === downEl) return; // 같은 셀 안 → 글자 선택 허용
      dragging = true;
      e.preventDefault();
      window.getSelection()?.removeAllRanges();
      selected = rangeBetween(anchor!, target, dragBoxes.map((b) => b.el));
      paint(selected);
    };
    const onMouseUp = () => {
      downEl = null; dragging = false; dragBoxes = [];
      if (selected.length < 2) clearSel();
    };

    // ── 붙여넣기(TSV) ──
    const onPaste = (e: ClipboardEvent) => {
      const fn = optsRef.current?.onPaste;
      if (!fn) return;
      const text = e.clipboardData?.getData("text") ?? "";
      if (!text || (!text.includes("\t") && !text.includes("\n"))) return; // 단일 값 → 기본 동작
      const a = document.activeElement;
      if (!(a instanceof HTMLInputElement) || a.dataset.cell == null || !root.contains(a)) return;
      e.preventDefault();
      const matrix = text.replace(/\r/g, "").replace(/\n+$/, "").split("\n").map((r) => r.split("\t"));
      fn(a.dataset.cell, matrix);
    };

    root.addEventListener("keydown", onKeyDown);
    root.addEventListener("paste", onPaste);
    document.addEventListener("mousedown", onMouseDown);
    document.addEventListener("mousemove", onMouseMove);
    document.addEventListener("mouseup", onMouseUp);
    return () => {
      unpaint();
      root.removeEventListener("keydown", onKeyDown);
      root.removeEventListener("paste", onPaste);
      document.removeEventListener("mousedown", onMouseDown);
      document.removeEventListener("mousemove", onMouseMove);
      document.removeEventListener("mouseup", onMouseUp);
    };
  }, [ref]);
}
