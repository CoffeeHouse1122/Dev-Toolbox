<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";

type MarkMode = "measure" | "color" | "rect" | "text";

type Point = { x: number; y: number };

type MarkAnnotation =
  | { id: string; type: "measure"; start: Point; end: Point }
  | { id: string; type: "rect"; start: Point; end: Point }
  | { id: string; type: "text"; point: Point; text: string };

interface ImageInfo {
  name: string;
  size: number;
  type: string;
  width: number;
  height: number;
}

const mode = ref<MarkMode>("measure");
const imageUrl = ref("");
const imageInfo = ref<ImageInfo | null>(null);
const annotations = ref<MarkAnnotation[]>([]);
const draft = ref<MarkAnnotation | null>(null);
const selectedId = ref("");
const textValue = ref("标注说明");
const colorSample = ref<{ hex: string; rgb: string; point: Point } | null>(null);
const copiedColor = ref(false);
const hoverPoint = ref<Point | null>(null);
const dragActive = ref(false);
const spacePressed = ref(false);
const isPanning = ref(false);
const viewScale = ref(1);
const viewOffset = ref({ x: 0, y: 0 });
const viewportRef = ref<HTMLElement | null>(null);
const overlayRef = ref<SVGSVGElement | null>(null);
const imageRef = ref<HTMLImageElement | null>(null);
const fileInputRef = ref<HTMLInputElement | null>(null);
const samplingCanvas = document.createElement("canvas");

let panState:
  | {
      pointerId: number;
      startX: number;
      startY: number;
      originX: number;
      originY: number;
    }
  | null = null;

const hasImage = computed(() => Boolean(imageUrl.value && imageInfo.value));
const screenUnit = computed(() => 1 / Math.max(0.05, viewScale.value));
const lineStrokeWidth = computed(() => 2.5 * screenUnit.value);
const labelFontSize = computed(() => 14 * screenUnit.value);
const labelStrokeWidth = computed(() => 4 * screenUnit.value);
const handleRadius = computed(() => 4.5 * screenUnit.value);
const cursorSize = computed(() => 13 * screenUnit.value);

const modeOptions: Array<{ value: MarkMode; label: string; icon: string; title: string }> = [
  { value: "measure", label: "测量", icon: "ri-ruler-2-line", title: "测量距离（快捷键 1）" },
  { value: "color", label: "吸色", icon: "ri-dropper-line", title: "吸取颜色（快捷键 2）" },
  { value: "rect", label: "矩形", icon: "ri-rectangle-line", title: "矩形标注（快捷键 3）" },
  { value: "text", label: "文字", icon: "ri-text", title: "文字标注（快捷键 4）" }
];

