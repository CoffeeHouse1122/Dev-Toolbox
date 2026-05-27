<script setup lang="ts">
import { computed, ref } from "vue";
import type { CodeMinifyOptions, ConversionResult, DevToolboxApi } from "../../shared/types";
// @ts-ignore VS Code inferred project may miss the local *.vue shim.
import DropZone from "../components/DropZone.vue";
// @ts-ignore VS Code inferred project may miss the local *.vue shim.
import OutputPicker from "../components/OutputPicker.vue";
// @ts-ignore VS Code inferred project may miss the local *.vue shim.
import ResultPanel from "../components/ResultPanel.vue";
// @ts-ignore VS Code inferred project may miss the local *.vue shim.
import SelectMenu from "../components/SelectMenu.vue";
const devToolbox = (window as unknown as Window & { devToolbox: DevToolboxApi }).devToolbox;

const input = ref<string[]>([]);
const outputDir = ref("");
const removeConsole = ref(true);
const beautify = ref(false);
const target = ref<CodeMinifyOptions["target"]>("legacy");
const busy = ref(false);
const result = ref<ConversionResult | null>(null);

const targetOptions = [
  { label: "传统兼容", value: "legacy", icon: "ri-ie-line" },
  { label: "现代浏览器", value: "defaults", icon: "ri-chrome-line" }
];

const canRun = computed(() => input.value.length > 0 && outputDir.value && !busy.value);

async function run() {
  if (!canRun.value) return;
  busy.value = true;
  try {
    result.value = await devToolbox.minifyCode({
      inputPaths: [...input.value],
      outputDir: outputDir.value,
      removeConsole: removeConsole.value,
      beautify: beautify.value,
      target: target.value
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
        <h2>CSS / JS 压缩</h2>
        <p>CSS 自动前缀，JS 兼容转换、压缩与 console.log 移除</p>
      </div>
      <button type="button" class="primary-button" :disabled="!canRun" @click="run">
        <i class="ri-braces-line" aria-hidden="true"></i>
        开始处理
      </button>
    </div>

    <div class="tool-layout">
      <section class="tool-main">
        <DropZone
          v-model="input"
          title="CSS / JS 文件"
          :multiple="true"
          :filters="[{ name: 'CSS / JS', extensions: ['css', 'js', 'mjs'] }]"
        />
        <OutputPicker v-model="outputDir" />
        <div class="option-grid">
          <div class="field span-2">
            <span>兼容目标</span>
            <SelectMenu v-model="target" :options="targetOptions" />
          </div>
          <label class="check-row video-check-row">
            <input v-model="removeConsole" type="checkbox" />
            <span>移除 console.log</span>
          </label>
          <label class="check-row video-check-row">
            <input v-model="beautify" type="checkbox" />
            <span>保留可读格式</span>
          </label>
        </div>
      </section>

      <ResultPanel :result="result" :busy="busy" />
    </div>
  </section>
</template>