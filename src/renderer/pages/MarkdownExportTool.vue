<script setup lang="ts">
import { ref } from "vue";
import type { ConversionResult } from "../../shared/types";
import OutputPicker from "../components/OutputPicker.vue";
import ResultPanel from "../components/ResultPanel.vue";

const markdown = ref("# 标题\n\n- 列表项\n- **加粗文本**");
const outputDir = ref("");
const baseName = ref("document");
const formats = ref<Array<"html" | "png" | "pdf">>(["html"]);
const busy = ref(false);
const result = ref<ConversionResult | null>(null);
const allFormats: Array<"html" | "png" | "pdf"> = ["html", "png", "pdf"];

function toggleFormat(format: "html" | "png" | "pdf") {
  formats.value = formats.value.includes(format) ? formats.value.filter((item) => item !== format) : [...formats.value, format];
}

async function run() {
  if (!outputDir.value || formats.value.length === 0) return;
  busy.value = true;
  result.value = await window.devToolbox.exportMarkdown({
    markdown: markdown.value,
    outputDir: outputDir.value,
    baseName: baseName.value,
    formats: [...formats.value]
  });
  busy.value = false;
}
</script>

<template>
  <section class="tool-page">
    <div class="tool-header">
      <div>
        <h2>Markdown 转 HTML / PNG / PDF</h2>
        <p>本地渲染并导出文档</p>
      </div>
      <button type="button" class="primary-button" :disabled="!outputDir || !formats.length || busy" @click="run">
        <i class="ri-file-download-line" aria-hidden="true"></i>
        导出
      </button>
    </div>
    <div class="tool-layout">
      <section class="tool-main">
        <textarea v-model="markdown" class="tool-textarea markdown-editor"></textarea>
        <OutputPicker v-model="outputDir" />
        <div class="option-grid">
          <label class="field"><span>文件名</span><input v-model="baseName" /></label>
          <div class="field"><span>格式</span><div class="size-grid"><button v-for="format in allFormats" :key="format" type="button" class="toggle-chip" :class="{ selected: formats.includes(format) }" @click="toggleFormat(format)">{{ format }}</button></div></div>
        </div>
      </section>
      <ResultPanel :result="result" :busy="busy" />
    </div>
  </section>
</template>

