import js from "@eslint/js";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/.astro/**",
      "**/node_modules/**",
      "coverage/**",
      "eslint.config.mjs",
      "**/*.astro",
      "**/*.d.ts",
      "packages/db/drizzle/**",
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    languageOptions: {
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      "@typescript-eslint/consistent-type-imports": ["error", { fixStyle: "inline-type-imports" }],
      complexity: ["error", 10],
      "max-depth": ["error", 4],
      "no-console": ["error", { allow: ["warn", "error"] }],
      "no-duplicate-imports": "error",
    },
  },
  {
    // JSX conditional rendering inflates cyclomatic complexity; allow React
    // components more headroom than server code.
    files: ["**/*.tsx"],
    rules: {
      complexity: ["error", 15],
    },
  },
);
