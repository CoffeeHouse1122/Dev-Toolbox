<script setup lang="ts">
import ToolTitle from "../components/ToolTitle.vue";
import { ref } from "vue";

const count = ref(5);
const uuids = ref<string[]>([]);

function generate() {
  const normalizedCount = Math.min(100, Math.max(1, Math.trunc(Number(count.value) || 1)));
  count.value = normalizedCount;
  uuids.value = Array.from({ length: normalizedCount }, () => crypto.randomUUID());
}

generate();
</script>

<template>
  <section class="tool-page">
    <div class="tool-header">
      <div>
        <ToolTitle tool-id="uuid" />
        <p>生成 RFC 4122 UUID v4</p>
      </div>
      <button type="button" class="primary-button" @click="generate"><i class="ri-refresh-line" aria-hidden="true"></i>生成</button>
    </div>
    <div class="tool-main">
      <label class="field"><span>数量</span><input v-model.number="count" type="number" min="1" max="100" /></label>
      <textarea class="tool-textarea" readonly :value="uuids.join('\n')"></textarea>
    </div>
  </section>
</template>