function formatFileSize(size: number) {
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${(size / 1024).toFixed(1)} KB`;
  return `${(size / 1024 / 1024).toFixed(2)} MB`;
}

function annotationId() {
  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function normalizeRect(start: Point, end: Point) {
  const x = Math.min(start.x, end.x);
  const y = Math.min(start.y, end.y);
  return {
    x,
    y,
    width: Math.abs(end.x - start.x),
    height: Math.abs(end.y - start.y)
  };
}

function rectLabelY(start: Point, end: Point) {
  const rect = normalizeRect(start, end);
  return rect.y > labelFontSize.value + 12 * screenUnit.value ? rect.y - 8 * screenUnit.value : rect.y + labelFontSize.value + 9 * screenUnit.value;
}

function distanceLabel(start: Point, end: Point) {
  const dx = Math.abs(end.x - start.x);
  const dy = Math.abs(end.y - start.y);
  const length = Math.sqrt(dx * dx + dy * dy);
  if (dy < 2) return `${Math.round(dx)}px`;
  if (dx < 2) return `${Math.round(dy)}px`;
  return `${Math.round(dx)} x ${Math.round(dy)} / ${Math.round(length)}px`;
}

function midpoint(start: Point, end: Point) {
  return { x: (start.x + end.x) / 2, y: (start.y + end.y) / 2 };
}

function clampPoint(point: Point) {
  const width = imageInfo.value?.width ?? 0;
  const height = imageInfo.value?.height ?? 0;
  return {
    x: Math.max(0, Math.min(width, point.x)),
    y: Math.max(0, Math.min(height, point.y))
  };
}

function eventPoint(event: PointerEvent): Point | null {
  const svg = overlayRef.value;
  const info = imageInfo.value;
  if (!svg || !info) return null;
  const rect = svg.getBoundingClientRect();
  if (!rect.width || !rect.height) return null;
  return clampPoint({
    x: ((event.clientX - rect.left) / rect.width) * info.width,
    y: ((event.clientY - rect.top) / rect.height) * info.height
  });
}

function isUsefulDrag(item: MarkAnnotation) {
  if (item.type === "text") return true;
  const rect = normalizeRect(item.start, item.end);
  return rect.width > 3 || rect.height > 3;
}

function setMode(nextMode: MarkMode) {
  mode.value = nextMode;
  draft.value = null;
}

function selectAnnotation(id: string) {
  selectedId.value = id;
}

function deleteSelectedAnnotation() {
  if (!selectedId.value) return;
  annotations.value = annotations.value.filter((item) => item.id !== selectedId.value);
  selectedId.value = "";
}

function startDraw(event: PointerEvent) {
  if (!hasImage.value || event.button !== 0 || isPanning.value) return;
  const point = eventPoint(event);
  if (!point) return;
  hoverPoint.value = point;
  selectedId.value = "";

  if (mode.value === "color") {
    sampleColor(point);
    return;
  }

  if (mode.value === "text") {
    const item: MarkAnnotation = { id: annotationId(), type: "text", point, text: textValue.value.trim() || "标注" };
    annotations.value = [...annotations.value, item];
    selectedId.value = item.id;
    return;
  }

  draft.value = { id: annotationId(), type: mode.value, start: point, end: point } as MarkAnnotation;
  overlayRef.value?.setPointerCapture(event.pointerId);
}

function moveDraw(event: PointerEvent) {
  const point = eventPoint(event);
  if (point) hoverPoint.value = point;
  if (!draft.value || !hasImage.value || draft.value.type === "text") return;
  if (!point) return;
  draft.value = { ...draft.value, end: point } as MarkAnnotation;
}

function endDraw(event: PointerEvent) {
  if (!draft.value) return;
  overlayRef.value?.releasePointerCapture(event.pointerId);
  if (isUsefulDrag(draft.value)) {
    annotations.value = [...annotations.value, draft.value];
    selectedId.value = draft.value.id;
  }
  draft.value = null;
}

function sampleColor(point: Point) {
  const image = imageRef.value;
  const info = imageInfo.value;
  if (!image || !info) return;

  samplingCanvas.width = info.width;
  samplingCanvas.height = info.height;
  const context = samplingCanvas.getContext("2d", { willReadFrequently: true });
  if (!context) return;
  context.drawImage(image, 0, 0, info.width, info.height);
  const x = Math.max(0, Math.min(info.width - 1, Math.floor(point.x)));
  const y = Math.max(0, Math.min(info.height - 1, Math.floor(point.y)));
  const [r, g, b] = context.getImageData(x, y, 1, 1).data;
  const hex = `#${[r, g, b].map((value) => value.toString(16).padStart(2, "0")).join("")}`.toUpperCase();
  colorSample.value = { hex, rgb: `rgb(${r}, ${g}, ${b})`, point: { x, y } };
  copiedColor.value = false;
}

async function copyColorHex() {
  if (!colorSample.value) return;
  await navigator.clipboard.writeText(colorSample.value.hex);
  copiedColor.value = true;
  window.setTimeout(() => {
    copiedColor.value = false;
  }, 1200);
}

