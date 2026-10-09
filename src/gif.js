import {
  GIFEncoder,
  applyPalette,
  quantize
} from "gifenc";

export const GIF_INTRODUCER = "GIF89a";

export function indexFramePixels(pixels, palette) {
  return applyPalette(pixels, palette);
}

export function yieldToEventLoop() {
  return new Promise((resolve) => {
    if (typeof requestAnimationFrame === "function") {
      requestAnimationFrame(() => resolve());
      return;
    }

    setTimeout(resolve, 0);
  });
}

export function createRgbaFrame({
  bitmap,
  width,
  height,
  background
}) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;

  const context = canvas.getContext("2d", {
    willReadFrequently: true
  });

  context.fillStyle = background;
  context.fillRect(0, 0, width, height);
  context.drawImage(bitmap, 0, 0, width, height);

  return context.getImageData(0, 0, width, height).data;
}

export async function encodeGif({
  frames,
  width,
  height,
  delayMs,
  loop,
  background,
  onProgress = () => {}
}) {
  if (frames.length === 0) {
    throw new Error("没有可导出的图片");
  }

  const gif = GIFEncoder();

  for (let frameIndex = 0; frameIndex < frames.length; frameIndex += 1) {
    const rgba = createRgbaFrame({
      bitmap: frames[frameIndex].bitmap,
      width,
      height,
      background
    });
    const palette = quantize(rgba, 256);
    const pixelIndex = indexFramePixels(rgba, palette);

    gif.writeFrame(pixelIndex, width, height, {
      palette,
      delay: delayMs,
      repeat: loop
    });

    onProgress((frameIndex + 1) / frames.length);
    await yieldToEventLoop();
  }

  gif.finish();

  return new Blob([gif.bytesView()], { type: "image/gif" });
}
