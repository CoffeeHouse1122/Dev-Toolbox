<script setup lang="ts">
import { computed, ref } from "vue";
import type { ConversionResult, ImageOutputFormat } from "../../shared/types";
import DropZone from "../components/DropZone.vue";
import OutputPicker from "../components/OutputPicker.vue";
import OptionGrid from "../components/OptionGrid.vue";
import ResultPanel from "../components/ResultPanel.vue";
import SelectMenu from "../components/SelectMenu.vue";

const input = ref<string[]>([]);
const outputDir = ref("");
const outputFormat = ref<ImageOutputFormat>("webp");
const quality = ref(82);
const lossless = ref(false);
const keepMetadata = ref(false);
const maxWidth = ref<number | null>(null);
const maxHeight = ref<number | null>(null);
const busy = ref(false);
const result = ref<ConversionResult | null>(null);
const formatOptions = [
  { label: "WebP", value: "webp", icon: "ri-image-line" },
  { label: "PNG", value: "png", icon: "ri-image-2-line" },
  { label: "JPEG", value: "jpeg", icon: "ri-image-circle-line" },
  { label: "AVIF", value: "avif", icon: "ri-gallery-line" }
];

const canRun = computed(() => input.value.length > 0 && outputDir.value && !busy.value);

async function run() {
  if (!canRun.value) return;
  busy.value = true;
  try {
    result.value = await window.devToolbox.convertWebp({
      inputPaths: [...input.value],
      outputDir: outputDir.value,
      outputFormat: outputFormat.value,
      quality: quality.value,
      lossless: lossless.value,
      keepMetadata: keepMetadata.value,
      maxWidth: maxWidth.value || undefined,
      maxHeight: maxHeight.value || undefined
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
        <h2>图片格式转换</h2>
        <p>支持 WebP、PNG、JPEG、AVIF，支持单个或批量</p>
      </div>
      <button type="button" class="primary-button" :disabled="!canRun" @click="run">
        <i class="ri-play-fill" aria-hidden="true"></i>
        转换 {{ input.length > 1 ? input.length : "" }}
      </button>
    </div>

    <div class="tool-layout">
      <div class="tool-main">
        <DropZone
          v-model="input"
          title="源图片"
          preview="image"
          :multiple="true"
          :filters="[{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'avif', 'tiff'] }]"
        />
        <OutputPicker v-model="outputDir" />

        <OptionGrid>
          <div class="field">
            <span>目标格式</span>
            <SelectMenu v-model="outputFormat" :options="formatOptions" />
          </div>
          <label class="field">
            <span>质量</span>
            <input v-model.number="quality" type="range" min="1" max="100" />
            <strong>{{ quality }}</strong>
          </label>
          <label class="field">
            <span>最大宽度</span>
            <input v-model.number="maxWidth" type="number" min="1" placeholder="保持原始" />
          </label>
          <label class="field">
            <span>最大高度</span>
            <input v-model.number="maxHeight" type="number" min="1" placeholder="保持原始" />
          </label>
          <label class="check-row">
            <input v-model="lossless" type="checkbox" />
            <span>无损压缩</span>
          </label>
          <label class="check-row">
            <input v-model="keepMetadata" type="checkbox" />
            <span>保留元数据</span>
          </label>
        </OptionGrid>
      </div>

      <ResultPanel :result="result" :busy="busy" />
    </div>
  </section>
</template>
