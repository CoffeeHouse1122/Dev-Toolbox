<script setup lang="ts">
import { computed, ref } from "vue";
import TaskFlowLayout from "../components/TaskFlowLayout.vue";

const input = ref("");
const mode = ref<"encode-uri" | "decode-uri" | "encode-component" | "decode-component">("encode-component");
const output = computed(() => {
  try {
    if (mode.value === "encode-uri") return encodeURI(input.value);
    if (mode.value === "decode-uri") return decodeURI(input.value);
    if (mode.value === "encode-component") return encodeURIComponent(input.value);
    return decodeURIComponent(input.value);
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
});

const usageTips = [
  "完整 URL：保留 : / ? & = # 等结构字符。",
  "参数或路径片段：编码时会转义大部分分隔符。",
  "拼接 ?keyword=某个值 时，通常只编码参数值。"
];

const operationLabel = computed(() => ({
  "encode-uri": "encodeURI",
  "decode-uri": "decodeURI",
  "encode-component": "encodeURIComponent",
  "decode-component": "decodeURIComponent"
})[mode.value]);
</script>

<template>
  <TaskFlowLayout
    class="url-codec-page"
    tool-id="url-codec"
    description="在完整 URL 与参数片段之间进行本地编码或解码"
    source-title="待处理内容"
    source-description="粘贴完整 URL、查询参数值或路径片段"
    settings-title="转换方式"
    settings-description="完整 URL 用 URI，单个参数或片段用 Component"
    preview-title="转换结果"
    preview-description="输入和模式变化会即时同步到结果"
    :file-label="`${input.length} 字符`"
    variant="preview-dominant"
  >
    <template #source>
      <textarea
        v-model="input"
        class="tool-textarea compact url-source"
        aria-label="待处理 URL 或片段"
        placeholder="输入 URL 或片段"
      ></textarea>
    </template>

    <template #settings>
      <div class="url-mode-grid segmented" role="group" aria-label="URL 编解码方式">
        <button type="button" :aria-pressed="mode === 'encode-uri'" :class="{ selected: mode === 'encode-uri' }" @click="mode = 'encode-uri'">encodeURI</button>
        <button type="button" :aria-pressed="mode === 'decode-uri'" :class="{ selected: mode === 'decode-uri' }" @click="mode = 'decode-uri'">decodeURI</button>
        <button type="button" :aria-pressed="mode === 'encode-component'" :class="{ selected: mode === 'encode-component' }" @click="mode = 'encode-component'">encodeURIComponent</button>
        <button type="button" :aria-pressed="mode === 'decode-component'" :class="{ selected: mode === 'decode-component' }" @click="mode = 'decode-component'">decodeURIComponent</button>
      </div>

      <div class="url-usage-panel">
        <div class="url-usage-heading">
          <i class="ri-information-line" aria-hidden="true"></i>
          <strong>如何选择</strong>
        </div>
        <ul class="url-usage-list">
          <li v-for="tip in usageTips" :key="tip">{{ tip }}</li>
        </ul>
      </div>
    </template>

    <template #preview-actions>
      <span class="status-pill success">{{ operationLabel }}</span>
    </template>

    <template #preview>
      <div class="url-output-wrap">
        <textarea
          class="tool-textarea code-output url-output"
          aria-label="URL 编解码结果"
          readonly
          :value="output"
        ></textarea>
        <span class="url-output-count">{{ output.length }} 字符</span>
      </div>
    </template>
  </TaskFlowLayout>
</template>

<style scoped>
.url-source {
  min-height: 86px;
  max-height: 132px;
}

.url-mode-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.url-mode-grid button {
  min-width: 0;
  min-height: 38px;
  padding: 6px 8px;
  font-size: 12px;
  overflow-wrap: anywhere;
  white-space: normal;
}

.url-usage-list {
  margin: 0;
  padding-left: 18px;
  display: grid;
  gap: 10px;
  color: var(--muted);
  font-size: 12px;
  line-height: 1.6;
}

.url-usage-panel {
  display: grid;
  gap: 10px;
  padding-top: 4px;
}

.url-usage-heading {
  display: flex;
  gap: 7px;
  align-items: center;
  color: var(--text);
  font-size: 13px;
}

.url-usage-heading i {
  color: var(--accent-strong);
  font-size: 17px;
}

.url-output-wrap {
  position: relative;
  width: 100%;
  height: 100%;
  min-height: 300px;
}

.url-output {
  display: block;
  height: 100%;
  min-height: 300px;
  padding-bottom: 34px;
  resize: none;
}

.url-output-count {
  position: absolute;
  right: 10px;
  bottom: 10px;
  padding: 3px 7px;
  border: 1px solid var(--border);
  border-radius: 999px;
  background: var(--surface-subtle);
  color: var(--muted);
  font-size: 11px;
  font-weight: 700;
}

@media (min-width: 1121px) and (min-height: 721px) {
  .url-codec-page :deep(.task-flow-workbench) {
    grid-template-columns: minmax(0, 0.82fr) minmax(0, 1.18fr);
  }

  .url-codec-page :deep(.task-flow-preview-content) {
    grid-template-rows: minmax(0, 1fr);
    align-content: stretch;
  }

  .url-output-wrap,
  .url-output {
    min-height: 0;
  }

  .url-source {
    height: 86px;
    resize: none;
  }
}

@media (max-width: 520px) {
  .url-mode-grid {
    grid-template-columns: 1fr;
  }
}
</style>
