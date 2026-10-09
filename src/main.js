import { encodeGif } from "./gif.js";
import {
  calculateDuration,
  calculateOutputSize,
  drawFrame,
  getLoopOptions,
  importFiles,
  moveFrameByOffset,
  normalizeSettings,
  reorderFrames
} from "./image-sequence.js";

let draggedFrameId = null;
let previewFrameIndex = 0;
let previewPlaying = false;
let previewStartedAt = 0;
let previewAnimationId = 0;
let isGenerating = false;
let isImporting = false;
let importRequestId = 0;
let pageIsUnloading = false;

const state = {
  frames: [],
  importOrder: [],
  settings: {
    delayMs: 100,
    loop: 0,
    outputWidth: 800,
    background: "#ffffff"
  },
  currentFrameIndex: 0
};

const elements = {
  fileInput: document.querySelector("#file-input"),
  dropZone: document.querySelector("#drop-zone"),
  pickButton: document.querySelector("#pick-button"),
  sequenceList: document.querySelector("#sequence-list"),
  emptyState: document.querySelector("#empty-state"),
  clearButton: document.querySelector("#clear-button"),
  resetButton: document.querySelector("#reset-button"),
  delayInput: document.querySelector("#delay-input"),
  loopSelect: document.querySelector("#loop-select"),
  widthInput: document.querySelector("#width-input"),
  backgroundInput: document.querySelector("#background-input"),
  backgroundValue: document.querySelector("#background-value"),
  generateButton: document.querySelector("#generate-button"),
  previewCanvas: document.querySelector("#preview-canvas"),
  previewToggle: document.querySelector("#preview-toggle"),
  previewPlaceholder: document.querySelector("#preview-placeholder"),
  status: document.querySelector("#status"),
  outputSize: document.querySelector("#output-size")
};

const previewContext = elements.previewCanvas.getContext("2d");

function releaseFrame(frame) {
  if (frame.previewUrl) {
    URL.revokeObjectURL(frame.previewUrl);
    frame.previewUrl = "";
  }

  frame.bitmap?.close();
  frame.bitmap = null;
}

function releaseFrames(frames) {
  for (const frame of frames) {
    releaseFrame(frame);
  }
}

function setStatus(message, isError = false) {
  elements.status.textContent = message;
  elements.status
    .closest(".status-bar")
    ?.classList.toggle("is-error", isError);
}

function updateControls() {
  const hasFrames = state.frames.length > 0;

  elements.clearButton.disabled = !hasFrames;
  elements.resetButton.disabled = !hasFrames;
  elements.emptyState.hidden = hasFrames;
}

function populateLoopOptions() {
  for (const option of getLoopOptions()) {
    const element = document.createElement("option");
    element.value = option.value;
    element.textContent = option.label;
    elements.loopSelect.append(element);
  }
}

elements.loopSelect.replaceChildren();

function readSettings() {
  state.settings = normalizeSettings({
    delayMs: elements.delayInput.value,
    loop: elements.loopSelect.value,
    outputWidth: elements.widthInput.value,
    background: elements.backgroundInput.value
  });

  elements.delayInput.value = state.settings.delayMs;
  elements.loopSelect.value = String(state.settings.loop);
  elements.widthInput.value = state.settings.outputWidth;
  elements.backgroundInput.value = state.settings.background;
  elements.backgroundValue.value = state.settings.background;
}

function getOutputSize() {
  const referenceFrame = state.frames[0];

  if (!referenceFrame) {
    return { width: 800, height: 450 };
  }

  return calculateOutputSize({
    sourceWidth: referenceFrame.width,
    sourceHeight: referenceFrame.height,
    outputWidth: state.settings.outputWidth
  });
}

function drawCurrentPreviewFrame() {
  const frame = state.frames[previewFrameIndex];

  if (!frame) {
    previewContext.clearRect(
      0,
      0,
      elements.previewCanvas.width,
      elements.previewCanvas.height
    );
    elements.previewPlaceholder.hidden = false;
    return;
  }

  const outputSize = getOutputSize();

  elements.previewCanvas.width = outputSize.width;
  elements.previewCanvas.height = outputSize.height;
  drawFrame(
    {
      bitmap: frame.bitmap,
      width: outputSize.width,
      height: outputSize.height,
      background: state.settings.background
    },
    previewContext
  );

  elements.previewPlaceholder.hidden = true;
}

