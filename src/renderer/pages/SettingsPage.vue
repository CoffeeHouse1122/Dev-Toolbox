<script setup lang="ts">
import { onMounted, onUnmounted, ref } from "vue";
import { useThemeStore, type ThemeMode } from "../stores/theme";
import type { AppCloseBehavior, AppDiagnostics, AppSettings, UpdateStatus } from "../../shared/types";

const theme = useThemeStore();

const settings = ref<AppSettings>({ closeBehavior: "minimize-to-tray", autoLaunch: false });
const status = ref("");
const diagnostics = ref<AppDiagnostics | null>(null);
const diagnosticsBusy = ref(false);

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

async function loadDiagnostics() {
  diagnosticsBusy.value = true;
  try {
    diagnostics.value = await window.devToolbox.getAppDiagnostics();
  } finally {
    diagnosticsBusy.value = false;
  }
}

function openPath(targetPath: string) {
  void window.devToolbox.revealPath(targetPath);
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
  loadDiagnostics();
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
    } else {
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
      <div class="settings-block diagnostics-block">
        <div class="settings-block-head">
          <h3>诊断</h3>
          <button type="button" class="secondary-button" :disabled="diagnosticsBusy" @click="loadDiagnostics">
            <i class="ri-refresh-line" aria-hidden="true"></i>
            {{ diagnosticsBusy ? "刷新中" : "刷新" }}
          </button>
        </div>
        <div class="diagnostics-grid">
          <div class="diagnostic-path-row">
            <span>用户数据目录</span>
            <code :title="diagnostics?.userDataDir || ''">{{ diagnostics?.userDataDir || "加载中..." }}</code>
            <button type="button" class="secondary-button" :disabled="!diagnostics?.userDataDir" @click="diagnostics && openPath(diagnostics.userDataDir)">打开</button>
          </div>
          <div class="diagnostic-path-row">
            <span>日志目录</span>
            <code :title="diagnostics?.logsDir || ''">{{ diagnostics?.logsDir || "加载中..." }}</code>
            <button type="button" class="secondary-button" :disabled="!diagnostics?.logsDir" @click="diagnostics && openPath(diagnostics.logsDir)">打开</button>
          </div>
          <div class="diagnostic-port-list">
            <div v-for="item in diagnostics?.ports || []" :key="item.port" class="diagnostic-port-row">
              <span>{{ item.label }}</span>
              <code>{{ item.port }}</code>
              <strong :class="item.inUse ? 'busy' : 'free'">{{ item.inUse ? "占用" : "空闲" }}</strong>
            </div>
          </div>
        </div>
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

<style scoped>
.settings-block-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.settings-block-head h3 {
  margin: 0;
}

.diagnostics-grid {
  display: grid;
  gap: 8px;
}

.diagnostic-path-row,
.diagnostic-port-row {
  display: grid;
  grid-template-columns: 104px minmax(0, 1fr) auto;
  gap: 10px;
  align-items: center;
  min-width: 0;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface-subtle);
}

.diagnostic-path-row span,
.diagnostic-port-row span {
  color: var(--muted);
  font-size: 12px;
  font-weight: 800;
}

.diagnostic-path-row code,
.diagnostic-port-row code {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-family: var(--font-mono);
  font-size: 12px;
}

.diagnostic-port-list {
  display: grid;
  gap: 8px;
}

.diagnostic-port-row strong {
  font-size: 12px;
}

.diagnostic-port-row strong.busy {
  color: var(--danger);
}

.diagnostic-port-row strong.free {
  color: var(--success);
}
</style>
