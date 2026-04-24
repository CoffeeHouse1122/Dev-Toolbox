<script setup lang="ts">
import { computed, ref, watch } from "vue";
import yaml from "js-yaml";
import * as toml from "smol-toml";

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
    if (sourceFormat.value === "yaml") return { data: yaml.load(text) };
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
    if (targetFormat.value === "yaml") return yaml.dump(parsed.value.data, { indent: 2, lineWidth: 120 });
    if (parsed.value.data === null || typeof parsed.value.data !== "object" || Array.isArray(parsed.value.data)) {
      return "# TOML 仅支持顶级表（对象）。请提供对象作为根节点。";
    }
    return toml.stringify(parsed.value.data as Record<string, unknown>);
  } catch (error) {
    return `# 转换失败：${error instanceof Error ? error.message : String(error)}`;
  }
});

const copyState = ref("");

async function copyTarget() {
  if (!targetText.value) return;
  try {
    await navigator.clipboard.writeText(targetText.value);
    copyState.value = "已复制到剪贴板";
    setTimeout(() => (copyState.value = ""), 1800);
  } catch (error) {
    copyState.value = error instanceof Error ? error.message : String(error);
  }
}

function swap() {
  const oldSrc = sourceFormat.value;
  sourceFormat.value = targetFormat.value;
  targetFormat.value = oldSrc;
  sourceText.value = targetText.value || sourceText.value;
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

watch(sourceFormat, () => loadSample());
</script>

<template>
  <section class="tool-page">
    <div class="tool-header">
      <div>
        <h2>JSON ↔ YAML ↔ TOML</h2>
        <p>本地双向互转结构化配置，支持 JSON、YAML、TOML 三种格式</p>
      </div>
      <div class="header-actions">
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
      </div>
    </div>

    <div class="tool-main">
      <div class="dual-pane">
        <div class="code-pane">
          <div class="pane-head">
            <strong>源格式</strong>
            <div class="segmented">
              <button
                v-for="fmt in formats"
                :key="fmt.value"
                type="button"
                :class="{ selected: fmt.value === sourceFormat }"
                @click="sourceFormat = fmt.value"
              >
                <i :class="fmt.icon" aria-hidden="true"></i>
                {{ fmt.label }}
              </button>
            </div>
          </div>
          <textarea v-model="sourceText" spellcheck="false"></textarea>
          <p v-if="parsed.error" class="error-banner">解析错误：{{ parsed.error }}</p>
        </div>
        <div class="code-pane">
          <div class="pane-head">
            <strong>目标格式</strong>
            <div class="segmented">
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
          <textarea readonly :value="targetText" spellcheck="false"></textarea>
          <p v-if="copyState" class="success-banner">{{ copyState }}</p>
        </div>
      </div>
    </div>
  </section>
</template>
