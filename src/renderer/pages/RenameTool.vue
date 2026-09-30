<script setup lang="ts">
import { computed, ref, watch } from "vue";
import type { ConversionResult } from "../../shared/types";
import DropZone from "../components/DropZone.vue";
import ResultPanel from "../components/ResultPanel.vue";
import TaskFlowLayout from "../components/TaskFlowLayout.vue";

const input = ref<string[]>([]);
const pattern = ref("{name}-{n}");
const start = ref(1);
const replaceFrom = ref("");
const replaceTo = ref("");
const busy = ref(false);
const result = ref<ConversionResult | null>(null);
const planPage = ref(0);
const planPageSize = 2;
const planPageCount = computed(() => Math.max(1, Math.ceil(input.value.length / planPageSize)));
watch(input, () => { planPage.value = Math.min(planPage.value, planPageCount.value - 1); });

function previewSafeName(value: string) {
  let next = value
    .normalize("NFC")
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "-")
    .replace(/[. ]+$/g, "")
    .trim();
  next = Array.from(next).slice(0, 180).join("").replace(/[. ]+$/g, "");
  if (!next || next === "." || next === "..") next = "untitled";
  if (/^(?:con|prn|aux|nul|com[1-9]|lpt[1-9])$/i.test(next)) next = `_${next}`;
  return next;
}

const previewRows = computed(() =>
  input.value.map((filePath, index) => {
    const name = filePath.split(/[\\/]/).pop() ?? filePath;
    const dotIndex = name.lastIndexOf(".");
    const base = dotIndex > 0 ? name.slice(0, dotIndex) : name;
    const ext = dotIndex > 0 ? name.slice(dotIndex) : "";
    const serial = String(start.value + index).padStart(3, "0");
    const replaced = replaceFrom.value ? base.replaceAll(replaceFrom.value, replaceTo.value) : base;
    const next = pattern.value.replaceAll("{name}", replaced).replaceAll("{n}", serial);
    return { path: filePath, from: name, to: `${previewSafeName(next)}${ext.normalize("NFC")}` };
  })
);
const visiblePlanRows = computed(() => previewRows.value.slice(planPage.value * planPageSize, (planPage.value + 1) * planPageSize));

async function run(dryRun = false) {
  if (!input.value.length) return;
  busy.value = true;
  try {
    result.value = await window.devToolbox.renameFiles({
      inputPaths: [...input.value],
      pattern: pattern.value,
      start: start.value,
      replaceFrom: replaceFrom.value || undefined,
      replaceTo: replaceTo.value,
      dryRun
    });
  } finally {
    busy.value = false;
  }
}
</script>

