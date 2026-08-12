<script setup lang="ts">
import { computed, onBeforeUnmount, ref, watch } from "vue";
import type { ConversionResult, DevToolboxApi, VideoLoopInfo } from "../../shared/types";
// @ts-ignore VS Code inferred project may miss the local *.vue shim.
import DropZone from "../components/DropZone.vue";
// @ts-ignore VS Code inferred project may miss the local *.vue shim.
import ResultPanel from "../components/ResultPanel.vue";
import SelectMenu from "../components/SelectMenu.vue";
import TaskFlowLayout from "../components/TaskFlowLayout.vue";
import { runConversionBatch } from "../utils/batchConversion";
const devToolbox = (window as unknown as Window & { devToolbox: DevToolboxApi }).devToolbox;

type VideoLoopResult = ConversionResult & { info?: VideoLoopInfo };
interface VideoLoopEntry {
  inputPath: string;
  result: VideoLoopResult;
}

const input = ref<string[]>([]);
const edgeSeconds = ref(0.08);
const busy = ref(false);
const loopResults = ref<VideoLoopEntry[]>([]);
const batchResult = ref<ConversionResult | null>(null);
const activeInputPath = ref("");
const loopVideoRef = ref<HTMLVideoElement | null>(null);
const videoOrientation = ref<"landscape" | "portrait" | "square">("landscape");
const previewVersion = ref(0);

function fileName(filePath: string) {
  return filePath.split(/[\\/]/).pop() || filePath;
}

function previewFileUrl(filePath: string, time = 0.1) {
  const params = new URLSearchParams({ path: filePath, cache: "1", v: String(previewVersion.value) });
  return `devtoolbox-file://preview?${params.toString()}#t=${time}`;
}

const currentInputPath = computed(() => activeInputPath.value || input.value[0] || "");
const result = computed(() => loopResults.value.find((item) => item.inputPath === currentInputPath.value)?.result ?? null);
const activeInputIndex = computed(() => input.value.indexOf(currentInputPath.value));
const selectedVideoUrl = computed(() => (currentInputPath.value ? previewFileUrl(currentInputPath.value) : ""));
const selectedFileName = computed(() => {
  if (!currentInputPath.value) return "未选择视频";
  const name = fileName(currentInputPath.value);
  return input.value.length > 1 ? `${name}（${activeInputIndex.value + 1}/${input.value.length}）` : name;
});
const canRun = computed(() => input.value.length > 0 && !busy.value);
const fileOptions = computed(() =>
  input.value.map((inputPath, index) => {
    const itemResult = loopResults.value.find((item) => item.inputPath === inputPath)?.result;
    return {
      label: `${index + 1}. ${fileName(inputPath)} · ${riskText(itemResult?.info?.loopRisk)}`,
      value: inputPath,
      icon: "ri-video-line"
    };
  })
);
const isPortraitVideo = computed(() => {
  if (videoOrientation.value === "portrait") return true;
  const resolution = result.value?.info?.resolution;
  const match = resolution?.match(/(\d{2,5})x(\d{2,5})/);
  return match ? Number(match[2]) > Number(match[1]) : false;
});
const infoRows = computed(() => {
  const info = result.value?.info;
  if (!info) return [];
  return [
    ["时长", info.durationSeconds == null ? "未知" : `${info.durationSeconds.toFixed(2)}s`],
    ["封装", info.format],
    ["码率", info.bitrate],
    ["视频编码", info.videoCodec],
    ["音频编码", info.audioCodec],
    ["分辨率", info.resolution],
    ["帧率", info.fps],
    ["首尾差异", info.frameDiffScore == null ? "未知" : `${info.frameDiffScore}%`]
  ];
});

function riskText(risk?: VideoLoopInfo["loopRisk"]) {
  if (risk === "low") return "低风险";
  if (risk === "medium") return "轻微风险";
  if (risk === "high") return "高风险";
  return "待分析";
}

function releaseLoopVideo() {
  const video = loopVideoRef.value;
  if (!video) return;
  video.pause();
  video.removeAttribute("src");
  video.load();
}

function resetLoopPreview() {
  releaseLoopVideo();
  videoOrientation.value = "landscape";
  previewVersion.value += 1;
}

function playLoopVideo() {
  const video = loopVideoRef.value;
  if (!video) return;
  video.loop = true;
  video.muted = true;
  void video.play().catch(() => undefined);
}

function updateVideoOrientation(event: Event) {
  const video = event.currentTarget as HTMLVideoElement;
  if (!video.videoWidth || !video.videoHeight) {
    videoOrientation.value = "landscape";
    return;
  }
  if (video.videoHeight > video.videoWidth) videoOrientation.value = "portrait";
  else if (video.videoHeight === video.videoWidth) videoOrientation.value = "square";
  else videoOrientation.value = "landscape";
  playLoopVideo();
}

function selectInput(paths: string[]) {
  input.value = paths;
  const selectedPaths = new Set(paths);
  loopResults.value = loopResults.value.filter((item) => selectedPaths.has(item.inputPath));
  batchResult.value = null;
  if (!selectedPaths.has(activeInputPath.value)) {
    activeInputPath.value = paths[0] ?? "";
  } else if (!paths.length) {
    activeInputPath.value = "";
  }
}

watch(activeInputPath, resetLoopPreview);

onBeforeUnmount(() => {
  releaseLoopVideo();
});

