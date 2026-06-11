"use client"

import {
  CircleCheckIcon,
  InfoIcon,
  Loader2Icon,
  OctagonXIcon,
  TriangleAlertIcon,
} from "lucide-react"
import { useSyncExternalStore } from "react"
import { Toaster as Sonner, type ToasterProps } from "sonner"

// next-themes 미사용 — 이 앱은 html.dark 클래스로 테마를 직접 토글(ThemeToggle).
//  클래스 변경(직접 토글/탭 간 동기화)에 반응하도록 EVT + storage + MutationObserver 구독.
const EVT = "dsqc.theme.change"
function subscribe(cb: () => void) {
  window.addEventListener(EVT, cb)
  window.addEventListener("storage", cb)
  const mo = new MutationObserver(cb)
  mo.observe(document.documentElement, { attributes: true, attributeFilter: ["class"] })
  return () => {
    window.removeEventListener(EVT, cb)
    window.removeEventListener("storage", cb)
    mo.disconnect()
  }
}

const Toaster = ({ ...props }: ToasterProps) => {
  const theme = useSyncExternalStore(
    subscribe,
    () => (document.documentElement.classList.contains("dark") ? "dark" : "light"),
    () => "light" as const,
  )

  return (
    <Sonner
      theme={theme}
      className="toaster group"
      icons={{
        success: <CircleCheckIcon className="size-5" />,
        info: <InfoIcon className="size-5" />,
        warning: <TriangleAlertIcon className="size-5" />,
        error: <OctagonXIcon className="size-5" />,
        loading: <Loader2Icon className="size-5 animate-spin" />,
      }}
      style={
        {
          // 일반(toast.message) — 테마 반전 고대비: 라이트=진회색 바탕/흰 글씨, 다크=흰 바탕/검은 글씨
          "--normal-bg": theme === "dark" ? "#fafafa" : "#1e293b",
          "--normal-text": theme === "dark" ? "#171717" : "#f8fafc",
          "--normal-border": "transparent",
          // 타입별(richColors) — 기본 파스텔 대신 진한 단색 배경 + 흰 글씨(시인성)
          "--success-bg": "#059669", "--success-text": "#ffffff", "--success-border": "#047857",
          "--error-bg": "#e11d48", "--error-text": "#ffffff", "--error-border": "#be123c",
          "--warning-bg": "#d97706", "--warning-text": "#ffffff", "--warning-border": "#b45309",
          "--info-bg": "#2563eb", "--info-text": "#ffffff", "--info-border": "#1d4ed8",
          "--border-radius": "var(--radius)",
          "--width": "420px", // 기본 356px보다 넓게 — 한 줄 메시지가 덜 접힘
        } as React.CSSProperties
      }
      toastOptions={{
        // 시인성 강화 — 글자 크게·굵게, 테두리 두껍게, 그림자 진하게(richColors 배경과 조합)
        classNames: {
          toast: "!gap-2.5 !border-2 !py-3.5 !shadow-xl",
          title: "!text-[0.95rem] !font-semibold !leading-snug",
          description: "!text-sm",
        },
      }}
      {...props}
    />
  )
}

export { Toaster }
