<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
// @ts-ignore VS Code inferred project may miss the local *.vue shim.
import DropZone from "../components/DropZone.vue";
import SelectMenu from "../components/SelectMenu.vue";
import TaskFlowLayout from "../components/TaskFlowLayout.vue";

type PreviewFit = "cover" | "contain";

const input = ref<string[]>([]);
const activeInputPath = ref("");
const previewFit = ref<PreviewFit>("cover");
const previewError = ref(false);
const previewReady = ref(false);
const loopVideoRef = ref<HTMLVideoElement | null>(null);

function fileName(filePath: string) {
  return filePath.split(/[\\/]/).pop() || filePath;
}

function previewFileUrl(filePath: string) {
  const params = new URLSearchParams({ path: filePath, cache: "1" });
  return `devtoolbox-file://preview?${params.toString()}`;
}

const currentInputPath = computed(() => activeInputPath.value || input.value[0] || "");
const activeInputIndex = computed(() => input.value.indexOf(currentInputPath.value));
const selectedVideoUrl = computed(() => (currentInputPath.value ? previewFileUrl(currentInputPath.value) : ""));
const selectedFileName = computed(() => {
  if (!currentInputPath.value) return "未选择视频";
  const name = fileName(currentInputPath.value);
  return input.value.length > 1 ? `${name}（${activeInputIndex.value + 1}/${input.value.length}）` : name;
});
const fileOptions = computed(() =>
  input.value.map((inputPath, index) => ({
    label: `${index + 1}. ${fileName(inputPath)}`,
    value: inputPath,
    icon: "ri-video-line"
  }))
);

function releaseLoopVideo() {
  const video = loopVideoRef.value;
  if (!video) return;
  video.pause();
  video.removeAttribute("src");
  video.load();
}

function resetPreviewState() {
  previewReady.value = false;
  previewError.value = false;
}

function playLoopVideo() {
  const video = loopVideoRef.value;
  if (!video) return;
  video.loop = true;
  video.muted = true;
  void video.play().catch(() => undefined);
}

function selectInput(paths: string[]) {
  input.value = paths;
  const selectedPaths = new Set(paths);
  if (!selectedPaths.has(activeInputPath.value)) {
    activeInputPath.value = paths[0] ?? "";
  }
}

watch(currentInputPath, resetPreviewState);

onBeforeUnmount(releaseLoopVideo);
</script>

<template>
  <TaskFlowLayout
    tool-id="video-loop"
    description="模拟网页背景视频的真实循环播放，直接观察首尾衔接和跳帧"
    source-title="源视频"
    source-description="可一次添加多个视频，并在预览区逐个切换检查"
    settings-title="预览设置"
    settings-description="选择视频以及网页背景的填充方式"
    preview-title="网页背景循环预览"
    :preview-description="selectedFileName"
    variant="preview-dominant"
    :file-count="input.length"
  >
    <template #source>
      <DropZone
        :model-value="input"
        title="拖入源视频"
        action-label="添加视频"
        compact
        append-selection
        :multiple="true"
        :filters="[{ name: '视频', extensions: ['mp4', 'webm', 'mov', 'mkv', 'avi'] }]"
        @update:model-value="selectInput"
      />
    </template>

    <template #settings>
      <div v-if="input.length > 1" class="field loop-file-selector">
        <span>当前预览</span>
        <SelectMenu v-model="activeInputPath" :options="fileOptions" />
      </div>

      <div class="field">
        <span>背景适配</span>
        <div class="segmented loop-fit-options" role="group" aria-label="视频背景适配方式">
          <button type="button" :class="{ selected: previewFit === 'cover' }" @click="previewFit = 'cover'">
            <i class="ri-fullscreen-line" aria-hidden="true"></i>
            铺满裁切
          </button>
          <button type="button" :class="{ selected: previewFit === 'contain' }" @click="previewFit = 'contain'">
            <i class="ri-aspect-ratio-line" aria-hidden="true"></i>
            完整显示
          </button>
        </div>
      </div>

      <div class="loop-observation-note">
        <i class="ri-eye-line" aria-hidden="true"></i>
        <div>
          <strong>肉眼观察循环点</strong>
          <p>视频将自动静音循环播放。重点观察画面从结尾返回开头时，主体位置、亮度和运动方向是否突然变化。</p>
        </div>
      </div>
    </template>

    <template #preview-actions>
      <span v-if="selectedVideoUrl && !previewError" class="status-pill success">
        <i class="ri-loop-left-line" aria-hidden="true"></i>
        自动循环
      </span>
    </template>

    <template #preview>
      <div class="loop-preview-shell" :class="`fit-${previewFit}`">
        <video
          v-if="selectedVideoUrl"
          ref="loopVideoRef"
          :key="selectedVideoUrl"
          :src="selectedVideoUrl"
          autoplay
          muted
          loop
          playsinline
          preload="auto"
          aria-label="网页背景视频循环预览"
          @canplay="playLoopVideo"
          @playing="previewReady = true"
          @error="previewError = true"
        ></video>

        <div v-if="!selectedVideoUrl" class="loop-preview-empty">
          <i class="ri-video-add-line" aria-hidden="true"></i>
          <strong>等待选择视频</strong>
          <span>添加视频后将自动开始循环播放</span>
        </div>

        <div v-else-if="previewError" class="loop-preview-empty error-state">
          <i class="ri-error-warning-line" aria-hidden="true"></i>
          <strong>无法预览此视频</strong>
          <span>当前 Chromium 可能不支持该视频的封装格式或编码</span>
        </div>

        <div v-else-if="!previewReady" class="loop-preview-loading" aria-live="polite">
          <i class="ri-loader-4-line" aria-hidden="true"></i>
          正在加载视频…
        </div>

        <div v-if="selectedVideoUrl && !previewError" class="loop-preview-overlay" aria-hidden="true">
          <span>BACKGROUND LOOP</span>
          <i class="ri-loop-left-line"></i>
        </div>
      </div>
    </template>
  </TaskFlowLayout>
