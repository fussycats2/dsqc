"use client";

import type { ReactNode } from "react";
import { useTransition } from "react";
import { useRouter } from "next/navigation";
import { LoadingOverlay } from "@/components/LoadingOverlay";

// 내부 이동 — <a href> 대신 클릭 이동(호버 시 브라우저 상태바에 URL 미노출) + 호버 prefetch.
//  서버 컴포넌트(대시보드 등)에서도 리프로 사용 가능. 표시는 className으로 제어(button=폰트 inherit).
//  이동을 transition으로 감싸 서버 렌더가 끝날 때까지 중앙 '불러오는 중' 표시.
export function ClientLink({
  href, className, title, children,
}: {
  href: string;
  className?: string;
  title?: string;
  children: ReactNode;
}) {
  const router = useRouter();
  const [pending, start] = useTransition();
  return (
    <>
      <button
        type="button"
        title={title}
        className={className}
        onClick={() => start(() => router.push(href))}
        onMouseEnter={() => router.prefetch(href)}
        onFocus={() => router.prefetch(href)}
      >
        {children}
      </button>
      <LoadingOverlay show={pending} />
    </>
  );
}
