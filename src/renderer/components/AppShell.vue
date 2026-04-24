<script setup lang="ts">
import { onMounted } from "vue";
import { RouterLink, RouterView } from "vue-router";
import { useThemeStore, type ThemeMode } from "../stores/theme";
import SelectMenu from "./SelectMenu.vue";

const theme = useThemeStore();
const tools = [
  { to: "/favicon", label: "图标生成", icon: "ri-star-smile-line" },
  { to: "/webp", label: "图片转换", icon: "ri-image-edit-line" },
  { to: "/image-compress", label: "图片压缩", icon: "ri-image-2-line" },
  { to: "/image-resize", label: "尺寸调整", icon: "ri-crop-line" },
  { to: "/base64-image", label: "Base64 图片", icon: "ri-code-line" },
  { to: "/woff2", label: "字体转换", icon: "ri-font-size-2" },
  { to: "/video-background", label: "视频转化", icon: "ri-movie-2-line" },
  { to: "/video-animation", label: "视频动图", icon: "ri-file-gif-line" },
  { to: "/video-mute", label: "视频去音频", icon: "ri-volume-mute-line" },
  { to: "/markdown-export", label: "Markdown", icon: "ri-markdown-line" },
  { to: "/url-codec", label: "URL 编解码", icon: "ri-links-line" },
  { to: "/timestamp", label: "时间戳", icon: "ri-time-line" },
  { to: "/uuid", label: "UUID", icon: "ri-fingerprint-line" },
  { to: "/rename", label: "文件重命名", icon: "ri-edit-2-line" },
  { to: "/history", label: "历史记录", icon: "ri-history-line" },
  { to: "/settings", label: "设置", icon: "ri-settings-3-line" }
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
          <span>前端资源转换</span>
        </div>
      </div>

      <nav class="nav-list" aria-label="工具">
        <RouterLink v-for="tool in tools" :key="tool.to" :to="tool.to" class="nav-item">
          <i class="nav-icon" :class="tool.icon" aria-hidden="true"></i>
          <span>{{ tool.label }}</span>
        </RouterLink>
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
