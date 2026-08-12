<script setup lang="ts">
import { computed, ref } from "vue";
import { dump as dumpYaml, load as loadYaml } from "js-yaml";
import * as toml from "smol-toml";
import TaskFlowLayout from "../components/TaskFlowLayout.vue";
import { showWorkspaceToast } from "../composables/useWorkspaceToast";

type Format = "json" | "yaml" | "toml";

const formats: { label: string; value: Format; icon: string }[] = [
  { label: "JSON", value: "json", icon: "ri-braces-line" },
  { label: "YAML", value: "yaml", icon: "ri-file-text-line" },
  { label: "TOML", value: "toml", icon: "ri-settings-3-line" }
];

const sourceFormat = ref<Format>("json");
const targetFormat = ref<Format>("yaml");
const sourceText = ref(
  `{\n  "name": "dev-toolbox",\n  "version": "0.2.0",\n  "tools": ["jwt", "color", "yaml"],\n  "active": true\n}\n`
);

const parsed = computed<{ data?: unknown; error?: string }>(() => {
  const text = sourceText.value.trim();
  if (!text) return { data: undefined };
  try {
    if (sourceFormat.value === "json") return { data: JSON.parse(text) };
    if (sourceFormat.value === "yaml") return { data: loadYaml(text) };
    return { data: toml.parse(text) };
  } catch (error) {
    return { error: error instanceof Error ? error.message : String(error) };
  }
});

const targetText = computed(() => {
  if (parsed.value.error) return "";
  if (parsed.value.data === undefined) return "";
  try {
    if (targetFormat.value === "json") return JSON.stringify(parsed.value.data, null, 2);
    if (targetFormat.value === "yaml") return dumpYaml(parsed.value.data, { indent: 2, lineWidth: 120 });
    if (parsed.value.data === null || typeof parsed.value.data !== "object" || Array.isArray(parsed.value.data)) {
      return "# TOML 仅支持顶级表（对象）。请提供对象作为根节点。";
    }
    return toml.stringify(parsed.value.data as Record<string, unknown>);
  } catch (error) {
    return `# 转换失败：${error instanceof Error ? error.message : String(error)}`;
  }
});

async function copyTarget() {
  if (!targetText.value) return;
  try {
    await navigator.clipboard.writeText(targetText.value);
    showWorkspaceToast("已复制到剪贴板", "success");
  } catch (error) {
    showWorkspaceToast(error instanceof Error ? error.message : String(error), "error");
  }
}

function swap() {
  const oldSrc = sourceFormat.value;
  const converted = targetText.value;
  sourceFormat.value = targetFormat.value;
  targetFormat.value = oldSrc;
  if (converted) sourceText.value = converted;
}

function setSourceFormat(format: Format) {
  if (format === sourceFormat.value) return;
  const previous = sourceFormat.value;
  sourceFormat.value = format;
  if (targetFormat.value === format) targetFormat.value = previous;
}

function loadSample() {
  if (sourceFormat.value === "json") {
    sourceText.value = `{\n  "name": "dev-toolbox",\n  "version": "0.2.0",\n  "tools": ["jwt", "color", "yaml"],\n  "active": true\n}\n`;
  } else if (sourceFormat.value === "yaml") {
    sourceText.value = `name: dev-toolbox\nversion: 0.2.0\ntools:\n  - jwt\n  - color\n  - yaml\nactive: true\n`;
  } else {
    sourceText.value = `name = "dev-toolbox"\nversion = "0.2.0"\ntools = ["jwt", "color", "yaml"]\nactive = true\n`;
  }
}

</script>