</template>

<style scoped>
.loop-file-selector {
  min-width: 0;
}

.loop-fit-options {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  width: 100%;
}

.loop-fit-options button {
  justify-content: center;
  gap: 6px;
}

.loop-observation-note {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  gap: 10px;
  padding: 12px;
  border: 1px solid color-mix(in srgb, var(--accent) 32%, var(--border));
  border-radius: 8px;
  background: color-mix(in srgb, var(--accent) 7%, var(--surface));
}

.loop-observation-note > i {
  margin-top: 1px;
  color: var(--accent-strong);
  font-size: 18px;
}

.loop-observation-note strong {
  display: block;
  margin-bottom: 5px;
  color: var(--text);
  font-size: 13px;
}

.loop-observation-note p {
  margin: 0;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.65;
}

.loop-preview-shell {
  position: relative;
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  min-height: 320px;
  overflow: hidden;
  border: 1px solid color-mix(in srgb, var(--border) 68%, #ffffff 8%);
  border-radius: 8px;
  background:
    linear-gradient(135deg, rgba(255, 255, 255, 0.025) 25%, transparent 25%) 0 0 / 22px 22px,
    linear-gradient(315deg, rgba(255, 255, 255, 0.025) 25%, transparent 25%) 0 0 / 22px 22px,
    #05080c;
}

.loop-preview-shell video {
  position: absolute;
  inset: 0;
  display: block;
  width: 100%;
  height: 100%;
  background: #000000;
}

.loop-preview-shell.fit-cover video {
  object-fit: cover;
}

.loop-preview-shell.fit-contain video {
  object-fit: contain;
}

.loop-preview-empty {
  z-index: 1;
  display: grid;
  justify-items: center;
  gap: 7px;
  max-width: 320px;
  padding: 24px;
  color: var(--muted);
  text-align: center;
}

.loop-preview-empty > i {
  margin-bottom: 4px;
  color: var(--accent-strong);
  font-size: 34px;
}

.loop-preview-empty strong {
  color: var(--text);
  font-size: 14px;
}

.loop-preview-empty span {
  font-size: 12px;
  line-height: 1.6;
}

.loop-preview-empty.error-state > i {
  color: var(--danger, #f85149);
}

.loop-preview-loading {
  position: absolute;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 7px 10px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 6px;
  background: rgba(5, 8, 12, 0.82);
  color: rgba(255, 255, 255, 0.78);
  font-size: 12px;
  backdrop-filter: blur(8px);
}

.loop-preview-loading i {
  animation: loop-preview-spin 0.8s linear infinite;
}

.loop-preview-overlay {
  position: absolute;
  right: 14px;
  bottom: 14px;
  z-index: 2;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 6px 9px;
  border: 1px solid rgba(255, 255, 255, 0.16);
  border-radius: 4px;
  background: rgba(5, 8, 12, 0.64);
  color: rgba(255, 255, 255, 0.72);
  font-family: ui-monospace, "SFMono-Regular", Consolas, monospace;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  backdrop-filter: blur(8px);
}

:deep(.task-flow-preview-content) {
  grid-template-rows: minmax(0, 1fr);
  align-content: stretch;
  overflow: hidden;
}

@keyframes loop-preview-spin {
  to {
    transform: rotate(360deg);
  }
}

@media (prefers-reduced-motion: reduce) {
  .loop-preview-loading i {
    animation: none;
  }
}

@media (max-width: 1120px), (max-height: 720px) {
  .loop-preview-shell {
    height: auto;
    aspect-ratio: 16 / 9;
  }

  :deep(.task-flow-preview-content) {
    overflow: visible;
  }
}

@media (max-width: 720px) {
  .loop-fit-options {
    grid-template-columns: 1fr;
  }

  .loop-preview-shell {
    min-height: 240px;
    aspect-ratio: auto;
  }
}
</style>
