import { defineConfig } from "vitest/config";
import { fileURLToPath } from "node:url";

// 핵심 계산 로직 단위 테스트용 (순수 함수라 node 환경). @/ alias만 맞춰줌.
export default defineConfig({
  resolve: {
    alias: { "@": fileURLToPath(new URL("./src", import.meta.url)) },
  },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts"],
  },
});
