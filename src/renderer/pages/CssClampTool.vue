<script setup lang="ts">
import { computed, ref } from "vue";

const minSize = ref(16);
const maxSize = ref(32);
const minViewport = ref(375);
const maxViewport = ref(1440);
const property = ref("font-size");

const clampValue = computed(() => {
  const slope = (maxSize.value - minSize.value) / (maxViewport.value - minViewport.value);
  const vw = slope * 100;
  const rem = (minSize.value - slope * minViewport.value) / 16;
  return `clamp(${minSize.value / 16}rem, ${rem.toFixed(4)}rem + ${vw.toFixed(4)}vw, ${maxSize.value / 16}rem)`;
});
const css = computed(() => `${property.value}: ${clampValue.value};`);
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
          <span class="status-pill success">READY</span>
        </div>
        <textarea class="tool-textarea code-output" readonly :value="css"></textarea>
      </aside>
    </div>
  </section>
</template>
