import type { NextConfig } from "next";
import { execSync } from "node:child_process";

// 빌드(배포) 시각 — `next build` 실행 순간을 KST로 박제. Vercel 배포 시 그 빌드 시각이 됨.
const kst = new Date(Date.now() + 9 * 3600 * 1000);
const pad = (n: number) => String(n).padStart(2, "0");
const BUILD_TIME =
  `${kst.getUTCFullYear()}-${pad(kst.getUTCMonth() + 1)}-${pad(kst.getUTCDate())} ` +
  `${pad(kst.getUTCHours())}:${pad(kst.getUTCMinutes())}`;

// 커밋 해시 앞 7자리 — Vercel은 VERCEL_GIT_COMMIT_SHA 제공, 로컬은 git에서 폴백
let sha = process.env.VERCEL_GIT_COMMIT_SHA ?? "";
if (!sha) {
  try { sha = execSync("git rev-parse HEAD").toString().trim(); } catch { /* git 없음 무시 */ }
}
const BUILD_SHA = sha.slice(0, 7);

const nextConfig: NextConfig = {
  // 개발 중 화면 좌하단 Next.js 마크/표시기 숨김
  devIndicators: false,
  // 빌드 시각·커밋 해시를 클라이언트 번들에 인라인(로그인 페이지 표시용)
  env: { NEXT_PUBLIC_BUILD_TIME: BUILD_TIME, NEXT_PUBLIC_BUILD_SHA: BUILD_SHA },
  // 백업/복원 라우트 lambda에 .xlsm 템플릿 포함(런타임 fs 읽기)
  outputFileTracingIncludes: {
    "/api/settlement/export": ["./templates/**"],
    "/api/settlement/import": ["./templates/**"],
    "/api/upload/export": ["./templates/**"],
  },
};

export default nextConfig;