function setViewScale(nextScale: number, anchor?: { clientX: number; clientY: number }) {
  const viewport = viewportRef.value;
  const scale = Math.min(12, Math.max(0.05, Number(nextScale.toFixed(3))));
  if (!viewport || !anchor) {
    viewScale.value = scale;
    return;
  }

  const rect = viewport.getBoundingClientRect();
  const localX = anchor.clientX - rect.left;
  const localY = anchor.clientY - rect.top;
  const contentX = (localX - viewOffset.value.x) / viewScale.value;
  const contentY = (localY - viewOffset.value.y) / viewScale.value;
  viewScale.value = scale;
  viewOffset.value = {
    x: localX - contentX * scale,
    y: localY - contentY * scale
  };
}

function zoomCanvas(delta: number) {
  const viewport = viewportRef.value;
  if (!viewport) {
    setViewScale(viewScale.value + delta);
    return;
  }
  const rect = viewport.getBoundingClientRect();
  setViewScale(viewScale.value + delta, {
    clientX: rect.left + rect.width / 2,
    clientY: rect.top + rect.height / 2
  });
}

function fitImageToStage() {
  const viewport = viewportRef.value;
  const info = imageInfo.value;
  if (!viewport || !info.width || !info.height) return;
  const scale = Math.min(1, (viewport.clientWidth - 48) / info.width, (viewport.clientHeight - 48) / info.height);
  const safeScale = Math.max(0.05, scale);
  viewScale.value = safeScale;
  viewOffset.value = {
    x: Math.round((viewport.clientWidth - info.width * safeScale) / 2),
    y: Math.round((viewport.clientHeight - info.height * safeScale) / 2)
  };
}

function handleStageWheel(event: WheelEvent) {
  if (!hasImage.value) return;
  event.preventDefault();
  setViewScale(viewScale.value * (event.deltaY < 0 ? 1.12 : 0.88), event);
}

function shouldStartPan(event: PointerEvent) {
  return spacePressed.value || event.button === 1 || event.button === 2;
}

function maybeStartPan(event: PointerEvent) {
  if (!hasImage.value || !shouldStartPan(event)) return;
  const viewport = viewportRef.value;
  if (!viewport) return;
  isPanning.value = true;
  panState = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    originX: viewOffset.value.x,
    originY: viewOffset.value.y
  };
  viewport.setPointerCapture(event.pointerId);
  event.preventDefault();
  event.stopPropagation();
}

function movePan(event: PointerEvent) {
  if (!panState || panState.pointerId !== event.pointerId) return;
  viewOffset.value = {
    x: panState.originX + event.clientX - panState.startX,
    y: panState.originY + event.clientY - panState.startY
  };
  event.preventDefault();
  event.stopPropagation();
}

function endPan(event: PointerEvent) {
  if (!panState || panState.pointerId !== event.pointerId) return;
  viewportRef.value?.releasePointerCapture(event.pointerId);
  panState = null;
  isPanning.value = false;
  event.preventDefault();
  event.stopPropagation();
}

function loadImageFile(file: File) {
  if (!file.type.startsWith("image/") && !/\.(png|jpe?g|webp|gif|bmp|svg)$/i.test(file.name)) return;
  const reader = new FileReader();
  reader.onload = () => {
    imageUrl.value = String(reader.result || "");
    imageInfo.value = {
      name: file.name,
      size: file.size,
      type: file.type || file.name.split(".").at(-1) || "image",
      width: 0,
      height: 0
    };
    annotations.value = [];
    draft.value = null;
    selectedId.value = "";
    colorSample.value = null;
    hoverPoint.value = null;
    viewScale.value = 1;
    viewOffset.value = { x: 0, y: 0 };
  };
  reader.readAsDataURL(file);
}

async function onImageLoad() {
  const image = imageRef.value;
  if (!image || !imageInfo.value) return;
  imageInfo.value = {
    ...imageInfo.value,
    width: image.naturalWidth,
    height: image.naturalHeight
  };
  await nextTick();
  fitImageToStage();
}

function openFilePicker() {
  fileInputRef.value?.click();
}

function onFileInput(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  if (file) loadImageFile(file);
  input.value = "";
}

function onDrop(event: DragEvent) {
  dragActive.value = false;
  const file = event.dataTransfer?.files?.[0];
  if (file) loadImageFile(file);
}

