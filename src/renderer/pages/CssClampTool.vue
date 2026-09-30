<script setup lang="ts">
import { computed, ref } from "vue";
import TaskFlowLayout from "../components/TaskFlowLayout.vue";

const minSize = ref(16);
const maxSize = ref(32);
const minViewport = ref(375);
const maxViewport = ref(1440);
const property = ref("font-size");

const validationError = computed(() => {
  const values = [minSize.value, maxSize.value, minViewport.value, maxViewport.value];
  if (!values.every((value) => Number.isFinite(value) && value > 0)) return "字号和视口必须是大于 0 的有限数值";
  if (maxSize.value < minSize.value) return "最大字号不能小于最小字号";
  if (maxViewport.value <= minViewport.value) return "最大视口必须大于最小视口";
  if (!/^(?:--[a-z0-9-_]+|[a-z][a-z0-9-]*)$/i.test(property.value.trim())) return "请输入有效的 CSS 属性名";
  return "";
});

const clampValue = computed(() => {
  if (validationError.value) return "";
  const slope = (maxSize.value - minSize.value) / (maxViewport.value - minViewport.value);
  const vw = slope * 100;
  const rem = (minSize.value - slope * minViewport.value) / 16;
  return `clamp(${minSize.value / 16}rem, ${rem.toFixed(4)}rem + ${vw.toFixed(4)}vw, ${maxSize.value / 16}rem)`;
});
const css = computed(() => validationError.value ? "" : `${property.value.trim()}: ${clampValue.value};`);
</script>

<template>
  <TaskFlowLayout
    tool-id="css-clamp"
    description="根据视口范围生成平滑响应式字号"
    source-title="响应范围"
    source-description="设置字号上下限及其对应的视口断点"
    settings-title="输出设置"
    settings-description="指定 CSS 属性并检查当前参数是否有效"
    preview-title="实时结果"
    preview-description="参数变化会立即更新 CSS 与字号插值示意"
    :file-label="validationError ? '参数有误' : '实时计算'"
    variant="preview-dominant"
  >
    <template #source>
      <div class="clamp-range-grid">
        <label class="field">
          <span>最小字号 px</span>
          <input v-model.number="minSize" type="number" min="1" />
        </label>
        <label class="field">
          <span>最大字号 px</span>
          <input v-model.number="maxSize" type="number" min="1" />
        </label>
        <label class="field">
          <span>最小视口 px</span>
          <input v-model.number="minViewport" type="number" min="1" />
        </label>
        <label class="field">
          <span>最大视口 px</span>
          <input v-model.number="maxViewport" type="number" min="1" />
        </label>
      </div>
    </template>

    <template #settings>
      <label class="field">
        <span>CSS 属性</span>
        <input v-model="property" placeholder="例如 font-size" />
      </label>

      <p v-if="validationError" class="error-banner">{{ validationError }}</p>
      <div v-else class="clamp-formula-card">
        <i class="ri-line-chart-line" aria-hidden="true"></i>
        <div>
          <strong>{{ minSize }}px → {{ maxSize }}px</strong>
          <span>{{ minViewport }}px 至 {{ maxViewport }}px 之间平滑变化</span>
        </div>
      </div>
    </template>

    <template #preview-actions>
      <span class="status-pill" :class="validationError ? 'error' : 'success'">
        {{ validationError ? "INVALID" : "READY" }}
      </span>
    </template>

    <template #preview>
      <div class="clamp-result">
        <div class="clamp-sample">
          <span class="clamp-sample-kicker">FLUID TYPE</span>
          <strong :style="{ fontSize: clampValue || '1rem' }">响应式字号</strong>
          <small>拖动窗口即可观察字号在上下限之间变化</small>
        </div>
        <textarea
          class="tool-textarea code-output clamp-code"
          aria-label="生成的 CSS Clamp 代码"
          readonly
          :value="css"
        ></textarea>
      </div>
    </template>
  </TaskFlowLayout>
</template>

<style scoped>
.clamp-range-grid {
  display: grid;
  grid-template-columns: repeat(4, minmax(120px, 1fr));
  gap: 12px;
}

.clamp-formula-card {
  display: grid;
  grid-template-columns: 38px minmax(0, 1fr);
  gap: 10px;
  align-items: center;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface-subtle);
}

.clamp-formula-card i {
  display: grid;
  place-items: center;
  width: 38px;
  height: 38px;
  border-radius: 8px;
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  color: var(--accent-strong);
  font-size: 20px;
}

.clamp-formula-card div {
  display: grid;
  gap: 4px;
  min-width: 0;
}

.clamp-formula-card span,
.clamp-sample small,
.clamp-sample-kicker {
  color: var(--muted);
  font-size: 12px;
}

.clamp-result {
  display: grid;
  grid-template-rows: minmax(150px, 1fr) auto;
  gap: 12px;
  width: 100%;
  height: 100%;
  min-height: 300px;
}

.clamp-sample {
  display: grid;
  place-items: center;
  align-content: center;
  gap: 10px;
  min-width: 0;
  overflow: hidden;
  padding: 20px;
  border: 1px dashed var(--border);
  border-radius: 8px;
  background:
    linear-gradient(90deg, color-mix(in srgb, var(--border) 25%, transparent) 1px, transparent 1px),
    linear-gradient(color-mix(in srgb, var(--border) 25%, transparent) 1px, transparent 1px),
    var(--surface-subtle);
  background-size: 24px 24px;
  text-align: center;
}

.clamp-sample strong {
  max-width: 100%;
  overflow-wrap: anywhere;
  line-height: 1.1;
}

.clamp-sample-kicker {
  font-weight: 800;
  letter-spacing: 0.16em;
}

.clamp-code {
  min-height: 88px;
  resize: none;
}

@media (max-width: 900px) {
  .clamp-range-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 520px) {
  .clamp-range-grid {
    grid-template-columns: 1fr;
  }
}
</style>
