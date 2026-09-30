<script setup lang="ts">
import { computed, ref } from "vue";
import type { ConversionResult, WatermarkOutputFormat, WatermarkPosition } from "../../shared/types";
import DropZone from "../components/DropZone.vue";
import OptionGrid from "../components/OptionGrid.vue";
import OutputPicker from "../components/OutputPicker.vue";
import ResultPanel from "../components/ResultPanel.vue";
import SelectMenu from "../components/SelectMenu.vue";
import Slider from "../components/Slider.vue";
import Checkbox from "../components/Checkbox.vue";
import TaskFlowLayout from "../components/TaskFlowLayout.vue";

const input = ref<string[]>([]);
const pattern = ref<string[]>([]);
const outputDir = ref("");
const text = ref("内部资料");
const position = ref<WatermarkPosition>("tile");
const outputFormat = ref<WatermarkOutputFormat>("same");
const opacity = ref(18);
const rotation = ref(-28);
const scale = ref(34);
const gap = ref(220);
const margin = ref(28);
const quality = ref(88);
const keepMetadata = ref(false);
const busy = ref(false);
const result = ref<ConversionResult | null>(null);

const patternPath = computed(() => pattern.value[0] ?? "");
const canRun = computed(() => Boolean(input.value.length && outputDir.value && (text.value.trim() || patternPath.value) && !busy.value));

const positionOptions = [
  { label: "全屏铺满", value: "tile", icon: "ri-layout-grid-2-line" },
  { label: "右下角", value: "bottom-right", icon: "ri-corner-down-right-line" },
  { label: "居中", value: "center", icon: "ri-crosshair-2-line" },
  { label: "左上角", value: "top-left", icon: "ri-corner-left-up-line" },
  { label: "右上角", value: "top-right", icon: "ri-corner-right-up-line" },
  { label: "左下角", value: "bottom-left", icon: "ri-corner-left-down-line" }
];

const formatOptions = [
  { label: "保持源格式", value: "same", icon: "ri-file-copy-2-line" },
  { label: "PNG", value: "png", icon: "ri-image-2-line" },
  { label: "JPEG", value: "jpeg", icon: "ri-image-circle-line" },
  { label: "WebP", value: "webp", icon: "ri-image-line" },
  { label: "AVIF", value: "avif", icon: "ri-gallery-line" }
];