function undo() {
  const removed = annotations.value.at(-1);
  annotations.value = annotations.value.slice(0, -1);
  if (removed?.id === selectedId.value) selectedId.value = "";
}

function clearAll() {
  annotations.value = [];
  draft.value = null;
  selectedId.value = "";
}

function isTypingTarget(target: EventTarget | null) {
  return target instanceof HTMLInputElement || target instanceof HTMLTextAreaElement || (target instanceof HTMLElement && target.isContentEditable);
}

function handleKeydown(event: KeyboardEvent) {
  if (event.key === " " && !isTypingTarget(event.target)) {
    spacePressed.value = true;
    event.preventDefault();
    return;
  }

  if (isTypingTarget(event.target)) return;

  if (event.key === "1") setMode("measure");
  if (event.key === "2") setMode("color");
  if (event.key === "3") setMode("rect");
  if (event.key === "4") setMode("text");
  if (event.key === "Escape") {
    selectedId.value = "";
    draft.value = null;
  }
  if (event.key === "Delete" || event.key === "Backspace") {
    deleteSelectedAnnotation();
    event.preventDefault();
  }
  if ((event.ctrlKey || event.metaKey) && event.key === "0") {
    fitImageToStage();
    event.preventDefault();
  }
  if ((event.ctrlKey || event.metaKey) && (event.key === "+" || event.key === "=")) {
    zoomCanvas(0.2);
    event.preventDefault();
  }
  if ((event.ctrlKey || event.metaKey) && event.key === "-") {
    zoomCanvas(-0.2);
    event.preventDefault();
  }
}

function handleKeyup(event: KeyboardEvent) {
  if (event.key === " ") spacePressed.value = false;
}

onMounted(() => {
  window.addEventListener("keydown", handleKeydown);
  window.addEventListener("keyup", handleKeyup);
  window.addEventListener("resize", fitImageToStage);
});

onBeforeUnmount(() => {
  window.removeEventListener("keydown", handleKeydown);
  window.removeEventListener("keyup", handleKeyup);
  window.removeEventListener("resize", fitImageToStage);
});
</script>

