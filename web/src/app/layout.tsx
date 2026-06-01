import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { Chrome } from "@/components/Chrome";
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
        <Chrome processes={processes}>{children}</Chrome>
      </body>
    </html>
  );
}
