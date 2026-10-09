export const SUPPORTED_IMAGE_TYPES = new Set([
  "image/png",
  "image/jpeg",
  "image/webp",
  "image/gif"
]);

let nextFrameId = 0;

export function createFrameId() {
  nextFrameId += 1;
  return `frame-${nextFrameId}`;
}

export function calculateOutputSize({
  sourceWidth,
  sourceHeight,
  outputWidth
}) {
  const width = Math.max(16, Math.round(outputWidth));
  const height = Math.max(
    1,
    Math.round((sourceHeight / sourceWidth) * width)
  );

  return { width, height };
}

export function normalizeSettings(value) {
  const delayValue = Number(value.delayMs);
  const loopValue = Number(value.loop);
  const widthValue = Number(value.outputWidth);

  const delayMs = Number.isFinite(delayValue)
    ? Math.min(5000, Math.max(10, Math.round(delayValue)))
    : 100;
  const loop = Number.isFinite(loopValue)
    ? Math.min(100, Math.max(0, Math.round(loopValue)))
    : 0;
  const outputWidth = Number.isFinite(widthValue)
    ? Math.min(2000, Math.max(16, Math.round(widthValue)))
    : 800;

  return {
    delayMs,
    loop,
    outputWidth,
    background: /^#[0-9a-f]{6}$/i.test(value.background)
      ? value.background.toLowerCase()
      : "#ffffff"
  };
}

export function isSupportedImageFile(file) {
  return Boolean(file && SUPPORTED_IMAGE_TYPES.has(file.type));
}

export async function decodeImageFile(file) {
  const bitmap = await createImageBitmap(file);
  const previewScale = Math.min(
    1,
    320 / Math.max(bitmap.width, bitmap.height)
  );
  const previewCanvas = document.createElement("canvas");

  previewCanvas.width = Math.max(
    1,
    Math.round(bitmap.width * previewScale)
  );
  previewCanvas.height = Math.max(
    1,
    Math.round(bitmap.height * previewScale)
  );

  const previewContext = previewCanvas.getContext("2d");
  previewContext.drawImage(
    bitmap,
    0,
    0,
    previewCanvas.width,
    previewCanvas.height
  );

  const previewUrl = await new Promise((resolve, reject) => {
    previewCanvas.toBlob((blob) => {
      if (!blob) {
        reject(new Error(`无法创建 ${file.name} 的预览图`));
        return;
      }

      resolve(URL.createObjectURL(blob));
    }, "image/webp");
  });

  return {
    id: createFrameId(),
    name: file.name,
    bitmap,
    previewUrl,
    width: bitmap.width,
    height: bitmap.height
  };
}

export async function importFiles(files, existingFrames = []) {
  const frames = [...existingFrames];
  const skipped = [];
  const failed = [];
  const importOrder = existingFrames.map((frame) => frame.id);

  for (const file of files) {
    if (!isSupportedImageFile(file)) {
      skipped.push(file);
      continue;
    }

    try {
      const frame = await decodeImageFile(file);
      frames.push(frame);
      importOrder.push(frame.id);
    } catch {
      failed.push(file);
    }
  }

  return { frames, skipped, failed, importOrder };
}

export function reorderFrames(frames, sourceId, targetId) {
  const nextFrames = [...frames];
  const sourceIndex = nextFrames.findIndex(
    (frame) => frame.id === sourceId
  );
  const targetIndex = nextFrames.findIndex(
    (frame) => frame.id === targetId
  );

  if (
    sourceIndex < 0 ||
    targetIndex < 0 ||
    sourceIndex === targetIndex
  ) {
    return frames;
  }

  const [movedFrame] = nextFrames.splice(sourceIndex, 1);
  const adjustedTargetIndex = nextFrames.findIndex(
    (frame) => frame.id === targetId
  );

  nextFrames.splice(adjustedTargetIndex, 0, movedFrame);
  return nextFrames;
}

export function moveFrameByOffset(
  frames,
  frameId,
  offset
) {
  const sourceIndex = frames.findIndex(
    (frame) => frame.id === frameId
  );
  const targetIndex = sourceIndex + offset;

  if (
    sourceIndex < 0 ||
    targetIndex < 0 ||
    targetIndex >= frames.length ||
    sourceIndex === targetIndex
  ) {
    return frames;
  }

  const nextFrames = [...frames];
  const [movedFrame] = nextFrames.splice(sourceIndex, 1);

  nextFrames.splice(targetIndex, 0, movedFrame);
  return nextFrames;
}

export function getLoopOptions() {
  return [
    { value: "0", label: "无限循环" },
    ...Array.from({ length: 100 }, (_, index) => {
      const value = String(index + 1);
      return { value, label: `${value} 次` };
    })
  ];
}

export function calculateDuration(frameCount, delayMs) {
  return Number(((frameCount * delayMs) / 1000).toFixed(1));
}

export function drawFrame(
  { bitmap, width, height, background },
  context
) {
  context.save();
  context.fillStyle = background;
  context.fillRect(0, 0, width, height);
  context.drawImage(bitmap, 0, 0, width, height);
  context.restore();
}