<template>
  <section class="tool-page mark-man-tool">
    <div class="tool-header">
      <div>
        <h2>Mark Man 标注</h2>
        <p>图片测距、取色与标注</p>
      </div>
      <div class="header-actions">
        <button type="button" class="secondary-button" :disabled="!hasImage" title="适应画布（Ctrl+0）" @click="fitImageToStage">
          <i class="ri-fullscreen-line" aria-hidden="true"></i>
          适应
        </button>
        <button type="button" class="secondary-button" :disabled="!annotations.length" @click="undo">
          <i class="ri-arrow-go-back-line" aria-hidden="true"></i>
          撤销
        </button>
        <button type="button" class="secondary-button" :disabled="!annotations.length" @click="clearAll">
          <i class="ri-eraser-line" aria-hidden="true"></i>
          清空
        </button>
      </div>
    </div>

    <div class="mark-layout">
      <section class="tool-main mark-stage-panel">
        <div
          class="mark-drop-zone"
          :class="{ active: dragActive, filled: hasImage }"
          @dragenter.prevent="dragActive = true"
          @dragover.prevent="dragActive = true"
          @dragleave.prevent="dragActive = false"
          @drop.prevent="onDrop"
        >
          <template v-if="hasImage">
            <div
              ref="viewportRef"
              class="mark-viewport"
              :class="{ panning: isPanning, 'space-mode': spacePressed }"
              @selectstart.prevent
              @dragstart.prevent
              @wheel="handleStageWheel"
              @pointerdown.capture="maybeStartPan"
              @pointermove.capture="movePan"
              @pointerup.capture="endPan"
              @pointercancel.capture="endPan"
              @contextmenu.prevent
            >
              <div
                class="mark-canvas-inner"
                :style="{
                  transform: `translate(${viewOffset.x}px, ${viewOffset.y}px) scale(${viewScale})`
                }"
              >
                <div
                  class="mark-image-frame"
                  :style="{ width: `${imageInfo?.width || 1}px`, height: `${imageInfo?.height || 1}px` }"
                >
                  <img ref="imageRef" :src="imageUrl" alt="标注图片" draggable="false" @load="onImageLoad" />
                  <svg
                    v-if="imageInfo?.width && imageInfo?.height"
                    ref="overlayRef"
                    class="mark-overlay"
                    :viewBox="`0 0 ${imageInfo.width} ${imageInfo.height}`"
                    @pointerdown="startDraw"
                    @pointermove="moveDraw"
                    @pointerup="endDraw"
                    @pointercancel="endDraw"
                    @pointerleave="hoverPoint = null"
                  >
                    <template v-for="item in [...annotations, ...(draft ? [draft] : [])]" :key="item.id">
                      <g
                        v-if="item.type === 'measure'"
                        class="mark-annotation mark-measure"
                        :class="{ selected: selectedId === item.id }"
                        @pointerdown.stop.prevent="selectAnnotation(item.id)"
                      >
                        <line
                          :x1="item.start.x"
                          :y1="item.start.y"
                          :x2="item.end.x"
                          :y2="item.end.y"
                          :stroke-width="lineStrokeWidth"
                        />
                        <circle :cx="item.start.x" :cy="item.start.y" :r="handleRadius" :stroke-width="lineStrokeWidth" />
                        <circle :cx="item.end.x" :cy="item.end.y" :r="handleRadius" :stroke-width="lineStrokeWidth" />
                        <text
                          :x="midpoint(item.start, item.end).x"
                          :y="midpoint(item.start, item.end).y - 10 * screenUnit"
                          text-anchor="middle"
                          :font-size="labelFontSize"
                          :stroke-width="labelStrokeWidth"
                        >
                          {{ distanceLabel(item.start, item.end) }}
                        </text>
                      </g>
                      <g
                        v-else-if="item.type === 'rect'"
                        class="mark-annotation mark-rect"
                        :class="{ selected: selectedId === item.id }"
                        @pointerdown.stop.prevent="selectAnnotation(item.id)"
                      >
                        <rect
                          :x="normalizeRect(item.start, item.end).x"
                          :y="normalizeRect(item.start, item.end).y"
                          :width="normalizeRect(item.start, item.end).width"
                          :height="normalizeRect(item.start, item.end).height"
                          :stroke-width="lineStrokeWidth"
                        />
                        <text
                          :x="normalizeRect(item.start, item.end).x + 6 * screenUnit"
                          :y="rectLabelY(item.start, item.end)"
                          :font-size="labelFontSize"
                          :stroke-width="labelStrokeWidth"
                        >
                          {{ Math.round(normalizeRect(item.start, item.end).width) }} x {{ Math.round(normalizeRect(item.start, item.end).height) }}
                        </text>
                      </g>
                      <g
                        v-else
                        class="mark-annotation mark-text"
                        :class="{ selected: selectedId === item.id }"
                        @pointerdown.stop.prevent="selectAnnotation(item.id)"
                      >
                        <circle :cx="item.point.x" :cy="item.point.y" :r="handleRadius" :stroke-width="lineStrokeWidth" />
                        <text
                          :x="item.point.x + 10 * screenUnit"
                          :y="item.point.y - 8 * screenUnit"
                          :font-size="labelFontSize * 1.08"
                          :stroke-width="labelStrokeWidth"
                        >{{ item.text }}</text>
                      </g>
                    </template>

                    <g v-if="colorSample" class="mark-color-marker" pointer-events="none">
                      <circle :cx="colorSample.point.x" :cy="colorSample.point.y" :r="9 * screenUnit" :stroke-width="lineStrokeWidth" />
                      <text
                        :x="colorSample.point.x + 13 * screenUnit"
                        :y="colorSample.point.y - 10 * screenUnit"
                        :font-size="labelFontSize"
                        :stroke-width="labelStrokeWidth"
                      >{{ colorSample.hex }}</text>
                    </g>

                    <g v-if="hoverPoint" class="mark-tool-cursor" :class="`cursor-${mode}`" pointer-events="none">
                      <template v-if="mode === 'rect'">
                        <line :x1="0" :y1="hoverPoint.y" :x2="imageInfo.width" :y2="hoverPoint.y" :stroke-width="lineStrokeWidth" />
                        <line :x1="hoverPoint.x" :y1="0" :x2="hoverPoint.x" :y2="imageInfo.height" :stroke-width="lineStrokeWidth" />
                      </template>
                      <template v-else>
                        <line :x1="hoverPoint.x - cursorSize" :y1="hoverPoint.y" :x2="hoverPoint.x + cursorSize" :y2="hoverPoint.y" :stroke-width="lineStrokeWidth" />
                        <line :x1="hoverPoint.x" :y1="hoverPoint.y - cursorSize" :x2="hoverPoint.x" :y2="hoverPoint.y + cursorSize" :stroke-width="lineStrokeWidth" />
                      </template>
                      <circle v-if="mode === 'color'" :cx="hoverPoint.x" :cy="hoverPoint.y" :r="cursorSize" :stroke-width="lineStrokeWidth" />
                      <rect
                        v-if="mode === 'measure'"
                        :x="hoverPoint.x - 3 * screenUnit"
                        :y="hoverPoint.y - 3 * screenUnit"
                        :width="6 * screenUnit"
                        :height="6 * screenUnit"
                        :stroke-width="lineStrokeWidth"
                      />
                      <text
                        v-if="mode === 'text'"
                        :x="hoverPoint.x + 9 * screenUnit"
                        :y="hoverPoint.y - 9 * screenUnit"
                        :font-size="labelFontSize * 1.15"
                        :stroke-width="labelStrokeWidth"
                      >T</text>
                    </g>
                  </svg>
                </div>
              </div>
            </div>
          </template>
          <template v-else>
            <i class="ri-image-add-line" aria-hidden="true"></i>
            <strong>拖入图片</strong>
            <span>PNG、JPG、WebP、GIF 等常见图片格式</span>
            <button type="button" class="primary-button" @click="openFilePicker">选择图片</button>
          </template>
        </div>
        <input ref="fileInputRef" type="file" accept="image/*" hidden @change="onFileInput" />
      </section>

      <aside class="result-panel mark-side-panel">
        <section class="mark-panel-section">
          <div class="section-title">
            <h2>工具</h2>
            <span class="status-pill">{{ mode.toUpperCase() }}</span>
          </div>
          <div class="mark-tool-grid">
            <button
              v-for="item in modeOptions"
              :key="item.value"
              type="button"
              class="secondary-button"
              :class="{ selected: mode === item.value }"
              :title="item.title"
              @click="setMode(item.value)"
            >
              <i :class="item.icon" aria-hidden="true"></i>
              {{ item.label }}
            </button>
          </div>
          <input v-if="mode === 'text'" v-model="textValue" class="mark-text-input" placeholder="标注文案" />
        </section>

        <section class="mark-panel-section">
          <div class="section-title">
            <h2>视图</h2>
            <span class="status-pill">{{ Math.round(viewScale * 100) }}%</span>
          </div>
          <div class="mark-view-actions">
            <button type="button" class="icon-button" :disabled="!hasImage" title="缩小（Ctrl+-）" @click="zoomCanvas(-0.2)">
              <i class="ri-zoom-out-line" aria-hidden="true"></i>
            </button>
            <button type="button" class="icon-button" :disabled="!hasImage" title="放大（Ctrl++）" @click="zoomCanvas(0.2)">
              <i class="ri-zoom-in-line" aria-hidden="true"></i>
            </button>
            <button type="button" class="secondary-button" :disabled="!hasImage" title="适应画布（Ctrl+0）" @click="fitImageToStage">适应画布</button>
          </div>
        </section>

        <section class="mark-panel-section">
          <div class="section-title">
            <h2>颜色</h2>
            <span class="status-pill">PICK</span>
          </div>
          <div v-if="colorSample" class="mark-color-card">
            <span class="mark-color-swatch" :style="{ background: colorSample.hex }"></span>
            <div>
              <strong>{{ colorSample.hex }}</strong>
              <small>{{ colorSample.rgb }} / {{ colorSample.point.x }}, {{ colorSample.point.y }}</small>
            </div>
            <button type="button" class="icon-button" :title="copiedColor ? '已复制' : '复制色值'" @click="copyColorHex">
              <i :class="copiedColor ? 'ri-check-line' : 'ri-file-copy-line'" aria-hidden="true"></i>
            </button>
          </div>
          <p v-else class="empty-state">切换到吸色后点击图片取色。</p>
        </section>

        <section class="mark-panel-section">
          <div class="section-title">
            <h2>标注</h2>
            <span class="status-pill">{{ annotations.length }}</span>
          </div>
          <div class="mark-selection-state">
            <span>{{ selectedId ? "已选中" : "未选中" }}</span>
            <button type="button" class="secondary-button" :disabled="!selectedId" @click="deleteSelectedAnnotation">删除标注</button>
          </div>
        </section>

        <section class="mark-panel-section">
          <div class="section-title">
            <h2>图片信息</h2>
            <span class="status-pill">INFO</span>
          </div>
          <div v-if="imageInfo" class="mark-info-list">
            <div><span>命名</span><strong :title="imageInfo.name">{{ imageInfo.name }}</strong></div>
            <div><span>尺寸</span><strong>{{ imageInfo.width }} x {{ imageInfo.height }}</strong></div>
            <div><span>大小</span><strong>{{ formatFileSize(imageInfo.size) }}</strong></div>
            <div><span>格式</span><strong>{{ imageInfo.type }}</strong></div>
          </div>
          <p v-else class="empty-state">加载图片后显示基础信息。</p>
        </section>
      </aside>
    </div>
  </section>