async function run() {
  if (!canRun.value) return;
  const inputPaths = [...input.value];
  const edgeOffset = edgeSeconds.value;
  busy.value = true;
  try {
    batchResult.value = await runConversionBatch(inputPaths, "", async (inputPath) => {
      const itemResult = await devToolbox.analyzeVideoLoop({
        inputPath,
        edgeSeconds: edgeOffset
      });
      const completed = new Map(loopResults.value.map((item) => [item.inputPath, item.result]));
      completed.set(inputPath, itemResult);
      loopResults.value = input.value.flatMap((selectedPath) => {
        const selectedResult = completed.get(selectedPath);
        return selectedResult ? [{ inputPath: selectedPath, result: selectedResult }] : [];
      });
      return itemResult;
    });
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <TaskFlowLayout
    title="视频循环播放"
    description="分析首尾帧差异，评估视频无缝循环效果"
    source-title="源视频"
    source-description="可批量分析视频，并逐个切换查看循环预览"
    settings-title="分析与预览"
    settings-description="选择当前视频并调整首尾取帧偏移"
    preview-title="首尾帧与视频信息"
    :preview-description="`${selectedFileName} · ${riskText(result?.info?.loopRisk)}`"
    variant="analysis"
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
        <span>当前查看</span>
        <SelectMenu v-model="activeInputPath" :options="fileOptions" />
      </div>
      <div class="loop-stage task-flow-loop-stage" :class="{ portrait: isPortraitVideo }">
        <video ref="loopVideoRef" v-if="selectedVideoUrl" :key="selectedVideoUrl" :src="selectedVideoUrl" autoplay muted loop playsinline controls preload="auto" @loadedmetadata="updateVideoOrientation" @canplay="playLoopVideo"></video>
        <div v-else class="empty-state">等待选择视频</div>
      </div>
      <label class="field">
        <span>首尾取帧偏移秒数</span>
        <input v-model.number="edgeSeconds" type="number" min="0.02" max="2" step="0.01" />
      </label>
    </template>

    <template #preview-actions>
      <span class="status-pill" :class="result?.info?.loopRisk === 'high' ? 'error' : result?.info ? 'success' : ''">
        {{ riskText(result?.info?.loopRisk) }}
      </span>
    </template>
    <template #preview>
      <div class="task-flow-loop-preview">
        <div v-if="result?.info?.firstFrameDataUrl && result?.info?.lastFrameDataUrl" class="loop-frame-grid" :class="{ portrait: isPortraitVideo }">
          <figure>
            <img :src="result.info.firstFrameDataUrl" alt="循环首帧" />
            <figcaption>首帧</figcaption>
          </figure>
          <figure>
            <img :src="result.info.lastFrameDataUrl" alt="循环尾帧" />
            <figcaption>尾帧</figcaption>
          </figure>
        </div>
        <p v-else class="empty-state task-flow-frame-empty">分析后显示首尾帧，截图只在工具内预览。</p>
        <p v-if="result?.info" class="loop-summary">{{ result.info.summary }}</p>
        <div v-if="infoRows.length" class="info-list task-flow-loop-info">
          <div v-for="row in infoRows" :key="row[0]" class="info-row loop-info-row">
            <span>{{ row[0] }}</span>
            <strong>{{ row[1] }}</strong>
          </div>
        </div>
      </div>
    </template>

    <template #result>
      <ResultPanel :result="batchResult" :busy="busy" title="分析结果" empty-text="分析后在此显示批量状态" compact />
    </template>

    <template #summary>
      <i class="ri-loop-left-line" aria-hidden="true"></i>
      <span>{{ input.length ? `${input.length} 个视频 · 偏移 ${edgeSeconds}s` : "添加视频后可开始分析" }}</span>
    </template>
    <template #actions>
      <button type="button" class="primary-button" :disabled="!canRun" @click="run">
        <i class="ri-loop-left-line" aria-hidden="true"></i>
        {{ busy ? "分析中…" : input.length > 1 ? `批量分析（${input.length}）` : "分析循环点" }}
      </button>
    </template>
  </TaskFlowLayout>
</template>

<style scoped>
.loop-file-selector {
  min-width: 0;
}

.loop-stage {
  display: grid;
  place-items: center;
  aspect-ratio: 16 / 9;
  width: 100%;
  min-height: 260px;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: #000000;
}

.task-flow-loop-stage {
  min-height: 0;
  height: 100%;
}

.loop-stage.portrait {
  aspect-ratio: auto;
  height: 100%;
}

.loop-stage video {
  width: 100%;
  height: 100%;
  object-fit: contain;
  background: #000000;
}

.loop-summary {
  margin: 0;
  color: var(--muted);
  line-height: 1.7;
}

.loop-info-row {
  grid-template-columns: 74px minmax(0, 1fr);
  align-items: center;
}

.loop-frame-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.loop-frame-grid figure {
  display: grid;
  gap: 6px;
  margin: 0;
  min-width: 0;
}

.loop-frame-grid img {
  display: block;
  width: 100%;
  aspect-ratio: 16 / 9;
  object-fit: contain;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: #000000;
}

.loop-frame-grid.portrait img {
  aspect-ratio: auto;
  max-height: 260px;
}

.loop-frame-grid figcaption {
  color: var(--muted);
  font-size: 12px;
  font-weight: 700;
  text-align: center;
}

.task-flow-loop-preview {
  display: grid;
  gap: 10px;
  min-height: 0;
}

.task-flow-loop-info {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.task-flow-frame-empty {
  min-height: 100px;
}

@media (max-width: 720px) {
  .task-flow-loop-info {
    grid-template-columns: 1fr;
  }
}
</style>
