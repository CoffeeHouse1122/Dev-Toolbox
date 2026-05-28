<script setup lang="ts">
import { computed, ref } from "vue";
import type { ConversionResult } from "../../shared/types";
import OutputPicker from "../components/OutputPicker.vue";
import ResultPanel from "../components/ResultPanel.vue";
import Checkbox from "../components/Checkbox.vue";

const sourceDir = ref("");
const outputDir = ref("");
const baseName = ref("asset-manifest");
const includeHash = ref(true);
const busy = ref(false);
const result = ref<ConversionResult | null>(null);

const canRun = computed(() => sourceDir.value && outputDir.value && baseName.value.trim() && !busy.value);

async function pickSourceDir() {
  const dir = await window.devToolbox.selectOutputDir();
  if (dir) sourceDir.value = dir;
}

async function run() {
  if (!canRun.value) return;
  busy.value = true;
  try {
    result.value = await window.devToolbox.generateAssetManifest({
      sourceDir: sourceDir.value,
      outputDir: outputDir.value,
      baseName: baseName.value,
      includeHash: includeHash.value
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
        <h2>前端静态资源清单</h2>
        <p>扫描构建目录，生成包含体积、类型、哈希的 manifest JSON</p>
      </div>
      <button type="button" class="primary-button" :disabled="!canRun" @click="run">
        <i class="ri-file-list-3-line" aria-hidden="true"></i>
        生成清单
      </button>
    </div>

    <div class="tool-layout">
      <section class="tool-main">
        <div class="field-row output-picker">
          <label class="field grow">
            <span>扫描目录</span>
            <input :value="sourceDir" readonly placeholder="请选择 dist、build 或静态资源目录" />
          </label>
          <button type="button" class="icon-button" title="选择扫描目录" @click="pickSourceDir">
            <i class="ri-folder-open-line" aria-hidden="true"></i>
          </button>
        </div>
        <OutputPicker v-model="outputDir" />
        <div class="option-grid">
          <label class="field span-2">
            <span>清单文件名</span>
            <input v-model="baseName" />
          </label>
          <Checkbox v-model="includeHash" class="check-row span-2" label="计算 SHA-256 哈希" />
        </div>
      </section>

      <ResultPanel :result="result" :busy="busy" />
    </div>
  </section>
</template>
