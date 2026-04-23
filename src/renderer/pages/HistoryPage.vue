<script setup lang="ts">
import { onMounted, ref } from "vue";
import type { ConversionRecord } from "../../shared/types";

const records = ref<ConversionRecord[]>([]);

async function refresh() {
  records.value = await window.devToolbox.listHistory(120);
}

async function clearHistory() {
  await window.devToolbox.clearHistory();
  await refresh();
}

function statusText(status: string) {
  return status === "success" ? "成功" : "失败";
}

function toolText(toolType: string) {
  const map: Record<string, string> = {
    favicon: "图标生成",
    webp: "图片转换",
    woff2: "字体转换",
    "video-background": "视频背景"
  };
  return map[toolType] ?? toolType;
}

onMounted(refresh);
</script>

<template>
  <section class="tool-page">
    <div class="tool-header">
      <div>
        <h2>历史记录</h2>
        <p>本地 SQLite 转换记录</p>
      </div>
      <button type="button" class="secondary-button" @click="clearHistory">
        <i class="ri-delete-bin-line" aria-hidden="true"></i>
        清空
      </button>
    </div>

    <section class="history-table">
      <div class="history-row table-head">
        <span>工具</span>
        <span>状态</span>
        <span>源文件</span>
        <span>输出目录</span>
        <span>完成时间</span>
      </div>
      <button
        v-for="record in records"
        :key="record.id"
        type="button"
        class="history-row"
        @click="window.devToolbox.revealPath(record.outputPath)"
      >
        <span>{{ toolText(record.toolType) }}</span>
        <span class="status-pill" :class="record.status">{{ statusText(record.status) }}</span>
        <span>{{ record.sourcePath }}</span>
        <span>{{ record.outputPath }}</span>
        <span>{{ record.finishedAt || record.createdAt }}</span>
      </button>
      <div v-if="records.length === 0" class="empty-state">暂无记录</div>
    </section>
  </section>
</template>
