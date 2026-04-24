<script setup lang="ts">
import { computed, ref } from "vue";
import type { ConversionResult } from "../../shared/types";
import DropZone from "../components/DropZone.vue";
import OutputPicker from "../components/OutputPicker.vue";
import ResultPanel from "../components/ResultPanel.vue";

const input = ref<string[]>([]);
const outputDir = ref("");
const tinyWidth = ref(24);
const componentX = ref(4);
const componentY = ref(3);
const busy = ref(false);
const result = ref<ConversionResult | null>(null);
const canRun = computed(() => input.value.length > 0 && outputDir.value && !busy.value);

async function run() {
  if (!canRun.value) return;
  busy.value = true;
  try {
    result.value = await window.devToolbox.generateImagePlaceholders({
      inputPaths: [...input.value],
      outputDir: outputDir.value,
      tinyWidth: tinyWidth.value,
      componentX: componentX.value,
      componentY: componentY.value
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
        <h2>图片占位符生成</h2>
        <p>输出 BlurHash、dominant color 与 tiny base64 placeholder</p>
      </div>
      <button type="button" class="primary-button" :disabled="!canRun" @click="run">
        <i class="ri-blur-off-line" aria-hidden="true"></i>
        生成占位符
      </button>
    </div>

    <div class="tool-layout">
      <section class="tool-main">
        <DropZone
          v-model="input"
          title="源图片"
          preview="image"
          :multiple="true"
          :filters="[{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'avif'] }]"
        />
        <OutputPicker v-model="outputDir" />
        <div class="option-grid">
          <label class="field">
            <span>Tiny 宽度</span>
            <input v-model.number="tinyWidth" type="number" min="8" max="128" />
          </label>
          <label class="field">
            <span>BlurHash X</span>
            <input v-model.number="componentX" type="number" min="1" max="9" />
          </label>
          <label class="field">
            <span>BlurHash Y</span>
            <input v-model.number="componentY" type="number" min="1" max="9" />
          </label>
        </div>
      </section>
      <ResultPanel :result="result" :busy="busy" />
    </div>
  </section>
</template>
