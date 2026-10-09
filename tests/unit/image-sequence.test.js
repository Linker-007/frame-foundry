import { describe, expect, it } from "vitest";
import {
  calculateDuration,
  calculateOutputSize,
  getLoopOptions,
  isSupportedImageFile,
  importFiles,
  moveFrameByOffset,
  normalizeSettings,
  reorderFrames
} from "../../src/image-sequence.js";

describe("image sequence rules", () => {
  it("accepts supported image MIME types", () => {
    expect(isSupportedImageFile({ type: "image/png" })).toBe(true);
    expect(isSupportedImageFile({ type: "image/webp" })).toBe(true);
    expect(isSupportedImageFile({ type: "text/plain" })).toBe(false);
  });

  it("preserves aspect ratio while changing output width", () => {
    expect(
      calculateOutputSize({
        sourceWidth: 1600,
        sourceHeight: 900,
        outputWidth: 800
      })
    ).toEqual({ width: 800, height: 450 });
  });

  it("clamps settings to valid ranges", () => {
    expect(
      normalizeSettings({
        delayMs: 5,
        loop: 999,
        outputWidth: 5000,
        background: "#ffffff"
      })
    ).toEqual({
      delayMs: 10,
      loop: 100,
      outputWidth: 2000,
      background: "#ffffff"
    });

    expect(
      normalizeSettings({
        delayMs: Number.NaN,
        loop: -4,
        outputWidth: Number.NaN,
        background: "#fff"
      })
    ).toEqual({
      delayMs: 100,
      loop: 0,
      outputWidth: 800,
      background: "#ffffff"
    });
  });

  it("filters unsupported files before appending supported images", async () => {
    const supported = { name: "photo.png", type: "image/png" };
    const unsupported = { name: "notes.txt", type: "text/plain" };

    const result = await importFiles([unsupported], [
      { id: "existing", name: "existing.jpg" }
    ]);

    expect(result.frames).toHaveLength(1);
    expect(result.frames[0].id).toBe("existing");
    expect(result.skipped).toEqual([unsupported]);
    expect(result.failed).toEqual([]);
    expect(result.importOrder).toEqual(["existing"]);
  });

  it("moves a frame before the target frame", () => {
    const frames = [
      { id: "a", name: "a" },
      { id: "b", name: "b" },
      { id: "c", name: "c" }
    ];

    expect(reorderFrames(frames, "c", "a")).toEqual([
      { id: "c", name: "c" },
      { id: "a", name: "a" },
      { id: "b", name: "b" }
    ]);
  });

  it("reports a keyboard move's resulting position", () => {
    const frames = [
      { id: "a", name: "a" },
      { id: "b", name: "b" },
      { id: "c", name: "c" }
    ];
    const nextFrames = moveFrameByOffset(frames, "a", 1);

    expect(nextFrames).toEqual([
      { id: "b", name: "b" },
      { id: "a", name: "a" },
      { id: "c", name: "c" }
    ]);
    expect(
      nextFrames.findIndex((frame) => frame.id === "a")
    ).toBe(1);
  });

  it("creates infinite and fixed loop choices", () => {
    const loopOptions = getLoopOptions();

    expect(loopOptions[0]).toEqual({
      value: "0",
      label: "无限循环"
    });
    expect(loopOptions).toContainEqual({
      value: "10",
      label: "10 次"
    });
    expect(
      loopOptions.filter((option) => option.value === "0")
    ).toHaveLength(1);
  });

  it("calculates animation duration in seconds", () => {
    expect(calculateDuration(4, 100)).toBe(0.4);
    expect(calculateDuration(0, 100)).toBe(0);
  });
});