</template>

<style scoped>
.mark-man-tool {
  min-height: calc(100vh - 108px);
  user-select: none;
  -webkit-user-select: none;
}

.mark-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 340px;
  gap: 18px;
  align-items: start;
}

.mark-stage-panel {
  min-width: 0;
}

.mark-drop-zone {
  display: grid;
  place-items: center;
  gap: 12px;
  min-height: 590px;
  padding: 22px;
  overflow: hidden;
  border: 1px dashed var(--border-strong);
  border-radius: 8px;
  background:
    linear-gradient(45deg, color-mix(in srgb, var(--surface-subtle) 86%, transparent) 25%, transparent 25%),
    linear-gradient(-45deg, color-mix(in srgb, var(--surface-subtle) 86%, transparent) 25%, transparent 25%),
    var(--surface);
  background-size: 22px 22px;
}

.mark-drop-zone.active {
  border-color: var(--accent);
  background-color: color-mix(in srgb, var(--accent) 8%, var(--surface));
}

.mark-drop-zone.filled {
  display: block;
  padding: 0;
}

.mark-drop-zone > i {
  color: var(--accent-strong);
  font-size: 42px;
}

.mark-drop-zone > span {
  color: var(--muted);
}

.mark-viewport {
  position: relative;
  width: 100%;
  height: min(72vh, 760px);
  min-height: 560px;
  overflow: hidden;
  border-radius: 8px;
  background:
    linear-gradient(45deg, color-mix(in srgb, var(--border) 24%, transparent) 25%, transparent 25%),
    linear-gradient(-45deg, color-mix(in srgb, var(--border) 24%, transparent) 25%, transparent 25%),
    var(--surface-subtle);
  background-size: 18px 18px;
  cursor: default;
}

