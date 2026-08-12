<script setup lang="ts">
import { computed, reactive, ref, watch } from "vue";
import type { ConversionResult, ImageOutputFormat } from "../../shared/types";
import DropZone from "../components/DropZone.vue";
import OutputPicker from "../components/OutputPicker.vue";
import ResultPanel from "../components/ResultPanel.vue";
import SelectMenu from "../components/SelectMenu.vue";
import Slider from "../components/Slider.vue";
import { runConversionBatch } from "../utils/batchConversion";

type DragMode = "draw" | "move" | "resize";
type ResizeHandle = "n" | "s" | "e" | "w" | "nw" | "ne" | "sw" | "se";

const input = ref<string[]>([]);
const outputDir = ref("");
const outputFormat = ref<ImageOutputFormat>("png");
const quality = ref(92);
const busy = ref(false);
const result = ref<ConversionResult | null>(null);
const stage = ref<HTMLElement | null>(null);
const imageUrl = ref("");
const naturalWidth = ref(0);
const naturalHeight = ref(0);
const selection = reactive({ x: 10, y: 10, w: 80, h: 80 });
const drag = ref<{
  mode: DragMode;
  handle?: ResizeHandle;
  startX: number;
  startY: number;
  start: { x: number; y: number; w: number; h: number };
} | null>(null);

const formatOptions = [
  { label: "PNG", value: "png", icon: "ri-image-2-line" },
  { label: "JPEG", value: "jpeg", icon: "ri-image-circle-line" },
  { label: "WebP", value: "webp", icon: "ri-image-line" },
  { label: "AVIF", value: "avif", icon: "ri-gallery-line" }
];
const handles: ResizeHandle[] = ["nw", "n", "ne", "e", "se", "s", "sw", "w"];

const canRun = computed(() => input.value.length > 0 && outputDir.value && cropRect.value.width > 0 && cropRect.value.height > 0 && !busy.value);
const selectionStyle = computed(() => ({
  left: `${selection.x}%`,
  top: `${selection.y}%`,
  width: `${selection.w}%`,
  height: `${selection.h}%`
}));
const cropRect = computed(() => ({
  x: Math.round((naturalWidth.value * selection.x) / 100),
  y: Math.round((naturalHeight.value * selection.y) / 100),
  width: Math.max(1, Math.round((naturalWidth.value * selection.w) / 100)),
  height: Math.max(1, Math.round((naturalHeight.value * selection.h) / 100))
}));

let previewRequestId = 0;

watch(
  () => input.value[0],
  async (inputPath) => {
    const requestId = ++previewRequestId;
    imageUrl.value = "";
    result.value = null;
    naturalWidth.value = 0;
    naturalHeight.value = 0;
    Object.assign(selection, { x: 10, y: 10, w: 80, h: 80 });

    if (!inputPath) return;
    try {
      const image = await window.devToolbox.imageToBase64(inputPath);
      if (requestId === previewRequestId) imageUrl.value = image.dataUrl;
    } catch {
      if (requestId === previewRequestId) imageUrl.value = "";
    }
  }
);

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function pointFromEvent(event: PointerEvent) {
  const rect = stage.value?.getBoundingClientRect();
  if (!rect) return { x: 0, y: 0 };
  return {
    x: clamp(((event.clientX - rect.left) / rect.width) * 100, 0, 100),
    y: clamp(((event.clientY - rect.top) / rect.height) * 100, 0, 100)
  };
}

function onImageLoad(event: Event) {
  const image = event.target as HTMLImageElement;
  naturalWidth.value = image.naturalWidth;
  naturalHeight.value = image.naturalHeight;
}

function beginDrag(mode: DragMode, event: PointerEvent, handle?: ResizeHandle) {
  const point = pointFromEvent(event);
  drag.value = {
    mode,
    handle,
    startX: point.x,
    startY: point.y,
    start: { ...selection }
  };
  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("pointerup", endDrag, { once: true });
}

function startDraw(event: PointerEvent) {
  const point = pointFromEvent(event);
  Object.assign(selection, { x: point.x, y: point.y, w: 1, h: 1 });
  beginDrag("draw", event);
}

function startMove(event: PointerEvent) {
  beginDrag("move", event);
}

function startResize(handle: ResizeHandle, event: PointerEvent) {
  beginDrag("resize", event, handle);
}