async function run() {
  if (!canRun.value) return;
  busy.value = true;
  try {
    result.value = await window.devToolbox.applyWatermark({
      inputPaths: [...input.value],
      outputDir: outputDir.value,
      text: text.value,
      patternPath: patternPath.value || undefined,
      position: position.value,
      outputFormat: outputFormat.value,
      opacity: opacity.value,
      rotation: rotation.value,
      scale: scale.value,
      gap: gap.value,
      margin: margin.value,
      quality: quality.value,
      keepMetadata: keepMetadata.value
    });
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <TaskFlowLayout
    class="watermark-page"
    title="添加水印"
    description="支持图片与 PDF，支持文字、图案、全屏铺满和角标水印"
    source-title="源文件"
    source-description="图片与 PDF 可混合添加，按队列处理"
    settings-title="水印设置"
    settings-description="所有源文件共用以下水印与输出规则"
    preview-title="输出计划"
    preview-description=""
    :file-count="input.length"
  >
    <template #source>
      <DropZone
        v-model="input"
        title="拖入图片或 PDF"
        action-label="添加文件"
        compact
        append-selection
        :multiple="true"
        :filters="[{ name: '图片 / PDF', extensions: ['png', 'jpg', 'jpeg', 'webp', 'avif', 'tif', 'tiff', 'pdf'] }]"
      />
    </template>

    <template #settings>
      <div class="watermark-content-grid">
        <label class="field">
          <span>水印文案</span>
          <textarea v-model="text" class="tool-textarea compact watermark-text" rows="2" placeholder="可换行；留空时仅使用图案"></textarea>
        </label>

        <div class="field">
          <span>水印图案</span>
          <div class="watermark-pattern-row">
            <DropZone
              v-model="pattern"
              title="选择图案"
              preview="image"
              :multiple="false"
              :filters="[{ name: '图片', extensions: ['png', 'jpg', 'jpeg', 'webp', 'avif', 'tif', 'tiff'] }]"
            />
            <button type="button" class="icon-button" title="移除图案" :disabled="!pattern.length" @click="pattern = []">
              <i class="ri-delete-bin-line" aria-hidden="true"></i>
            </button>
          </div>
        </div>
      </div>
      <OptionGrid class="watermark-options">
        <div class="field">
          <span>位置与方式</span>
          <SelectMenu v-model="position" :options="positionOptions" />
        </div>
        <div class="field">
          <span>图片输出格式</span>
          <SelectMenu v-model="outputFormat" :options="formatOptions" />
        </div>
        <label class="field">
          <span>透明度</span>
          <Slider v-model="opacity" :min="1" :max="100" unit="%" aria-label="透明度" />
        </label>
        <label class="field">
          <span>旋转角度</span>
          <Slider v-model="rotation" :min="-90" :max="90" unit="°" aria-label="旋转角度" />
        </label>
        <label class="field">
          <span>字号 / 图案尺寸</span>
          <Slider v-model="scale" :min="12" :max="160" aria-label="字号 / 图案尺寸" />
        </label>
        <label class="field">
          <span>铺满间距</span>
          <Slider v-model="gap" :min="80" :max="720" :disabled="position !== 'tile'" aria-label="铺满间距" />
        </label>
        <label class="field">
          <span>边距</span>
          <input v-model.number="margin" type="number" min="0" max="512" :disabled="position === 'tile'" />
        </label>
        <label class="field">
          <span>图片质量</span>
          <Slider v-model="quality" :min="1" :max="100" aria-label="图片质量" />
        </label>
        <Checkbox v-model="keepMetadata" class="check-row watermark-metadata" label="图片输出保留元数据" />
      </OptionGrid>
    </template>

    <template #preview>
      <div class="watermark-plan">
        <div class="watermark-plan-mark">
          <div class="watermark-plan-sample" :style="{ opacity: opacity / 100, transform: `rotate(${rotation}deg)` }">
            <i v-if="patternPath" class="ri-image-line" aria-hidden="true"></i>
            <span>{{ text.trim() || (patternPath ? "图案水印" : "尚未设置水印") }}</span>
          </div>
        </div>
        <dl>
          <div><dt>处理范围</dt><dd>{{ input.length || 0 }} 个文件</dd></div>
          <div><dt>位置</dt><dd>{{ positionOptions.find((item) => item.value === position)?.label }}</dd></div>
          <div><dt>输出</dt><dd>{{ formatOptions.find((item) => item.value === outputFormat)?.label }}</dd></div>
          <div><dt>内容</dt><dd>{{ patternPath ? (text.trim() ? "文字 + 图案" : "图案") : text.trim() ? "文字" : "未设置" }}</dd></div>
        </dl>
      </div>
    </template>

    <template #result>
      <ResultPanel :result="result" :busy="busy" title="水印结果" empty-text="处理后可在此打开输出文件" compact />
    </template>

    <template #destination>
      <OutputPicker v-model="outputDir" />
    </template>
    <template #summary>
      <i class="ri-contrast-drop-2-line" aria-hidden="true"></i>
      <span>{{ input.length ? `${input.length} 个文件 · ${opacity}% 透明度` : "添加文件后可开始" }}</span>
    </template>
    <template #actions>
      <button type="button" class="primary-button" :disabled="!canRun" @click="run">
        <i class="ri-contrast-drop-2-line" aria-hidden="true"></i>
        {{ busy ? "处理中…" : "添加水印" }}
      </button>
    </template>
  </TaskFlowLayout>
</template>

<style scoped>
.watermark-content-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.watermark-text {
  min-height: 64px;
  height: 64px;
  max-height: 64px;
  resize: none;
}

.watermark-pattern-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 34px;
  align-items: center;
  gap: 6px;
  min-width: 0;
}

.watermark-pattern-row :deep(.drop-zone) {
  display: grid;
  grid-template-columns: 32px minmax(0, 1fr);
  grid-template-rows: auto auto;
  gap: 2px 8px;
  min-height: 64px;
  height: 64px;
  padding: 8px;
  text-align: left;
}

.watermark-pattern-row :deep(.drop-icon),
.watermark-pattern-row :deep(.drop-preview) {
  grid-column: 1;
  grid-row: 1 / 3;
  align-self: center;
  width: 32px;
  height: 32px;
  min-height: 0;
  margin: 0;
  font-size: 16px;
}

.watermark-pattern-row :deep(.drop-preview-media) { width: 100%; height: 100%; object-fit: contain; }
/* The single selected pattern is already named above and has its own remove action. */
.watermark-pattern-row :deep(.drop-file-list) { display: none; }
.watermark-pattern-row :deep(.drop-title),
.watermark-pattern-row :deep(.drop-files) {
  grid-column: 2;
  width: 100%;
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.watermark-options { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 8px 12px; }
.watermark-content-grid > *, .watermark-options > * { min-width: 0; }
.watermark-metadata { align-self: end; min-height: 36px; }
.watermark-options :deep(.slider-control) { min-width: 0; }
.watermark-options :deep(.select-menu) { min-width: 0; }
.watermark-page :deep(.task-flow-settings-content) { gap: 10px; }
.watermark-page :deep(.task-flow-preview-panel .panel-heading p:empty) { display: none; }
.watermark-page :deep(.task-flow-preview-content) { align-content: stretch; }

@media (min-width: 1121px) and (min-height: 721px) {
  .watermark-page :deep(.task-flow-source-panel) {
    display: grid;
    grid-template-columns: minmax(0, 0.85fr) minmax(0, 1.4fr);
    align-items: center;
    gap: 18px;
  }
  .watermark-page :deep(.task-flow-source-panel > .panel-heading) { margin-bottom: 0; }
  .watermark-page :deep(.task-flow-workbench) { grid-template-columns: minmax(0, 1.5fr) minmax(0, 1fr); }
  .watermark-page :deep(.task-flow-layout.has-preview .task-flow-output-column) { grid-template-rows: minmax(0, 1fr) minmax(148px, 0.58fr); }
  .watermark-page .watermark-plan { gap: 6px; }
  .watermark-page .watermark-plan dl { gap: 6px; }
  .watermark-options :deep(.select-popover) {
    grid-template-columns: repeat(2, minmax(0, 1fr));
    width: calc(200% + 12px);
  }
}

@media (max-width: 720px) {
  .watermark-content-grid { grid-template-columns: 1fr; }
  .watermark-options { grid-template-columns: repeat(2, minmax(0, 1fr)); }
}

.watermark-plan {
  display: grid;
  grid-template-rows: minmax(80px, 1fr) auto;
  gap: 10px;
  min-height: 0;
  height: 100%;
}

.watermark-plan-mark {
  display: grid;
  place-items: center;
  min-width: 0;
  padding: 12px;
  overflow: hidden;
  border: 1px dashed var(--border-strong);
  border-radius: 7px;
  background: var(--surface-subtle);
}

.watermark-plan-sample {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 8px;
  max-width: 88%;
  color: var(--text);
  font-size: clamp(16px, 2vw, 28px);
  font-weight: 800;
  text-align: center;
  white-space: pre-wrap;
}

.watermark-plan dl {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
  margin: 0;
}

.watermark-plan dl div {
  display: grid;
  grid-template-columns: auto minmax(0, 1fr);
  align-items: center;
  gap: 3px;
  min-width: 0;
  padding: 6px 8px;
  border-radius: 6px;
  background: var(--surface-subtle);
}

.watermark-plan dt {
  color: var(--muted);
  font-size: 11px;
}

.watermark-plan dd {
  margin: 0;
  overflow: hidden;
  color: var(--text);
  font-size: 12px;
  font-weight: 700;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: right;
}
</style>
