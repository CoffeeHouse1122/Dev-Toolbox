<script setup lang="ts">
import { computed, ref } from "vue";

const now = new Date();
const timestamp = ref(String(now.getTime()));
const timestampUnit = ref<"ms" | "s">("ms");
const dateText = ref(toDatetimeLocal(now));

function pad(value: number) {
  return String(value).padStart(2, "0");
}

function toDatetimeLocal(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

function formatDate(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
}

const timestampDate = computed(() => {
  const raw = Number(timestamp.value.trim());
  if (!Number.isFinite(raw)) return null;
  const date = new Date(timestampUnit.value === "s" ? raw * 1000 : raw);
  return Number.isFinite(date.getTime()) ? date : null;
});

const parsedDate = computed(() => {
  if (!timestampDate.value) return "无效时间戳";
  return [`本地时间：${formatDate(timestampDate.value)}`, `ISO：${timestampDate.value.toISOString()}`].join("\n");
});

const parsedTimestamp = computed(() => {
  const date = new Date(dateText.value);
  if (!Number.isFinite(date.getTime())) return "无效时间";
  return [`毫秒：${date.getTime()}`, `秒：${Math.floor(date.getTime() / 1000)}`].join("\n");
});

function useNow() {
  const current = new Date();
  timestamp.value = String(timestampUnit.value === "s" ? Math.floor(current.getTime() / 1000) : current.getTime());
  dateText.value = toDatetimeLocal(current);
}

function syncDateFromTimestamp() {
  if (!timestampDate.value) return;
  dateText.value = toDatetimeLocal(timestampDate.value);
}

function syncTimestampFromDate() {
  const date = new Date(dateText.value);
  if (!Number.isFinite(date.getTime())) return;
  timestamp.value = String(timestampUnit.value === "s" ? Math.floor(date.getTime() / 1000) : date.getTime());
}
</script>

<template>
  <section class="tool-page">
    <div class="tool-header">
      <div>
        <h2>时间戳转换</h2>
        <p>日期时间、秒级时间戳与毫秒级时间戳互转</p>
      </div>
      <button type="button" class="secondary-button" @click="useNow"><i class="ri-time-line" aria-hidden="true"></i>当前时间</button>
    </div>
    <div class="tool-main two-column-form">
      <div class="field">
        <span>时间戳</span>
        <div class="segmented">
          <button type="button" :class="{ selected: timestampUnit === 'ms' }" @click="timestampUnit = 'ms'">毫秒</button>
          <button type="button" :class="{ selected: timestampUnit === 's' }" @click="timestampUnit = 's'">秒</button>
        </div>
        <input v-model="timestamp" inputmode="numeric" @change="syncDateFromTimestamp" />
        <textarea class="tool-textarea compact" readonly :value="parsedDate"></textarea>
      </div>
      <label class="field">
        <span>日期时间</span>
        <input v-model="dateText" type="datetime-local" step="1" @change="syncTimestampFromDate" />
        <textarea class="tool-textarea compact" readonly :value="parsedTimestamp"></textarea>
      </label>
    </div>
  </section>
</template>

