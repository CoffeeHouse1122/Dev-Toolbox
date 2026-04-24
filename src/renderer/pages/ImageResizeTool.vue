<script setup lang="ts">
import { ref } from "vue";
import type { ConversionResult } from "../../shared/types";
import DropZone from "../components/DropZone.vue";
import OutputPicker from "../components/OutputPicker.vue";
import ResultPanel from "../components/ResultPanel.vue";

const input = ref<string[]>([]);
const outputDir = ref("");
const mode = ref<"size" | "scale">("size");
const width = ref(1280);
const height = ref<number | undefined>();
const scale = ref(50);
const busy = ref(false);
const result = ref<ConversionResult | null>(null);

async function run() {
  if (!input.value.length || !outputDir.value) return;
  busy.value = true;
  result.value = await window.devToolbox.resizeImages({
    inputPaths: [...input.value],
    outputDir: outputDir.value,
    mode: mode.value,
    width: width.value || undefined,
    height: height.value || undefined,
    scale: scale.value
  });
  busy.value = false;
}
</script>

<template>
  <section class="tool-page">
    <div class="tool-header">
      <div>
        <h2>图片尺寸调整</h2>
        <p>按宽高或比例缩放，支持批量</p>
      </div>
      <button type="button" class="primary-button" :disabled="!input.length || !outputDir || busy" @click="run"><i class="ri-crop-line" aria-hidden="true"></i>调整</button>
    </div>
    <div class="tool-layout">
      <section class="tool-main">
        <DropZone v-model="input" title="源图片" preview="image" :filters="[{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'avif', 'tiff'] }]" />
        <OutputPicker v-model="outputDir" />
        <div class="segmented">
          <button type="button" :class="{ selected: mode === 'size' }" @click="mode = 'size'">宽高</button>
          <button type="button" :class="{ selected: mode === 'scale' }" @click="mode = 'scale'">比例</button>
        </div>
        <div class="option-grid">
          <label class="field"><span>宽度</span><input v-model.number="width" type="number" min="1" :disabled="mode === 'scale'" /></label>
          <label class="field"><span>高度</span><input v-model.number="height" type="number" min="1" :disabled="mode === 'scale'" placeholder="自动" /></label>
          <label class="field span-2"><span>比例 %</span><input v-model.number="scale" type="number" min="1" :disabled="mode === 'size'" /></label>
        </div>
      </section>
      <ResultPanel :result="result" :busy="busy" />
    </div>
  </section>
</template>

