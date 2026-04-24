<script setup lang="ts">
import { computed, ref } from "vue";
import type { ConversionResult } from "../../shared/types";
import OutputPicker from "../components/OutputPicker.vue";
import ResultPanel from "../components/ResultPanel.vue";

const outputDir = ref("");
const fileName = ref("og-image");
const title = ref("Dev Toolbox");
const subtitle = ref("前端资源工具箱");
const siteName = ref("example.com");
const width = ref(1200);
const height = ref(630);
const backgroundColor = ref("#0d1117");
const accentColor = ref("#2f81f7");
const textColor = ref("#e6edf3");
const busy = ref(false);
const result = ref<ConversionResult | null>(null);
const canRun = computed(() => outputDir.value && fileName.value.trim() && title.value.trim() && !busy.value);

async function run() {
  if (!canRun.value) return;
  busy.value = true;
  try {
    result.value = await window.devToolbox.generateOgImage({
      outputDir: outputDir.value,
      fileName: fileName.value,
      title: title.value,
      subtitle: subtitle.value,
      siteName: siteName.value,
      width: width.value,
      height: height.value,
      backgroundColor: backgroundColor.value,
      accentColor: accentColor.value,
      textColor: textColor.value
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
        <h2>Open Graph 图片生成器</h2>
        <p>快速生成 1200x630 社交分享图</p>
      </div>
      <button type="button" class="primary-button" :disabled="!canRun" @click="run">
        <i class="ri-image-add-line" aria-hidden="true"></i>
        生成 OG 图片
      </button>
    </div>

    <div class="tool-layout">
      <section class="tool-main">
        <OutputPicker v-model="outputDir" />
        <div class="option-grid">
          <label class="field">
            <span>文件名</span>
            <input v-model="fileName" />
          </label>
          <label class="field">
            <span>站点名</span>
            <input v-model="siteName" />
          </label>
          <label class="field span-2">
            <span>标题</span>
            <input v-model="title" />
          </label>
          <label class="field span-2">
            <span>副标题</span>
            <input v-model="subtitle" />
          </label>
          <label class="field">
            <span>宽度</span>
            <input v-model.number="width" type="number" min="320" max="2400" />
          </label>
          <label class="field">
            <span>高度</span>
            <input v-model.number="height" type="number" min="240" max="1600" />
          </label>
          <label class="field">
            <span>背景色</span>
            <input v-model="backgroundColor" />
          </label>
          <label class="field">
            <span>强调色</span>
            <input v-model="accentColor" />
          </label>
          <label class="field">
            <span>文字色</span>
            <input v-model="textColor" />
          </label>
        </div>
      </section>
      <ResultPanel :result="result" :busy="busy" />
    </div>
  </section>
</template>
