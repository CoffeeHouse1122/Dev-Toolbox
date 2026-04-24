<script setup lang="ts">
import { computed, ref } from "vue";

const input = ref("");
const mode = ref<"encode" | "decode">("encode");
const output = computed(() => {
  try {
    return mode.value === "encode" ? encodeURIComponent(input.value) : decodeURIComponent(input.value);
  } catch (error) {
    return error instanceof Error ? error.message : String(error);
  }
});
</script>

<template>
  <section class="tool-page">
    <div class="tool-header">
      <div>
        <h2>URL 编解码</h2>
        <p>encodeURIComponent / decodeURIComponent</p>
      </div>
      <div class="segmented">
        <button type="button" :class="{ selected: mode === 'encode' }" @click="mode = 'encode'">编码</button>
        <button type="button" :class="{ selected: mode === 'decode' }" @click="mode = 'decode'">解码</button>
      </div>
    </div>
    <div class="tool-main">
      <textarea v-model="input" class="tool-textarea" placeholder="输入 URL 或片段"></textarea>
      <textarea class="tool-textarea" readonly :value="output"></textarea>
    </div>
  </section>
</template>

