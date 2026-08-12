<script setup lang="ts">
import { computed, ref } from "vue";
import type { ConversionResult } from "../../shared/types";
import DropZone from "../components/DropZone.vue";
import OutputPicker from "../components/OutputPicker.vue";
import OptionGrid from "../components/OptionGrid.vue";
import ResultPanel from "../components/ResultPanel.vue";
import Checkbox from "../components/Checkbox.vue";
import TaskFlowLayout from "../components/TaskFlowLayout.vue";

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
  <TaskFlowLayout
    title="WOFF2 字体转换"
    description="支持 TTF、OTF、WOFF、WOFF2"
    source-title="源字体"
    source-description="添加待转换字体，任务将按队列顺序处理"
    settings-title="转换设置"
    settings-description="为输出字体设置统一的字体名称与 CSS 规则"
    preview-title="字体样张"
    preview-description="快速确认字母、数字与中文字符的视觉表现"
    :file-count="input.length"
  >
    <template #source>
      <DropZone
        v-model="input"
        title="拖入源字体"
        action-label="添加字体"
        compact
        append-selection
        :multiple="true"
        :filters="[{ name: '字体', extensions: ['ttf', 'otf', 'woff', 'woff2'] }]"
      />
    </template>

    <template #settings>
      <OptionGrid>
        <label class="field span-2">
          <span>字体名称</span>
          <input v-model="fontFamily" placeholder="默认使用文件名" />
        </label>
        <Checkbox v-model="generateCss" class="check-row" label="生成 @font-face CSS" />
      </OptionGrid>
    </template>

    <template #preview>
      <section class="preview-strip">
        <span class="sample-a">Aa</span>
        <span class="sample-b">0123456789</span>
        <span class="sample-c">前端资源</span>
      </section>
    </template>

    <template #result>
      <ResultPanel :result="result" :busy="busy" compact />
    </template>

    <template #destination>
      <OutputPicker v-model="outputDir" />
    </template>

    <template #summary>
      <i class="ri-stack-line" aria-hidden="true"></i>
      <span>{{ input.length }} 个字体 · WOFF2{{ generateCss ? " + CSS" : "" }}</span>
    </template>

    <template #actions>
      <button type="button" class="primary-button" :disabled="!canRun" @click="run">
        <i class="ri-play-fill" aria-hidden="true"></i>
        开始转换
      </button>
    </template>
  </TaskFlowLayout>
</template>
