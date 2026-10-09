# Frame Foundry

> 把多张图片整理成序列，导出为 GIF。**全程在浏览器本地完成，图片不上传任何服务器。**

一个纯前端的图片序列编辑与 GIF 导出工具。拖入图片 → 调整帧序 → 设置帧延迟、循环、输出宽度与背景色 → 实时预览 → 导出 GIF。

运行时依赖只有 [`gifenc`](https://github.com/mattdesl/gifenc) 一个，没有前端框架。

---

## 特性

- **导入** PNG / JPEG / WebP / GIF，点击选择或拖放，支持多次追加
- **排序** 拖拽排序、`Alt + ←/→` 键盘排序、「移动」按钮两步入位、一键重置顺序
- **设置** 帧延迟 10–5000ms、循环 0–100 次、输出宽度 16–2000px、透明区域背景色
- **预览** 画布内实时播放动画，节奏与导出设置一致
- **导出** 浏览器内编码 GIF，自动下载并显示文件大小
- **响应式** 桌面双栏 / 移动单栏，触控目标 ≥44px
- **无障碍** 键盘可完成排序，`aria-live` 播报状态，焦点环清晰

---

## 快速开始

需要 Node.js 20+。

```bash
npm install
npm run dev        # 开发服务器
npm run build      # 生产构建，输出到 dist/
npm run preview    # 预览构建产物
```

### 测试

```bash
npm test           # 单元测试（Vitest，13 个）
npm run test:e2e   # 浏览器流程测试（Playwright，3 个）
```

> **如果 `vitest` / `vite` 报 `Cannot read file "package.json": winapi error #5`**  
> 那是沙箱环境拦截了 esbuild 子进程。加 `--configLoader runner` 绕开：
> ```bash
> npx vitest run --configLoader runner
> npx vite --configLoader runner
> ```

---

## 项目结构

```
frame-foundry/
├── index.html              # 页面语义结构，不含业务逻辑
├── src/
│   ├── style.css           # 视觉系统 + 响应式
│   ├── main.js             # UI 控制器（656 行）
│   ├── image-sequence.js   # 帧元数据、解码、排序、尺寸（无 DOM 依赖）
│   └── gif.js              # 封装 gifenc，产出 Blob
├── public/fonts/           # 自托管字体（latin 子集，54 KB）
├── tests/
│   ├── unit/               # Vitest：纯函数与 DOM 契约
│   └── e2e/                # Playwright：完整流程
└── scripts/                # 截图脚本
```

**数据流**

```text
选择/拖入文件
     ↓
main.js 创建帧记录
     ↓
image-sequence.js 解码（ImageBitmap）+ 生成缩略图（WebP blob）
     ↓
用户调整顺序与设置
     ↓
预览画布绘制 ← main.js 驱动 rAF
     ↓
点击「生成 GIF」
     ↓
gif.js 编码 Blob
     ↓
main.js 触发下载
```

---

## 实现要点

### 帧数据：bitmap 与 previewUrl 双轨

```javascript
{
  id: "frame-1",        // 稳定唯一标识，排序全靠它
  name: "photo.jpg",
  bitmap,               // ImageBitmap，全分辨率，给最终编码用
  previewUrl,           // blob: URL，缩略图用，删除帧必须 revoke
  width, height
}
```

缩略图列表可能有几十张，全分辨率 `ImageBitmap` 常驻内存会吃紧，所以预览图缩到
最长边 320px 存成 WebP blob，原图只留一份给编码。

### 内存管理

`ImageBitmap` 必须显式 `close()`，不能等 GC。删除单帧、清空序列、`pagehide`
三个时机都要释放 `bitmap` 和 `previewUrl`。

导入是异步的，用**请求令牌 + 补偿释放**处理竞态：清空时递增 `importRequestId`，
让飞行中的 promise 回来时发现令牌过期，走 `releaseFrames(addedFrames)` 分支
把已解码但无用的帧释放掉。

### 编码管线

```javascript
for (const frame of frames) {
  const rgba    = createRgbaFrame({ bitmap, width, height, background });
  const palette = quantize(rgba, 256);
  const index   = applyPalette(rgba, palette);
  gif.writeFrame(index, width, height, { palette, delay: delayMs, repeat: loop });
  onProgress((i + 1) / frames.length);
  await yieldToEventLoop();   // 每帧之间让出主线程，UI 不卡
}
```

> **单位坑**：`gifenc` 的 `writeFrame` 内部做 `Math.round(delay / 10)`，
> 即**传毫秒、库转成 1/100 秒**。换库时务必重算这个系数。

---

## 字体

标题与数据字体（Space Grotesk / JetBrains Mono）取 **latin 子集自托管**在
`public/fonts/`，不走 CDN。

本机通常并未安装这两款字体，CSS 里只写字体名会全部回退到系统字体——
`document.fonts.check()` 对此**不可靠**（永远返回 `true`），需用 canvas
`measureText` 的宽度比对才能确认字体是否真的生效。

每个家族只保留一份 woff2：可变字体在 Google Fonts 上多个字重指向同一文件，
用 `font-weight: 300 700` 区间声明即可。

---

## 设计

视觉语言取自**胶片接触印样与编辑台**：

```
--ink:     #171717   深墨黑（页头、主操作）
--paper:   #F3F0E8   纸张白（背景）
--develop: #D9FF45   显影绿（当前帧、进度）
--track:   #FF5A36   片轨橙（删除、错误）
```

「显影」是核心隐喻：当前帧用显影绿描边标记，与胶片冲洗出画面的过程呼应。

品牌标是两张叠放的画格，表达「多张图 → 一段动画」。

---

## 隐私

图片和 GIF 全程在浏览器内处理，不发送任何网络请求。可断网离线使用。

---

## License

MIT