<template>
  <TaskFlowLayout
    class="rename-page"
    title="文件名重命名"
    description="支持单个或批量，使用 {name} 和 {n} 生成新名称"
    source-title="待重命名文件"
    source-description="按队列顺序生成序号，执行前可先校验完整计划"
    settings-title="命名规则"
    settings-description="新文件名会自动规避系统禁止字符"
    preview-title="名称计划"
    preview-description=""
    :file-count="input.length"
  >
    <template #source>
      <DropZone
        v-model="input"
        title="拖入待重命名文件"
        action-label="添加文件"
        compact
        append-selection
        :page-size="2"
        :multiple="true"
      />
    </template>

    <template #settings>
      <div class="option-grid rename-options">
        <label class="field span-2"><span>命名模式</span><input v-model="pattern" /></label>
        <label class="field span-2"><span>起始序号</span><input v-model.number="start" type="number" min="0" /></label>
        <label class="field"><span>查找</span><input v-model="replaceFrom" /></label>
        <label class="field"><span>替换为</span><input v-model="replaceTo" /></label>
      </div>
      <p class="rename-hint"><code>{name}</code> 表示原文件名，<code>{n}</code> 表示补零序号。</p>
    </template>

    <template #preview>
      <div v-if="previewRows.length" class="rename-preview task-flow-rename-preview">
        <div class="rename-row table-head"><span>原文件名</span><span>新文件名</span></div>
        <div v-for="row in visiblePlanRows" :key="row.path" class="rename-row">
          <span :title="row.from">{{ row.from }}</span>
          <span :title="row.to">{{ row.to }}</span>
        </div>
        <nav v-if="planPageCount > 1" class="plan-pagination" aria-label="名称计划分页">
          <span>共 {{ previewRows.length }} 个文件</span>
          <button type="button" class="icon-button" title="上一页计划" :disabled="planPage === 0" @click="planPage--"><i class="ri-arrow-left-s-line"></i></button>
          <span aria-live="polite">{{ planPage + 1 }} / {{ planPageCount }}</span>
          <button type="button" class="icon-button" title="下一页计划" :disabled="planPage + 1 >= planPageCount" @click="planPage++"><i class="ri-arrow-right-s-line"></i></button>
        </nav>
      </div>
      <div v-else class="empty-state task-flow-rename-empty">添加文件后实时显示名称计划</div>
    </template>

    <template #result>
      <ResultPanel :result="result" :busy="busy" title="执行结果" empty-text="校验或重命名后在此显示结果" compact />
    </template>

    <template #summary>
      <i class="ri-file-list-3-line" aria-hidden="true"></i>
      <span>{{ input.length ? `${input.length} 个文件 · 从 ${start} 开始编号` : "添加文件后可校验计划" }}</span>
    </template>
    <template #actions>
      <button type="button" class="secondary-button" :disabled="!input.length || busy" @click="run(true)">
        <i class="ri-shield-check-line" aria-hidden="true"></i>
        校验计划
      </button>
      <button type="button" class="primary-button" :disabled="!input.length || busy" @click="run(false)">
        <i class="ri-edit-2-line" aria-hidden="true"></i>
        {{ busy ? "处理中…" : "重命名" }}
      </button>
    </template>
  </TaskFlowLayout>
</template>

<style scoped>
.task-flow-rename-preview {
  align-content: start;
  gap: 4px;
  padding: 6px 8px;
}
.task-flow-rename-preview .rename-row { min-height: 26px; font-size: 12px; }
.field, .field input { min-width: 0; }
.rename-page :deep(.task-flow-preview-panel .panel-heading p:empty) { display: none; }
.plan-pagination { display: flex; align-items: center; justify-content: flex-end; gap: 6px; color: var(--muted); font-size: 11px; }
.plan-pagination > span:first-child { margin-right: auto; }
.plan-pagination .icon-button { width: 26px; height: 28px; }
.rename-page :deep(.result-panel.paged .file-item) { min-height: 26px; padding: 3px 7px; }
.rename-page :deep(.result-toolbar) { min-height: 28px; }

.task-flow-rename-empty {
  height: 100%;
  min-height: 0;
}

.rename-hint {
  margin: 0;
  padding: 10px;
  border-radius: 6px;
  color: var(--muted);
  background: var(--surface-subtle);
  font-size: 12px;
  line-height: 1.5;
}

.rename-hint code {
  color: var(--accent-strong);
  font-family: var(--font-mono);
  font-weight: 700;
}

@media (min-width: 1121px) and (min-height: 721px) {
  .rename-page :deep(.task-flow-source-panel > .panel-heading) { align-items: center; margin-bottom: 8px; }
  .rename-page :deep(.task-flow-source-panel .panel-heading > div:first-child) { display: flex; align-items: center; gap: 14px; }
  .rename-page :deep(.task-flow-source-panel .panel-heading p) { margin: 0; font-size: 12px; }
  .rename-page :deep(.task-flow-workbench) { grid-template-columns: minmax(0, 0.78fr) minmax(0, 1.22fr); }
  .rename-page :deep(.task-flow-layout.has-preview .task-flow-output-column) { grid-template-rows: minmax(0, 1fr) 180px; }
}
</style>
