import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { TabBar } from "@/components/TabBar";
import { DateToggle } from "@/components/DateToggle";
import { ThemeToggle } from "@/components/ThemeToggle";
import { getProcesses } from "@/lib/getProcesses";

// 첫 페인트 전에 저장된 테마 적용(깜빡임 방지)
const themeScript = `
(function(){try{var t=localStorage.getItem('dsqc.theme')||'light';
var d=t==='dark'||(t==='system'&&matchMedia('(prefers-color-scheme: dark)').matches);
document.documentElement.classList.toggle('dark',d);}catch(e){}})();
`;

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body className="min-h-full flex flex-col bg-white text-gray-900 dark:bg-neutral-950 dark:text-neutral-100">
        <header className="sticky top-0 z-20 flex items-center justify-between gap-3 border-b border-gray-300 bg-white px-4 py-2 dark:border-neutral-700 dark:bg-neutral-900">
          <span className="font-bold text-sm">dsqc · 제조공정 관리</span>
          <div className="flex items-center gap-4">
            <DateToggle />
            <ThemeToggle />
          </div>
        </header>
        <div className="flex-1">{children}</div>
        <TabBar processes={processes} />
      </body>
    </html>
  );
}
