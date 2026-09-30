<script setup lang="ts">
import { computed, ref, watch } from "vue";
import { reportWorkspaceError } from "../composables/useWorkspaceToast";
import type { AudioCompressOptions, ConversionResult, DevToolboxApi, MediaInfo } from "../../shared/types";
// @ts-ignore VS Code inferred project may miss the local *.vue shim.
import DropZone from "../components/DropZone.vue";
// @ts-ignore VS Code inferred project may miss the local *.vue shim.
import OutputPicker from "../components/OutputPicker.vue";
// @ts-ignore VS Code inferred project may miss the local *.vue shim.
import ResultPanel from "../components/ResultPanel.vue";
// @ts-ignore VS Code inferred project may miss the local *.vue shim.
import SelectMenu from "../components/SelectMenu.vue";
import TaskFlowLayout from "../components/TaskFlowLayout.vue";
const devToolbox = (window as unknown as Window & { devToolbox: DevToolboxApi }).devToolbox;

const input = ref<string[]>([]);
const outputDir = ref("");
const outputFormat = ref<AudioCompressOptions["outputFormat"]>("mp3");
const bitrate = ref("160k");
const sampleRate = ref<number | null>(44100);
const busy = ref(false);
const infoBusy = ref(false);
const mediaInfo = ref<MediaInfo | null>(null);
const mediaError = ref("");
const result = ref<ConversionResult | null>(null);

const formatOptions = [
  { label: "MP3", value: "mp3", icon: "ri-music-2-line" },
  { label: "AAC", value: "aac", icon: "ri-music-line" },
  { label: "OGG", value: "ogg", icon: "ri-sound-module-line" },
  { label: "M4A", value: "m4a", icon: "ri-apple-line" }
];

const bitrateOptions = [
  { label: "96k", value: "96k" },
  { label: "128k", value: "128k" },
  { label: "160k", value: "160k" },
  { label: "192k", value: "192k" },
  { label: "256k", value: "256k" }
];

const canRun = computed(() => input.value.length > 0 && outputDir.value && !busy.value);
const infoRows = computed(() => {
  const info = mediaInfo.value;
  if (!info) return [];
  return [
    ["时长", info.durationSeconds == null ? "未知" : `${info.durationSeconds.toFixed(2)}s`],
    ["封装", info.format],
    ["码率", info.bitrate],
    ["音频编码", info.audioCodec],
    ["采样率", info.sampleRate === "未知" ? "未知" : `${info.sampleRate} Hz`],
    ["声道", info.channels]
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
        reportWorkspaceError(error, "读取音频信息失败");
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
    result.value = await devToolbox.compressAudio({
      inputPaths: [...input.value],
      outputDir: outputDir.value,
      outputFormat: outputFormat.value,
      bitrate: bitrate.value,
      sampleRate: sampleRate.value || undefined
    });
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <TaskFlowLayout
    title="音频压缩"
    :description="`${outputFormat.toUpperCase()} · ${bitrate} · ${sampleRate || '原采样率'}`"
    source-title="源音频"
    source-description="可继续添加音频，任务将按队列顺序批量压缩"
    settings-title="压缩设置"
    settings-description="队列中的音频共用以下压缩参数"
    preview-title="当前音频"
    preview-description="显示队列首个音频的媒体信息"
    :file-count="input.length"
  >
    <template #source>
        <DropZone
          v-model="input"
          title="拖入音频文件"
          action-label="添加音频"
          compact
          append-selection
          :multiple="true"
          :filters="[{ name: '音频', extensions: ['mp3', 'wav', 'aac', 'ogg', 'flac', 'm4a', 'wma'] }]"
        />
    </template>

    <template #settings>
        <div class="option-grid">
          <div class="field">
            <span>目标格式</span>
            <SelectMenu v-model="outputFormat" :options="formatOptions" />
          </div>
          <div class="field">
            <span>码率</span>
            <SelectMenu v-model="bitrate" :options="bitrateOptions" />
          </div>
          <label class="field span-2">
            <span>采样率</span>
            <input v-model.number="sampleRate" type="number" min="8000" step="1000" placeholder="保持原始采样率" />
          </label>
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
      <p v-else class="empty-state">选择音频文件后显示格式、编码、采样率和码率。</p>
    </template>

    <template #result>
      <ResultPanel :result="result" :busy="busy" title="压缩结果" empty-text="压缩后可在此打开输出文件" compact />
    </template>

    <template #destination>
      <OutputPicker v-model="outputDir" />
    </template>

    <template #summary>
      <i class="ri-stack-line" aria-hidden="true"></i>
      <span>{{ input.length }} 个音频 · {{ outputFormat.toUpperCase() }} · {{ bitrate }}</span>
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
