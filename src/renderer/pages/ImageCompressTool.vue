<script setup lang="ts">
import { ref } from "vue";
import type { ConversionResult } from "../../shared/types";
import DropZone from "../components/DropZone.vue";
import OutputPicker from "../components/OutputPicker.vue";
import ResultPanel from "../components/ResultPanel.vue";

const input = ref<string[]>([]);
const outputDir = ref("");
const quality = ref(78);
const keepMetadata = ref(false);
const keepOriginalName = ref(false);
const busy = ref(false);
const result = ref<ConversionResult | null>(null);

async function run() {
  if (!input.value.length || !outputDir.value) return;
  busy.value = true;
  try {
    result.value = await window.devToolbox.compressImages({
      inputPaths: [...input.value],
      outputDir: outputDir.value,
      quality: quality.value,
      keepMetadata: keepMetadata.value,
      keepOriginalName: keepOriginalName.value
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
        <h2>图片压缩</h2>
        <p>PNG / JPG / WebP / AVIF 单个或批量压缩</p>
      </div>
      <button type="button" class="primary-button" :disabled="!input.length || !outputDir || busy" @click="run">
        <i class="ri-image-edit-line" aria-hidden="true"></i>
        压缩 {{ input.length > 1 ? input.length : "" }}
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
            <span>质量</span>
            <input v-model.number="quality" type="range" min="1" max="100" />
            <strong>{{ quality }}</strong>
          </label>
          <label class="check-row">
            <input v-model="keepMetadata" type="checkbox" />
            <span>保留元数据</span>
          </label>
          <label class="check-row">
            <input v-model="keepOriginalName" type="checkbox" />
            <span>保持原命名输出</span>
          </label>
        </div>
      </section>
      <ResultPanel :result="result" :busy="busy" />
    </div>
  </section>
</template>
