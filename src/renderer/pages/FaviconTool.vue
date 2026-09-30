<script setup lang="ts">
import { computed, ref } from "vue";
import type { ConversionResult } from "../../shared/types";
import DropZone from "../components/DropZone.vue";
import OutputPicker from "../components/OutputPicker.vue";
import OptionGrid from "../components/OptionGrid.vue";
import ResultPanel from "../components/ResultPanel.vue";
import Checkbox from "../components/Checkbox.vue";
import TaskFlowLayout from "../components/TaskFlowLayout.vue";
import { batchChildOutputDir, runConversionBatch } from "../utils/batchConversion";

const input = ref<string[]>([]);
const outputDir = ref("");
const includePng = ref(true);
const includeManifest = ref(true);
const sizes = ref([256]);
const busy = ref(false);
const result = ref<ConversionResult | null>(null);

const canRun = computed(() => input.value.length > 0 && outputDir.value && sizes.value.length > 0 && !busy.value);
const availableSizes = [16, 32, 48, 64, 128, 180, 192, 256, 512];

function toggleSize(size: number) {
  sizes.value = sizes.value.includes(size) ? sizes.value.filter((item) => item !== size) : [...sizes.value, size];
}

async function run() {
  if (!canRun.value) return;
  busy.value = true;
  try {
    const inputPaths = [...input.value];
    const destination = outputDir.value;
    const selectedSizes = [...sizes.value];
    const withPng = includePng.value;
    const withManifest = includeManifest.value;
    result.value = await runConversionBatch(inputPaths, destination, (inputPath, index) =>
      window.devToolbox.convertFavicon({
        inputPath,
        outputDir: batchChildOutputDir(destination, inputPath, index, inputPaths.length),
        sizes: selectedSizes,
        includePng: withPng,
        includeManifest: withManifest
      })
    );
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <TaskFlowLayout
    tool-id="favicon"
    description="生成 ICO、PNG 图标和 manifest"
    source-title="源图片"
    source-description="添加一个或多个图标源图，分别生成完整资源包"
    settings-title="图标包设置"
    settings-description="选择需要生成的尺寸与附加资源"
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
        :filters="[{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'svg'] }]"
      />
    </template>

    <template #settings>
      <OptionGrid>
        <label class="field span-2">
          <span>尺寸</span>
          <div class="size-grid">
            <button
              v-for="size in availableSizes"
              :key="size"
              type="button"
              class="toggle-chip"
              :class="{ selected: sizes.includes(size) }"
              @click="toggleSize(size)"
            >
              {{ size }}
            </button>
          </div>
        </label>
        <Checkbox v-model="includePng" class="check-row" label="生成 PNG 文件" />
        <Checkbox v-model="includeManifest" class="check-row" label="生成 Manifest" />
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
      <span>{{ input.length }} 张 · {{ sizes.length }} 个尺寸</span>
    </template>

    <template #actions>
      <button type="button" class="primary-button" :disabled="!canRun" @click="run">
        <i class="ri-play-fill" aria-hidden="true"></i>
        开始转换
      </button>
    </template>
  </TaskFlowLayout>
</template>
