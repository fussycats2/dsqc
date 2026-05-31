import type { KeyboardEvent } from "react";

// Enter 누르면 컨테이너 내 다음 입력칸(오른쪽 → 다음 행)으로 포커스 이동 (엑셀식)
//  컨테이너 요소의 onKeyDown에 연결해서 사용.
export function focusNextInput(e: KeyboardEvent<HTMLElement>) {
  if (e.key !== "Enter") return;
  const target = e.target as HTMLElement;
  if (
    !(target instanceof HTMLInputElement) &&
    !(target instanceof HTMLSelectElement) &&
    !(target instanceof HTMLTextAreaElement)
  )
    return;
  e.preventDefault();
  const fields = Array.from(
    e.currentTarget.querySelectorAll<HTMLElement>("input, select, textarea"),
  ).filter((el) => {
    const i = el as HTMLInputElement;
    return (
      !i.disabled &&
      i.type !== "checkbox" &&
      i.type !== "button" &&
      el.tabIndex !== -1 &&
      el.offsetParent !== null // 화면에 보이는 것만
    );
  });
  const idx = fields.indexOf(target);
  const next = idx >= 0 ? fields[idx + 1] : undefined;
  if (!next) return;
  next.focus();
  if (next instanceof HTMLInputElement) {
    try {
      next.select();
    } catch {
      /* date 등 select 미지원 타입 무시 */
    }
  }
}