<template>
  <TaskFlowLayout
    title="JSON ↔ YAML ↔ TOML"
    description="本地双向互转结构化配置，支持 JSON、YAML、TOML 三种格式"
    source-title="源数据"
    source-description="粘贴结构化配置，解析与转换结果会实时更新"
    settings-title="转换设置"
    settings-description="指定输入格式与目标格式"
    preview-title="转换结果"
    preview-description="转换完全在本地完成，可直接复制输出"
    :file-label="`${sourceText.length} 字符`"
    variant="preview-dominant"
  >
    <template #source>
      <textarea
        v-model="sourceText"
        class="tool-textarea data-source-editor"
        aria-label="源数据"
        spellcheck="false"
      ></textarea>
      <p v-if="parsed.error" class="error-banner data-parse-error">解析错误：{{ parsed.error }}</p>
    </template>

    <template #settings>
      <div class="format-flow">
        <div class="format-step">
          <span class="format-step-label">源格式</span>
          <div class="segmented format-segmented">
            <button
              v-for="fmt in formats"
              :key="fmt.value"
              type="button"
              :class="{ selected: fmt.value === sourceFormat }"
              @click="setSourceFormat(fmt.value)"
            >
              <i :class="fmt.icon" aria-hidden="true"></i>
              {{ fmt.label }}
            </button>
          </div>
        </div>

        <div class="format-direction" aria-hidden="true">
          <i class="ri-arrow-down-line"></i>
          <span>转换为</span>
        </div>

        <div class="format-step">
          <span class="format-step-label">目标格式</span>
          <div class="segmented format-segmented">
            <button
              v-for="fmt in formats"
              :key="fmt.value"
              type="button"
              :class="{ selected: fmt.value === targetFormat }"
              :disabled="fmt.value === sourceFormat"
              @click="targetFormat = fmt.value"
            >
              <i :class="fmt.icon" aria-hidden="true"></i>
              {{ fmt.label }}
            </button>
          </div>
        </div>
      </div>
    </template>

    <template #preview-actions>
      <span class="status-pill" :class="parsed.error ? 'error' : 'success'">
        {{ parsed.error ? "解析失败" : "实时转换" }}
      </span>
    </template>

    <template #preview>
      <textarea
        class="tool-textarea code-output data-result-editor"
        aria-label="转换结果"
        readonly
        :value="targetText"
        spellcheck="false"
      ></textarea>
    </template>

    <template #summary>
      <i class="ri-arrow-left-right-line" aria-hidden="true"></i>
      <span>{{ sourceFormat.toUpperCase() }} → {{ targetFormat.toUpperCase() }} · {{ targetText.length }} 字符</span>
    </template>

    <template #actions>
      <button type="button" class="secondary-button" @click="loadSample">
        <i class="ri-flask-line" aria-hidden="true"></i>
        示例
      </button>
      <button type="button" class="secondary-button" @click="swap">
        <i class="ri-arrow-left-right-line" aria-hidden="true"></i>
        交换
      </button>
      <button type="button" class="primary-button" :disabled="!targetText" @click="copyTarget">
        <i class="ri-clipboard-line" aria-hidden="true"></i>
        复制结果
      </button>
    </template>
  </TaskFlowLayout>
</template>

<style scoped>
.data-source-editor {
  min-height: 92px;
  max-height: 124px;
  resize: vertical;
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Consolas, monospace);
  font-size: 13px;
}

.data-parse-error {
  margin: 8px 0 0;
}

.format-flow {
  display: grid;
  gap: 12px;
}

.format-step {
  display: grid;
  gap: 8px;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 7px;
  background: var(--surface-subtle);
}

.format-step-label {
  color: var(--muted);
  font-size: 12px;
  font-weight: 700;
}

.format-segmented {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
}

.format-segmented button {
  justify-content: center;
}

.format-direction {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
  color: var(--muted);
  font-size: 12px;
  font-weight: 700;
}

.format-direction i {
  color: var(--accent-strong);
  font-size: 16px;
}

.data-result-editor {
  width: 100%;
  height: 100%;
  min-height: 260px;
  resize: none;
  font-family: var(--font-mono, ui-monospace, SFMono-Regular, Consolas, monospace);
  font-size: 13px;
}
</style>
