<script setup lang="ts">
import { computed, ref } from "vue";
import type { ConversionResult, FontSubsetOptions } from "../../shared/types";
import DropZone from "../components/DropZone.vue";
import OutputPicker from "../components/OutputPicker.vue";
import ResultPanel from "../components/ResultPanel.vue";
import SelectMenu from "../components/SelectMenu.vue";
import Checkbox from "../components/Checkbox.vue";

const input = ref<string[]>([]);
const outputDir = ref("");
const text = ref("开发者工具箱 Dev Toolbox 0123456789");
const outputFormat = ref<FontSubsetOptions["outputFormat"]>("woff2");
const fontFamily = ref("DevToolboxSubset");
const generateCss = ref(true);
const busy = ref(false);
const result = ref<ConversionResult | null>(null);

const formatOptions = [
  { label: "WOFF2", value: "woff2", icon: "ri-font-size-2" },
  { label: "TTF", value: "ttf", icon: "ri-font-mono" }
];
const charCount = computed(() => new Set([...text.value].filter((item) => item.trim())).size);
const canRun = computed(() => input.value[0] && outputDir.value && text.value.trim() && !busy.value);

async function run() {
  if (!canRun.value) return;
  busy.value = true;
  try {
    result.value = await window.devToolbox.subsetFont({
      inputPath: input.value[0],
      outputDir: outputDir.value,
      text: text.value,
      outputFormat: outputFormat.value,
      fontFamily: fontFamily.value,
      generateCss: generateCss.value
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
        <h2>字体子集化</h2>
        <p>按字符裁剪中文 Web 字体，减少线上字体包体积</p>
      </div>
      <button type="button" class="primary-button" :disabled="!canRun" @click="run">
        <i class="ri-scissors-cut-line" aria-hidden="true"></i>
        生成子集
      </button>
    </div>

    <div class="tool-layout">
      <section class="tool-main">
        <DropZone
          v-model="input"
          title="源字体"
          :multiple="false"
          :filters="[{ name: '字体', extensions: ['ttf', 'otf', 'woff', 'woff2'] }]"
        />
        <OutputPicker v-model="outputDir" />
        <label class="field">
          <span>保留字符（{{ charCount }} 个唯一字符）</span>
          <textarea v-model="text" class="tool-textarea compact"></textarea>
        </label>
        <div class="option-grid">
          <div class="field">
            <span>输出格式</span>
            <SelectMenu v-model="outputFormat" :options="formatOptions" />
          </div>
          <label class="field">
            <span>字体族名</span>
            <input v-model="fontFamily" />
          </label>
          <Checkbox v-model="generateCss" class="check-row span-2" label="同时生成 @font-face CSS" />
        </div>
      </section>

      <ResultPanel :result="result" :busy="busy" />
    </div>
  </section>
</template>
