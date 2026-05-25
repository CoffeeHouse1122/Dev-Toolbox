<script setup lang="ts">
import { computed, ref } from "vue";
import type { ConversionResult, VideoLoopInfo } from "../../shared/types";
import DropZone from "../components/DropZone.vue";
import OutputPicker from "../components/OutputPicker.vue";
import ResultPanel from "../components/ResultPanel.vue";

type VideoLoopResult = ConversionResult & { info?: VideoLoopInfo };

const input = ref<string[]>([]);
const outputDir = ref("");
const saveFrames = ref(true);
const edgeSeconds = ref(0.08);
const busy = ref(false);
const result = ref<VideoLoopResult | null>(null);

const selectedVideoUrl = computed(() => input.value[0] ? `devtoolbox-file://preview/${encodeURIComponent(input.value[0])}` : "");
const selectedFileName = computed(() => input.value[0]?.split(/[\\/]/).pop() ?? "未选择视频");
const canRun = computed(() => input.value.length === 1 && !busy.value && (!saveFrames.value || Boolean(outputDir.value)));
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
    result.value = await window.devToolbox.analyzeVideoLoop({
      inputPath: input.value[0],
      outputDir: saveFrames.value ? outputDir.value : undefined,
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
          <video v-if="selectedVideoUrl" :src="selectedVideoUrl" autoplay muted loop playsinline controls></video>
          <div v-else class="empty-state">等待选择视频</div>
        </div>
        <label class="field">
          <span>首尾取帧偏移秒数</span>
          <input v-model.number="edgeSeconds" type="number" min="0.02" max="2" step="0.01" />
        </label>
        <label class="check-row video-check-row">
          <input v-model="saveFrames" type="checkbox" />
          <span>保存首尾帧截图</span>
        </label>
        <OutputPicker v-if="saveFrames" v-model="outputDir" />
      </section>

      <aside class="media-tool-side">
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

@media (max-width: 980px) {
  .video-loop-layout {
    grid-template-columns: 1fr;
  }
}
</style>