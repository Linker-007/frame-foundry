import { readFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";

const htmlPath = fileURLToPath(
  new URL("../../index.html", import.meta.url)
);

const requiredIds = [
  "file-input",
  "drop-zone",
  "pick-button",
  "sequence-list",
  "clear-button",
  "reset-button",
  "delay-input",
  "loop-select",
  "width-input",
  "background-input",
  "generate-button",
  "preview-canvas",
  "preview-toggle",
  "status",
  "output-size"
];

describe("DOM contract", () => {
  it("exposes stable ids for the controller", async () => {
    const html = await readFile(htmlPath, "utf8");

    for (const id of requiredIds) {
      expect(html).toContain(`id="${id}"`);
    }
  });

  it("provides accessible labels and live status", async () => {
    const html = await readFile(htmlPath, "utf8");

    expect(html).toContain('aria-live="polite"');
    expect(html).toContain('<label for="delay-input">');
    expect(html).toContain('<label for="width-input">');
  });
});
