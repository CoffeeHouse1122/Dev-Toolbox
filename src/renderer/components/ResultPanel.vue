<script setup lang="ts">
import type { ConversionResult } from "../../shared/types";

defineProps<{
  result: ConversionResult | null;
  busy: boolean;
}>();

function reveal(path: string) {
  void window.devToolbox.revealPath(path);
}

function statusText(status: string) {
  return status === "success" ? "成功" : "失败";
}
</script>

<template>
  <section class="result-panel">
    <div class="section-title">
      <h2>转换结果</h2>
      <span v-if="busy" class="status-pill running">运行中</span>
      <span v-else-if="result" class="status-pill" :class="result.status">{{ statusText(result.status) }}</span>
    </div>

    <div v-if="!result" class="empty-state">等待转换</div>
    <div v-else class="result-content">
      <p v-if="result.errorMessage" class="error-text">{{ result.errorMessage }}</p>

      <div v-if="result.files.length" class="file-list">
        <button v-for="file in result.files" :key="file" type="button" class="file-item" @click="reveal(file)">
          <i class="ri-search-eye-line" aria-hidden="true"></i>
          <span>{{ file }}</span>
        </button>
      </div>

      <details v-if="result.logs.length" class="log-panel">
        <summary>转换日志</summary>
        <pre>{{ result.logs.join("\n") }}</pre>
      </details>
    </div>
  </section>
</template>
