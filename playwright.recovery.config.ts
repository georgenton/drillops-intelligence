import { defineConfig } from "@playwright/test";
import base from "./playwright.config";
export default defineConfig({
  ...base,
  testMatch:["recovery-workflows-e2e.spec.ts","recovered-advisor-depth-e2e.spec.ts"],
  outputDir:"test-results/recovery-e2e",
  timeout:120_000,
});
