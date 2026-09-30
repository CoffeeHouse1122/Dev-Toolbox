<script setup lang="ts">
import { computed, ref } from "vue";
import type { ConversionResult, SequenceAnimationOptions } from "../../shared/types";
import DropZone from "../components/DropZone.vue";
import OutputPicker from "../components/OutputPicker.vue";
import ResultPanel from "../components/ResultPanel.vue";
import SelectMenu from "../components/SelectMenu.vue";
import Checkbox from "../components/Checkbox.vue";
import TaskFlowLayout from "../components/TaskFlowLayout.vue";

const input = ref<string[]>([]);
const outputDir = ref("");
const outputFormat = ref<SequenceAnimationOptions["outputFormat"]>("gif");
const fps = ref(12);
const width = ref<number | null>(null);
const loop = ref(true);
const busy = ref(false);
const result = ref<ConversionResult | null>(null);

const formatOptions = [
  { label: "GIF", value: "gif", icon: "ri-file-gif-line" },
  { label: "APNG", value: "apng", icon: "ri-image-line" },
  { label: "Animated WebP", value: "webp", icon: "ri-gallery-line" }
];
const canRun = computed(() => input.value.length > 0 && outputDir.value && !busy.value);

function sortByName() {
  input.value = [...input.value].sort((a, b) => a.localeCompare(b, "zh-Hans-CN", { numeric: true }));
}

async function run() {
  if (!canRun.value) return;
  busy.value = true;
  try {
    result.value = await window.devToolbox.convertSequenceAnimation({
      inputPaths: [...input.value],
      outputDir: outputDir.value,
      outputFormat: outputFormat.value,
      fps: fps.value,
      width: width.value || undefined,
      loop: loop.value
    });
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <TaskFlowLayout
    tool-id="sequence-animation"
    description="把连续图片帧转换为 GIF、APNG 或 Animated WebP"
    source-title="序列帧图片"
    source-description="按队列顺序合成动图，可先按文件名进行自然排序"
    settings-title="动图设置"
    settings-description="所有序列帧共用以下合成参数"
    preview-title="帧序列"
    preview-description="执行前确认图片帧的合成顺序"
    :file-count="input.length"
  >
    <template #source-actions>
      <button type="button" class="secondary-button" :disabled="input.length < 2" @click="sortByName">
        <i class="ri-sort-asc" aria-hidden="true"></i>
        按文件名排序
      </button>
    </template>

    <template #source>
        <DropZone
          v-model="input"
          title="拖入序列帧图片"
          action-label="添加图片"
          compact
          append-selection
          :multiple="true"
          :filters="[{ name: '序列帧图片', extensions: ['png', 'jpg', 'jpeg', 'webp'] }]"
        />
    </template>

    <template #settings>
        <div class="option-grid">
          <div class="field">
            <span>输出格式</span>
            <SelectMenu v-model="outputFormat" :options="formatOptions" />
          </div>
          <label class="field">
            <span>FPS</span>
            <input v-model.number="fps" type="number" min="1" max="60" />
          </label>
          <label class="field">
            <span>输出宽度</span>
            <input v-model.number="width" type="number" min="1" placeholder="保持原始宽度" />
          </label>
          <Checkbox v-model="loop" class="check-row" label="循环播放" />
        </div>
    </template>

    <template #preview>
      <div v-if="input.length" class="sequence-list">
        <div v-for="(frame, index) in input.slice(0, 8)" :key="frame" class="sequence-row">
          <span>{{ String(index + 1).padStart(2, "0") }}</span>
          <strong>{{ frame.split(/[\\/]/).pop() }}</strong>
        </div>
        <p v-if="input.length > 8" class="empty-state">还有 {{ input.length - 8 }} 帧未显示</p>
      </div>
      <p v-else class="empty-state">选择序列帧后显示合成顺序。</p>
    </template>

    <template #result>
      <ResultPanel :result="result" :busy="busy" title="生成结果" empty-text="生成后可在此打开动图文件" compact />
    </template>

    <template #destination>
      <OutputPicker v-model="outputDir" />
    </template>

    <template #summary>
      <i class="ri-stack-line" aria-hidden="true"></i>
      <span>{{ input.length }} 帧 · {{ outputFormat.toUpperCase() }} · {{ fps }} FPS</span>
    </template>

    <template #actions>
      <button type="button" class="primary-button" :disabled="!canRun" @click="run">
        <i class="ri-play-fill" aria-hidden="true"></i>
        生成动图
      </button>
    </template>
  </TaskFlowLayout>
</template>
