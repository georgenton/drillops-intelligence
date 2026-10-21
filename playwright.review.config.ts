import {defineConfig} from "@playwright/test";
import base from "./playwright.config";
if(new URL(process.env.E2E_BASE_URL??"http://127.0.0.1:3000").port==="3329")throw Error("Review E2E must never target the private candidate clone");
export default defineConfig({...base,testMatch:"review-scenario-e2e.spec.ts",outputDir:"test-results/review-scenario",timeout:120_000});
