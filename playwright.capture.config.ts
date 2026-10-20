import { defineConfig } from "@playwright/test";
import base from "./playwright.config";
export default defineConfig({...base,testMatch:"capture-export-e2e.spec.ts",outputDir:"test-results/capture-export-e2e"});
