<script setup lang="ts">
import type { ConversionItemResult, ConversionResult } from "../../shared/types";
import GsapTransition from "./GsapTransition.vue";

defineProps<{
  result: ConversionResult | null;
  busy: boolean;
  title?: string;
  emptyText?: string;
  compact?: boolean;
}>();

function reveal(path: string) {
  void window.devToolbox.revealPath(path);
}

function statusText(status: string) {
  return ({
    queued: "等待中",
    running: "运行中",
    partial: "部分完成",
    success: "成功",
    error: "失败",
    failed: "失败",
    cancelled: "已取消"
  } as Record<string, string>)[status] ?? status;
}

function statusClass(status: string) {
  if (status === "error" || status === "failed") return "error";
  if (status === "queued" || status === "running" || status === "partial") return "running";
  return status;
}

function fileItemEnter(index: number) {
  return {
    from: { opacity: 0, x: index % 2 === 0 ? -8 : 8 },
    to: { opacity: 1, x: 0 },
    delay: Math.min(index * 0.025, 0.16)
  };
}

function issueItems(result: ConversionResult): ConversionItemResult[] {
  return result.items?.filter((item) => item.status !== "success") ?? [];
}
</script>

<template>
  <section class="result-panel" :class="{ compact }">
    <div class="section-title">
      <h2>{{ title || "转换结果" }}</h2>
      <span v-if="busy" class="status-pill running">运行中</span>
      <span v-else-if="result" class="status-pill" :class="statusClass(result.status)">{{ statusText(result.status) }}</span>
    </div>

    <GsapTransition mode="out-in">
      <div
        v-if="!result"
        key="result-empty"
        class="empty-state"
      >
        {{ emptyText || "等待转换" }}
      </div>
      <div
        v-else
        key="result-content"
        class="result-content"
      >
        <p v-if="result.errorMessage" class="error-text">{{ result.errorMessage }}</p>

        <div v-if="result.files.length" class="file-list">
          <button
            v-for="(file, index) in result.files"
            :key="file"
            type="button"
            class="file-item"
            v-gsap-enter="fileItemEnter(index)"
            @click="reveal(file)"
          >
            <i class="ri-search-eye-line" aria-hidden="true"></i>
            <span>{{ file }}</span>
          </button>
        </div>

        <section v-if="issueItems(result).length" class="batch-item-issues" aria-label="未完成项目">
          <strong>未完成项目（{{ issueItems(result).length }}）</strong>
          <article v-for="item in issueItems(result)" :key="`${item.inputPath}:${item.status}`" class="batch-item-issue" :class="item.status">
            <i :class="item.status === 'skipped' ? 'ri-skip-forward-line' : 'ri-error-warning-line'" aria-hidden="true"></i>
            <span>
              <code :title="item.inputPath">{{ item.inputPath }}</code>
              <small>{{ item.errorMessage || (item.status === "skipped" ? "已跳过" : "处理失败") }}</small>
            </span>
          </article>
        </section>

        <details v-if="result.logs.length" class="log-panel">
          <summary>转换日志</summary>
          <pre>{{ result.logs.join("\n") }}</pre>
        </details>
      </div>
    </GsapTransition>
  </section>
</template>

<style scoped>
.batch-item-issues { display: grid; gap: 7px; margin-top: 12px; padding-top: 12px; border-top: 1px solid var(--border); }
.batch-item-issues > strong { color: var(--muted); font-size: 12px; }
.batch-item-issue { display: grid; grid-template-columns: 18px minmax(0, 1fr); gap: 8px; align-items: start; padding: 8px 9px; border: 1px solid var(--border); border-radius: 6px; background: var(--surface-subtle); }
.batch-item-issue.error > i { color: var(--danger); }
.batch-item-issue.skipped > i { color: var(--muted); }
.batch-item-issue span, .batch-item-issue code, .batch-item-issue small { display: block; min-width: 0; }
.batch-item-issue code { overflow: hidden; color: var(--text); font: 11px/1.4 var(--font-mono); text-overflow: ellipsis; white-space: nowrap; }
.batch-item-issue small { margin-top: 3px; color: var(--muted); font-size: 11px; }

.result-panel.compact {
  min-height: 154px;
}

.result-panel.compact > .empty-state {
  min-height: 80px;
}
</style>
