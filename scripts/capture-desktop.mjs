import { chromium } from "playwright";
import { resolve } from "node:path";
import { pathToFileURL } from "node:url";

const htmlPath = resolve(process.cwd(), "dist/index.html");
const output = resolve(process.cwd(), "test-results", "desktop.png");
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({
  viewport: { width: 1440, height: 1000 },
  deviceScaleFactor: 1
});

await page.goto("http://127.0.0.1:4173/", {
  waitUntil: "load"
});
await page.waitForTimeout(100);
await page.screenshot({ path: output, fullPage: true });
await browser.close();

console.log(output);
