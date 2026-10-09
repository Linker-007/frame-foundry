import { describe, expect, it, vi } from "vitest";
import {
  GIF_INTRODUCER,
  indexFramePixels,
  yieldToEventLoop
} from "../../src/gif.js";

describe("GIF export contract", () => {
  it("uses GIF89a as the file signature", () => {
    expect(GIF_INTRODUCER).toBe("GIF89a");
  });

  it("indexes pixels with gifenc's public applyPalette API", () => {
    const palette = [
      [255, 0, 0],
      [0, 128, 255]
    ];
    const pixels = new Uint8Array([
      255, 0, 0, 255,
      0, 128, 255, 255
    ]);

    expect(indexFramePixels(pixels, palette)).toEqual(
      new Uint8Array([0, 1])
    );
  });

  it("yields to the event loop when animation frames are unavailable", async () => {
    let animationFrameCallback = null;
    vi.stubGlobal(
      "requestAnimationFrame",
      vi.fn((callback) => {
        animationFrameCallback = callback;
        return 1;
      })
    );

    try {
      const yielded = yieldToEventLoop();

      expect(animationFrameCallback).toBeTypeOf("function");
      animationFrameCallback();
      await yielded;
    } finally {
      vi.unstubAllGlobals();
    }
  });
});
