<script setup lang="ts">
import { inject, onMounted, onUnmounted, ref } from "vue";
import { useThemeStore, type ThemeMode, type UiFont } from "../stores/theme";
import type { AppCloseBehavior, AppDiagnostics, AppSettings, UpdateStatus } from "../../shared/types";
import Checkbox from "../components/Checkbox.vue";
import { showWorkspaceToast } from "../composables/useWorkspaceToast";

const theme = useThemeStore();

const settings = ref<AppSettings>({ closeBehavior: "minimize-to-tray", autoLaunch: false });
const diagnostics = ref<AppDiagnostics | null>(null);
const diagnosticsBusy = ref(false);

// 更新相关状态
const currentVersion = ref("");
const updateStatus = ref<UpdateStatus | null>(null);
const updateChecking = ref(false);
const updateDownloading = ref(false);
const updateInstalling = ref(false);
let unsubUpdate: (() => void) | null = null;
const openProvidedNavEditor = inject<() => void>("openNavEditor");
const fontOptions: Array<{ value: UiFont; label: string; sample: string }> = [
  { value: "source-han", label: "默认字体", sample: "清晰、稳健，适合长时间使用" },
  { value: "zcool-kuaile", label: "ZCOOL KuaiLe", sample: "前端工具箱 Aa 123" },
  { value: "wdxl-lubrifont", label: "WDXL Lubrifont SC", sample: "前端工具箱 Aa 123" }
];

function setTheme(mode: ThemeMode) {
  theme.setMode(mode);
}

function setUiFont(font: UiFont) {
  theme.setUiFont(font);
  showWorkspaceToast("界面字体已切换", "success");
}

async function loadSettings() {
  settings.value = await window.devToolbox.loadAppSettings();
}

async function setCloseBehavior(value: AppCloseBehavior) {
  settings.value.closeBehavior = value;
  settings.value = await window.devToolbox.saveAppSettings({ ...settings.value });
}

async function setAutoLaunch(value: boolean) {
  settings.value.autoLaunch = value;
  settings.value = await window.devToolbox.saveAppSettings({ ...settings.value });
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

function openNavEditor() {
  openProvidedNavEditor?.();
}

function notifyUpdateStatus(value: UpdateStatus) {
  if (value.status === "checking") {
    showWorkspaceToast("正在检查更新…");
  } else if (value.status === "not-available") {
    showWorkspaceToast("当前已是最新版本", "success");
  } else if (value.status === "available") {
    showWorkspaceToast(`发现新版本 v${value.version ?? "--"}`);
  } else if (value.status === "downloading") {
    showWorkspaceToast(`正在下载更新 ${value.percent ?? 0}%`);
  } else if (value.status === "downloaded") {
    showWorkspaceToast(`v${value.version ?? "--"} 已下载完成，可立即安装`, "success");
  } else {
    showWorkspaceToast(value.message || "更新检查失败", "error");
  }
}

// 手动检查更新
async function handleCheckUpdate() {
  updateChecking.value = true;
  updateStatus.value = { status: "checking" };
  notifyUpdateStatus(updateStatus.value);
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

// Keep the action locked after a successful request because the main process
// intentionally waits for the installer spawn event before quitting the app.
async function handleInstallUpdate() {
  if (updateInstalling.value) return;
  updateInstalling.value = true;
  showWorkspaceToast("正在启动安装…");
  try {
    await window.devToolbox.installUpdate();
  } catch (error) {
    updateInstalling.value = false;
    updateStatus.value = {
      status: "error",
      message: error instanceof Error ? error.message : String(error)
    };
    notifyUpdateStatus(updateStatus.value);
  }
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
    notifyUpdateStatus(s);
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
    if (s.status === "error") updateInstalling.value = false;
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
        <div class="settings-block-head">
          <h3>界面字体</h3>
          <span class="settings-current-value">{{ fontOptions.find((option) => option.value === theme.uiFont)?.label }}</span>
        </div>
        <div class="font-choice-grid" role="radiogroup" aria-label="界面字体">
          <button
            v-for="option in fontOptions"
            :key="option.value"
            type="button"
            class="font-choice"
            :class="[{ selected: theme.uiFont === option.value }, `font-choice-${option.value}`]"
            role="radio"
            :aria-checked="theme.uiFont === option.value"
            @click="setUiFont(option.value)"
          >
            <strong>{{ option.label }}</strong>
            <span>{{ option.sample }}</span>
          </button>
        </div>
        <p class="settings-helper-text">仅切换工具箱界面字体，代码与终端内容继续使用等宽字体。</p>
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
      </div>

      <div class="settings-block">
        <h3>开机自启</h3>
        <Checkbox class="settings-toggle-row" :model-value="settings.autoLaunch" label="启动 Windows 后自动打开 Dev Toolbox" @update:model-value="setAutoLaunch" />
      </div>
      <div class="settings-block">
        <div class="settings-block-head">
          <h3>导航管理</h3>
          <button type="button" class="secondary-button" @click="openNavEditor">
            <i class="ri-list-settings-line" aria-hidden="true"></i>
            编辑导航
          </button>
        </div>
        <p class="settings-helper-text">调整左侧工具分组、显示状态和置顶顺序。</p>
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
            :disabled="updateInstalling"
            @click="handleInstallUpdate"
          >
            <i :class="updateInstalling ? 'ri-loader-4-line ri-spin' : 'ri-restart-line'" aria-hidden="true" style="margin-right:6px;"></i>
            {{ updateInstalling ? '正在启动安装...' : '安装更新并重启' }}
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

.settings-helper-text {
  margin: 10px 0 0;
  color: var(--muted);
  font-size: 13px;
  line-height: 1.7;
}

.settings-current-value {
  color: var(--muted);
  font-size: 12px;
}

.font-choice-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.font-choice {
  display: grid;
  gap: 5px;
  min-width: 0;
  padding: 11px 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  color: var(--text);
  text-align: left;
  cursor: pointer;
}

.font-choice:hover {
  background: var(--surface-subtle);
}

.font-choice.selected {
  border-color: var(--accent);
  color: var(--accent-strong);
  background: color-mix(in srgb, var(--accent) 12%, transparent);
}

.font-choice strong,
.font-choice span {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.font-choice span {
  color: var(--muted);
  font-size: 13px;
}

.font-choice-source-han {
  font-family: "Source Han Sans CN", ui-sans-serif, system-ui, sans-serif;
}

.font-choice-zcool-kuaile {
  font-family: "ZCOOL KuaiLe", "Source Han Sans CN", sans-serif;
}

.font-choice-wdxl-lubrifont {
  font-family: "WDXL Lubrifont SC", "Source Han Sans CN", sans-serif;
}

@media (max-width: 760px) {
  .font-choice-grid {
    grid-template-columns: 1fr;
  }
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
