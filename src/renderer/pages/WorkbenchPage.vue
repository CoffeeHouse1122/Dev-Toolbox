<script setup lang="ts">
import { computed } from "vue";
import { RouterLink } from "vue-router";

type WorkbenchTool = { to: string; label: string; icon: string; hint: string };
type Workbench = { title: string; code: string; description: string; tools: WorkbenchTool[] };

const props = defineProps<{ id: string }>();

const workbenches: Record<string, Workbench> = {
  images: {
    title: "图片工作台", code: "IMAGE_PIPELINE", description: "从原始图片到网页交付资源的一站式处理。",
    tools: [
      ["/favicon", "图标生成", "ri-star-smile-line", "Favicon / App Icon"],
      ["/webp", "图片优化", "ri-image-edit-line", "格式 / 体积 / 尺寸 / 裁剪 / 占位"],
      ["/watermark", "添加水印", "ri-contrast-drop-2-line", "图片 / PDF / 平铺水印"],
      ["/qr-code", "二维码生成", "ri-qr-code-line", "PNG / SVG"]
    ].map(([to, label, icon, hint]) => ({ to, label, icon, hint }))
  },
  media: {
    title: "音视频工作台", code: "MEDIA_PIPELINE", description: "面向网页发布的音视频转换、优化与动图生产。",
    tools: [
      ["/video-background", "视频发布", "ri-movie-2-line", "MP4 / WebM / HLS / Poster"],
      ["/video-compress", "视频处理", "ri-video-ai-line", "压缩 / 静音 / 循环预览"],
      ["/video-animation", "动图生成", "ri-file-gif-line", "视频 / 序列帧 → GIF / WebP"],
      ["/audio-convert", "音频处理", "ri-music-2-line", "格式转换 / 码率压缩"]
    ].map(([to, label, icon, hint]) => ({ to, label, icon, hint }))
  },
  font: {
    title: "字体工作台", code: "FONT_PIPELINE", description: "完成 Web Font 预览、瘦身、转换与项目接入。",
    tools: [
      ["/woff2", "Web 字体", "ri-font-size-2", "预览 / WOFF2 / 子集化 / @font-face"]
    ].map(([to, label, icon, hint]) => ({ to, label, icon, hint }))
  },
  text: {
    title: "文本与样式工作台", code: "FRONTEND_UTILS", description: "配置、编码、调试、CSS 与代码交付的前端高频操作。",
    tools: [
      ["/markdown-export", "Markdown", "ri-markdown-line", "HTML / PNG / PDF"], ["/data-convert", "JSON/YAML/TOML", "ri-arrow-left-right-line", "配置格式双向转换"],
      ["/diff", "文本 Diff", "ri-swap-line", "逐行差异对比"], ["/jwt", "编码与安全", "ri-shield-keyhole-line", "编码 / Token / 时间 / UUID / Hash·AES"],
      ["/code-minify", "CSS / JS 压缩", "ri-braces-line", "压缩 / Babel / Source Map"],
      ["/regex-tester", "正则测试器", "ri-parentheses-line", "匹配 / 索引 / 捕获组"],
      ["/color-converter", "CSS 实验室", "ri-palette-line", "颜色转换 / Clamp 字号"]
    ].map(([to, label, icon, hint]) => ({ to, label, icon, hint }))
  },
  seo: {
    title: "SEO 发布工作台", code: "WEB_RELEASE", description: "集中准备站点搜索收录、页面元数据与分享素材。",
    tools: [
      ["/seo-files", "站点发布", "ri-global-line", "robots / sitemap / Meta / OG 图片"]
    ].map(([to, label, icon, hint]) => ({ to, label, icon, hint }))
  },
  system: {
    title: "文件与网络工作台", code: "FULLSTACK_IO", description: "个人资源入口、文件批处理与本地网络诊断。",
    tools: [
      ["/links", "网站与文档", "ri-bookmark-3-line", "常用站点 / 开发文档"], ["/ip-query", "网络诊断", "ri-router-line", "IP / DNS / TLS 证书"],
      ["/shared-disk", "共享盘登录", "ri-hard-drive-3-line", "Windows 网络共享"], ["/rename", "文件重命名", "ri-edit-2-line", "批量规则 / 冲突预检"],
      ["/asset-manifest", "资源清单", "ri-file-list-3-line", "体积 / MIME / SHA-256"]
    ].map(([to, label, icon, hint]) => ({ to, label, icon, hint }))
  },
  assist: {
    title: "开发者快捷工作台", code: "QUICK_CONSOLE", description: "保留个人高频使用的本地记录与临时信息入口。",
    tools: [
      ["/clipboard-history", "剪贴板历史", "ri-clipboard-line", "本地记录 / 搜索 / 复用"],
      ["/sticky-notes", "桌面便签", "ri-sticky-note-line", "富文本 / 导入导出 / 归档"]
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
