import { defineConfig } from "vitest/config";

export default defineConfig({
  resolve: { tsconfigPaths: true },
  test: {
    environment: "node",
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"],
    globalSetup: ["src/test/globalSetup.ts"],
    setupFiles: ["src/test-setup.ts"],
  },
});
