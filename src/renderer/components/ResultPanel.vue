<script setup lang="ts">
import { computed, onActivated, onDeactivated, ref, watch, watchEffect } from "vue";
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
}>();

const page = ref(0);
const detailsOpen = ref(false);
const content = ref<HTMLElement>();
const fileList = ref<HTMLElement>();
const toolbar = ref<HTMLElement>();
const pageSize = ref(1);
const pageCount = computed(() => Math.max(1, Math.ceil((props.result?.files.length ?? 0) / pageSize.value)));
const visibleFiles = computed(() => props.result?.files.slice(page.value * pageSize.value, (page.value + 1) * pageSize.value) ?? []);
watch(() => props.result, () => { page.value = 0; detailsOpen.value = false; });
watch(pageCount, count => { page.value = Math.min(page.value, count - 1); });

// Derive capacity from the allocated result area, not from its overflowing contents.
watchEffect(onCleanup => {
  const body = content.value;
  const list = fileList.value;
  const actions = toolbar.value;
  if (!props.result?.files.length || !body || !list || !actions) return;
  const updateCapacity = () => {
    if (!body.clientHeight) return;
    const style = getComputedStyle(list);
    const columns = style.gridTemplateColumns.split(" ").length;
    const gap = parseFloat(style.rowGap) || 0;
    const rowHeight = list.querySelector<HTMLElement>(".file-item")?.offsetHeight || 32;
    const available = body.clientHeight - actions.offsetHeight - (parseFloat(getComputedStyle(body).rowGap) || 0);
    const rows = Math.max(1, Math.floor((available + gap) / (rowHeight + gap)));
    pageSize.value = Math.min(6, rows * columns);
  };
  const observer = new ResizeObserver(updateCapacity);
  [body, list, actions].forEach(el => observer.observe(el));
  updateCapacity();
  onCleanup(() => observer.disconnect());
}, { flush: "post" });

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
  <section class="result-panel paged" :class="{ compact }">
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
        ref="content"
        class="result-content"
      >
        <div v-if="result.files.length" ref="fileList" class="file-list" :class="{ 'single-file': result.files.length === 1 }">
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
            <span>{{ file.split(/[\\/]/).pop() }}</span>
          </button>
        </div>

        <div v-else class="paged-empty">未生成输出文件</div>
        <div ref="toolbar" class="result-toolbar">
          <span>共 {{ result.files.length }} 个文件</span>
          <nav v-if="pageCount > 1" aria-label="结果分页">
            <button type="button" class="icon-button" title="上一页" :disabled="page === 0" @click="page--"><i class="ri-arrow-left-s-line"></i></button>
            <span aria-live="polite">{{ page + 1 }} / {{ pageCount }}</span>
            <button type="button" class="icon-button" title="下一页" :disabled="page + 1 >= pageCount" @click="page++"><i class="ri-arrow-right-s-line"></i></button>
          </nav>
          <button v-if="result.logs.length || result.errorMessage || issueItems(result).length" type="button" class="secondary-button result-details-button" @click="detailsOpen = true">{{ result.errorMessage || issueItems(result).length ? "任务详情" : "转换日志" }}</button>
        </div>
      </div>
    </GsapTransition>
    <AppDialog :open="detailsOpen" title="转换日志与任务详情" @close="detailsOpen = false">
      <template v-if="result">
        <p v-if="result.errorMessage">{{ result.errorMessage }}</p>
        <div v-for="item in issueItems(result)" :key="item.inputPath" class="result-dialog-issue">
          <strong>{{ item.inputPath }}</strong>
          <span>{{ item.errorMessage || (item.status === 'skipped' ? '已跳过' : '处理失败') }}</span>
        </div>
        <pre class="result-dialog-log">{{ result.logs.join('\n') || '没有额外日志。' }}</pre>
      </template>
      <template #actions><button type="button" class="secondary-button" @click="detailsOpen = false">关闭</button></template>
    </AppDialog>
  </section>
</template>

<style scoped>
.result-panel.paged { gap: 8px; }
.result-panel.paged .section-title { padding-bottom: 8px; }
.paged .file-list { grid-template-columns: repeat(3, minmax(0, 1fr)); gap: 6px; max-height: none; padding: 0; overflow: visible; }
.paged .file-list.single-file { grid-template-columns: minmax(0, 1fr); }
.paged .file-item { grid-template-columns: 20px minmax(0, 1fr); gap: 5px; min-height: 32px; padding: 5px 7px; font-size: 12px; }
.paged .file-item i { width: 20px; height: 20px; }
.result-panel.paged .result-content { display: flex; flex-direction: column; gap: 8px; overflow: visible; }
.paged .file-list, .paged-empty, .result-toolbar { flex-shrink: 0; }
.result-toolbar { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-top: auto; min-height: 32px; color: var(--muted); font-size: 11px; }
.result-toolbar nav { display: flex; align-items: center; gap: 6px; }
.result-toolbar .icon-button { width: 28px; height: 28px; }
.result-toolbar .secondary-button { font-size: 12px; }
.paged-empty { display: flex; align-items: center; min-height: 32px; color: var(--muted); }
.result-dialog-log { max-height: 50vh; overflow: auto; white-space: pre-wrap; overflow-wrap: anywhere; font-size: 12px; }
.result-dialog-issue { display: grid; gap: 4px; margin-bottom: 12px; overflow-wrap: anywhere; }
@media (max-width: 720px) { .paged .file-list { grid-template-columns: repeat(2, minmax(0, 1fr)); } .result-toolbar { flex-wrap: wrap; } }

.result-panel.compact {
  min-height: 154px;
}

.result-panel.compact > .empty-state {
  min-height: 80px;
}
</style>
