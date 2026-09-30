<script setup lang="ts">
import { computed, ref } from "vue";
import type { ConversionResult, ImageOutputFormat } from "../../shared/types";
import DropZone from "../components/DropZone.vue";
import OutputPicker from "../components/OutputPicker.vue";
import OptionGrid from "../components/OptionGrid.vue";
import ResultPanel from "../components/ResultPanel.vue";
import SelectMenu from "../components/SelectMenu.vue";
import Slider from "../components/Slider.vue";
import Checkbox from "../components/Checkbox.vue";
import TaskFlowLayout from "../components/TaskFlowLayout.vue";

const input = ref<string[]>([]);
const outputDir = ref("");
const outputFormat = ref<ImageOutputFormat>("webp");
const quality = ref(82);
const lossless = ref(false);
const keepMetadata = ref(false);
const maxWidth = ref<number | null>(null);
const maxHeight = ref<number | null>(null);
const busy = ref(false);
const result = ref<ConversionResult | null>(null);
const formatOptions = [
  { label: "WebP", value: "webp", icon: "ri-image-line" },
  { label: "PNG", value: "png", icon: "ri-image-2-line" },
  { label: "JPEG", value: "jpeg", icon: "ri-image-circle-line" },
  { label: "AVIF", value: "avif", icon: "ri-gallery-line" }
];

const canRun = computed(() => input.value.length > 0 && outputDir.value && !busy.value);

async function run() {
  if (!canRun.value) return;
  busy.value = true;
  try {
    result.value = await window.devToolbox.convertWebp({
      inputPaths: [...input.value],
      outputDir: outputDir.value,
      outputFormat: outputFormat.value,
      quality: quality.value,
      lossless: lossless.value,
      keepMetadata: keepMetadata.value,
      maxWidth: maxWidth.value || undefined,
      maxHeight: maxHeight.value || undefined
    });
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <TaskFlowLayout
    tool-id="webp"
    description="支持 WebP、PNG、JPEG、AVIF，支持单个或批量"
    source-title="源图片"
    source-description="添加待转换图片，任务将按队列顺序处理"
    settings-title="转换设置"
    settings-description="所有源图片共用以下格式与尺寸规则"
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
        :filters="[{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'avif', 'tiff'] }]"
      />
    </template>

    <template #settings>
      <OptionGrid>
        <div class="field">
          <span>目标格式</span>
          <SelectMenu v-model="outputFormat" :options="formatOptions" />
        </div>
        <label class="field">
          <span>质量</span>
          <Slider v-model="quality" :min="1" :max="100" aria-label="质量" />
        </label>
        <label class="field">
          <span>最大宽度</span>
          <input v-model.number="maxWidth" type="number" min="1" placeholder="保持原始" />
        </label>
        <label class="field">
          <span>最大高度</span>
          <input v-model.number="maxHeight" type="number" min="1" placeholder="保持原始" />
        </label>
        <Checkbox v-model="lossless" class="check-row" label="无损压缩" />
        <Checkbox v-model="keepMetadata" class="check-row" label="保留元数据" />
      </OptionGrid>
    </template>

    <template #result>
      <ResultPanel :result="result" :busy="busy" compact />
    </template>

    <template #destination>
      <OutputPicker v-model="outputDir" />
    </template>

    <template #summary>
      <i class="ri-stack-line" aria-hidden="true"></i>
      <span>{{ input.length }} 张 · {{ outputFormat.toUpperCase() }} · 质量 {{ quality }}</span>
    </template>

    <template #actions>
      <button type="button" class="primary-button" :disabled="!canRun" @click="run">
        <i class="ri-play-fill" aria-hidden="true"></i>
        转换 {{ input.length > 1 ? input.length : "" }}
      </button>
    </template>
  </TaskFlowLayout>
</template>
