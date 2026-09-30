<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { reportWorkspaceError } from "../composables/useWorkspaceToast";
import type { ConversionResult, DevToolboxApi, MediaInfo, VideoCompressOptions } from "../../shared/types";
// @ts-ignore VS Code inferred project may miss the local *.vue shim.
import DropZone from "../components/DropZone.vue";
// @ts-ignore VS Code inferred project may miss the local *.vue shim.
import OutputPicker from "../components/OutputPicker.vue";
// @ts-ignore VS Code inferred project may miss the local *.vue shim.
import ResultPanel from "../components/ResultPanel.vue";
// @ts-ignore VS Code inferred project may miss the local *.vue shim.
import SelectMenu from "../components/SelectMenu.vue";
// @ts-ignore VS Code inferred project may miss the local *.vue shim.
import Slider from "../components/Slider.vue";
import Checkbox from "../components/Checkbox.vue";
import TaskFlowLayout from "../components/TaskFlowLayout.vue";
const devToolbox = (window as unknown as Window & { devToolbox: DevToolboxApi }).devToolbox;

const input = ref<string[]>([]);
const outputDir = ref("");
const crf = ref(22);
const width = ref<number | null>(1280);
const preset = ref<VideoCompressOptions["preset"]>("medium");
const keepAudio = ref(true);
const audioBitrate = ref("128k");
const busy = ref(false);
const infoBusy = ref(false);
const mediaInfo = ref<MediaInfo | null>(null);
const mediaError = ref("");
const result = ref<ConversionResult | null>(null);

const presetOptions = [
  { label: "慢速高压缩", value: "slow", icon: "ri-speed-mini-line" },
  { label: "均衡", value: "medium", icon: "ri-speed-line" },
  { label: "快速", value: "fast", icon: "ri-speed-up-line" }
];

const audioBitrateOptions = [
  { label: "96k", value: "96k" },
  { label: "128k", value: "128k" },
  { label: "160k", value: "160k" },
  { label: "192k", value: "192k" }
];

const qualityTone = computed(() => {
  if (crf.value <= 20) return "高画质";
  if (crf.value <= 25) return "质量优先";
  return "体积优先";
});
const canRun = computed(() => input.value.length > 0 && outputDir.value && !busy.value);
const infoRows = computed(() => {
  const info = mediaInfo.value;
  if (!info) return [];
  return [
    ["时长", info.durationSeconds == null ? "未知" : `${info.durationSeconds.toFixed(2)}s`],
    ["封装", info.format],
    ["码率", info.bitrate],
    ["视频编码", info.videoCodec],
    ["音频编码", info.audioCodec],
    ["分辨率", info.resolution],
    ["帧率", info.fps === "未知" ? "未知" : `${info.fps} fps`]
  ];
});

watch(
  () => input.value[0],
  async (filePath, _previous, onCleanup) => {
    let cancelled = false;
    onCleanup(() => { cancelled = true; });
    mediaInfo.value = null;
    mediaError.value = "";
    infoBusy.value = false;
    if (!filePath) return;
    infoBusy.value = true;
    try {
      const info = await devToolbox.getMediaInfo(filePath);
      if (!cancelled) mediaInfo.value = info;
    } catch (error) {
      if (!cancelled) {
        mediaError.value = "读取失败";
        reportWorkspaceError(error, "读取视频信息失败");
      }
    } finally {
      if (!cancelled) infoBusy.value = false;
    }
  }
);

async function run() {
  if (!canRun.value) return;
  busy.value = true;
  try {
    result.value = await devToolbox.compressVideos({
      inputPaths: [...input.value],
      outputDir: outputDir.value,
      crf: crf.value,
      width: width.value || undefined,
      preset: preset.value,
      keepAudio: keepAudio.value,
      audioBitrate: audioBitrate.value
    });
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <TaskFlowLayout
    title="视频压缩"
    :description="`${qualityTone} · CRF ${crf} · ${width || '原始尺寸'}`"
    source-title="源视频"
    source-description="可继续添加视频，任务将按队列顺序批量压缩"
    settings-title="压缩设置"
    settings-description="队列中的视频共用以下编码参数"
    preview-title="当前视频"
    preview-description="显示队列首个视频的媒体信息"
    :file-count="input.length"
  >
    <template #source>
        <DropZone
          v-model="input"
          title="拖入视频文件"
          action-label="添加视频"
          compact
          append-selection
          :multiple="true"
          :filters="[{ name: '视频', extensions: ['mp4', 'webm', 'mov', 'mkv', 'avi'] }]"
        />
    </template>

    <template #settings>
        <div class="video-form-grid">
          <label class="field">
            <span>CRF</span>
            <Slider v-model="crf" :min="12" :max="36" aria-label="CRF" />
          </label>
          <label class="field">
            <span>最大宽度</span>
            <input v-model.number="width" type="number" min="320" step="2" placeholder="保持原尺寸" />
          </label>
          <div class="field">
            <span>编码速度</span>
            <SelectMenu v-model="preset" :options="presetOptions" />
          </div>
          <div class="field">
            <span>音频码率</span>
            <SelectMenu v-model="audioBitrate" :options="audioBitrateOptions" />
          </div>
          <Checkbox v-model="keepAudio" class="check-row span-2 video-check-row" label="保留音频并重新编码" />
        </div>
    </template>

    <template #preview-actions>
      <span class="status-pill" :class="{ running: infoBusy, error: mediaError }">INFO</span>
    </template>

    <template #preview>
      <div v-if="infoRows.length" class="info-list">
        <div v-for="row in infoRows" :key="row[0]" class="info-row media-info-row">
          <span>{{ row[0] }}</span>
          <strong>{{ row[1] }}</strong>
        </div>
      </div>
      <p v-else class="empty-state">选择视频文件后显示编码、时长、分辨率、帧率和码率。</p>
    </template>

    <template #result>
      <ResultPanel :result="result" :busy="busy" title="压缩结果" empty-text="压缩后可在此打开输出文件" compact />
    </template>

    <template #destination>
      <OutputPicker v-model="outputDir" />
    </template>

    <template #summary>
      <i class="ri-stack-line" aria-hidden="true"></i>
      <span>{{ input.length }} 个视频 · CRF {{ crf }} · {{ width || "原始尺寸" }}</span>
    </template>

    <template #actions>
      <button type="button" class="primary-button" :disabled="!canRun" @click="run">
        <i class="ri-compress-line" aria-hidden="true"></i>
        {{ input.length > 1 ? `批量压缩（${input.length}）` : "开始压缩" }}
      </button>
    </template>
  </TaskFlowLayout>
</template>

<style scoped>
.media-info-row {
  grid-template-columns: 74px minmax(0, 1fr);
  align-items: center;
}
</style>
