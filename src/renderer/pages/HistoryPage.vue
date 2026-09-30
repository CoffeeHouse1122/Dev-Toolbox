<script setup lang="ts">
import ToolTitle from "../components/ToolTitle.vue";
import { useToolName } from "../composables/useToolName";
import { onDeactivated, onMounted, ref } from "vue";
import type { ConversionRecord } from "../../shared/types";
import AppDialog from "../components/AppDialog.vue";
import { showWorkspaceToast } from "../composables/useWorkspaceToast";

const records = ref<ConversionRecord[]>([]);
const selectedRecord = ref<ConversionRecord | null>(null);
const openingRecord = ref("");
const unavailable = ref<Record<string, string>>({});
const loading = ref(false);
onDeactivated(() => { selectedRecord.value = null; });

function outputHint(record: ConversionRecord) {
  return unavailable.value[record.id] || (!record.outputPath ? "该记录没有输出位置" : "打开输出目录（文件记录打开所在目录）");
}

async function openOutput(record: ConversionRecord) {
  if (!record.outputPath || openingRecord.value || unavailable.value[record.id]) return;
  openingRecord.value = record.id;
  try {
    const result = await window.devToolbox.openHistoryOutput(record.id);
    if (result.status !== "opened") {
      const message = result.message || "无法打开输出目录，请刷新后重试。";
      if (result.status === "missing") unavailable.value[record.id] = message;
      showWorkspaceToast(message, result.status === "blocked" ? "info" : "error");
    }
  } catch {
    showWorkspaceToast("无法打开历史输出目录，请刷新后重试。", "error");
  } finally {
    openingRecord.value = "";
  }
}

function formatTime(value: string | null) {
  if (!value) return "—";
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? value : date.toLocaleString("zh-CN", { hour12: false });
}

async function refresh() {
  loading.value = true;
  try {
    records.value = await window.devToolbox.listHistory(120);
    unavailable.value = {};
    selectedRecord.value = null;
  } catch {
    showWorkspaceToast("历史记录读取失败，请稍后重试。", "error");
  } finally { loading.value = false; }
}

async function clearHistory() {
  try { await window.devToolbox.clearHistory(); await refresh(); }
  catch { showWorkspaceToast("历史记录清空失败，请稍后重试。", "error"); }
}

function statusText(status: string) {
  return ({
    queued: "等待中",
    running: "运行中",
    interrupted: "异常中断",
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

const toolName = useToolName();
function toolText(toolType: string) {
  if (toolType === "sprite") return "雪碧图";
  return toolName(toolType === "batch-rename" ? "rename" : toolType);
}

onMounted(refresh);
</script>

<template>
  <section class="tool-page history-page">
    <div class="tool-header">
      <div>
        <ToolTitle tool-id="history" />
        <p>点击记录查看详情，可在详情中打开输出目录</p>
      </div>
      <div class="history-actions">
        <button type="button" class="secondary-button history-refresh" :disabled="loading || !!openingRecord" @click="refresh">刷新</button>
        <button type="button" class="secondary-button" :disabled="loading || !!openingRecord" @click="clearHistory">
          <i class="ri-delete-bin-line" aria-hidden="true"></i>
          清空
        </button>
      </div>
    </div>

    <section class="history-table">
      <div class="history-entry">
        <div class="history-row table-head">
          <span>工具</span>
          <span>状态</span>
          <span>源文件</span>
          <span>输出目录</span>
          <span>完成时间</span>
        </div>
      </div>
      <div
        v-for="record in records"
        :key="record.id"
        class="history-entry"
      >
        <button
          type="button"
          class="history-row"
          title="查看记录详情"
          @click="selectedRecord = record"
        >
          <span>{{ toolText(record.toolType) }}</span>
          <span class="status-pill" :class="statusClass(record.status)">{{ statusText(record.status) }}</span>
          <span :title="record.sourcePath">{{ record.sourcePath || "—" }}</span>
          <span :title="record.outputPath">{{ record.outputPath || "—" }}</span>
          <span :title="record.finishedAt || record.createdAt">{{ formatTime(record.finishedAt || record.createdAt) }}</span>
        </button>
      </div>
      <div v-if="records.length === 0" class="empty-state">{{ loading ? "加载中…" : "暂无记录" }}</div>
    </section>
    <AppDialog :open="!!selectedRecord" title="历史记录详情" @close="selectedRecord = null">
      <dl v-if="selectedRecord" class="history-details">
        <dt>工具</dt><dd>{{ toolText(selectedRecord.toolType) }}</dd>
        <dt>任务状态</dt><dd>{{ statusText(selectedRecord.status) }}（记录当时的执行结果）</dd>
        <dt>源文件</dt><dd>{{ selectedRecord.sourcePath || "—" }}</dd>
        <dt>输出位置</dt><dd>{{ selectedRecord.outputPath || "无输出位置" }}</dd>
        <dt>创建时间</dt><dd>{{ formatTime(selectedRecord.createdAt) }}</dd>
        <dt>完成时间</dt><dd>{{ formatTime(selectedRecord.finishedAt) }}</dd>
        <template v-if="selectedRecord.errorMessage"><dt>失败原因</dt><dd>{{ selectedRecord.errorMessage }}</dd></template>
        <template v-if="unavailable[selectedRecord.id]"><dt>位置状态</dt><dd>{{ unavailable[selectedRecord.id] }} 刷新列表后可重试。</dd></template>
      </dl>
      <template #actions>
        <button v-if="selectedRecord" type="button" class="secondary-button history-open-output" :title="outputHint(selectedRecord)"
          :disabled="!!openingRecord || !selectedRecord.outputPath || !!unavailable[selectedRecord.id]" @click="openOutput(selectedRecord)">
          {{ openingRecord === selectedRecord.id ? "打开中…" : unavailable[selectedRecord.id] ? "位置不可用" : "打开输出目录" }}
        </button>
        <button type="button" class="secondary-button history-detail-close" @click="selectedRecord = null">关闭</button>
      </template>
    </AppDialog>
  </section>
</template>

<style scoped>
.history-actions { display: flex; gap: 8px; }
.history-entry { display: grid; grid-template-columns: minmax(0, 1fr); }
.history-row { grid-template-columns: 100px 62px minmax(0, 1fr) minmax(0, 1fr) 142px; gap: 8px; min-width: 0; }
.history-row > span { min-width: 0; }
.history-row > span:last-child { font-size: 12px; }
.history-details { margin: 0; display: grid; grid-template-columns: 72px minmax(0, 1fr); gap: 12px; }
.history-details dt { color: var(--muted); }
.history-details dd { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
@media (max-width: 1100px) { .history-row { grid-template-columns: 90px 60px minmax(0, 1fr); } .history-row > span:nth-child(4), .history-row > span:nth-child(5) { display: none; } }
</style>
