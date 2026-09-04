import { defineConfig } from "vitest/config";

export default defineConfig({
  test: {
    include: ["test/**/*.test.ts"],
    coverage: {
      provider: "v8",
      reporter: ["text", "json-summary", "json"],
      reportsDirectory: "/tmp/praxis-control-plane-coverage",
      include: ["src/**/*.ts"],
      thresholds: { perFile: true, branches: 90, functions: 90, lines: 90, statements: 90 },
    },
  },
});
