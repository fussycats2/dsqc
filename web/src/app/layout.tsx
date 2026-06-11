import type { Metadata } from "next";
import { Geist_Mono } from "next/font/google";
import localFont from "next/font/local";
import "./globals.css";
import { Chrome } from "@/components/Chrome";
import { getProcesses } from "@/lib/getProcesses";

// 첫 페인트 전에 저장된 테마·글자크기 적용(깜빡임 방지). 다크 on/off만 — system 폐기.
const themeScript = `
(function(){try{
document.documentElement.classList.toggle('dark',localStorage.getItem('dsqc.theme')==='dark');
document.documentElement.classList.toggle('font-lg',localStorage.getItem('dsqc.fontScale')==='lg');
}catch(e){}})();
`;

// 본문 한글 폰트 — Pretendard 가변(로컬 파일, 외부 의존 없음)
const pretendard = localFont({
  src: "../fonts/PretendardVariable.woff2",
  display: "swap",
  weight: "45 920",
  variable: "--font-pretendard",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "dsqc — 제조공정 관리",
  description: "귀금속 제조공정 중량추적 시스템",
};

export default async function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  const processes = await getProcesses();
  return (
    <html
      lang="ko"
      suppressHydrationWarning
      className={`${pretendard.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full flex flex-col bg-white text-slate-900 dark:bg-neutral-950 dark:text-neutral-100">
        <Chrome processes={processes}>{children}</Chrome>
      </body>
    </html>
  );
}
