import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // These effects initialize browser-only state (localStorage, clock, polling)
      // after hydration. Setting state there is what keeps SSR output deterministic,
      // so this rule is advisory for this app rather than an error.
      "react-hooks/set-state-in-effect": "warn",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    ".axis/**",
    "test-results/**",
    "playwright-report/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
