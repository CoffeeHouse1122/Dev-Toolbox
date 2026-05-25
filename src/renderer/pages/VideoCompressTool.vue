<script setup lang="ts">
import { computed, ref } from "vue";
import type { ConversionResult, VideoCompressOptions } from "../../shared/types";
import DropZone from "../components/DropZone.vue";
import OutputPicker from "../components/OutputPicker.vue";
import ResultPanel from "../components/ResultPanel.vue";
import SelectMenu from "../components/SelectMenu.vue";

const input = ref<string[]>([]);
const outputDir = ref("");
const crf = ref(22);
const width = ref<number | null>(1280);
const preset = ref<VideoCompressOptions["preset"]>("medium");
const keepAudio = ref(true);
const audioBitrate = ref("128k");
const busy = ref(false);
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

async function run() {
  if (!canRun.value) return;
  busy.value = true;
  try {
    result.value = await window.devToolbox.compressVideos({
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
  <section class="tool-page">
    <div class="tool-header">
      <div>
        <h2>视频压缩</h2>
        <p>{{ qualityTone }} · CRF {{ crf }} · {{ width || "原始尺寸" }}</p>
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
          title="源视频"
          preview="video"
          :multiple="true"
          :filters="[{ name: '视频', extensions: ['mp4', 'webm', 'mov', 'mkv', 'avi'] }]"
        />
        <OutputPicker v-model="outputDir" />
        <div class="video-form-grid">
          <label class="field">
            <span>CRF</span>
            <div class="range-field">
              <input v-model.number="crf" type="range" min="12" max="36" />
              <strong>{{ crf }}</strong>
            </div>
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
          <label class="check-row span-2 video-check-row">
            <input v-model="keepAudio" type="checkbox" />
            <span>保留音频并重新编码</span>
          </label>
        </div>
      </section>

      <ResultPanel :result="result" :busy="busy" />
    </div>
  </section>
</template>