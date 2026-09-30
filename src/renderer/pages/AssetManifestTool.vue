<script setup lang="ts">
import { computed, ref } from "vue";
import type { ConversionResult } from "../../shared/types";
import OutputPicker from "../components/OutputPicker.vue";
import ResultPanel from "../components/ResultPanel.vue";
import Checkbox from "../components/Checkbox.vue";
import TaskFlowLayout from "../components/TaskFlowLayout.vue";

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
  <TaskFlowLayout
    tool-id="asset-manifest"
    description="扫描构建目录，生成包含体积、类型、哈希的 manifest JSON"
    source-title="构建产物目录"
    source-description="选择 dist、build 或静态资源目录作为清单扫描来源"
    settings-title="清单设置"
    settings-description="设置生成文件名及资源指纹信息"
    :file-label="sourceDir ? '已选择目录' : '未选择目录'"
  >
    <template #source>
      <div class="manifest-source-row">
        <div class="field-row output-picker">
          <label class="field grow">
            <span>扫描目录</span>
            <input :value="sourceDir" readonly placeholder="请选择 dist、build 或静态资源目录" />
          </label>
          <button type="button" class="icon-button" title="选择扫描目录" @click="pickSourceDir">
            <i class="ri-folder-open-line" aria-hidden="true"></i>
          </button>
        </div>
      </div>
    </template>

    <template #settings>
      <div class="option-grid">
        <label class="field span-2">
          <span>清单文件名</span>
          <input v-model="baseName" />
        </label>
        <Checkbox v-model="includeHash" class="check-row span-2" label="计算 SHA-256 哈希" />
      </div>
    </template>

    <template #result>
      <ResultPanel :result="result" :busy="busy" title="生成结果" empty-text="生成后可在此打开资源清单" compact />
    </template>

    <template #destination>
      <OutputPicker v-model="outputDir" />
    </template>

    <template #summary>
      <i class="ri-folder-chart-line" aria-hidden="true"></i>
      <span>{{ sourceDir ? `扫描 1 个目录 · ${includeHash ? "包含 SHA-256" : "不计算哈希"}` : "等待选择扫描目录" }}</span>
    </template>

    <template #actions>
      <button type="button" class="primary-button" :disabled="!canRun" @click="run">
        <i class="ri-file-list-3-line" aria-hidden="true"></i>
        {{ busy ? "生成中…" : "生成清单" }}
      </button>
    </template>
  </TaskFlowLayout>
</template>

<style scoped>
.manifest-source-row {
  max-width: 100%;
}

.manifest-source-row .field-row {
  margin: 0;
}
</style>
