<script setup lang="ts">
import { computed, ref } from "vue";
import type { ConversionResult } from "../../shared/types";
import DropZone from "../components/DropZone.vue";
import OutputPicker from "../components/OutputPicker.vue";
import OptionGrid from "../components/OptionGrid.vue";
import ResultPanel from "../components/ResultPanel.vue";

const input = ref<string[]>([]);
const outputDir = ref("");
const generateCss = ref(true);
const fontFamily = ref("");
const busy = ref(false);
const result = ref<ConversionResult | null>(null);

const canRun = computed(() => input.value.length > 0 && outputDir.value && !busy.value);

async function run() {
  if (!canRun.value) return;
  busy.value = true;
  result.value = await window.devToolbox.convertFontWoff2({
    inputPaths: [...input.value],
    outputDir: outputDir.value,
    generateCss: generateCss.value,
    fontFamily: fontFamily.value || undefined
  });
  busy.value = false;
}
</script>

<template>
  <section class="tool-page">
    <div class="tool-header">
      <div>
        <h2>WOFF2 字体转换</h2>
        <p>支持 TTF、OTF、WOFF、WOFF2</p>
      </div>
      <button type="button" class="primary-button" :disabled="!canRun" @click="run">
        <i class="ri-play-fill" aria-hidden="true"></i>
        开始转换
      </button>
    </div>

    <div class="tool-layout">
      <div class="tool-main">
        <DropZone
          v-model="input"
          title="源字体"
          :filters="[{ name: '字体', extensions: ['ttf', 'otf', 'woff', 'woff2'] }]"
        />
        <OutputPicker v-model="outputDir" />

        <OptionGrid>
          <label class="field span-2">
            <span>字体名称</span>
            <input v-model="fontFamily" placeholder="默认使用文件名" />
          </label>
          <label class="check-row">
            <input v-model="generateCss" type="checkbox" />
            <span>生成 @font-face CSS</span>
          </label>
        </OptionGrid>

        <section class="preview-strip">
          <span class="sample-a">Aa</span>
          <span class="sample-b">0123456789</span>
          <span class="sample-c">前端资源</span>
        </section>
      </div>

      <ResultPanel :result="result" :busy="busy" />
    </div>
  </section>
</template>