function stopPreview() {
  previewPlaying = false;
  cancelAnimationFrame(previewAnimationId);
  elements.previewToggle.textContent = "播放预览";
}

function animatePreview(timestamp) {
  if (!previewPlaying || state.frames.length === 0) return;

  if (!previewStartedAt) {
    previewStartedAt = timestamp;
  }

  const elapsed = timestamp - previewStartedAt;
  const nextFrameIndex =
    Math.floor(elapsed / state.settings.delayMs) %
    state.frames.length;

  if (nextFrameIndex !== previewFrameIndex) {
    previewFrameIndex = nextFrameIndex;
    state.currentFrameIndex = previewFrameIndex;
    drawCurrentPreviewFrame();
  }

  previewAnimationId = requestAnimationFrame(animatePreview);
}

function startPreview() {
  if (state.frames.length === 0) return;

  previewPlaying = true;
  previewStartedAt = performance.now();
  elements.previewToggle.textContent = "暂停预览";
  previewAnimationId = requestAnimationFrame(animatePreview);
}

function updateSummary() {
  const size = getOutputSize();
  const duration = calculateDuration(
    state.frames.length,
    state.settings.delayMs
  );

  if (state.frames.length === 0) {
    setStatus("等待导入图片");
    elements.outputSize.textContent = "尚未生成";
    elements.generateButton.disabled = true;
    elements.previewToggle.disabled = true;
    return;
  }

  setStatus(
    `${String(state.frames.length).padStart(2, "0")} 帧 · ` +
      `${size.width} x ${size.height} · ` +
      `${duration.toFixed(1)} 秒 · 等待生成`
  );
  elements.outputSize.textContent = "尚未生成";
  elements.generateButton.disabled = false;
  elements.previewToggle.disabled = false;
}

function formatBytes(bytes) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) {
    return `${(bytes / 1024).toFixed(1)} KB`;
  }

  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

