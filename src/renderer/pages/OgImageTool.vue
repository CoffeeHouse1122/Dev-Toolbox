<script setup lang="ts">
import { computed, ref } from "vue";
import type { ConversionResult } from "../../shared/types";
import OutputPicker from "../components/OutputPicker.vue";
import ResultPanel from "../components/ResultPanel.vue";
import TaskFlowLayout from "../components/TaskFlowLayout.vue";

const outputDir = ref("");
const fileName = ref("og-image");
const title = ref("Dev Toolbox");
const subtitle = ref("前端资源工具箱");
const siteName = ref("example.com");
const width = ref(1200);
const height = ref(630);
const backgroundColor = ref("#0d1117");
const accentColor = ref("#2f81f7");
const textColor = ref("#e6edf3");
const busy = ref(false);
const result = ref<ConversionResult | null>(null);
const canRun = computed(() => outputDir.value && fileName.value.trim() && title.value.trim() && !busy.value);
const previewStyle = computed<Record<string, string>>(() => ({
  aspectRatio: `${Math.max(1, Number(width.value) || 1200)} / ${Math.max(1, Number(height.value) || 630)}`,
  backgroundColor: backgroundColor.value,
  color: textColor.value,
  "--og-accent-color": accentColor.value
}));

async function run() {
  if (!canRun.value) return;
  busy.value = true;
  try {
    result.value = await window.devToolbox.generateOgImage({
      outputDir: outputDir.value,
      fileName: fileName.value,
      title: title.value,
      subtitle: subtitle.value,
      siteName: siteName.value,
      width: width.value,
      height: height.value,
      backgroundColor: backgroundColor.value,
      accentColor: accentColor.value,
      textColor: textColor.value
    });
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <TaskFlowLayout
    title="Open Graph 图片生成器"
    description="生成适合社交分享的 Open Graph 封面图"
    source-title="分享内容"
    source-description="先编辑标题与副标题，右侧画布会实时反映内容和配色"
    settings-title="画布设置"
    settings-description="设置文件信息、尺寸和视觉配色"
    preview-title="封面预览"
    preview-description="使用当前字段实时绘制，不加载任何外部资源"
    :file-label="`${width} × ${height}`"
    variant="preview-dominant"
  >
    <template #source>
      <div class="option-grid og-source-grid">
        <label class="field">
          <span>标题</span>
          <input v-model="title" />
        </label>
        <label class="field">
          <span>副标题</span>
          <input v-model="subtitle" />
        </label>
      </div>
    </template>

    <template #settings>
      <div class="option-grid">
        <label class="field">
          <span>文件名</span>
          <input v-model="fileName" />
        </label>
        <label class="field">
          <span>站点名</span>
          <input v-model="siteName" />
        </label>
        <label class="field">
          <span>宽度</span>
          <input v-model.number="width" type="number" min="320" max="2400" />
        </label>
        <label class="field">
          <span>高度</span>
          <input v-model.number="height" type="number" min="240" max="1600" />
        </label>
        <label class="field">
          <span>背景色</span>
          <input v-model="backgroundColor" />
        </label>
        <label class="field">
          <span>强调色</span>
          <input v-model="accentColor" />
        </label>
        <label class="field span-2">
          <span>文字色</span>
          <input v-model="textColor" />
        </label>
      </div>
    </template>

    <template #preview>
      <div class="og-preview-stage">
        <article class="og-preview-card" :style="previewStyle">
          <div class="og-preview-accent"></div>
          <span class="og-preview-site">{{ siteName || "example.com" }}</span>
          <div class="og-preview-copy">
            <h3>{{ title || "未命名分享页面" }}</h3>
            <p>{{ subtitle || "添加一句简洁的内容说明" }}</p>
          </div>
          <small>{{ width }} × {{ height }}</small>
        </article>
      </div>
    </template>

    <template #result>
      <ResultPanel :result="result" :busy="busy" title="生成结果" empty-text="生成后可在此打开 OG 图片" compact />
    </template>

    <template #destination>
      <OutputPicker v-model="outputDir" />
    </template>

    <template #summary>
      <i class="ri-image-line" aria-hidden="true"></i>
      <span>{{ fileName || "og-image" }}.png · {{ width }} × {{ height }}</span>
    </template>

    <template #actions>
      <button type="button" class="primary-button" :disabled="!canRun" @click="run">
        <i class="ri-image-add-line" aria-hidden="true"></i>
        {{ busy ? "生成中…" : "生成 OG 图片" }}
      </button>
    </template>
  </TaskFlowLayout>
</template>

<style scoped>
.og-source-grid {
  align-items: end;
}

.og-preview-stage {
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  min-height: 180px;
  padding: 8px;
  overflow: hidden;
  border: 1px dashed var(--border);
  border-radius: 8px;
  background: var(--surface-subtle);
}

.og-preview-card {
  --og-accent-color: var(--accent);
  position: relative;
  display: grid;
  grid-template-rows: auto 1fr auto;
  width: min(100%, 560px);
  max-height: 100%;
  padding: clamp(18px, 4%, 34px);
  overflow: hidden;
  border: 1px solid color-mix(in srgb, currentColor 20%, transparent);
  border-radius: 10px;
  box-shadow: 0 18px 42px rgb(0 0 0 / 24%);
}

.og-preview-accent {
  position: absolute;
  top: 0;
  left: 0;
  width: 34%;
  height: 5px;
  background: var(--og-accent-color);
}

.og-preview-site,
.og-preview-card small {
  position: relative;
  z-index: 1;
  font-size: 11px;
  font-weight: 800;
  letter-spacing: 0.08em;
  opacity: 0.76;
}

.og-preview-copy {
  position: relative;
  z-index: 1;
  align-self: center;
  max-width: 86%;
}

.og-preview-copy h3 {
  margin: 0;
  color: inherit;
  font-size: clamp(20px, 3.2vw, 40px);
  line-height: 1.08;
}

.og-preview-copy p {
  margin: 10px 0 0;
  color: inherit;
  font-size: clamp(11px, 1.4vw, 16px);
  line-height: 1.5;
  opacity: 0.72;
}

.og-preview-card::after {
  position: absolute;
  right: -12%;
  bottom: -35%;
  width: 48%;
  aspect-ratio: 1;
  border-radius: 50%;
  background: color-mix(in srgb, var(--og-accent-color) 28%, transparent);
  content: "";
}
</style>