.mark-viewport.space-mode {
  cursor: grab;
}

.mark-viewport.panning {
  cursor: grabbing;
}

.mark-canvas-inner {
  position: absolute;
  top: 0;
  left: 0;
  transform-origin: 0 0;
  will-change: transform;
}

.mark-image-frame {
  position: relative;
  line-height: 0;
  background: var(--surface);
  box-shadow: 0 10px 28px rgba(1, 4, 9, 0.18);
}

.mark-image-frame img {
  display: block;
  width: 100%;
  height: 100%;
  object-fit: fill;
  pointer-events: none;
  user-select: none;
  -webkit-user-drag: none;
}

.mark-overlay {
  position: absolute;
  inset: 0;
  width: 100%;
  height: 100%;
  cursor: none;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
}

.mark-annotation {
  pointer-events: visiblePainted;
  cursor: pointer;
}

.mark-measure line {
  stroke: #ff3b30;
}

.mark-measure circle,
.mark-text circle {
  fill: #ff3b30;
  stroke: #fff;
}

.mark-measure text,
.mark-rect text,
.mark-text text,
.mark-color-marker text,
.mark-tool-cursor text {
  user-select: none;
  -webkit-user-select: none;
  paint-order: stroke;
  stroke: rgba(255, 255, 255, 0.96);
  fill: #101418;
  font-family: "Source Han Sans CN", "Microsoft YaHei", sans-serif;
  font-weight: 800;
  dominant-baseline: central;
}

