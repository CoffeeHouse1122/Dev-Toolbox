<script setup lang="ts">
import { onMounted, ref } from "vue";
import { useThemeStore, type ThemeMode } from "../stores/theme";
import type { AppCloseBehavior, AppSettings } from "../../shared/types";

const theme = useThemeStore();

const settings = ref<AppSettings>({ closeBehavior: "minimize-to-tray" });
const status = ref("");

function setTheme(mode: ThemeMode) {
  theme.setMode(mode);
}

async function loadSettings() {
  settings.value = await window.devToolbox.loadAppSettings();
}

async function setCloseBehavior(value: AppCloseBehavior) {
  settings.value.closeBehavior = value;
  settings.value = await window.devToolbox.saveAppSettings({ ...settings.value });
  status.value = value === "minimize-to-tray" ? "已设置为关闭时最小化到托盘" : "已设置为关闭时直接退出";
}

onMounted(loadSettings);
</script>

<template>
  <section class="tool-page">
    <div class="tool-header">
      <div>
        <h2>设置</h2>
        <p>外观、关闭行为与本地存储</p>
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
        <h3>关闭行为</h3>
        <div class="segmented">
          <button
            type="button"
            :class="{ selected: settings.closeBehavior === 'minimize-to-tray' }"
            @click="setCloseBehavior('minimize-to-tray')"
          >
            <i class="ri-shrink-line" aria-hidden="true" style="margin-right:6px;"></i>
            最小化到托盘
          </button>
          <button
            type="button"
            :class="{ selected: settings.closeBehavior === 'exit' }"
            @click="setCloseBehavior('exit')"
          >
            <i class="ri-shut-down-line" aria-hidden="true" style="margin-right:6px;"></i>
            直接关闭客户端
          </button>
        </div>
        <p v-if="status" class="empty-state">{{ status }}</p>
      </div>

      <div class="settings-block">
        <h3>实例策略</h3>
        <p>仅允许同时运行一个 Dev Toolbox 实例。再次启动客户端时，将自动唤起已开启的窗口。</p>
      </div>

      <div class="settings-block">
        <h3>存储</h3>
        <p>转换历史保存在 Electron 用户数据目录中。</p>
      </div>
    </section>
  </section>
</template>
