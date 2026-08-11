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
    "shared-disk": "共享盘登录",
    "image-compress": "图片压缩",
    "image-resize": "尺寸调整",
    "image-crop": "自由裁剪",
    watermark: "添加水印",
    sprite: "雪碧图",
    "image-placeholder": "图片占位符",
    "mark-man": "Mark Man",
    "ip-query": "IP 查询",
    "qr-code": "二维码生成",
    "audio-convert": "音频转换",
    "regex-tester": "正则测试器",
    "font-preview": "字体预览",
    "font-subset": "字体子集化",
    "font-face": "@font-face",
    "css-variables": "CSS 变量",
    "asset-manifest": "资源清单",
    "seo-files": "robots / sitemap",
    "meta-tags": "HTML Meta",
    "css-clamp": "Clamp 字号",
    "og-image": "OG 图片",
    links: "网站与文档",
    jwt: "JWT 解析",
    "data-convert": "JSON / YAML / TOML",
    diff: "文本 Diff",
    "color-palette": "配色生成器",
    "code-screenshot": "代码截图",
    "clipboard-history": "剪贴板历史",
    "base64-text": "Base64 文本",
    hash: "Hash / 加解密",
    "color-converter": "颜色转换器",
    "http-tester": "HTTP 测试器",
    "certificate-scan": "证书扫描",
    "capture-proxy": "抓包工具",
    "sticky-notes": "桌面便签"
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
        @click="record.outputPath && window.devToolbox.revealPath(record.outputPath)"
      >
        <span>{{ toolText(record.toolType) }}</span>
        <span class="status-pill" :class="statusClass(record.status)">{{ statusText(record.status) }}</span>
        <span>{{ record.sourcePath }}</span>
        <span>{{ record.outputPath }}</span>
        <span>{{ record.finishedAt || record.createdAt }}</span>
      </button>
      <div v-if="records.length === 0" class="empty-state">暂无记录</div>
    </section>
  </section>
</template>
