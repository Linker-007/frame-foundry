import { chromium } from "playwright";
import { resolve } from "node:path";

const output = resolve(process.cwd(), "test-results", "mobile.png");
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 375, height: 812 },
  deviceScaleFactor: 1
});

await page.goto("http://127.0.0.1:4173/", {
  waitUntil: "load"
});
await page.waitForTimeout(100);
await page.screenshot({ path: output, fullPage: true });
await browser.close();

console.log(output);
