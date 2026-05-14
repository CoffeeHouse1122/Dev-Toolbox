<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import { useThemeStore, type ThemeMode } from "../stores/theme";
import type { AppCloseBehavior, AppSettings, UpdateStatus } from "../../shared/types";

const theme = useThemeStore();

const settings = ref<AppSettings>({ closeBehavior: "minimize-to-tray", autoLaunch: false });
const status = ref("");

// 更新相关状态
const currentVersion = ref("");
const updateStatus = ref<UpdateStatus | null>(null);
const updateChecking = ref(false);
const updateDownloading = ref(false);
let unsubUpdate: (() => void) | null = null;

function setTheme(mode: ThemeMode) {
  theme.setMode(mode);
}

async function loadSettings() {
  settings.value = await window.devToolbox.loadAppSettings();
}

async function setCloseBehavior(value: AppCloseBehavior) {
  settings.value.closeBehavior = value;
  settings.value = await window.devToolbox.saveAppSettings({ ...settings.value });
  // status.value = value === "minimize-to-tray" ? "已设置为关闭时最小化到托盘" : "已设置为关闭时直接退出";
}

async function setAutoLaunch(value: boolean) {
  settings.value.autoLaunch = value;
  settings.value = await window.devToolbox.saveAppSettings({ ...settings.value });
  // status.value = value ? "已开启开机自启" : "已关闭开机自启";
}

// 手动检查更新
async function handleCheckUpdate() {
  updateChecking.value = true;
  updateStatus.value = { status: "checking" };
  try {
    await window.devToolbox.checkForUpdates();
  } catch {
    // 错误通过 onUpdateStatus 事件推送
  } finally {
    updateChecking.value = false;
  }
}

// 下载更新
async function handleDownloadUpdate() {
  updateDownloading.value = true;
  try {
    await window.devToolbox.downloadUpdate();
  } catch {
    // 错误通过 onUpdateStatus 事件推送
  } finally {
    updateDownloading.value = false;
  }
}

// 安装更新
function handleInstallUpdate() {
  window.devToolbox.installUpdate();
}

onMounted(async () => {
  loadSettings();
  // 获取当前版本号
  try {
    currentVersion.value = await window.devToolbox.getCurrentVersion();
  } catch {
    currentVersion.value = "--";
  }
  // 监听更新状态推送
  unsubUpdate = window.devToolbox.onUpdateStatus((s) => {
    updateStatus.value = s;
    if (s.status === "checking") {
      updateChecking.value = true;
    } else {
      updateChecking.value = false;
    }
    if (s.status === "downloading") {
      updateDownloading.value = true;
    } else if (s.status !== "downloading") {
      updateDownloading.value = false;
    }
  });
});

onUnmounted(() => {
  unsubUpdate?.();
});
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
        <h3>开机自启</h3>
        <label class="settings-toggle-row">
          <input type="checkbox" :checked="settings.autoLaunch" @change="setAutoLaunch(($event.target as HTMLInputElement).checked)" />
          <span>启动 Windows 后自动打开 Dev Toolbox</span>
        </label>
      </div>
      <div class="settings-block">
        <h3>版本更新</h3>
        <p>
          当前版本：<strong>v{{ currentVersion }}</strong>
        </p>
        <p>启动后会自动检查一次新版本。也可随时手动点击下方按钮检测更新。</p>

        <!-- 状态文案 -->
        <p v-if="updateStatus?.status === 'checking'" class="empty-state">
          <i class="ri-loader-4-line ri-spin" aria-hidden="true" style="margin-right:6px;"></i>正在检查更新...
        </p>
        <p v-else-if="updateStatus?.status === 'not-available'" class="empty-state" style="color: var(--success);">
          <i class="ri-check-line" aria-hidden="true" style="margin-right:6px;"></i>当前已是最新版本
        </p>
        <p v-else-if="updateStatus?.status === 'available'" class="empty-state" style="color: var(--accent-strong);">
          <i class="ri-arrow-up-circle-line" aria-hidden="true" style="margin-right:6px;"></i>发现新版本 v{{ updateStatus.version }}
        </p>
        <p v-else-if="updateStatus?.status === 'downloading'" class="empty-state" style="color: var(--accent-strong);">
          <i class="ri-download-line" aria-hidden="true" style="margin-right:6px;"></i>正在下载更新 {{ updateStatus.percent ?? 0 }}%
        </p>
        <p v-else-if="updateStatus?.status === 'downloaded'" class="empty-state" style="color: var(--success);">
          <i class="ri-check-double-line" aria-hidden="true" style="margin-right:6px;"></i>v{{ updateStatus.version }} 已下载完成，可立即安装
        </p>
        <p v-else-if="updateStatus?.status === 'error'" class="empty-state" style="color: var(--danger);">
          <i class="ri-error-warning-line" aria-hidden="true" style="margin-right:6px;"></i>{{ updateStatus.message || '更新检查失败' }}
        </p>

        <!-- 操作按钮 -->
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;">
          <button
            type="button"
            class="secondary-button"
            :disabled="updateChecking || updateDownloading"
            @click="handleCheckUpdate"
          >
            <i class="ri-search-line" aria-hidden="true" style="margin-right:6px;"></i>
            {{ updateChecking ? '检查中...' : '检测更新' }}
          </button>
          <button
            v-if="updateStatus?.status === 'available'"
            type="button"
            class="primary-button"
            :disabled="updateDownloading"
            @click="handleDownloadUpdate"
          >
            <i class="ri-download-line" aria-hidden="true" style="margin-right:6px;"></i>
            {{ updateDownloading ? '下载中...' : '下载更新' }}
          </button>
          <button
            v-if="updateStatus?.status === 'downloaded'"
            type="button"
            class="primary-button"
            @click="handleInstallUpdate"
          >
            <i class="ri-restart-line" aria-hidden="true" style="margin-right:6px;"></i>
            安装更新并重启
          </button>
        </div>
      </div>
    </section>
  </section>
</template>
