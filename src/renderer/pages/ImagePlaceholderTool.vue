<script setup lang="ts">
import { computed, ref } from "vue";
import type { ConversionResult } from "../../shared/types";
import DropZone from "../components/DropZone.vue";
import OutputPicker from "../components/OutputPicker.vue";
import ResultPanel from "../components/ResultPanel.vue";
import TaskFlowLayout from "../components/TaskFlowLayout.vue";

const input = ref<string[]>([]);
const outputDir = ref("");
const tinyWidth = ref(24);
const componentX = ref(4);
const componentY = ref(3);
const busy = ref(false);
const result = ref<ConversionResult | null>(null);
const canRun = computed(() => input.value.length > 0 && outputDir.value && !busy.value);

async function run() {
  if (!canRun.value) return;
  busy.value = true;
  try {
    result.value = await window.devToolbox.generateImagePlaceholders({
      inputPaths: [...input.value],
      outputDir: outputDir.value,
      tinyWidth: tinyWidth.value,
      componentX: componentX.value,
      componentY: componentY.value
    });
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <TaskFlowLayout
    tool-id="image-placeholder"
    description="输出 BlurHash、dominant color 与 tiny base64 placeholder"
    source-title="源图片"
    source-description="添加待分析图片，任务将按队列顺序处理"
    settings-title="占位符设置"
    settings-description="调整 Tiny 图尺寸与 BlurHash 采样精度"
    :file-count="input.length"
  >
    <template #source>
      <DropZone
        v-model="input"
        title="拖入源图片"
        action-label="添加图片"
        compact
        append-selection
        :multiple="true"
        :filters="[{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'avif'] }]"
      />
    </template>

    <template #settings>
      <div class="option-grid">
        <label class="field">
          <span>Tiny 宽度</span>
          <input v-model.number="tinyWidth" type="number" min="8" max="128" />
        </label>
        <label class="field">
          <span>BlurHash X</span>
          <input v-model.number="componentX" type="number" min="1" max="9" />
        </label>
        <label class="field">
          <span>BlurHash Y</span>
          <input v-model.number="componentY" type="number" min="1" max="9" />
        </label>
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
      <span>{{ input.length }} 张 · Tiny {{ tinyWidth }}px · BlurHash {{ componentX }} × {{ componentY }}</span>
    </template>

    <template #actions>
      <button type="button" class="primary-button" :disabled="!canRun" @click="run">
        <i class="ri-blur-off-line" aria-hidden="true"></i>
        生成占位符
      </button>
    </template>
  </TaskFlowLayout>
</template>
