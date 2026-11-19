import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    // Intentional patterns: syncing state from URL params / IndexedDB / props on open.
    rules: { "react-hooks/set-state-in-effect": "warn", "react-hooks/incompatible-library": "off" },
  },
  globalIgnores([".next/**", "out/**", "build/**", "next-env.d.ts", "public/**", "playwright-report/**", "test-results/**"]),
]);