.mark-rect rect {
  fill: rgba(9, 105, 218, 0.1);
  stroke: #0969da;
  stroke-dasharray: 8 5;
}

.mark-text text {
  fill: #1f2328;
}

.mark-annotation.selected line,
.mark-annotation.selected rect,
.mark-annotation.selected circle {
  filter: drop-shadow(0 0 3px rgba(255, 214, 10, 0.9));
}

.mark-annotation.selected text {
  fill: #000;
  stroke: #ffd60a;
}

.mark-color-marker circle {
  fill: none;
  stroke: #111827;
}

.mark-color-marker text {
  fill: #111827;
}

.mark-tool-cursor line,
.mark-tool-cursor rect,
.mark-tool-cursor circle {
  fill: none;
  stroke: #ff3b30;
  stroke-dasharray: 5 4;
}

.mark-tool-cursor.cursor-color line,
.mark-tool-cursor.cursor-color circle {
  stroke: #10b981;
}

.mark-tool-cursor.cursor-rect line {
  stroke: #0969da;
  stroke-dasharray: 10 7;
  opacity: 0.76;
}

.mark-tool-cursor.cursor-text line,
.mark-tool-cursor.cursor-text text {
  stroke: rgba(255, 255, 255, 0.96);
  fill: #cf222e;
}

.mark-side-panel,
.mark-panel-section,
.mark-tool-grid,
.mark-info-list {
  display: grid;
  gap: 12px;
}

.mark-tool-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.mark-tool-grid .secondary-button {
  justify-content: center;
  padding-inline: 10px;
}

.mark-tool-grid .selected {
  border-color: var(--accent);
  color: var(--accent-strong);
  background: color-mix(in srgb, var(--accent) 10%, var(--surface));
}

.mark-text-input {
  width: 100%;
}

.mark-view-actions,
.mark-selection-state {
  display: flex;
  align-items: center;
  gap: 8px;
}

.mark-view-actions .secondary-button,
.mark-selection-state .secondary-button {
  flex: 1;
}

.mark-selection-state span {
  color: var(--muted);
  font-size: 12px;
  font-weight: 700;
}

.mark-color-card {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr) 34px;
  gap: 10px;
  align-items: center;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface-subtle);
}

.mark-color-swatch {
  display: block;
  width: 44px;
  height: 44px;
  border: 1px solid var(--border);
  border-radius: 6px;
}

.mark-color-card strong,
.mark-color-card small,
.mark-info-list strong {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.mark-color-card small,
.mark-info-list span {
  color: var(--muted);
  font-size: 12px;
}

.mark-info-list div {
  display: grid;
  gap: 4px;
  min-width: 0;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface-subtle);
}

@media (max-width: 1080px) {
  .mark-layout {
    grid-template-columns: 1fr;
  }

  .mark-viewport {
    min-height: 420px;
  }
}
</style>