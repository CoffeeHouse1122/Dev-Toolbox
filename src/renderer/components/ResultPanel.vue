<script setup lang="ts">
import { computed, onActivated, onDeactivated, ref, watch } from "vue";
import { reportWorkspaceError, showWorkspaceToast } from "../composables/useWorkspaceToast";
import type { ConversionItemResult, ConversionResult } from "../../shared/types";
import GsapTransition from "./GsapTransition.vue";
import AppDialog from "./AppDialog.vue";

const props = defineProps<{
  result: ConversionResult | null;
  busy: boolean;
  title?: string;
  emptyText?: string;
  compact?: boolean;
  paged?: boolean;
}>();

const page = ref(0);
const detailsOpen = ref(false);
const pageSize = 6;
const pageCount = computed(() => Math.max(1, Math.ceil((props.result?.files.length ?? 0) / pageSize)));
const visibleFiles = computed(() => props.paged
  ? props.result?.files.slice(page.value * pageSize, (page.value + 1) * pageSize) ?? []
  : props.result?.files ?? []);
watch(() => props.result, () => { page.value = 0; detailsOpen.value = false; });

let active = true;
onActivated(() => { active = true; });
onDeactivated(() => { active = false; detailsOpen.value = false; });
watch(() => props.result, result => {
  if (active && result && ["error", "failed", "partial"].includes(result.status)) {
    showWorkspaceToast(result.errorMessage || "任务未全部完成，请查看结果详情。", "error", 7000);
  }
});

async function reveal(path: string) {
  try { await window.devToolbox.revealPath(path); }
  catch (cause) { reportWorkspaceError(cause, "打开结果失败"); }
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
  <section class="result-panel" :class="{ compact, paged }">
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
        <div v-if="result.files.length" class="file-list">
          <button
            v-for="(file, index) in visibleFiles"
            :key="file"
            type="button"
            class="file-item"
            :title="file"
            :aria-label="file"
            v-gsap-enter="fileItemEnter(index)"
            @click="reveal(file)"
          >
            <i class="ri-search-eye-line" aria-hidden="true"></i>
            <span>{{ paged ? file.split(/[\\/]/).pop() : file }}</span>
          </button>
        </div>

        <div v-else-if="paged" class="paged-empty">未生成输出文件</div>

        <section v-if="!paged && issueItems(result).length" class="batch-item-issues" aria-label="未完成项目">
          <strong>未完成项目（{{ issueItems(result).length }}）</strong>
          <article v-for="item in issueItems(result)" :key="`${item.inputPath}:${item.status}`" class="batch-item-issue" :class="item.status">
            <i :class="item.status === 'skipped' ? 'ri-skip-forward-line' : 'ri-error-warning-line'" aria-hidden="true"></i>
            <span>
              <code :title="item.inputPath">{{ item.inputPath }}</code>
              <small>{{ item.errorMessage || (item.status === "skipped" ? "已跳过" : "处理失败") }}</small>
            </span>
          </article>
        </section>

        <details v-if="!paged && (result.logs.length || result.errorMessage)" class="log-panel">
          <summary>{{ result.errorMessage ? "查看任务详情" : "转换日志" }}</summary>
          <pre>{{ [result.errorMessage, ...result.logs].filter(Boolean).join("\n") }}</pre>
        </details>
        <div v-if="paged" class="result-toolbar">
          <span>共 {{ result.files.length }} 个文件</span>
          <nav v-if="pageCount > 1" aria-label="结果分页">
            <button type="button" class="icon-button" title="上一页" :disabled="page === 0" @click="page--"><i class="ri-arrow-left-s-line"></i></button>
            <span aria-live="polite">{{ page + 1 }} / {{ pageCount }}</span>
            <button type="button" class="icon-button" title="下一页" :disabled="page + 1 >= pageCount" @click="page++"><i class="ri-arrow-right-s-line"></i></button>
          </nav>
          <button v-if="result.logs.length || result.errorMessage || issueItems(result).length" type="button" class="secondary-button result-details-button" @click="detailsOpen = true">{{ result.errorMessage ? "任务详情" : "转换日志" }}</button>
        </div>
      </div>
    </GsapTransition>
    <AppDialog v-if="paged" :open="detailsOpen" title="转换日志与任务详情" @close="detailsOpen = false">
      <template v-if="result">
        <p v-if="result.errorMessage">{{ result.errorMessage }}</p>
        <div v-for="item in issueItems(result)" :key="item.inputPath" class="result-dialog-issue">
          <strong>{{ item.inputPath }}</strong>
          <span>{{ item.errorMessage || '已跳过' }}</span>
        </div>
        <pre class="result-dialog-log">{{ result.logs.join('\n') || '没有额外日志。' }}</pre>
      </template>
      <template #actions><button type="button" class="secondary-button" @click="detailsOpen = false">关闭</button></template>
    </AppDialog>
  </section>
</template>

<style scoped>
.paged .file-list { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; max-height: none; padding: 0; overflow: visible; }
.paged .file-item { grid-template-columns: 20px minmax(0, 1fr); gap: 5px; min-height: 32px; padding: 5px 7px; font-size: 12px; }
.paged .file-item i { width: 20px; height: 20px; }
.paged .result-content { display: flex; flex-direction: column; gap: 8px; }
.result-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: auto; min-height: 32px; color: var(--muted); font-size: 11px; }
.result-toolbar nav { display: flex; align-items: center; gap: 6px; }
.result-toolbar .icon-button { width: 28px; height: 28px; }
.result-toolbar .secondary-button { font-size: 12px; }
.paged-empty { color: var(--muted); padding: 10px 0; }
.result-dialog-log { max-height: 50vh; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; font-size: 12px; }
.result-dialog-issue { display: grid; gap: 4px; margin-bottom: 12px; }
@media (max-width: 720px) { .paged .file-list { grid-template-columns: repeat(2, minmax(0, 1fr)); } .result-toolbar { flex-wrap: wrap; } }
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
