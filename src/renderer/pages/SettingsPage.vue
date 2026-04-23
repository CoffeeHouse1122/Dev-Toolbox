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
        <h2>Settings</h2>
        <p>Appearance and storage</p>
      </div>
    </div>

    <section class="settings-grid">
      <div class="settings-block">
        <h3>Theme</h3>
        <div class="segmented">
          <button type="button" :class="{ selected: theme.mode === 'system' }" @click="setTheme('system')">System</button>
          <button type="button" :class="{ selected: theme.mode === 'light' }" @click="setTheme('light')">Light</button>
          <button type="button" :class="{ selected: theme.mode === 'dark' }" @click="setTheme('dark')">Dark</button>
        </div>
      </div>

      <div class="settings-block">
        <h3>Storage</h3>
        <p>Conversion history is stored in the Electron user data directory.</p>
      </div>
    </section>
  </section>
</template>

