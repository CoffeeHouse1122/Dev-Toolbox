<script setup lang="ts">
import { computed, ref } from "vue";
import type { ConversionResult, SequenceAnimationOptions } from "../../shared/types";
import DropZone from "../components/DropZone.vue";
import OutputPicker from "../components/OutputPicker.vue";
import ResultPanel from "../components/ResultPanel.vue";
import SelectMenu from "../components/SelectMenu.vue";
import Checkbox from "../components/Checkbox.vue";

const input = ref<string[]>([]);
const outputDir = ref("");
const outputFormat = ref<SequenceAnimationOptions["outputFormat"]>("gif");
const fps = ref(12);
const width = ref<number | null>(null);
const loop = ref(true);
const busy = ref(false);
const result = ref<ConversionResult | null>(null);

const formatOptions = [
  { label: "GIF", value: "gif", icon: "ri-file-gif-line" },
  { label: "APNG", value: "apng", icon: "ri-image-line" },
  { label: "Animated WebP", value: "webp", icon: "ri-gallery-line" }
];
const canRun = computed(() => input.value.length > 0 && outputDir.value && !busy.value);

function sortByName() {
  input.value = [...input.value].sort((a, b) => a.localeCompare(b, "zh-Hans-CN", { numeric: true }));
}

async function run() {
  if (!canRun.value) return;
  busy.value = true;
  try {
    result.value = await window.devToolbox.convertSequenceAnimation({
      inputPaths: [...input.value],
      outputDir: outputDir.value,
      outputFormat: outputFormat.value,
      fps: fps.value,
      width: width.value || undefined,
      loop: loop.value
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
        <h2>序列帧转动图</h2>
        <p>把连续图片帧转换为 GIF、APNG 或 Animated WebP</p>
      </div>
      <div class="header-actions">
        <button type="button" class="secondary-button" :disabled="input.length < 2" @click="sortByName">
          <i class="ri-sort-asc" aria-hidden="true"></i>
          按文件名排序
        </button>
        <button type="button" class="primary-button" :disabled="!canRun" @click="run">
          <i class="ri-play-fill" aria-hidden="true"></i>
          生成动图
        </button>
      </div>
    </div>

    <div class="tool-layout">
      <section class="tool-main">
        <DropZone
          v-model="input"
          title="序列帧图片"
          :multiple="true"
          :filters="[{ name: '序列帧图片', extensions: ['png', 'jpg', 'jpeg', 'webp'] }]"
        />
        <OutputPicker v-model="outputDir" />
        <div class="option-grid">
          <div class="field">
            <span>输出格式</span>
            <SelectMenu v-model="outputFormat" :options="formatOptions" />
          </div>
          <label class="field">
            <span>FPS</span>
            <input v-model.number="fps" type="number" min="1" max="60" />
          </label>
          <label class="field">
            <span>输出宽度</span>
            <input v-model.number="width" type="number" min="1" placeholder="保持原始宽度" />
          </label>
          <Checkbox v-model="loop" class="check-row" label="循环播放" />
        </div>
        <div v-if="input.length" class="sequence-list">
          <div v-for="(frame, index) in input.slice(0, 8)" :key="frame" class="sequence-row">
            <span>{{ String(index + 1).padStart(2, "0") }}</span>
            <strong>{{ frame.split(/[\\/]/).pop() }}</strong>
          </div>
          <p v-if="input.length > 8" class="empty-state">还有 {{ input.length - 8 }} 帧未显示</p>
        </div>
      </section>
      <ResultPanel :result="result" :busy="busy" />
    </div>
  </section>
</template>
