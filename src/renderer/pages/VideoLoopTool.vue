<script setup lang="ts">
import { computed, ref } from "vue";
import type { ConversionResult, DevToolboxApi, VideoLoopInfo } from "../../shared/types";
// @ts-ignore VS Code inferred project may miss the local *.vue shim.
import DropZone from "../components/DropZone.vue";
// @ts-ignore VS Code inferred project may miss the local *.vue shim.
import ResultPanel from "../components/ResultPanel.vue";
const devToolbox = (window as unknown as Window & { devToolbox: DevToolboxApi }).devToolbox;

type VideoLoopResult = ConversionResult & { info?: VideoLoopInfo };

const input = ref<string[]>([]);
const edgeSeconds = ref(0.08);
const busy = ref(false);
const result = ref<VideoLoopResult | null>(null);

function previewFileUrl(filePath: string, time = 0.1) {
  const params = new URLSearchParams({ path: filePath });
  return `devtoolbox-file://preview?${params.toString()}#t=${time}`;
}

const selectedVideoUrl = computed(() => (input.value[0] ? previewFileUrl(input.value[0]) : ""));
const selectedFileName = computed(() => input.value[0]?.split(/[\\/]/).pop() ?? "未选择视频");
const canRun = computed(() => input.value.length === 1 && !busy.value);
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

async function run() {
  if (!canRun.value) return;
  busy.value = true;
  try {
    result.value = await devToolbox.analyzeVideoLoop({
      inputPath: input.value[0],
      edgeSeconds: edgeSeconds.value
    });
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section class="tool-page video-loop-page">
    <div class="tool-header">
      <div>
        <h2>视频循环播放</h2>
        <p>{{ selectedFileName }} · {{ riskText(result?.info?.loopRisk) }}</p>
      </div>
      <button type="button" class="primary-button" :disabled="!canRun" @click="run">
        <i class="ri-loop-left-line" aria-hidden="true"></i>
        分析循环点
      </button>
    </div>

    <div class="video-loop-layout">
      <section class="tool-main video-loop-main">
        <DropZone
          v-model="input"
          title="源视频"
          preview="video"
          :multiple="false"
          :filters="[{ name: '视频', extensions: ['mp4', 'webm', 'mov', 'mkv', 'avi'] }]"
        />
        <div class="loop-stage">
          <video v-if="selectedVideoUrl" :key="selectedVideoUrl" :src="selectedVideoUrl" autoplay muted loop playsinline controls preload="metadata"></video>
          <div v-else class="empty-state">等待选择视频</div>
        </div>
        <label class="field">
          <span>首尾取帧偏移秒数</span>
          <input v-model.number="edgeSeconds" type="number" min="0.02" max="2" step="0.01" />
        </label>
      </section>

      <aside class="media-tool-side">
        <section class="output-summary loop-frame-panel">
          <div class="section-title">
            <h2>首尾帧</h2>
            <span class="status-pill">Frame</span>
          </div>
          <div v-if="result?.info?.firstFrameDataUrl && result?.info?.lastFrameDataUrl" class="loop-frame-grid">
            <figure>
              <img :src="result.info.firstFrameDataUrl" alt="循环首帧" />
              <figcaption>首帧</figcaption>
            </figure>
            <figure>
              <img :src="result.info.lastFrameDataUrl" alt="循环尾帧" />
              <figcaption>尾帧</figcaption>
            </figure>
          </div>
          <p v-else class="empty-state">分析后展示首尾帧截图，截图只在工具内显示，不保存到磁盘。</p>
        </section>

        <section class="output-summary loop-info-panel">
          <div class="section-title">
            <h2>视频信息</h2>
            <span class="status-pill" :class="result?.info?.loopRisk === 'high' ? 'error' : result?.info ? 'success' : ''">
              {{ riskText(result?.info?.loopRisk) }}
            </span>
          </div>
          <p v-if="result?.info" class="loop-summary">{{ result.info.summary }}</p>
          <div v-if="infoRows.length" class="info-list">
            <div v-for="row in infoRows" :key="row[0]" class="info-row loop-info-row">
              <span>{{ row[0] }}</span>
              <strong>{{ row[1] }}</strong>
            </div>
          </div>
          <p v-else class="empty-state">分析后显示编码、时长、分辨率和首尾帧差异。</p>
        </section>

        <ResultPanel :result="result" :busy="busy" />
      </aside>
    </div>
  </section>
</template>

<style scoped>
.video-loop-layout {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 390px;
  gap: 16px;
  align-items: start;
}

.video-loop-main {
  align-content: start;
}

.loop-stage {
  display: grid;
  place-items: center;
  aspect-ratio: 16 / 9;
  min-height: 260px;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: #000000;
}

.loop-stage video {
  width: 100%;
  height: 100%;
  object-fit: cover;
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
  object-fit: cover;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: #000000;
}

.loop-frame-grid figcaption {
  color: var(--muted);
  font-size: 12px;
  font-weight: 700;
  text-align: center;
}

@media (max-width: 980px) {
  .video-loop-layout {
    grid-template-columns: 1fr;
  }
}
</style>