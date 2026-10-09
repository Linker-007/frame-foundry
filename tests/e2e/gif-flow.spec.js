import { expect, test } from "@playwright/test";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const fixtures = resolve(process.cwd(), "tests/fixtures");

async function createPngFixture(name, color) {
  const { PNG } = await import("pngjs");
  const png = new PNG({ width: 40, height: 30 });

  for (let index = 0; index < png.data.length; index += 4) {
    png.data[index] = color[0];
    png.data[index + 1] = color[1];
    png.data[index + 2] = color[2];
    png.data[index + 3] = 255;
  }

  await writeFile(resolve(fixtures, name), PNG.sync.write(png));
}

test.beforeAll(async () => {
  await mkdir(fixtures, { recursive: true });
  await createPngFixture("frame-one.png", [255, 0, 0]);
  await createPngFixture("frame-two.png", [0, 128, 255]);
});

test("imports, reorders, previews, and exports a GIF", async ({
  page
}) => {
  await page.goto("/");

  await expect(
    page.getByRole("heading", { name: "Frame Foundry" })
  ).toBeVisible();

  await page.setInputFiles("#file-input", [
    resolve(fixtures, "frame-one.png"),
    resolve(fixtures, "frame-two.png")
  ]);

  await expect(page.locator(".frame-card")).toHaveCount(2);
  await expect(page.locator(".frame-card").first()).toContainText(
    "frame-one.png"
  );

  await page
    .locator(".frame-card")
    .nth(1)
    .dragTo(page.locator(".frame-card").first());

  await expect(page.locator(".frame-card").first()).toContainText(
    "frame-two.png"
  );

  await page
    .locator(".frame-card")
    .first()
    .getByRole("button", { name: "移动第 1 帧" })
    .click();
  await expect(page.locator("#status")).toContainText(
    "已选择要移动的图片"
  );
  await page
    .locator(".frame-card")
    .nth(1)
    .click({ position: { x: 5, y: 5 } });
  await expect(page.locator(".frame-card").first()).toContainText(
    "frame-two.png"
  );

  await page.locator("#delay-input").fill("80");
  await page.locator("#width-input").fill("120");
  await expect(page.locator("#preview-canvas")).toHaveAttribute(
    "width",
    "120"
  );

  await page.getByRole("button", { name: "播放预览" }).click();
  await expect(
    page.getByRole("button", { name: "暂停预览" })
  ).toBeVisible();

  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "生成 GIF" }).click();
  const download = await downloadPromise;

  expect(download.suggestedFilename()).toBe("frame-foundry.gif");
  await expect(page.locator("#status")).toContainText(
    "已生成 frame-foundry.gif"
  );
});

test("supports keyboard-only frame reordering", async ({ page }) => {
  await page.goto("/");

  await page.setInputFiles("#file-input", [
    resolve(fixtures, "frame-one.png"),
    resolve(fixtures, "frame-two.png")
  ]);

  await expect(page.locator(".frame-card")).toHaveCount(2);
  await page.locator(".frame-card").first().focus();
  await page.keyboard.press("Alt+ArrowRight");

  await expect(page.locator(".frame-card").first()).toContainText(
    "frame-two.png"
  );
  await expect(page.locator("#status")).toContainText(
    "已将图片移动到第 2 位"
  );
});

test("mobile layout has no horizontal overflow", async ({ page }) => {
  await page.setViewportSize({ width: 375, height: 812 });
  await page.goto("/");

  const overflow = await page.evaluate(
    () =>
      document.documentElement.scrollWidth >
      document.documentElement.clientWidth
  );

  expect(overflow).toBe(false);
});