async function generateGif() {
  if (isGenerating || state.frames.length === 0) return;

  readSettings();

  const outputSize = getOutputSize();

  isGenerating = true;
  elements.generateButton.disabled = true;
  elements.generateButton.textContent = "正在生成 0%";
  setStatus("正在生成 GIF");

  try {
    const blob = await encodeGif({
      frames: state.frames,
      width: outputSize.width,
      height: outputSize.height,
      delayMs: state.settings.delayMs,
      loop: state.settings.loop,
      background: state.settings.background,
      onProgress: (progress) => {
        const percentage = Math.round(progress * 100);
        elements.generateButton.textContent =
          `正在生成 ${percentage}%`;
      }
    });

    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");

    if (pageIsUnloading) {
      URL.revokeObjectURL(url);
      return;
    }

    link.href = url;
    link.download = "frame-foundry.gif";
    document.body.append(link);
    link.click();
    link.remove();

    elements.outputSize.textContent =
      `GIF · ${formatBytes(blob.size)}`;
    setStatus(
      `已生成 frame-foundry.gif · ${formatBytes(blob.size)}`
    );

    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch {
    setStatus("生成失败，请重试", true);
  } finally {
    isGenerating = false;
    elements.generateButton.textContent = "生成 GIF";
    elements.generateButton.disabled = state.frames.length === 0;
  }
}

function removeFrame(frameId) {
  const index = state.frames.findIndex(
    (frame) => frame.id === frameId
  );

  if (index < 0) return;

  const [frame] = state.frames.splice(index, 1);
  releaseFrame(frame);

  state.currentFrameIndex = Math.min(
    state.currentFrameIndex,
    Math.max(0, state.frames.length - 1)
  );

  renderFrames();
  drawCurrentPreviewFrame();
  updateSummary();
  updateControls();
  setStatus(`已删除第 ${index + 1} 帧`);
}

function renderFrames() {
  elements.sequenceList.replaceChildren();

  state.frames.forEach((frame, index) => {
    const item = document.createElement("li");
    const card = document.createElement("article");
    const image = document.createElement("img");
    const moveControls = document.createElement("div");
    const moveButton = document.createElement("button");
    const meta = document.createElement("div");
    const number = document.createElement("span");
    const name = document.createElement("p");
    const removeButton = document.createElement("button");

    item.className = "frame-card-slot";
    item.dataset.frameId = frame.id;

    card.className = "frame-card";
    card.tabIndex = 0;
    card.setAttribute("role", "group");
    card.setAttribute(
      "aria-label",
      `第 ${index + 1} 帧，共 ${state.frames.length} 帧。按 Alt 加方向键移动`
    );
    card.dataset.frameId = frame.id;
    card.classList.toggle(
      "is-active",
      index === state.currentFrameIndex
    );

    image.className = "frame-card__media";
    image.src = frame.previewUrl;
    image.alt = `第 ${index + 1} 帧：${frame.name}`;

    meta.className = "frame-card__meta";

    number.className = "frame-card__index";
    number.textContent = String(index + 1).padStart(2, "0");

    name.className = "frame-card__name";
    name.textContent = frame.name;
    name.title = frame.name;

    removeButton.className = "frame-card__remove";
    removeButton.type = "button";
    removeButton.textContent = "×";
    removeButton.setAttribute(
      "aria-label",
      `删除第 ${index + 1} 帧 ${frame.name}`
    );
    removeButton.addEventListener("click", () =>
      removeFrame(frame.id)
    );

    moveControls.className = "frame-card__move-controls";

    moveButton.className = "frame-card__move";
    moveButton.type = "button";
    moveButton.textContent = "移动";
    moveButton.setAttribute("aria-label", `移动第 ${index + 1} 帧`);
    moveButton.addEventListener("click", () => {
      moveSelectedFrame(frame.id);
    });

    card.addEventListener("keydown", (event) => {
      if (!event.altKey) return;

      if (event.key === "ArrowLeft") {
        event.preventDefault();
        moveFrame(frame.id, -1);
      } else if (event.key === "ArrowRight") {
        event.preventDefault();
        moveFrame(frame.id, 1);
      }
    });

    card.addEventListener("dragstart", () => {
      draggedFrameId = frame.id;
      card.classList.add("is-dragging");
    });

    card.addEventListener("dragend", () => {
      draggedFrameId = null;
      card.classList.remove("is-dragging");
    });

    item.addEventListener("dragover", (event) => {
      if (!draggedFrameId || draggedFrameId === frame.id) return;
      event.preventDefault();
      item.classList.add("is-drop-target");
    });

    item.addEventListener("dragleave", () => {
      item.classList.remove("is-drop-target");
    });

    item.addEventListener("drop", (event) => {
      event.preventDefault();
      item.classList.remove("is-drop-target");

      if (!draggedFrameId || draggedFrameId === frame.id) return;

      state.frames = reorderFrames(
        state.frames,
        draggedFrameId,
        frame.id
      );
      renderFrames();
      setStatus(`已将图片移动到第 ${index + 1} 位`);
    });

    moveControls.append(moveButton);
    meta.append(number, name, removeButton);
    card.append(image, meta, moveControls);
    item.append(card);
    elements.sequenceList.append(item);
  });
}

function moveFrame(frameId, offset) {
  const nextFrames = moveFrameByOffset(
    state.frames,
    frameId,
    offset
  );

  if (nextFrames === state.frames) return;

  const movedIndex = nextFrames.findIndex(
    (frame) => frame.id === frameId
  );

  state.frames = nextFrames;
  state.currentFrameIndex = movedIndex;
  previewFrameIndex = movedIndex;
  renderFrames();
  drawCurrentPreviewFrame();
  updateSummary();
  setStatus(`已将图片移动到第 ${movedIndex + 1} 位`);
}

let selectedFrameId = null;

function moveSelectedFrame(targetId) {
  if (!selectedFrameId || selectedFrameId === targetId) {
    selectedFrameId = targetId;
    setStatus("已选择要移动的图片，再选择目标位置");
    return;
  }

  const nextFrames = reorderFrames(
    state.frames,
    selectedFrameId,
    targetId
  );
  const movedIndex = nextFrames.findIndex(
    (frame) => frame.id === selectedFrameId
  );

  selectedFrameId = null;
  state.frames = nextFrames;
  state.currentFrameIndex = movedIndex;
  previewFrameIndex = movedIndex;
  renderFrames();
  drawCurrentPreviewFrame();
  updateSummary();
  setStatus(`已将图片移动到第 ${movedIndex + 1} 位`);
}

async function handleFiles(fileList) {
  const files = Array.from(fileList);

  if (files.length === 0) return;
  if (isImporting || isGenerating) {
    setStatus(
      isGenerating
        ? "GIF 生成期间不能导入新图片"
        : "图片正在导入，请稍候"
    );
    return;
  }

  const requestId = ++importRequestId;
  const baseFrames = state.frames;
  const baseImportOrder = state.importOrder;

  isImporting = true;
  elements.pickButton.disabled = true;
  elements.clearButton.disabled = true;
  elements.resetButton.disabled = true;
  setStatus(`正在导入 ${files.length} 张图片`);

  try {
    const result = await importFiles(files, baseFrames);

    if (requestId !== importRequestId || pageIsUnloading) {
      const addedFrames = result.frames.slice(
        baseFrames.length
      );
      releaseFrames(addedFrames);
      return;
    }

    state.frames = result.frames;
    state.importOrder = result.importOrder;

    const messages = [];
    const hasErrors = result.failed.length > 0;

    if (result.failed.length > 0) {
      messages.push(
        `${result.failed.map((file) => file.name).join("、")} 解码失败`
      );
    }

    if (result.skipped.length > 0) {
      messages.push(
        `已跳过 ${result.skipped.length} 个不支持的文件`
      );
    }

    if (result.failed.length === 0 && result.skipped.length === 0) {
      messages.push(`已导入 ${files.length} 张图片`);
    }

    setStatus(messages.join(" · "), hasErrors);
  } catch {
    if (requestId === importRequestId && !pageIsUnloading) {
      setStatus("导入失败，请重试", true);
    }
  } finally {
    if (requestId === importRequestId) {
      isImporting = false;
      elements.pickButton.disabled = false;
      renderFrames();
      drawCurrentPreviewFrame();
      updateSummary();
      updateControls();
    }
  }
}

elements.pickButton.addEventListener("click", () => {
  elements.fileInput.click();
});

elements.dropZone.addEventListener("keydown", (event) => {
  if (event.key !== "Enter" && event.key !== " ") return;

  event.preventDefault();
  elements.fileInput.click();
});

elements.fileInput.addEventListener("change", async (event) => {
  await handleFiles(event.target.files);
  event.target.value = "";
});

elements.dropZone.addEventListener("dragover", (event) => {
  event.preventDefault();
  elements.dropZone.classList.add("is-dragging");
});

elements.dropZone.addEventListener("dragleave", () => {
  elements.dropZone.classList.remove("is-dragging");
});

elements.dropZone.addEventListener("drop", async (event) => {
  event.preventDefault();
  elements.dropZone.classList.remove("is-dragging");
  await handleFiles(event.dataTransfer.files);
});

elements.clearButton.addEventListener("click", () => {
  importRequestId += 1;
  isImporting = false;
  elements.pickButton.disabled = false;
  releaseFrames(state.frames);

  state.frames = [];
  state.importOrder = [];
  state.currentFrameIndex = 0;
  elements.sequenceList.replaceChildren();
  setStatus("序列已清空");
  renderFrames();
  drawCurrentPreviewFrame();
  updateSummary();
  updateControls();
});

elements.resetButton.addEventListener("click", () => {
  const frameMap = new Map(
    state.frames.map((frame) => [frame.id, frame])
  );
  state.frames = state.importOrder
    .map((id) => frameMap.get(id))
    .filter(Boolean);
  renderFrames();
  drawCurrentPreviewFrame();
  updateSummary();
  setStatus("顺序已重置");
  updateControls();
});

for (const input of [
  elements.delayInput,
  elements.loopSelect,
  elements.widthInput,
  elements.backgroundInput
]) {
  const updateFromInput = () => {
    readSettings();
    previewFrameIndex = 0;
    state.currentFrameIndex = 0;
    stopPreview();
    renderFrames();
    drawCurrentPreviewFrame();
    updateSummary();
  };

  input.addEventListener("input", updateFromInput);
  input.addEventListener("change", updateFromInput);
}

elements.previewToggle.addEventListener("click", () => {
  if (previewPlaying) {
    stopPreview();
  } else {
    startPreview();
  }
});

elements.generateButton.addEventListener("click", generateGif);

window.addEventListener("pagehide", () => {
  pageIsUnloading = true;
  importRequestId += 1;
  stopPreview();
  releaseFrames(state.frames);
  state.frames = [];
});

populateLoopOptions();
readSettings();
renderFrames();
drawCurrentPreviewFrame();
updateSummary();
updateControls();