function onPointerMove(event: PointerEvent) {
  if (!drag.value) return;
  const point = pointFromEvent(event);
  const dx = point.x - drag.value.startX;
  const dy = point.y - drag.value.startY;
  const start = drag.value.start;

  if (drag.value.mode === "draw") {
    const x1 = drag.value.startX;
    const y1 = drag.value.startY;
    const x2 = point.x;
    const y2 = point.y;
    selection.x = Math.min(x1, x2);
    selection.y = Math.min(y1, y2);
    selection.w = Math.max(1, Math.abs(x2 - x1));
    selection.h = Math.max(1, Math.abs(y2 - y1));
    return;
  }

  if (drag.value.mode === "move") {
    selection.x = clamp(start.x + dx, 0, 100 - start.w);
    selection.y = clamp(start.y + dy, 0, 100 - start.h);
    return;
  }

  const handle = drag.value.handle ?? "se";
  let left = start.x;
  let top = start.y;
  let right = start.x + start.w;
  let bottom = start.y + start.h;

  if (handle.includes("w")) left = clamp(start.x + dx, 0, right - 1);
  if (handle.includes("e")) right = clamp(start.x + start.w + dx, left + 1, 100);
  if (handle.includes("n")) top = clamp(start.y + dy, 0, bottom - 1);
  if (handle.includes("s")) bottom = clamp(start.y + start.h + dy, top + 1, 100);

  selection.x = left;
  selection.y = top;
  selection.w = right - left;
  selection.h = bottom - top;
}

function endDrag() {
  window.removeEventListener("pointermove", onPointerMove);
  drag.value = null;
}

async function imageDimensions(inputPath: string) {
  if (inputPath === input.value[0] && naturalWidth.value && naturalHeight.value) {
    return { width: naturalWidth.value, height: naturalHeight.value };
  }
  const source = await window.devToolbox.imageToBase64(inputPath);
  return new Promise<{ width: number; height: number }>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
    image.onerror = () => reject(new Error("无法读取图片尺寸。"));
    image.src = source.dataUrl;
  });
}

async function run() {
  if (!canRun.value) return;
  busy.value = true;
  try {
    const selectedPaths = [...input.value];
    const relativeSelection = { ...selection };
    const destination = outputDir.value;
    const format = outputFormat.value;
    const outputQuality = quality.value;
    result.value = await runConversionBatch(selectedPaths, destination, async (inputPath) => {
      const dimensions = await imageDimensions(inputPath);
      return window.devToolbox.cropImage({
        inputPath,
        outputDir: destination,
        x: Math.round((dimensions.width * relativeSelection.x) / 100),
        y: Math.round((dimensions.height * relativeSelection.y) / 100),
        width: Math.max(1, Math.round((dimensions.width * relativeSelection.w) / 100)),
        height: Math.max(1, Math.round((dimensions.height * relativeSelection.h) / 100)),
        outputFormat: format,
        quality: outputQuality
      });
    });
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section class="tool-page">
    <div class="tool-header">
      <div>
        <h2>图片自由裁剪</h2>
        <p>框选比例区域并批量应用到所有图片</p>
      </div>
      <button type="button" class="primary-button" :disabled="!canRun" @click="run">
        <i class="ri-scissors-cut-line" aria-hidden="true"></i>
        导出裁剪
      </button>
    </div>

    <div class="tool-layout image-crop-layout">
      <section class="tool-main image-crop-main">
        <DropZone
          v-model="input"
          title="源图片"
          preview="image"
          :multiple="true"
          :filters="[{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'avif', 'tiff'] }]"
        />

        <div v-if="imageUrl" ref="stage" class="crop-stage" @pointerdown="startDraw">
          <img class="crop-image" :src="imageUrl" alt="裁剪预览" draggable="false" @load="onImageLoad" />
          <div class="crop-mask"></div>
          <div class="crop-selection" :style="selectionStyle" @pointerdown.stop="startMove">
            <button
              v-for="handle in handles"
              :key="handle"
              type="button"
              class="crop-handle"
              :class="`crop-handle-${handle}`"
              :aria-label="`调整 ${handle}`"
              @pointerdown.stop="startResize(handle, $event)"
            ></button>
          </div>
        </div>

        <OutputPicker v-model="outputDir" />

        <div class="option-grid">
          <div class="field">
            <span>输出格式</span>
            <SelectMenu v-model="outputFormat" :options="formatOptions" />
          </div>
          <label class="field">
            <span>质量</span>
            <Slider v-model="quality" :min="1" :max="100" aria-label="质量" />
          </label>
          <div class="crop-stats span-2">
            <span>{{ cropRect.x }}, {{ cropRect.y }}</span>
            <strong>{{ cropRect.width }} x {{ cropRect.height }}</strong>
          </div>
        </div>
      </section>

      <ResultPanel :result="result" :busy="busy" />
    </div>
  </section>
</template>
