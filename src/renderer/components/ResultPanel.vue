<script setup lang="ts">
import { AnimatePresence, motion } from "motion-v";
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

const resultStateEnter = { opacity: 0, y: 8 };
const resultStateVisible = { opacity: 1, y: 0 };
const resultStateExit = { opacity: 0, y: -6 };

function fileItemEnter(index: number) {
  return { opacity: 0, x: index % 2 === 0 ? -8 : 8 };
}
</script>

<template>
  <section class="result-panel">
    <div class="section-title">
      <h2>转换结果</h2>
      <span v-if="busy" class="status-pill running">运行中</span>
      <span v-else-if="result" class="status-pill" :class="result.status">{{ statusText(result.status) }}</span>
    </div>

    <AnimatePresence>
      <motion.div
        v-if="!result"
        key="result-empty"
        class="empty-state"
        :initial="resultStateEnter"
        :animate="resultStateVisible"
        :exit="resultStateExit"
        :transition="{ duration: 0.16 }"
      >
        等待转换
      </motion.div>
      <motion.div
        v-else
        key="result-content"
        class="result-content"
        :initial="resultStateEnter"
        :animate="resultStateVisible"
        :exit="resultStateExit"
        :transition="{ duration: 0.16 }"
      >
        <p v-if="result.errorMessage" class="error-text">{{ result.errorMessage }}</p>

        <div v-if="result.files.length" class="file-list">
          <motion.button
            v-for="(file, index) in result.files"
            :key="file"
            type="button"
            class="file-item"
            :initial="fileItemEnter(index)"
            :animate="{ opacity: 1, x: 0 }"
            :whilePress="{ scale: 0.99 }"
            :transition="{ duration: 0.16, delay: Math.min(index * 0.025, 0.16) }"
            @click="reveal(file)"
          >
            <i class="ri-search-eye-line" aria-hidden="true"></i>
            <span>{{ file }}</span>
          </motion.button>
        </div>

        <details v-if="result.logs.length" class="log-panel">
          <summary>转换日志</summary>
          <pre>{{ result.logs.join("\n") }}</pre>
        </details>
      </motion.div>
    </AnimatePresence>
  </section>
</template>
