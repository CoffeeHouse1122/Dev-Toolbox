<script setup lang="ts">
import { ref } from "vue";
import type { ConversionResult } from "../../shared/types";
import DropZone from "../components/DropZone.vue";
import OutputPicker from "../components/OutputPicker.vue";
import ResultPanel from "../components/ResultPanel.vue";
import SelectMenu from "../components/SelectMenu.vue";

const input = ref<string[]>([]);
const outputDir = ref("");
const outputFormat = ref<"gif" | "webp">("gif");
const width = ref(480);
const fps = ref(12);
const startSeconds = ref(0);
const durationSeconds = ref(5);
const busy = ref(false);
const result = ref<ConversionResult | null>(null);
const formatOptions = [
  { label: "GIF", value: "gif", icon: "ri-file-gif-line" },
  { label: "Animated WebP", value: "webp", icon: "ri-image-line" }
];

async function run() {
  if (!input.value[0] || !outputDir.value) return;
  busy.value = true;
  result.value = await window.devToolbox.convertVideoAnimation({
    inputPath: input.value[0],
    outputDir: outputDir.value,
    outputFormat: outputFormat.value,
    width: width.value || undefined,
    fps: fps.value,
    startSeconds: startSeconds.value,
    durationSeconds: durationSeconds.value
  });
  busy.value = false;
}
</script>

<template>
  <section class="tool-page">
    <div class="tool-header">
      <div>
        <h2>视频转 GIF / Animated WebP</h2>
        <p>截取片段并生成动图资源</p>
      </div>
      <button type="button" class="primary-button" :disabled="!input.length || !outputDir || busy" @click="run">
        <i class="ri-play-fill" aria-hidden="true"></i>
        开始转换
      </button>
    </div>

    <div class="tool-layout">
      <section class="tool-main">
        <DropZone v-model="input" title="源视频" preview="video" :multiple="false" :filters="[{ name: '视频', extensions: ['mp4', 'webm', 'mov', 'mkv', 'avi'] }]" />
        <OutputPicker v-model="outputDir" />
        <div class="option-grid">
          <div class="field span-2">
            <span>输出格式</span>
            <SelectMenu v-model="outputFormat" :options="formatOptions" />
          </div>
          <label class="field"><span>宽度</span><input v-model.number="width" type="number" min="64" /></label>
          <label class="field"><span>FPS</span><input v-model.number="fps" type="number" min="1" max="60" /></label>
          <label class="field"><span>开始秒</span><input v-model.number="startSeconds" type="number" min="0" /></label>
          <label class="field"><span>持续秒</span><input v-model.number="durationSeconds" type="number" min="0.1" step="0.1" /></label>
        </div>
      </section>
      <ResultPanel :result="result" :busy="busy" />
    </div>
  </section>
</template>

