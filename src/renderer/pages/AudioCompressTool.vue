<script setup lang="ts">
import { computed, ref } from "vue";
import type { AudioCompressOptions, ConversionResult } from "../../shared/types";
import DropZone from "../components/DropZone.vue";
import OutputPicker from "../components/OutputPicker.vue";
import ResultPanel from "../components/ResultPanel.vue";
import SelectMenu from "../components/SelectMenu.vue";

const input = ref<string[]>([]);
const outputDir = ref("");
const outputFormat = ref<AudioCompressOptions["outputFormat"]>("mp3");
const bitrate = ref("160k");
const sampleRate = ref<number | null>(44100);
const busy = ref(false);
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

async function run() {
  if (!canRun.value) return;
  busy.value = true;
  try {
    result.value = await window.devToolbox.compressAudio({
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

      <ResultPanel :result="result" :busy="busy" />
    </div>
  </section>
</template>