<script setup lang="ts">
import { computed, ref } from "vue";
import type { ConversionResult, SvgOutputFormat } from "../../shared/types";
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
const outputFormat = ref<SvgOutputFormat>("svg");
const precision = ref(2);
const removeDimensions = ref(false);
const cleanupIds = ref(true);
const width = ref<number | null>(null);
const height = ref<number | null>(null);
const quality = ref(88);
const busy = ref(false);
const result = ref<ConversionResult | null>(null);

const formatOptions = [
  { label: "优化 SVG", value: "svg", icon: "ri-shapes-line" },
  { label: "转换 PNG", value: "png", icon: "ri-image-line" },
  { label: "转换 WebP", value: "webp", icon: "ri-image-edit-line" }
];

const previewPath = computed(() => result.value?.files.find((filePath) => /\.(?:svg|png|webp)$/i.test(filePath)) ?? "");
const previewUrl = computed(() => previewPath.value
  ? `devtoolbox-file://preview/${encodeURIComponent(previewPath.value)}`
  : "");
const isRaster = computed(() => outputFormat.value !== "svg");
const canRun = computed(() => input.value.length > 0 && Boolean(outputDir.value) && !busy.value);
const summary = computed(() => {
  const target = outputFormat.value.toUpperCase();
  if (!isRaster.value) return `${input.value.length} 个 SVG · 精度 ${precision.value}`;
  const size = width.value || height.value ? `${width.value || "auto"} × ${height.value || "auto"}` : "原始尺寸";
  return `${input.value.length} 个 SVG · ${target} · ${size}`;
});

async function run() {
  if (!canRun.value) return;
  busy.value = true;
  try {
    result.value = await window.devToolbox.processSvgFiles({
      inputPaths: [...input.value],
      outputDir: outputDir.value,
      outputFormat: outputFormat.value,
      precision: precision.value,
      removeDimensions: outputFormat.value === "svg" && removeDimensions.value,
      cleanupIds: cleanupIds.value,
      width: isRaster.value && width.value ? width.value : undefined,
      height: isRaster.value && height.value ? height.value : undefined,
      quality: outputFormat.value === "webp" ? quality.value : undefined
    });
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <TaskFlowLayout
    title="SVG 工具箱"
    description="批量清理 SVG，并按需导出 SVG、PNG 或 WebP"
    source-title="SVG 文件"
    source-description="添加一个或多个 SVG，任务会保持原文件不变"
    settings-title="优化与导出"
    settings-description="统一应用精度、尺寸与输出格式"
    preview-title="安全输出预览"
    preview-description="处理完成后预览第一项输出"
    variant="preview-dominant"
    :file-count="input.length"
  >
    <template #source>
      <DropZone
        v-model="input"
        title="拖入 SVG 文件"
        action-label="添加 SVG"
        compact
        append-selection
        :multiple="true"
        :filters="[{ name: 'SVG', extensions: ['svg'] }]"
      />
    </template>

    <template #settings>
      <OptionGrid>
        <div class="field span-2">
          <span>输出格式</span>
          <SelectMenu v-model="outputFormat" :options="formatOptions" />
        </div>
        <label class="field span-2">
          <span>数值精度：{{ precision }}</span>
          <Slider v-model="precision" :min="0" :max="6" aria-label="SVG 数值精度" />
        </label>
        <template v-if="isRaster">
          <label class="field">
            <span>目标宽度</span>
            <input v-model.number="width" type="number" min="1" max="8192" placeholder="保持原始" />
          </label>
          <label class="field">
            <span>目标高度</span>
            <input v-model.number="height" type="number" min="1" max="8192" placeholder="保持原始" />
          </label>
          <label v-if="outputFormat === 'webp'" class="field span-2">
            <span>WebP 质量：{{ quality }}</span>
            <Slider v-model="quality" :min="1" :max="100" aria-label="WebP 质量" />
          </label>
        </template>
        <Checkbox v-model="cleanupIds" class="check-row" label="清理无用 ID" />
        <Checkbox v-if="outputFormat === 'svg'" v-model="removeDimensions" class="check-row" label="移除固定宽高" />
      </OptionGrid>
    </template>

    <template #preview>
      <div class="svg-preview-stage">
        <img v-if="previewUrl" :src="previewUrl" alt="SVG 源文件预览" />
        <div v-else class="svg-preview-empty">
          <i class="ri-shapes-line" aria-hidden="true"></i>
          <strong>等待 SVG</strong>
          <span>完成安全检查与处理后在此显示图形</span>
        </div>
      </div>
    </template>

    <template #result>
      <ResultPanel :result="result" :busy="busy" title="处理结果" empty-text="处理后可在此打开输出文件" compact />
    </template>

    <template #destination>
      <OutputPicker v-model="outputDir" />
    </template>

    <template #summary>
      <i class="ri-shapes-line" aria-hidden="true"></i>
      <span>{{ summary }}</span>
    </template>

    <template #actions>
      <button type="button" class="primary-button" :disabled="!canRun" @click="run">
        <i class="ri-magic-line" aria-hidden="true"></i>
        {{ busy ? "处理中…" : "优化并导出" }}
      </button>
    </template>
  </TaskFlowLayout>
</template>

<style scoped>
.svg-preview-stage,
.svg-preview-empty {
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  min-height: 180px;
}

.svg-preview-stage {
  overflow: hidden;
  border: 1px dashed var(--border);
  border-radius: 8px;
  background:
    linear-gradient(45deg, color-mix(in srgb, var(--border) 28%, transparent) 25%, transparent 25%) 0 0 / 18px 18px,
    linear-gradient(-45deg, color-mix(in srgb, var(--border) 28%, transparent) 25%, transparent 25%) 0 0 / 18px 18px,
    var(--surface-subtle);
}

.svg-preview-stage > img {
  display: block;
  width: min(78%, 420px);
  height: min(78%, 320px);
  object-fit: contain;
  filter: drop-shadow(0 12px 24px rgb(0 0 0 / 18%));
}

.svg-preview-empty {
  gap: 7px;
  align-content: center;
  color: var(--muted);
  text-align: center;
}

.svg-preview-empty i {
  color: var(--accent-strong);
  font-size: 40px;
}

.svg-preview-empty strong {
  color: var(--text);
  font-size: 14px;
}

.svg-preview-empty span {
  font-size: 12px;
}
</style>
