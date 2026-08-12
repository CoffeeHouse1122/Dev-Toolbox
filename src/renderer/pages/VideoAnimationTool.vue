<script setup lang="ts">
import { computed, ref } from "vue";
import type { ConversionResult } from "../../shared/types";
import DropZone from "../components/DropZone.vue";
import OutputPicker from "../components/OutputPicker.vue";
import ResultPanel from "../components/ResultPanel.vue";
import SelectMenu from "../components/SelectMenu.vue";
import TaskFlowLayout from "../components/TaskFlowLayout.vue";
import { runConversionBatch } from "../utils/batchConversion";

const input = ref<string[]>([]);
const outputDir = ref("");
const outputFormat = ref<"gif" | "webp">("gif");
const width = ref(480);
const fps = ref(12);
const startSeconds = ref(0);
const durationSeconds = ref(5);
const busy = ref(false);
const result = ref<ConversionResult | null>(null);
const canRun = computed(() => input.value.length > 0 && Boolean(outputDir.value) && !busy.value);
const formatOptions = [
  { label: "GIF", value: "gif", icon: "ri-file-gif-line" },
  { label: "Animated WebP", value: "webp", icon: "ri-image-line" }
];

async function run() {
  if (!canRun.value) return;
  const inputPaths = [...input.value];
  const destination = outputDir.value;
  const options = {
    outputFormat: outputFormat.value,
    width: width.value || undefined,
    fps: fps.value,
    startSeconds: startSeconds.value,
    durationSeconds: durationSeconds.value
  };
  busy.value = true;
  try {
    result.value = await runConversionBatch(inputPaths, destination, (inputPath) =>
      window.devToolbox.convertVideoAnimation({
        inputPath,
        outputDir: destination,
        ...options
      })
    );
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <TaskFlowLayout
    title="视频转 GIF / Animated WebP"
    description="截取片段并生成动图资源"
    source-title="源视频"
    source-description="可继续添加视频，任务将按队列顺序批量转换"
    settings-title="动图设置"
    settings-description="队列中的视频共用以下截取与输出参数"
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

    <template #settings>
        <div class="option-grid">
          <div class="field span-2">
            <span>输出格式</span>
            <SelectMenu v-model="outputFormat" :options="formatOptions" />
          </div>
          <label class="field"><span>宽度</span><input v-model.number="width" type="number" min="64" /></label>
          <label class="field"><span>FPS</span><input v-model.number="fps" type="number" min="1" max="60" /></label>
          <label class="field"><span>开始秒</span><input v-model.number="startSeconds" type="number" min="0" /></label>
          <label class="field"><span>持续秒</span><input v-model.number="durationSeconds" type="number" min="0.1" step="0.1" /></label>
        </div>
    </template>

    <template #result>
      <ResultPanel :result="result" :busy="busy" title="转换结果" empty-text="转换后可在此打开输出文件" compact />
    </template>

    <template #destination>
      <OutputPicker v-model="outputDir" />
    </template>

    <template #summary>
      <i class="ri-stack-line" aria-hidden="true"></i>
      <span>{{ input.length }} 个视频 · {{ outputFormat.toUpperCase() }} · {{ fps }} FPS</span>
    </template>

    <template #actions>
      <button type="button" class="primary-button" :disabled="!canRun" @click="run">
        <i class="ri-play-fill" aria-hidden="true"></i>
        {{ input.length > 1 ? `批量转换（${input.length}）` : "开始转换" }}
      </button>
    </template>
  </TaskFlowLayout>
</template>
