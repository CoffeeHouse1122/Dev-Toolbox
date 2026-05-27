<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { AudioCompressOptions, ConversionResult, DevToolboxApi, MediaInfo } from "../../shared/types";
// @ts-ignore VS Code inferred project may miss the local *.vue shim.
import DropZone from "../components/DropZone.vue";
// @ts-ignore VS Code inferred project may miss the local *.vue shim.
import OutputPicker from "../components/OutputPicker.vue";
// @ts-ignore VS Code inferred project may miss the local *.vue shim.
import ResultPanel from "../components/ResultPanel.vue";
// @ts-ignore VS Code inferred project may miss the local *.vue shim.
import SelectMenu from "../components/SelectMenu.vue";
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
  async (filePath) => {
    mediaInfo.value = null;
    mediaError.value = "";
    if (!filePath) return;
    infoBusy.value = true;
    try {
      mediaInfo.value = await devToolbox.getMediaInfo(filePath);
    } catch (error) {
      mediaError.value = error instanceof Error ? error.message : String(error);
    } finally {
      infoBusy.value = false;
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
  <section class="tool-page">
    <div class="tool-header">
      <div>
        <h2>音频压缩</h2>
        <p>{{ outputFormat.toUpperCase() }} · {{ bitrate }} · {{ sampleRate || "原采样率" }}</p>
      </div>
      <button type="button" class="primary-button" :disabled="!canRun" @click="run">
        <i class="ri-compress-line" aria-hidden="true"></i>
        开始压缩
      </button>
    </div>

    <div class="tool-layout">
      <section class="tool-main">
        <DropZone
          v-model="input"
          title="源音频"
          :multiple="true"
          :filters="[{ name: '音频', extensions: ['mp3', 'wav', 'aac', 'ogg', 'flac', 'm4a', 'wma'] }]"
        />
        <OutputPicker v-model="outputDir" />
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
      </section>

      <aside class="media-tool-side">
        <section class="output-summary">
          <div class="section-title">
            <h2>当前音频</h2>
            <span class="status-pill" :class="{ running: infoBusy, error: mediaError }">INFO</span>
          </div>
          <p v-if="mediaError" class="error-text">{{ mediaError }}</p>
          <div v-else-if="infoRows.length" class="info-list">
            <div v-for="row in infoRows" :key="row[0]" class="info-row media-info-row">
              <span>{{ row[0] }}</span>
              <strong>{{ row[1] }}</strong>
            </div>
          </div>
          <p v-else class="empty-state">选择音频文件后显示格式、编码、采样率和码率。</p>
        </section>

        <ResultPanel :result="result" :busy="busy" />
      </aside>
    </div>
  </section>
</template>

<style scoped>
.media-info-row {
  grid-template-columns: 74px minmax(0, 1fr);
  align-items: center;
}
</style>