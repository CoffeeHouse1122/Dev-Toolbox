<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { ConversionResult, FontSubsetOptions } from "../../shared/types";
import DropZone from "../components/DropZone.vue";
import OutputPicker from "../components/OutputPicker.vue";
import ResultPanel from "../components/ResultPanel.vue";
import SelectMenu from "../components/SelectMenu.vue";
import Checkbox from "../components/Checkbox.vue";
import { batchChildOutputDir, runConversionBatch } from "../utils/batchConversion";

const input = ref<string[]>([]);
const outputDir = ref("");
const text = ref("开发者工具箱 Dev Toolbox 0123456789");
const outputFormat = ref<FontSubsetOptions["outputFormat"]>("woff2");
const fontFamily = ref("DevToolboxSubset");
const generateCss = ref(true);
const busy = ref(false);
const result = ref<ConversionResult | null>(null);
const activePreviewPath = ref("");

const formatOptions = [
  { label: "WOFF2", value: "woff2", icon: "ri-font-size-2" },
  { label: "TTF", value: "ttf", icon: "ri-font-mono" }
];
const charCount = computed(() => new Set([...text.value].filter((item) => item.trim())).size);
const canRun = computed(() => input.value.length > 0 && outputDir.value && text.value.trim() && !busy.value);
const previewFontOptions = computed(() =>
  input.value.map((path) => ({
    label: path.split(/[\\/]/).pop() || path,
    value: path,
    icon: "ri-font-size-2"
  }))
);
const previewFontStyle = computed(() =>
  activePreviewPath.value
    ? `@font-face { font-family: "FontSubsetSourcePreview"; src: url("devtoolbox-file://preview/${encodeURIComponent(activePreviewPath.value)}"); font-display: swap; }`
    : ""
);
const outputSummary = computed(() => {
  if (!input.value.length) return "选择字体后可生成";
  return `${input.value.length} 个字体 · ${outputFormat.value.toUpperCase()}${generateCss.value ? " + CSS" : ""}`;
});
const previewSizes = [14, 18, 26, 38];

watch(
  input,
  (paths) => {
    if (!paths.includes(activePreviewPath.value)) activePreviewPath.value = paths[0] || "";
  },
  { immediate: true }
);

