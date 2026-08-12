<script setup lang="ts">
import { computed } from "vue";
import { RouterLink } from "vue-router";

type WorkbenchTool = { to: string; label: string; icon: string; hint: string };
type Workbench = { title: string; code: string; description: string; tools: WorkbenchTool[] };

const props = defineProps<{ id: string }>();

const workbenches: Record<string, Workbench> = {
  images: {
    title: "图片工作台", code: "IMAGE_PIPELINE", description: "前端资源生产、体积优化、尺寸处理与交付格式。",
    tools: [
      ["/favicon", "图标生成", "ri-star-smile-line", "Favicon / App Icon"], ["/webp", "图片转换", "ri-image-edit-line", "WebP / PNG / JPEG / AVIF"],
      ["/image-compress", "图片压缩", "ri-image-2-line", "批量体积优化"], ["/image-resize", "尺寸调整", "ri-crop-line", "批量缩放"],
      ["/image-crop", "自由裁剪", "ri-scissors-cut-line", "可视化裁剪"], ["/watermark", "添加水印", "ri-contrast-drop-2-line", "图片 / PDF 水印"],
      ["/sprite", "雪碧图", "ri-layout-grid-line", "CSS Sprite"], ["/image-placeholder", "图片占位符", "ri-blur-off-line", "BlurHash / LQIP"],
      ["/mark-man", "Mark Man", "ri-ruler-line", "测量与标注"], ["/base64-image", "Base64 图片", "ri-code-line", "Data URL"],
      ["/qr-code", "二维码生成", "ri-qr-code-line", "PNG / SVG"]
    ].map(([to, label, icon, hint]) => ({ to, label, icon, hint }))
  },
  media: {
    title: "音视频工作台", code: "MEDIA_PIPELINE", description: "基于 FFmpeg 的网页媒体兼容、压缩与动画资源生成。",
    tools: [
      ["/video-background", "视频转化", "ri-movie-2-line", "Web background package"], ["/video-animation", "视频动图", "ri-file-gif-line", "GIF / WebP"],
      ["/sequence-animation", "序列帧动图", "ri-film-line", "Frames to animation"], ["/video-mute", "视频去音频", "ri-volume-mute-line", "Remove audio track"],
      ["/video-compress", "视频压缩", "ri-video-ai-line", "Web delivery"], ["/video-loop", "视频循环播放", "ri-loop-left-line", "Loop analysis"],
      ["/audio-convert", "音频转换", "ri-music-2-line", "Format conversion"], ["/audio-compress", "音频压缩", "ri-volume-down-line", "Bitrate optimization"]
    ].map(([to, label, icon, hint]) => ({ to, label, icon, hint }))
  },
  font: {
    title: "字体工作台", code: "FONT_PIPELINE", description: "Web Font 检查、子集化、转换与 CSS 接入。",
    tools: [
      ["/woff2", "WOFF2 转换", "ri-font-size-2", "Web font conversion"], ["/font-preview", "字体预览", "ri-font-sans-serif", "Glyph preview"],
      ["/font-subset", "字体子集化", "ri-scissors-cut-line", "Reduce payload"], ["/font-face", "@font-face", "ri-braces-line", "CSS generator"]
    ].map(([to, label, icon, hint]) => ({ to, label, icon, hint }))
  },
  text: {
    title: "文本与样式工作台", code: "FRONTEND_UTILS", description: "配置、编码、调试、CSS 与代码交付的前端高频操作。",
    tools: [
      ["/markdown-export", "Markdown", "ri-markdown-line", "HTML / PNG / PDF"], ["/data-convert", "JSON/YAML/TOML", "ri-arrow-left-right-line", "Config conversion"],
      ["/diff", "文本 Diff", "ri-swap-line", "Line comparison"], ["/jwt", "JWT 解析", "ri-key-2-line", "Decode claims"],
      ["/url-codec", "URL 编解码", "ri-links-line", "URIComponent"], ["/code-minify", "CSS / JS 压缩", "ri-braces-line", "Build optimization"],
      ["/regex-tester", "正则测试器", "ri-parentheses-line", "Match inspector"],
      ["/css-clamp", "Clamp 字号", "ri-font-size", "Fluid scale"],
      ["/code-screenshot", "代码截图", "ri-camera-3-line", "Shareable snippet"], ["/base64-text", "Base64 文本", "ri-text-block", "Multi-encoding"],
      ["/color-converter", "颜色转换器", "ri-contrast-drop-line", "HEX / RGB / HSL / CMYK"]
    ].map(([to, label, icon, hint]) => ({ to, label, icon, hint }))
  },
  seo: {
    title: "SEO 发布工作台", code: "WEB_RELEASE", description: "站点发布前的搜索、分享卡片与元数据资源。",
    tools: [
      ["/seo-files", "robots / sitemap", "ri-road-map-line", "Crawler files"], ["/meta-tags", "HTML Meta", "ri-meta-line", "Head metadata"],
      ["/og-image", "OG 图片", "ri-image-add-line", "Social preview"]
    ].map(([to, label, icon, hint]) => ({ to, label, icon, hint }))
  },
  system: {
    title: "文件与网络工作台", code: "FULLSTACK_IO", description: "文件系统、接口、域名证书与本地网络调试。",
    tools: [
      ["/links", "网站与文档", "ri-bookmark-3-line", "Developer bookmarks"], ["/ip-query", "IP 查询", "ri-router-line", "IP / DNS"],
      ["/shared-disk", "共享盘登录", "ri-hard-drive-3-line", "Windows share"], ["/rename", "文件重命名", "ri-edit-2-line", "Batch planner"],
      ["/asset-manifest", "资源清单", "ri-file-list-3-line", "Hash manifest"], ["/http-tester", "HTTP 测试器", "ri-send-plane-line", "API request"],
      ["/certificate-scan", "证书扫描", "ri-shield-check-line", "TLS inspector"], ["/capture-proxy", "抓包工具", "ri-radar-line", "Local MITM proxy"]
    ].map(([to, label, icon, hint]) => ({ to, label, icon, hint }))
  },
  assist: {
    title: "开发者快捷工作台", code: "QUICK_CONSOLE", description: "前端主职、全栈副职日常会反复使用的小型操作。",
    tools: [
      ["/timestamp", "时间戳", "ri-time-line", "Date / epoch"], ["/uuid", "UUID", "ri-fingerprint-line", "UUID v4"],
      ["/hash", "Hash / 加解密", "ri-shield-keyhole-line", "Digest / AES-GCM"], ["/clipboard-history", "剪贴板历史", "ri-clipboard-line", "Local clipboard"],
      ["/sticky-notes", "桌面便签", "ri-sticky-note-line", "Developer notes"]
    ].map(([to, label, icon, hint]) => ({ to, label, icon, hint }))
  }
};

const workbench = computed(() => workbenches[props.id] ?? workbenches.text);
</script>

<template>
  <section class="tool-page workbench-page">
    <header class="tool-header workbench-header">
      <div>
        <span class="workbench-code">{{ workbench.code }}</span>
        <h2>{{ workbench.title }}</h2>
        <p>{{ workbench.description }}</p>
      </div>
      <span class="status-pill success">{{ workbench.tools.length }} TOOLS</span>
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
