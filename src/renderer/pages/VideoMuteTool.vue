<script setup lang="ts">
import { ref } from "vue";
import type { ConversionResult } from "../../shared/types";
import DropZone from "../components/DropZone.vue";
import OutputPicker from "../components/OutputPicker.vue";
import ResultPanel from "../components/ResultPanel.vue";
import TaskFlowLayout from "../components/TaskFlowLayout.vue";

const input = ref<string[]>([]);
const outputDir = ref("");
const busy = ref(false);
const result = ref<ConversionResult | null>(null);

async function run() {
  if (!input.value.length || !outputDir.value) return;
  busy.value = true;
  result.value = await window.devToolbox.removeVideoAudio({ inputPaths: [...input.value], outputDir: outputDir.value });
  busy.value = false;
}
</script>

<template>
  <TaskFlowLayout
    title="视频去音频"
    description="批量移除音轨，保留视频画面"
    source-title="源视频"
    source-description="可继续添加视频，任务将按队列顺序移除音轨"
    :file-count="input.length"
  >
    <template #source>
      <DropZone
        v-model="input"
        title="拖入视频文件"
        action-label="添加视频"
        compact
        append-selection
        :multiple="true"
        :filters="[{ name: '视频', extensions: ['mp4', 'webm', 'mov', 'mkv', 'avi'] }]"
      />
    </template>

    <template #result>
      <ResultPanel :result="result" :busy="busy" title="处理结果" empty-text="处理后可在此打开输出文件" compact />
    </template>

    <template #destination>
      <OutputPicker v-model="outputDir" />
    </template>

    <template #summary>
      <i class="ri-stack-line" aria-hidden="true"></i>
      <span>{{ input.length }} 个视频 · 移除全部音轨</span>
    </template>

    <template #actions>
      <button type="button" class="primary-button" :disabled="!input.length || !outputDir || busy" @click="run">
        <i class="ri-volume-mute-line" aria-hidden="true"></i>
        {{ input.length > 1 ? `批量处理（${input.length}）` : "去除音频" }}
      </button>
    </template>
  </TaskFlowLayout>
</template>
