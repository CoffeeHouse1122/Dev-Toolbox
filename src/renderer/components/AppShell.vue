<script setup lang="ts">
import { onMounted } from "vue";
import { RouterLink, RouterView } from "vue-router";
import { useThemeStore, type ThemeMode } from "../stores/theme";
import SelectMenu from "./SelectMenu.vue";

const theme = useThemeStore();

const groups = [
  {
    label: "图片",
    tools: [
      { to: "/favicon", label: "图标生成", icon: "ri-star-smile-line" },
      { to: "/webp", label: "图片转换", icon: "ri-image-edit-line" },
      { to: "/image-compress", label: "图片压缩", icon: "ri-image-2-line" },
      { to: "/image-resize", label: "尺寸调整", icon: "ri-crop-line" },
      { to: "/image-crop", label: "自由裁剪", icon: "ri-scissors-cut-line" },
      { to: "/base64-image", label: "Base64 图片", icon: "ri-code-line" },
      { to: "/qr-code", label: "二维码生成", icon: "ri-qr-code-line" }
    ]
  },
  {
    label: "音视频",
    tools: [
      { to: "/video-background", label: "视频转化", icon: "ri-movie-2-line" },
      { to: "/video-animation", label: "视频动图", icon: "ri-file-gif-line" },
      { to: "/video-mute", label: "视频去音频", icon: "ri-volume-mute-line" },
      { to: "/audio-convert", label: "音频转换", icon: "ri-music-2-line" }
    ]
  },
  {
    label: "字体",
    tools: [
      { to: "/woff2", label: "WOFF2 转换", icon: "ri-font-size-2" },
      { to: "/font-preview", label: "字体预览", icon: "ri-font-sans-serif" },
      { to: "/font-subset", label: "字体子集化", icon: "ri-scissors-cut-line" },
      { to: "/font-face", label: "@font-face", icon: "ri-braces-line" }
    ]
  },
  {
    label: "文本与 CSS",
    tools: [
      { to: "/markdown-export", label: "Markdown", icon: "ri-markdown-line" },
      { to: "/url-codec", label: "URL 编解码", icon: "ri-links-line" },
      { to: "/regex-tester", label: "正则测试器", icon: "ri-parentheses-line" },
      { to: "/css-variables", label: "CSS 变量", icon: "ri-css3-line" }
    ]
  },
  {
    label: "文件与网络",
    tools: [
      { to: "/ip-query", label: "IP 查询", icon: "ri-router-line" },
      { to: "/shared-disk", label: "共享盘登录", icon: "ri-hard-drive-3-line" },
      { to: "/rename", label: "文件重命名", icon: "ri-edit-2-line" },
      { to: "/asset-manifest", label: "资源清单", icon: "ri-file-list-3-line" }
    ]
  },
  {
    label: "开发辅助",
    tools: [
      { to: "/timestamp", label: "时间戳", icon: "ri-time-line" },
      { to: "/uuid", label: "UUID", icon: "ri-fingerprint-line" }
    ]
  },
  {
    label: "系统",
    tools: [
      { to: "/history", label: "历史记录", icon: "ri-history-line" },
      { to: "/settings", label: "设置", icon: "ri-settings-3-line" }
    ]
  }
];

const themeOptions = [
  { label: "跟随系统", value: "system", icon: "ri-computer-line" },
  { label: "浅色", value: "light", icon: "ri-sun-line" },
  { label: "深色", value: "dark", icon: "ri-moon-line" }
];

onMounted(() => {
  theme.sync();
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", theme.sync);
});

function setTheme(value: string) {
  theme.setMode(value as ThemeMode);
}
</script>

<template>
  <div class="app-shell">
    <aside class="sidebar">
      <div class="brand">
        <div class="brand-mark">D</div>
        <div>
          <strong>Dev Toolbox</strong>
          <span>前端资源工具箱</span>
        </div>
      </div>

      <nav class="nav-list grouped-nav" aria-label="工具">
        <section v-for="group in groups" :key="group.label" class="nav-group">
          <h2>{{ group.label }}</h2>
          <RouterLink v-for="tool in group.tools" :key="tool.to" :to="tool.to" class="nav-item">
            <i class="nav-icon" :class="tool.icon" aria-hidden="true"></i>
            <span>{{ tool.label }}</span>
          </RouterLink>
        </section>
      </nav>
    </aside>

    <main class="workspace">
      <header class="topbar">
        <div>
          <span class="eyebrow">本地优先</span>
          <h1>前端资源工具箱</h1>
        </div>
        <SelectMenu class="theme-menu" :model-value="theme.mode" :options="themeOptions" label="主题" @update:model-value="setTheme" />
      </header>

      <RouterView />
    </main>
  </div>
</template>