async function run() {
  if (!canRun.value) return;
  busy.value = true;
  try {
    const inputPaths = [...input.value];
    const destination = outputDir.value;
    const subsetText = text.value;
    const format = outputFormat.value;
    const family = fontFamily.value;
    const withCss = generateCss.value;
    result.value = await runConversionBatch(inputPaths, destination, (inputPath, index) =>
      window.devToolbox.subsetFont({
        inputPath,
        outputDir: batchChildOutputDir(destination, inputPath, index, inputPaths.length),
        text: subsetText,
        outputFormat: format,
        fontFamily: family,
        generateCss: withCss
      })
    );
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <section class="tool-page font-subset-page">
    <component :is="'style'">{{ previewFontStyle }}</component>
    <div class="tool-header">
      <div>
        <h2>字体子集化</h2>
        <p>按字符裁剪中文 Web 字体，减少线上字体包体积</p>
      </div>
    </div>

    <section class="subset-panel subset-source-panel">
      <div class="panel-heading">
        <div>
          <h3>源字体</h3>
          <p>可拖入多个字体，任务将按队列顺序处理</p>
        </div>
        <span class="status-pill">{{ input.length }} 个文件</span>
      </div>
      <DropZone
        v-model="input"
        title="拖入字体文件"
        action-label="添加字体"
        compact
        append-selection
        :multiple="true"
        :filters="[{ name: '字体', extensions: ['ttf', 'otf', 'woff', 'woff2'] }]"
      />
    </section>

    <div class="subset-workbench">
      <section class="subset-panel subset-settings-panel">
        <div class="panel-heading">
          <div>
            <h3>子集设置</h3>
            <p>所有源字体共用以下输出规则</p>
          </div>
        </div>
        <label class="field">
          <span>保留字符（{{ charCount }} 个唯一字符）</span>
          <textarea v-model="text" class="tool-textarea compact"></textarea>
        </label>
        <div class="option-grid">
          <div class="field">
            <span>输出格式</span>
            <SelectMenu v-model="outputFormat" :options="formatOptions" />
          </div>
          <label class="field">
            <span>字体族名</span>
            <input v-model="fontFamily" />
          </label>
          <Checkbox v-model="generateCss" class="check-row span-2" label="同时生成 @font-face CSS" />
        </div>
      </section>

      <div class="subset-output-column">
        <section class="subset-panel subset-preview-panel">
          <div class="panel-heading subset-preview-heading">
            <div>
              <h3>字体预览</h3>
              <p>实时查看保留字符在源字体中的显示效果</p>
            </div>
            <SelectMenu
              v-if="previewFontOptions.length > 1"
              v-model="activePreviewPath"
              class="preview-font-select"
              :options="previewFontOptions"
            />
          </div>

          <div v-if="activePreviewPath" class="subset-preview-list" aria-label="字体字号预览">
            <div v-for="size in previewSizes" :key="size" class="subset-preview-row">
              <span>{{ size }}px</span>
              <p :style="{ fontFamily: 'FontSubsetSourcePreview', fontSize: `${size}px` }">{{ text || "请输入保留字符" }}</p>
            </div>
          </div>
          <div v-else class="subset-preview-empty">
            <i class="ri-font-size-2" aria-hidden="true"></i>
            <span>选择字体后显示实时预览</span>
          </div>
        </section>

        <ResultPanel
          :result="result"
          :busy="busy"
          title="生成结果"
          empty-text="生成后可在此打开输出文件"
          compact
        />
      </div>
    </div>

    <footer class="subset-action-bar">
      <OutputPicker v-model="outputDir" class="subset-output-picker" />
      <div class="subset-task-summary" aria-live="polite">
        <i class="ri-stack-line" aria-hidden="true"></i>
        <span>{{ outputSummary }}</span>
      </div>
      <button type="button" class="primary-button subset-run-button" :disabled="!canRun" @click="run">
        <i class="ri-scissors-cut-line" aria-hidden="true"></i>
        {{ busy ? "生成中…" : "生成子集" }}
      </button>
    </footer>
  </section>
</template>

<style scoped>
.font-subset-page {
  grid-template-rows: auto auto minmax(0, 1fr) auto;
  gap: 14px;
  height: calc(100vh - var(--titlebar-height) - 72px);
  min-height: 0;
  overflow: hidden;
}

.subset-panel,
.subset-action-bar {
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
}

.subset-panel {
  padding: 14px;
}

.subset-panel > .panel-heading {
  margin-bottom: 12px;
}

.subset-source-panel {
  min-width: 0;
}

.subset-workbench {
  display: grid;
  grid-template-columns: minmax(320px, 0.72fr) minmax(440px, 1fr);
  gap: 14px;
  align-items: stretch;
  min-height: 0;
}

.subset-settings-panel {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr) auto;
  gap: 14px;
  min-width: 0;
  min-height: 0;
}

.subset-settings-panel > .field {
  grid-template-rows: auto minmax(0, 1fr);
  min-height: 0;
}

.subset-settings-panel .tool-textarea {
  height: 100%;
  min-height: 84px;
  resize: none;
}

.subset-output-column {
  display: grid;
  grid-template-rows: minmax(0, 1.55fr) minmax(164px, 0.8fr);
  gap: 14px;
  min-width: 0;
  min-height: 0;
}

.subset-preview-panel {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 12px;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
}

.subset-preview-heading {
  align-items: center;
}

.preview-font-select {
  width: min(260px, 45%);
  min-width: 180px;
}

.subset-preview-list {
  display: grid;
  min-height: 0;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 7px;
  background: var(--surface-subtle);
}

.subset-preview-row {
  display: grid;
  grid-template-columns: 46px minmax(0, 1fr);
  gap: 12px;
  align-items: baseline;
  min-height: 38px;
  padding: 5px 10px;
  border-bottom: 1px solid color-mix(in srgb, var(--border) 76%, transparent);
}

.subset-preview-row:last-child {
  border-bottom: 0;
}

.subset-preview-row > span {
  color: var(--muted);
  font-size: 11px;
  font-weight: 700;
}

.subset-preview-row p {
  min-width: 0;
  margin: 0;
  overflow: hidden;
  color: var(--text);
  line-height: 1.32;
  overflow-wrap: anywhere;
}

.subset-preview-empty {
  display: grid;
  place-items: center;
  gap: 8px;
  min-height: 0;
  height: 100%;
  border: 1px dashed var(--border-strong);
  border-radius: 7px;
  color: var(--muted);
  background: var(--surface-subtle);
}

.subset-preview-empty i {
  font-size: 24px;
}

.subset-action-bar {
  position: relative;
  z-index: 8;
  display: grid;
  grid-template-columns: minmax(300px, 1fr) auto auto;
  gap: 16px;
  align-items: end;
  padding: 12px 14px;
  box-shadow: none;
}

.subset-output-column :deep(.result-panel.compact) {
  height: 100%;
  min-height: 0;
}

.subset-output-column :deep(.result-panel.compact > .empty-state) {
  min-height: 0;
}

.subset-output-column :deep(.result-panel.compact .result-content) {
  min-height: 0;
}

.subset-output-picker {
  min-width: 0;
}

.subset-task-summary {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  min-height: 32px;
  padding: 0 4px;
  color: var(--muted);
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
}

.subset-task-summary i {
  color: var(--accent-strong);
  font-size: 15px;
}

.subset-run-button {
  min-width: 138px;
}

@media (max-width: 1120px) {
  .font-subset-page {
    grid-template-rows: none;
    height: auto;
    overflow: visible;
  }

  .subset-workbench {
    grid-template-columns: 1fr;
  }

  .subset-settings-panel,
  .subset-output-column,
  .subset-preview-panel {
    grid-template-rows: none;
    height: auto;
    overflow: visible;
  }

  .subset-preview-empty {
    min-height: 192px;
  }

  .subset-action-bar {
    position: sticky;
    bottom: 0;
    grid-template-columns: minmax(0, 1fr) auto;
    box-shadow: 0 -8px 24px color-mix(in srgb, var(--bg) 72%, transparent);
  }

  .subset-output-picker {
    grid-column: 1 / -1;
  }
}

@media (max-height: 720px) {
  .font-subset-page {
    grid-template-rows: none;
    height: auto;
    overflow: visible;
  }

  .subset-workbench,
  .subset-settings-panel,
  .subset-output-column,
  .subset-preview-panel {
    min-height: auto;
  }

  .subset-settings-panel,
  .subset-output-column,
  .subset-preview-panel {
    grid-template-rows: none;
    height: auto;
    overflow: visible;
  }

  .subset-preview-empty {
    min-height: 160px;
  }

  .subset-action-bar {
    position: sticky;
    bottom: 0;
    box-shadow: 0 -8px 24px color-mix(in srgb, var(--bg) 72%, transparent);
  }
}

@media (max-width: 720px) {
  .subset-preview-heading {
    align-items: stretch;
    flex-direction: column;
  }

  .preview-font-select {
    width: 100%;
  }

  .subset-action-bar {
    grid-template-columns: 1fr;
  }

  .subset-output-picker,
  .subset-task-summary,
  .subset-run-button {
    grid-column: 1;
    width: 100%;
  }

  .subset-task-summary {
    justify-content: center;
  }
}
</style>
