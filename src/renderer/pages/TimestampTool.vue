<script setup lang="ts">
import { computed, ref } from "vue";

const timestamp = ref(String(Date.now()));
const dateText = ref(new Date().toISOString());

const parsedDate = computed(() => {
  const raw = Number(timestamp.value);
  const ms = timestamp.value.length <= 10 ? raw * 1000 : raw;
  const date = new Date(ms);
  return Number.isFinite(date.getTime()) ? date.toLocaleString() : "无效时间戳";
});

const parsedTimestamp = computed(() => {
  const date = new Date(dateText.value);
  return Number.isFinite(date.getTime()) ? `${date.getTime()}\n${Math.floor(date.getTime() / 1000)}` : "无效时间";
});

function useNow() {
  const now = new Date();
  timestamp.value = String(now.getTime());
  dateText.value = now.toISOString();
}
</script>

<template>
  <section class="tool-page">
    <div class="tool-header">
      <div>
        <h2>时间戳转换</h2>
        <p>毫秒、秒与可读时间互转</p>
      </div>
      <button type="button" class="secondary-button" @click="useNow"><i class="ri-time-line" aria-hidden="true"></i>当前时间</button>
    </div>
    <div class="tool-main two-column-form">
      <label class="field"><span>时间戳</span><input v-model="timestamp" /><textarea class="tool-textarea compact" readonly :value="parsedDate"></textarea></label>
      <label class="field"><span>时间文本</span><input v-model="dateText" /><textarea class="tool-textarea compact" readonly :value="parsedTimestamp"></textarea></label>
    </div>
  </section>
</template>

