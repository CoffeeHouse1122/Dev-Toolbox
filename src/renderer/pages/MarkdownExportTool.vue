<script setup lang="ts">
import { computed, ref } from "vue";
import type { ConversionResult } from "../../shared/types";
import OutputPicker from "../components/OutputPicker.vue";
import ResultPanel from "../components/ResultPanel.vue";
import TaskFlowLayout from "../components/TaskFlowLayout.vue";

const markdown = ref("# 标题\n\n- 列表项\n- **加粗文本**");
const outputDir = ref("");
const baseName = ref("document");
const formats = ref<Array<"html" | "png" | "pdf">>(["html"]);
const busy = ref(false);
const result = ref<ConversionResult | null>(null);
const allFormats: Array<"html" | "png" | "pdf"> = ["html", "png", "pdf"];
const canRun = computed(() => Boolean(outputDir.value && formats.value.length && !busy.value));
const formatLabel = computed(() => formats.value.map((format) => format.toUpperCase()).join(" + ") || "未选择格式");

function toggleFormat(format: "html" | "png" | "pdf") {
  formats.value = formats.value.includes(format) ? formats.value.filter((item) => item !== format) : [...formats.value, format];
}

async function run() {
  if (!canRun.value) return;
  busy.value = true;
  result.value = await window.devToolbox.exportMarkdown({
    markdown: markdown.value,
    outputDir: outputDir.value,
    baseName: baseName.value,
    formats: [...formats.value]
  });
  busy.value = false;
}
</script>

<template>
  <TaskFlowLayout
    title="Markdown 转 HTML / PNG / PDF"
    description="在本地渲染 Markdown，并导出可发布或归档的文档"
    source-title="Markdown 内容"
    source-description="编辑正文后，选择输出格式和文件名完成导出"
    settings-title="导出设置"
    settings-description="同一份内容可一次生成多种格式"
    :file-label="`${markdown.length} 字符`"
  >
    <template #source>
      <textarea
        v-model="markdown"
        class="tool-textarea markdown-source-editor"
        aria-label="Markdown 内容"
        placeholder="输入 Markdown 内容"
      ></textarea>
    </template>

    <template #settings>
      <div class="option-grid">
        <label class="field span-2">
          <span>文件名</span>
          <input v-model="baseName" />
        </label>
        <div class="field span-2">
          <span>输出格式</span>
          <div class="size-grid markdown-format-grid">
            <button
              v-for="format in allFormats"
              :key="format"
              type="button"
              class="toggle-chip"
              :class="{ selected: formats.includes(format) }"
              :aria-pressed="formats.includes(format)"
              @click="toggleFormat(format)"
            >
              {{ format.toUpperCase() }}
            </button>
          </div>
        </div>
      </div>
      <div class="markdown-export-plan">
        <i class="ri-file-list-3-line" aria-hidden="true"></i>
        <div>
          <strong>{{ baseName || "document" }}</strong>
          <span>{{ formatLabel }}</span>
        </div>
      </div>
    </template>

    <template #result>
      <ResultPanel :result="result" :busy="busy" title="导出结果" empty-text="导出后可在此打开生成的文档" compact />
    </template>

    <template #destination>
      <OutputPicker v-model="outputDir" />
    </template>
    <template #summary>
      <i class="ri-markdown-line" aria-hidden="true"></i>
      <span>{{ markdown.length }} 字符 · {{ formatLabel }}</span>
    </template>
    <template #actions>
      <button type="button" class="primary-button" :disabled="!canRun" @click="run">
        <i class="ri-file-download-line" aria-hidden="true"></i>
        {{ busy ? "导出中…" : "导出文档" }}
      </button>
    </template>
  </TaskFlowLayout>
</template>

<style scoped>
.markdown-source-editor {
  min-height: 88px;
  max-height: 124px;
  resize: vertical;
}

.markdown-format-grid {
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.markdown-export-plan {
  display: grid;
  grid-template-columns: 36px minmax(0, 1fr);
  gap: 10px;
  align-items: center;
  padding: 12px;
  border-radius: 7px;
  background: var(--surface-subtle);
}

.markdown-export-plan > i {
  display: grid;
  place-items: center;
  width: 36px;
  height: 36px;
  border-radius: 7px;
  color: var(--accent-strong);
  background: color-mix(in srgb, var(--accent) 10%, transparent);
  font-size: 18px;
}

.markdown-export-plan strong,
.markdown-export-plan span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.markdown-export-plan span {
  margin-top: 4px;
  color: var(--muted);
  font-size: 12px;
}
</style>
