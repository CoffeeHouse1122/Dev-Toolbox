<script setup lang="ts">
import { computed, ref } from "vue";
import type { ConversionResult } from "../../shared/types";
import DropZone from "../components/DropZone.vue";
import OutputPicker from "../components/OutputPicker.vue";
import ResultPanel from "../components/ResultPanel.vue";
import TaskFlowLayout from "../components/TaskFlowLayout.vue";

const input = ref<string[]>([]);
const outputDir = ref("");
const spriteName = ref("sprite");
const classPrefix = ref("sprite");
const columns = ref(4);
const padding = ref(4);
const busy = ref(false);
const result = ref<ConversionResult | null>(null);
const canRun = computed(() => input.value.length > 0 && outputDir.value && spriteName.value.trim() && !busy.value);

async function run() {
  if (!canRun.value) return;
  busy.value = true;
  try {
    result.value = await window.devToolbox.generateSprite({
      inputPaths: [...input.value],
      outputDir: outputDir.value,
      spriteName: spriteName.value,
      classPrefix: classPrefix.value,
      columns: columns.value,
      padding: padding.value
    });
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <TaskFlowLayout
    title="雪碧图生成器"
    description="批量合并小图标，生成 sprite.png 与定位 CSS"
    source-title="图标图片"
    source-description="添加需要合并的图标，队列顺序将决定雪碧图排列顺序"
    settings-title="排版设置"
    settings-description="设置输出名称、CSS 前缀、列数与图标间距"
    :file-count="input.length"
  >
    <template #source>
      <DropZone
        v-model="input"
        title="拖入图标图片"
        action-label="添加图标"
        compact
        append-selection
        :multiple="true"
        :filters="[{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'svg'] }]"
      />
    </template>

    <template #settings>
      <div class="option-grid">
        <label class="field">
          <span>文件名</span>
          <input v-model="spriteName" />
        </label>
        <label class="field">
          <span>CSS 类名前缀</span>
          <input v-model="classPrefix" />
        </label>
        <label class="field">
          <span>列数</span>
          <input v-model.number="columns" type="number" min="1" max="24" />
        </label>
        <label class="field">
          <span>间距</span>
          <input v-model.number="padding" type="number" min="0" max="256" />
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
      <span>{{ input.length }} 张 · {{ columns }} 列 · {{ padding }}px 间距</span>
    </template>

    <template #actions>
      <button type="button" class="primary-button" :disabled="!canRun" @click="run">
        <i class="ri-layout-grid-line" aria-hidden="true"></i>
        生成雪碧图
      </button>
    </template>
  </TaskFlowLayout>
</template>
