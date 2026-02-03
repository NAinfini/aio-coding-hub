import react from "@vitejs/plugin-react";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const ROOT_DIR = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    setupFiles: ["src/test/setup.ts"],
    restoreMocks: true,
    coverage: {
      provider: "v8",
      reporter: ["text", "lcov"],
      reportsDirectory: "coverage",
      all: true,
      thresholds: {
        statements: 90,
        branches: 85,
        functions: 90,
        lines: 90,
      },
      include: ["src/**/*.{ts,tsx}"],
      exclude: [
        "**/*.d.ts",
        "**/node_modules/**",
        "**/__tests__/**",
        "**/*.{test,spec}.{ts,tsx}",
        "src/components/ClaudeModelValidation*.tsx",
        "src/services/claudeModelValidation*.ts",
        "src/services/claudeValidationTemplates.ts",
        "src/test/**",
      ],
    },
  },
});
