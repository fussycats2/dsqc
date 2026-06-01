import type { NextConfig } from "next";

// 빌드(배포) 시각 — `next build` 실행 순간을 KST로 박제. Vercel 배포 시 그 빌드 시각이 됨.
const kst = new Date(Date.now() + 9 * 3600 * 1000);
const pad = (n: number) => String(n).padStart(2, "0");
const BUILD_TIME =
  `${kst.getUTCFullYear()}-${pad(kst.getUTCMonth() + 1)}-${pad(kst.getUTCDate())} ` +
  `${pad(kst.getUTCHours())}:${pad(kst.getUTCMinutes())}`;

const nextConfig: NextConfig = {
  // 개발 중 화면 좌하단 Next.js 마크/표시기 숨김
  devIndicators: false,
  // 빌드 시각을 클라이언트 번들에 인라인(로그인 페이지 표시용)
  env: { NEXT_PUBLIC_BUILD_TIME: BUILD_TIME },
};

export default nextConfig;
