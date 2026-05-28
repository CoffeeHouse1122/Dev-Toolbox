<script setup lang="ts">
import { computed, ref } from "vue";
import type { ConversionResult, WatermarkOutputFormat, WatermarkPosition } from "../../shared/types";
import DropZone from "../components/DropZone.vue";
import OptionGrid from "../components/OptionGrid.vue";
import OutputPicker from "../components/OutputPicker.vue";
import ResultPanel from "../components/ResultPanel.vue";
import SelectMenu from "../components/SelectMenu.vue";
import MotionRange from "../components/MotionRange.vue";

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
  <section class="tool-page watermark-page">
    <div class="tool-header">
      <div>
        <h2>添加水印</h2>
        <p>支持图片与 PDF，支持文字、图案、全屏铺满和角标水印</p>
      </div>
      <button type="button" class="primary-button" :disabled="!canRun" @click="run">
        <i class="ri-contrast-drop-2-line" aria-hidden="true"></i>
        添加水印 {{ input.length > 1 ? input.length : "" }}
      </button>
    </div>

    <div class="tool-layout watermark-layout">
      <section class="tool-main watermark-main">
        <DropZone
          v-model="input"
          title="源文件"
          :multiple="true"
          :filters="[{ name: '图片 / PDF', extensions: ['png', 'jpg', 'jpeg', 'webp', 'avif', 'tif', 'tiff', 'pdf'] }]"
        />
        <OutputPicker v-model="outputDir" />

        <OptionGrid>
          <label class="field span-2">
            <span>水印文案</span>
            <textarea v-model="text" class="tool-textarea compact" placeholder="可换行；留空时仅使用图案"></textarea>
          </label>

          <div class="field span-2">
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
            <MotionRange v-model="opacity" :min="1" :max="100" unit="%" aria-label="透明度" />
          </label>

          <label class="field">
            <span>旋转角度</span>
            <MotionRange v-model="rotation" :min="-90" :max="90" unit="°" aria-label="旋转角度" />
          </label>

          <label class="field">
            <span>字号 / 图案尺寸</span>
            <MotionRange v-model="scale" :min="12" :max="160" aria-label="字号 / 图案尺寸" />
          </label>

          <label class="field">
            <span>铺满间距</span>
            <MotionRange v-model="gap" :min="80" :max="720" :disabled="position !== 'tile'" aria-label="铺满间距" />
          </label>

          <label class="field">
            <span>边距</span>
            <input v-model.number="margin" type="number" min="0" max="512" :disabled="position === 'tile'" />
          </label>

          <label class="field">
            <span>图片质量</span>
            <MotionRange v-model="quality" :min="1" :max="100" aria-label="图片质量" />
          </label>

          <label class="check-row span-2">
            <input v-model="keepMetadata" type="checkbox" />
            <span>图片输出保留元数据</span>
          </label>
        </OptionGrid>
      </section>

      <ResultPanel :result="result" :busy="busy" />
    </div>
  </section>
</template>
