<script setup lang="ts">
import { onMounted } from "vue";
import { RouterLink, RouterView } from "vue-router";
import { useThemeStore, type ThemeMode } from "../stores/theme";
import SelectMenu from "./SelectMenu.vue";

const theme = useThemeStore();
const tools = [
  { to: "/favicon", label: "Favicon", icon: "ri-star-smile-line" },
  { to: "/webp", label: "WebP", icon: "ri-image-edit-line" },
  { to: "/woff2", label: "WOFF2", icon: "ri-font-size-2" },
  { to: "/video-background", label: "Video", icon: "ri-movie-2-line" },
  { to: "/history", label: "History", icon: "ri-history-line" },
  { to: "/settings", label: "Settings", icon: "ri-settings-3-line" }
];
const themeOptions = [
  { label: "System", value: "system", icon: "ri-computer-line" },
  { label: "Light", value: "light", icon: "ri-sun-line" },
  { label: "Dark", value: "dark", icon: "ri-moon-line" }
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
          <span>Asset converters</span>
        </div>
      </div>

      <nav class="nav-list" aria-label="Tools">
        <RouterLink v-for="tool in tools" :key="tool.to" :to="tool.to" class="nav-item">
          <i class="nav-icon" :class="tool.icon" aria-hidden="true"></i>
          <span>{{ tool.label }}</span>
        </RouterLink>
      </nav>
    </aside>

    <main class="workspace">
      <header class="topbar">
        <div>
          <span class="eyebrow">Local-first</span>
          <h1>Frontend Asset Toolkit</h1>
        </div>
        <SelectMenu class="theme-menu" :model-value="theme.mode" :options="themeOptions" label="Theme" @update:model-value="setTheme" />
      </header>

      <RouterView />
    </main>
  </div>
</template>
