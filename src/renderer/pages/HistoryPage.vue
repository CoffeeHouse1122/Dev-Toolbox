<script setup lang="ts">
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

function toolText(toolType: string) {
  const map: Record<string, string> = {
    favicon: "图标生成",
    "svg-toolbox": "SVG 工具箱",
    "pwa-icons": "PWA 图标包",
    webp: "图片转换",
    woff2: "WOFF2 转换",
    "video-background": "视频转化",
    "base64-image": "Base64 图片",
    "video-animation": "视频动图",
    "sequence-animation": "序列帧动图",
    "video-mute": "视频去音频",
    "video-compress": "视频压缩",
    "audio-compress": "音频压缩",
    "code-minify": "CSS / JS 压缩",
    "video-loop": "视频循环播放",
    "markdown-export": "Markdown 导出",
    "url-codec": "URL 编解码",
    timestamp: "时间戳",
    uuid: "UUID",
    rename: "文件重命名",
    "batch-rename": "文件重命名",
    "shared-disk": "共享连接",
    "image-compress": "图片压缩",
    "image-resize": "尺寸调整",
    "image-crop": "自由裁剪",
    watermark: "添加水印",
    sprite: "雪碧图",
    "image-placeholder": "图片占位符",
    "ip-query": "IP 查询",
    "qr-code": "二维码生成",
    "audio-convert": "音频转换",
    "regex-tester": "正则测试器",
    "font-preview": "字体预览",
    "font-subset": "字体子集化",
    "font-face": "@font-face",
    "asset-manifest": "资源清单",
    "seo-files": "robots / sitemap",
    "meta-tags": "HTML Meta",
    "css-clamp": "Clamp 字号",
    "og-image": "OG 图片",
    links: "网站与文档",
    jwt: "JWT 解析",
    "data-convert": "JSON / YAML / TOML",
    diff: "文本 Diff",
    "clipboard-history": "剪贴板历史",
    "base64-text": "Base64 文本",
    hash: "Hash / 加解密",
    "color-converter": "颜色转换器",
    "certificate-scan": "证书扫描",
    "sticky-notes": "桌面便签"
  };
  return map[toolType] ?? toolType;
}

onMounted(refresh);
</script>

<template>
  <section class="tool-page history-page">
    <div class="tool-header">
      <div>
        <h2>历史记录</h2>
        <p>点击记录查看详情；打开输出目录请使用右侧按钮</p>
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
        <span class="history-operation-label">操作</span>
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
        <button type="button" class="secondary-button history-open-output" :title="outputHint(record)"
          :disabled="!!openingRecord || !record.outputPath || !!unavailable[record.id]" @click="openOutput(record)">
          {{ openingRecord === record.id ? "打开中…" : unavailable[record.id] ? "位置不可用" : "打开输出目录" }}
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
        <button v-if="selectedRecord" type="button" class="secondary-button" :disabled="!!openingRecord || !selectedRecord.outputPath || !!unavailable[selectedRecord.id]" @click="openOutput(selectedRecord)">打开输出目录</button>
        <button type="button" class="secondary-button history-detail-close" @click="selectedRecord = null">关闭</button>
      </template>
    </AppDialog>
  </section>
</template>

<style scoped>
.history-actions { display: flex; gap: 8px; }
.history-entry { display: grid; grid-template-columns: minmax(0, 1fr) 112px; gap: 8px; align-items: center; }
.history-row { grid-template-columns: 100px 62px minmax(0, 1fr) minmax(0, 1fr) 142px; gap: 8px; min-width: 0; }
.history-row > span { min-width: 0; }
.history-row > span:last-child { font-size: 12px; }
.history-open-output { padding: 5px 8px; font-size: 12px; }
.history-operation-label { color: var(--muted); font-size: 12px; text-align: center; }
.history-details { margin: 0; display: grid; grid-template-columns: 72px minmax(0, 1fr); gap: 12px; }
.history-details dt { color: var(--muted); }
.history-details dd { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
@media (max-width: 1100px) { .history-row { grid-template-columns: 90px 60px minmax(0, 1fr); } .history-row > span:nth-child(4), .history-row > span:nth-child(5) { display: none; } }
</style>
