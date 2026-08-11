<script setup lang="ts">
import { computed, ref } from "vue";

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
  <section class="tool-page">
    <div class="tool-header">
      <div>
        <h2>CSS Clamp 字号生成器</h2>
        <p>根据视口范围生成平滑响应式字号</p>
      </div>
    </div>

    <div class="tool-layout">
      <section class="tool-main">
        <div class="option-grid">
          <label class="field">
            <span>CSS 属性</span>
            <input v-model="property" />
          </label>
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
      </section>
      <aside class="result-panel">
        <div class="section-title">
          <h2>CSS</h2>
          <span class="status-pill" :class="validationError ? 'error' : 'success'">{{ validationError ? "INVALID" : "READY" }}</span>
        </div>
        <p v-if="validationError" class="error-banner">{{ validationError }}</p>
        <textarea class="tool-textarea code-output" readonly :value="css"></textarea>
      </aside>
    </div>
  </section>
</template>
