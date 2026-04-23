<script setup lang="ts">
import { useThemeStore, type ThemeMode } from "../stores/theme";

const theme = useThemeStore();

function setTheme(mode: ThemeMode) {
  theme.setMode(mode);
}
</script>

<template>
  <section class="tool-page">
    <div class="tool-header">
      <div>
        <h2>设置</h2>
        <p>外观和本地存储</p>
      </div>
    </div>

    <section class="settings-grid">
      <div class="settings-block">
        <h3>主题</h3>
        <div class="segmented">
          <button type="button" :class="{ selected: theme.mode === 'system' }" @click="setTheme('system')">跟随系统</button>
          <button type="button" :class="{ selected: theme.mode === 'light' }" @click="setTheme('light')">浅色</button>
          <button type="button" :class="{ selected: theme.mode === 'dark' }" @click="setTheme('dark')">深色</button>
        </div>
      </div>

      <div class="settings-block">
        <h3>存储</h3>
        <p>转换历史保存在 Electron 用户数据目录中。</p>
      </div>
    </section>
  </section>
</template>
