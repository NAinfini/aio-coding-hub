import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

export default tseslint.config(
  // Global ignores
  {
    ignores: [
      "node_modules/",
      "dist/",
      "src/generated/",
      "src-tauri/",
      "*.config.js",
      "*.config.ts",
    ],
  },

  // Base TypeScript recommended rules
  ...tseslint.configs.recommended,

  // React Hooks rules
  // Note: react-hooks v7 "recommended" includes React Compiler rules
  // (static-components, set-state-in-effect, preserve-manual-memoization, etc.)
  // which are too strict for a non-Compiler codebase. We only enable the
  // classic rules-of-hooks and exhaustive-deps.
  {
    plugins: {
      "react-hooks": reactHooks,
    },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },

  // Project-specific rule overrides
  {
    files: ["src/**/*.{ts,tsx}"],
    rules: {
      // Align with tsconfig strict settings (noUnusedLocals, noUnusedParameters)
      // but allow underscore-prefixed variables for intentional ignoring
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],

      // Allow empty functions (common in React callbacks and default props)
      "@typescript-eslint/no-empty-function": "off",

      // Allow explicit any in limited cases (warn instead of error)
      "@typescript-eslint/no-explicit-any": "warn",
    },
  },

  // Test files: relaxed rules
  {
    files: ["src/**/*.test.{ts,tsx}", "src/**/*.spec.{ts,tsx}", "src/test/**"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-non-null-assertion": "off",
    },
  }
);
