<script setup lang="ts">
import { computed, ref } from "vue";

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
</script>

<template>
  <section class="tool-page">
    <div class="tool-header">
      <div>
        <h2>URL 编解码</h2>
      </div>
      <div class="segmented">
        <button type="button" :class="{ selected: mode === 'encode-uri' }" @click="mode = 'encode-uri'">encodeURI</button>
        <button type="button" :class="{ selected: mode === 'decode-uri' }" @click="mode = 'decode-uri'">decodeURI</button>
        <button type="button" :class="{ selected: mode === 'encode-component' }" @click="mode = 'encode-component'">encodeURIComponent</button>
        <button type="button" :class="{ selected: mode === 'decode-component' }" @click="mode = 'decode-component'">decodeURIComponent</button>
      </div>
    </div>
    <div class="tool-layout url-codec-layout">
      <section class="tool-main">
        <textarea v-model="input" class="tool-textarea" placeholder="输入 URL 或片段"></textarea>
        <textarea class="tool-textarea" readonly :value="output"></textarea>
      </section>
      <aside class="result-panel url-usage-panel">
        <div class="section-title">
          <h2>使用说明</h2>
          <span class="status-pill">URL</span>
        </div>
        <div class="info-list">
          <div v-for="tip in usageTips" :key="tip" class="info-row">
            <strong>{{ tip }}</strong>
          </div>
        </div>
      </aside>
    </div>
  </section>
</template>

<style scoped>
.url-codec-layout {
  align-items: stretch;
}

.url-usage-panel {
  align-content: start;
}
</style>

