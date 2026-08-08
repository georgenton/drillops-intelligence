import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

export default defineConfig([
  ...nextVitals,
  ...nextTs,
  { rules: { "react-hooks/use-memo": "off", "react-hooks/exhaustive-deps": "off" } },
  globalIgnores([".next/**", "node_modules/**", "packages/db/migrations/**"]),
]);
