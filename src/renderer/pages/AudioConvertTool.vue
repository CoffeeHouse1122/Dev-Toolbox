<script setup lang="ts">
import { computed, ref } from "vue";
import type { AudioConvertOptions, ConversionResult } from "../../shared/types";
import DropZone from "../components/DropZone.vue";
import OutputPicker from "../components/OutputPicker.vue";
import ResultPanel from "../components/ResultPanel.vue";
import SelectMenu from "../components/SelectMenu.vue";
import TaskFlowLayout from "../components/TaskFlowLayout.vue";

const input = ref<string[]>([]);
const outputDir = ref("");
const outputFormat = ref<AudioConvertOptions["outputFormat"]>("mp3");
const bitrate = ref("192k");
const sampleRate = ref<number | null>(44100);
const busy = ref(false);
const result = ref<ConversionResult | null>(null);

const formatOptions = [
  { label: "MP3", value: "mp3", icon: "ri-music-2-line" },
  { label: "WAV", value: "wav", icon: "ri-disc-line" },
  { label: "AAC", value: "aac", icon: "ri-music-line" },
  { label: "OGG", value: "ogg", icon: "ri-sound-module-line" },
  { label: "FLAC", value: "flac", icon: "ri-hq-line" },
  { label: "M4A", value: "m4a", icon: "ri-apple-line" }
];
const bitrateOptions = [
  { label: "128k", value: "128k" },
  { label: "192k", value: "192k" },
  { label: "256k", value: "256k" },
  { label: "320k", value: "320k" }
];

const canRun = computed(() => input.value.length > 0 && outputDir.value && !busy.value);

async function run() {
  if (!canRun.value) return;
  busy.value = true;
  try {
    result.value = await window.devToolbox.convertAudio({
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
    title="音频格式转换"
    description="批量转换 MP3、WAV、AAC、OGG、FLAC、M4A"
    source-title="源音频"
    source-description="可继续添加音频，任务将按队列顺序批量转换"
    settings-title="转换设置"
    settings-description="队列中的音频共用以下输出参数"
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

    <template #result>
      <ResultPanel :result="result" :busy="busy" title="转换结果" empty-text="转换后可在此打开输出文件" compact />
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
        <i class="ri-play-fill" aria-hidden="true"></i>
        {{ input.length > 1 ? `批量转换（${input.length}）` : "开始转换" }}
      </button>
    </template>
  </TaskFlowLayout>
</template>
