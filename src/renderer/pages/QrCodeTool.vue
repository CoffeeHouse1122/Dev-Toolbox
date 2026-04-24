<script setup lang="ts">
import { computed, ref } from "vue";
import type { ConversionResult } from "../../shared/types";
import OutputPicker from "../components/OutputPicker.vue";
import ResultPanel from "../components/ResultPanel.vue";
import SelectMenu from "../components/SelectMenu.vue";

const text = ref("https://github.com/");
const outputDir = ref("");
const fileName = ref("qrcode");
const format = ref<"png" | "svg">("png");
const size = ref(512);
const margin = ref(2);
const darkColor = ref("#1f2328");
const lightColor = ref("#ffffff");
const busy = ref(false);
const result = ref<ConversionResult | null>(null);
const formatOptions = [
  { label: "PNG", value: "png", icon: "ri-image-line" },
  { label: "SVG", value: "svg", icon: "ri-code-box-line" }
];

const canRun = computed(() => text.value.trim() && outputDir.value && fileName.value.trim() && !busy.value);
const previewPath = computed(() => result.value?.files[0] ?? "");
const previewUrl = computed(() => (previewPath.value ? `devtoolbox-file://preview/${encodeURIComponent(previewPath.value)}` : ""));

async function run() {
  if (!canRun.value) return;
  busy.value = true;
  try {
    result.value = await window.devToolbox.generateQrCode({
      text: text.value,
      outputDir: outputDir.value,
      fileName: fileName.value,
      format: format.value,
      size: size.value,
      margin: margin.value,
      darkColor: darkColor.value,
      lightColor: lightColor.value
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
        <h2>二维码生成</h2>
        <p>把链接、文本或配置片段生成 PNG / SVG 二维码</p>
      </div>
      <button type="button" class="primary-button" :disabled="!canRun" @click="run">
        <i class="ri-qr-code-line" aria-hidden="true"></i>
        生成二维码
      </button>
    </div>

    <div class="tool-layout">
      <section class="tool-main">
        <label class="field">
          <span>内容</span>
          <textarea v-model="text" class="tool-textarea compact" placeholder="输入需要编码的文本"></textarea>
        </label>
        <OutputPicker v-model="outputDir" />
        <div class="option-grid">
          <label class="field">
            <span>文件名</span>
            <input v-model="fileName" />
          </label>
          <div class="field">
            <span>格式</span>
            <SelectMenu v-model="format" :options="formatOptions" />
          </div>
          <label class="field">
            <span>尺寸</span>
            <input v-model.number="size" type="number" min="128" max="2048" />
          </label>
          <label class="field">
            <span>边距</span>
            <input v-model.number="margin" type="number" min="0" max="12" />
          </label>
          <label class="field">
            <span>前景色</span>
            <input v-model="darkColor" type="text" />
          </label>
          <label class="field">
            <span>背景色</span>
            <input v-model="lightColor" type="text" />
          </label>
        </div>
        <div v-if="previewUrl" class="qr-preview">
          <img :src="previewUrl" alt="二维码预览" />
        </div>
      </section>

      <ResultPanel :result="result" :busy="busy" />
    </div>
  </section>
</template>
