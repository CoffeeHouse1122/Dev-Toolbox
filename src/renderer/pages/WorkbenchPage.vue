<script setup lang="ts">
import { computed, inject } from "vue";
import { RouterLink } from "vue-router";
import { navigationGroupsKey, workbenchRoutes } from "../navigation";

const props = defineProps<{ id: string }>();
const groups = inject(navigationGroupsKey);
const descriptions: Record<string, string> = {
  images: "前端资源生产、体积优化、尺寸处理与交付格式。",
  media: "基于 FFmpeg 的网页媒体兼容、压缩与动画资源生成。",
  font: "Web Font 检查、子集化、转换与 CSS 接入。",
  text: "配置、编码、调试、CSS 与代码交付的前端高频操作。",
  seo: "站点发布前的搜索、分享卡片与元数据资源。",
  system: "文件系统、接口、域名证书与本地网络调试。",
  assist: "前端主职、全栈副职日常会反复使用的小型操作。"
};
const toolHints: Record<string, string> = {
  favicon: "Favicon / App Icon", "svg-toolbox": "Optimize / PNG / WebP", "pwa-icons": "PWA / Android / iOS",
  webp: "WebP / PNG / JPEG / AVIF", "image-compress": "批量体积优化", "image-resize": "批量缩放",
  "image-crop": "可视化裁剪", watermark: "图片 / PDF 水印", "image-placeholder": "BlurHash / LQIP",
  "base64-image": "Data URL", "qr-code": "PNG / SVG", "video-background": "Web background package",
  "video-animation": "GIF / WebP", "sequence-animation": "Frames to animation", "video-mute": "Remove audio track",
  "video-compress": "Web delivery", "video-loop": "网页背景循环预览", "audio-convert": "Format conversion",
  "audio-compress": "Bitrate optimization", woff2: "Web font conversion", "font-preview": "Glyph preview",
  "font-subset": "Reduce payload", "font-face": "CSS generator", "markdown-export": "HTML / PNG / PDF",
  "data-convert": "Config conversion", diff: "Line comparison", jwt: "Decode claims", "url-codec": "URIComponent",
  "code-minify": "Build optimization", "regex-tester": "Match inspector", "css-clamp": "Fluid scale",
  "base64-text": "Multi-encoding", "color-converter": "HEX / RGB / HSL / CMYK", "seo-files": "Crawler files",
  "meta-tags": "Head metadata", "og-image": "Social preview", links: "Developer bookmarks", "ip-query": "IP / DNS",
  "shared-disk": "Windows share", rename: "Batch planner", "asset-manifest": "Hash manifest",
  "certificate-scan": "TLS inspector", timestamp: "Time / epoch", uuid: "UUID v4", hash: "Digest / AES-GCM",
  "clipboard-history": "Clipboard history", "sticky-notes": "Desktop notes", history: "Task history", settings: "Preferences"
};
const workbench = computed(() => {
  const group = groups?.value.find(item => workbenchRoutes[item.id] === `/workbench/${props.id}`);
  return {
    title: group?.label ?? "工具总览",
    description: descriptions[props.id] ?? "从分类中选择工具。",
    tools: (group?.tools ?? []).filter(tool => tool.visible).map(tool => ({ ...tool, hint: toolHints[tool.id] ?? "打开工具" }))
  };
});
</script>

<template>
  <section class="tool-page workbench-page">
    <header class="tool-header workbench-header">
      <div>
        <span class="workbench-code">分类工具总览</span>
        <h2>{{ workbench.title }}</h2>
        <p>{{ workbench.description }}</p>
      </div>
      <span class="status-pill">{{ workbench.tools.length }} 项工具</span>
    </header>

    <div class="workbench-grid">
      <RouterLink
        v-for="(tool, index) in workbench.tools"
        :key="tool.to"
        v-gsap-enter="{ from: { opacity: 0, y: 8 }, delay: Math.min(index * 0.025, 0.18) }"
        :to="tool.to"
        class="workbench-tool-card"
      >
        <i :class="tool.icon" aria-hidden="true"></i>
        <span>
          <strong>{{ tool.label }}</strong>
          <small>{{ tool.hint }}</small>
        </span>
        <i class="ri-arrow-right-up-line workbench-arrow" aria-hidden="true"></i>
      </RouterLink>
    </div>
    <p v-if="!workbench.tools.length" class="empty-state">该分类暂无可见工具，可在导航设置中调整。</p>
  </section>
</template>

<style scoped>
.workbench-page { max-width: 1180px; }
.workbench-header { border-bottom: 1px solid var(--border); padding-bottom: 16px; }
.workbench-code { display: block; margin-bottom: 5px; color: var(--accent-strong); font: 700 11px/1.2 var(--font-mono); letter-spacing: .12em; }
.workbench-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(240px, 1fr)); gap: 10px; }
.workbench-tool-card { display: grid; grid-template-columns: 34px minmax(0, 1fr) 18px; align-items: center; gap: 10px; min-height: 68px; padding: 11px 12px; border: 1px solid var(--border); border-radius: 8px; background: var(--surface); color: var(--text); text-decoration: none; transition: border-color .14s ease, background-color .14s ease; }
.workbench-tool-card:hover { border-color: color-mix(in srgb, var(--accent) 52%, var(--border)); background: color-mix(in srgb, var(--accent) 5%, var(--surface)); }
.workbench-tool-card > i:first-child { display: grid; place-items: center; width: 32px; height: 32px; border-radius: 6px; background: var(--surface-subtle); color: var(--accent-strong); font-size: 17px; }
.workbench-tool-card span { min-width: 0; }
.workbench-tool-card strong, .workbench-tool-card small { display: block; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.workbench-tool-card strong { font-size: 13px; }
.workbench-tool-card small { margin-top: 4px; color: var(--muted); font: 11px/1.2 var(--font-mono); }
.workbench-arrow { color: var(--muted); }
@media (max-width: 640px) { .workbench-grid { grid-template-columns: 1fr; } }
</style>
