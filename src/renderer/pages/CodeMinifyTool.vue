<script setup lang="ts">
import { computed, ref } from "vue";
import type { CodeMinifyOptions, ConversionResult, DevToolboxApi } from "../../shared/types";
import Checkbox from "../components/Checkbox.vue";
// @ts-ignore VS Code inferred project may miss the local *.vue shim.
import DropZone from "../components/DropZone.vue";
// @ts-ignore VS Code inferred project may miss the local *.vue shim.
import OutputPicker from "../components/OutputPicker.vue";
// @ts-ignore VS Code inferred project may miss the local *.vue shim.
import ResultPanel from "../components/ResultPanel.vue";
// @ts-ignore VS Code inferred project may miss the local *.vue shim.
import SelectMenu from "../components/SelectMenu.vue";
// @ts-ignore VS Code inferred project may miss the local *.vue shim.
import TaskFlowLayout from "../components/TaskFlowLayout.vue";
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
  <TaskFlowLayout
    tool-id="code-minify"
    description="CSS 自动前缀，JS 兼容转换、压缩与所有 console.* 调用移除"
    source-title="源代码文件"
    source-description="添加 CSS / JS 文件，任务将按队列顺序处理"
    settings-title="压缩设置"
    settings-description="所有源文件共用以下兼容与输出规则"
    :file-count="input.length"
  >
    <template #source>
      <DropZone
        v-model="input"
        title="拖入 CSS / JS 文件"
        action-label="添加文件"
        compact
        append-selection
        :multiple="true"
        :filters="[{ name: 'CSS / JS', extensions: ['css', 'js', 'mjs'] }]"
      />
    </template>

    <template #settings>
      <div class="option-grid">
        <div class="field span-2">
          <span>兼容目标</span>
          <SelectMenu v-model="target" :options="targetOptions" />
        </div>
        <Checkbox v-model="removeConsole" class="check-row video-check-row" label="移除所有 console.*" />
        <Checkbox v-model="beautify" class="check-row video-check-row" label="保留可读格式" />
      </div>
    </template>

    <template #result>
      <ResultPanel :result="result" :busy="busy" compact />
    </template>

    <template #destination>
      <OutputPicker v-model="outputDir" />
    </template>

    <template #summary>
      <i class="ri-stack-line" aria-hidden="true"></i>
      <span>{{ input.length }} 个文件 · {{ target === "legacy" ? "传统兼容" : "现代浏览器" }}</span>
    </template>

    <template #actions>
      <button type="button" class="primary-button" :disabled="!canRun" @click="run">
        <i class="ri-braces-line" aria-hidden="true"></i>
        开始处理
      </button>
    </template>
  </TaskFlowLayout>
</template>
