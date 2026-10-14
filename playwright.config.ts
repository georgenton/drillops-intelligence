import { defineConfig, devices } from "@playwright/test";
const baseURL = process.env.E2E_BASE_URL ?? "http://127.0.0.1:3000";
if (!["127.0.0.1", "localhost"].includes(new URL(baseURL).hostname)) throw new Error("E2E fixtures may only target the local disposable application");
const startServer = process.env.DRILLOPS_E2E_START_SERVER === "true";
const runtimeDatabase = process.env.DRILLOPS_E2E_DATABASE_URL ?? "postgresql://drillops_e2e_runtime:Synthetic-E2E-Runtime-Only@127.0.0.1:5448/drillops_test";
if (startServer) {
  const url = new URL(runtimeDatabase);
  if (!["127.0.0.1", "localhost"].includes(url.hostname) || url.port !== "5448" || url.pathname !== "/drillops_test") throw new Error("Managed E2E server requires disposable DB5448");
}
export default defineConfig({
  testDir: "./scripts", testMatch: "operational-e2e.spec.ts", fullyParallel: false, workers: 1,
  timeout: 90_000, expect: { timeout: 20_000 }, retries: 0,
  reporter: [["list"]], outputDir: "test-results/operational-e2e",
  use: { baseURL, ...devices["Desktop Chrome"], trace: "retain-on-failure", screenshot: "only-on-failure" },
  webServer: startServer ? {
    command: "pnpm start --hostname 127.0.0.1 --port 3000", url: `${baseURL}/api/auth/mode`, reuseExistingServer: false, timeout: 60_000,
    env: { DATABASE_URL: runtimeDatabase, DEMO_MODE: "false", DRILLOPS_ENV: "staging", COMMERCIAL_ACCESS_ENABLED: "false", APP_ORIGIN: baseURL },
  } : undefined,
});
