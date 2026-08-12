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
  "encodeURI / decodeURI：用于处理完整 URL，会保留 : / ? & = # 等 URL 结构字符。",
  "encodeURIComponent / decodeURIComponent：用于处理 query 参数值、路径片段等，会编码大部分分隔符。",
  "如果要拼接 ?keyword=某个值，通常只对参数值使用 encodeURIComponent。"
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
    title="URL 编解码"
    description="在完整 URL 与参数片段之间进行本地编码或解码"
    source-title="待处理内容"
    source-description="粘贴完整 URL、查询参数值或路径片段"
    settings-title="转换方式"
    settings-description="选择保留 URL 结构字符或编码单个组成部分"
    preview-title="转换结果"
    preview-description="输入和模式变化会即时同步到结果"
    :file-label="`${input.length} 字符`"
    variant="preview-dominant"
  >
    <template #source>
      <textarea
        v-model="input"
        class="tool-textarea compact url-source"
        placeholder="输入 URL 或片段"
      ></textarea>
    </template>

    <template #settings>
      <div class="url-mode-grid segmented" aria-label="URL 编解码方式">
        <button type="button" :class="{ selected: mode === 'encode-uri' }" @click="mode = 'encode-uri'">encodeURI</button>
        <button type="button" :class="{ selected: mode === 'decode-uri' }" @click="mode = 'decode-uri'">decodeURI</button>
        <button type="button" :class="{ selected: mode === 'encode-component' }" @click="mode = 'encode-component'">encodeURIComponent</button>
        <button type="button" :class="{ selected: mode === 'decode-component' }" @click="mode = 'decode-component'">decodeURIComponent</button>
      </div>

      <div class="url-usage-panel">
        <div class="url-usage-heading">
          <i class="ri-information-line" aria-hidden="true"></i>
          <strong>如何选择</strong>
        </div>
        <div class="info-list">
          <div v-for="tip in usageTips" :key="tip" class="info-row">
            <span>{{ tip }}</span>
          </div>
        </div>
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
  min-height: 38px;
  padding: 6px 8px;
  overflow: hidden;
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
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

@media (max-width: 520px) {
  .url-mode-grid {
    grid-template-columns: 1fr;
  }
}
</style>
