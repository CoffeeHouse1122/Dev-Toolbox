<script setup lang="ts">
import { computed, ref } from "vue";
import type { ConversionResult } from "../../shared/types";
import OutputPicker from "../components/OutputPicker.vue";
import ResultPanel from "../components/ResultPanel.vue";
import SelectMenu from "../components/SelectMenu.vue";
import TaskFlowLayout from "../components/TaskFlowLayout.vue";

const text = ref("https://github.com/");
const outputDir = ref("");
const fileName = ref("qrcode");
const format = ref<"png" | "svg">("png");
const size = ref(512);
const margin = ref(2);
const darkColor = ref("#1f2328");
const lightColor = ref("#ffffff");
const busy = ref(false);
const result = ref<ConversionResult | null>(null);
const formatOptions = [
  { label: "PNG", value: "png", icon: "ri-image-line" },
  { label: "SVG", value: "svg", icon: "ri-code-box-line" }
];

const colorError = computed(() => {
  const valid = (value: string) => /^#(?:[\da-f]{3,4}|[\da-f]{6}|[\da-f]{8})$/i.test(value.trim());
  const normalize = (value: string) => {
    const hex = value.trim().slice(1).toLowerCase();
    const expanded = hex.length <= 4 ? [...hex].map((char) => char + char).join("") : hex;
    return expanded.length === 6 ? `${expanded}ff` : expanded;
  };
  if (!valid(darkColor.value)) return "前景色必须是 #RGB、#RGBA、#RRGGBB 或 #RRGGBBAA";
  if (!valid(lightColor.value)) return "背景色必须是 #RGB、#RGBA、#RRGGBB 或 #RRGGBBAA";
  if (normalize(darkColor.value) === normalize(lightColor.value)) return "前景色与背景色不能相同";
  return "";
});
const canRun = computed(() => Boolean(text.value.trim() && outputDir.value && fileName.value.trim() && !colorError.value && !busy.value));
const previewPath = computed(() => result.value?.files[0] ?? "");
const previewUrl = computed(() => (previewPath.value ? `devtoolbox-file://preview/${encodeURIComponent(previewPath.value)}` : ""));

async function run() {
  if (!canRun.value) return;
  size.value = Math.min(2048, Math.max(128, Math.round(Number(size.value) || 512)));
  margin.value = Math.min(12, Math.max(0, Math.round(Number(margin.value) || 0)));
  busy.value = true;
  try {
    result.value = await window.devToolbox.generateQrCode({
      text: text.value,
      outputDir: outputDir.value,
      fileName: fileName.value,
      format: format.value,
      size: size.value,
      margin: margin.value,
      darkColor: darkColor.value,
      lightColor: lightColor.value
    });
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <TaskFlowLayout
    title="二维码生成"
    description="把链接、文本或配置片段生成 PNG / SVG 二维码"
    source-title="编码内容"
    source-description="输入需要写入二维码的链接、文本或配置片段"
    settings-title="二维码设置"
    settings-description="设置文件格式、画布尺寸、边距与颜色"
    preview-title="二维码预览"
    preview-description="生成后在此检查实际输出图片"
    :file-label="`${text.trim().length} 字符`"
    variant="preview-dominant"
  >
    <template #source>
      <label class="field">
        <span>内容</span>
        <textarea v-model="text" class="tool-textarea compact qr-source-textarea" placeholder="输入需要编码的文本"></textarea>
      </label>
    </template>

    <template #settings>
      <div class="option-grid">
          <label class="field">
            <span>文件名</span>
            <input v-model="fileName" />
          </label>
          <div class="field">
            <span>格式</span>
            <SelectMenu v-model="format" :options="formatOptions" />
          </div>
          <label class="field">
            <span>尺寸</span>
            <input v-model.number="size" type="number" min="128" max="2048" />
          </label>
          <label class="field">
            <span>边距</span>
            <input v-model.number="margin" type="number" min="0" max="12" />
          </label>
          <label class="field">
            <span>前景色</span>
            <input v-model="darkColor" type="text" :aria-invalid="Boolean(colorError)" />
          </label>
          <label class="field">
            <span>背景色</span>
            <input v-model="lightColor" type="text" :aria-invalid="Boolean(colorError)" />
          </label>
      </div>
      <p v-if="colorError" class="error-banner">{{ colorError }}</p>
    </template>

    <template #preview>
      <div class="qr-preview-stage">
        <img v-if="previewUrl" :src="previewUrl" alt="二维码预览" />
        <div v-else class="qr-preview-empty">
          <i class="ri-qr-code-line" aria-hidden="true"></i>
          <span>生成二维码后显示实际文件</span>
        </div>
      </div>
    </template>

    <template #result>
      <ResultPanel :result="result" :busy="busy" title="生成结果" empty-text="生成后可在此打开二维码文件" compact />
    </template>

    <template #destination>
      <OutputPicker v-model="outputDir" />
    </template>

    <template #summary>
      <i class="ri-qr-code-line" aria-hidden="true"></i>
      <span>{{ format.toUpperCase() }} · {{ size }} px · {{ text.trim().length }} 字符</span>
    </template>

    <template #actions>
      <button type="button" class="primary-button" :disabled="!canRun" @click="run">
        <i class="ri-qr-code-line" aria-hidden="true"></i>
        {{ busy ? "生成中…" : "生成二维码" }}
      </button>
    </template>
  </TaskFlowLayout>
</template>

<style scoped>
.qr-source-textarea {
  min-height: 72px;
  max-height: 112px;
  resize: vertical;
}

.qr-preview-stage,
.qr-preview-empty {
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  min-height: 170px;
}

.qr-preview-stage {
  overflow: hidden;
  border: 1px dashed var(--border);
  border-radius: 8px;
  background:
    linear-gradient(45deg, color-mix(in srgb, var(--border) 25%, transparent) 25%, transparent 25%) 0 0 / 16px 16px,
    linear-gradient(-45deg, color-mix(in srgb, var(--border) 25%, transparent) 25%, transparent 25%) 0 0 / 16px 16px,
    var(--surface-subtle);
}

.qr-preview-stage img {
  display: block;
  width: min(72%, 260px);
  max-height: calc(100% - 20px);
  object-fit: contain;
  border-radius: 6px;
  box-shadow: 0 10px 26px rgb(0 0 0 / 18%);
}

.qr-preview-empty {
  gap: 8px;
  align-content: center;
  color: var(--muted);
  font-size: 12px;
}

.qr-preview-empty i {
  font-size: 34px;
  opacity: 0.72;
}
</style>
