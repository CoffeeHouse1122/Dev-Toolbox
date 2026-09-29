<script setup lang="ts">
import { computed, inject, onMounted, onUnmounted, ref } from "vue";
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
const updateChecking = computed(() => updateStatus.value?.status === "checking");
const updateDownloading = computed(() => updateStatus.value?.status === "downloading");
const updateInstalling = computed(() => updateStatus.value?.status === "installing");
const updatePending = ref(false);
const canCheckUpdate = computed(() => !updatePending.value && ["idle", "available", "not-available", "error"].includes(updateStatus.value?.status || ""));
let updateEventCount = 0;
let unmounted = false;
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

function applyUpdateStatus(value: UpdateStatus, notify = false) {
  const previous = updateStatus.value?.status;
  updateStatus.value = value;
  if (notify && previous !== value.status && ["available", "downloaded", "error"].includes(value.status)) {
    showWorkspaceToast(value.message || "更新状态已变化", value.status === "error" ? "error" : "info");
  }
}

async function runUpdateAction(action: () => Promise<void>) {
  if (updatePending.value) return;
  updatePending.value = true;
  try { await action(); }
  catch (error) {
    showWorkspaceToast(error instanceof Error ? error.message : "更新操作失败，请重试", "error");
  } finally { updatePending.value = false; }
}

function handleCheckUpdate() { void runUpdateAction(() => window.devToolbox.checkForUpdates()); }
function handleDownloadUpdate() { void runUpdateAction(() => window.devToolbox.downloadUpdate()); }
function handleInstallUpdate() { void runUpdateAction(() => window.devToolbox.installUpdate()); }

onMounted(async () => {
  // Subscribe before requesting a snapshot; a delayed snapshot must not overwrite a newer event.
  unsubUpdate = window.devToolbox.onUpdateStatus((state) => {
    updateEventCount += 1;
    applyUpdateStatus(state, true);
  });
  const eventCount = updateEventCount;
  void window.devToolbox.getUpdateState().then((state) => {
    if (!unmounted && updateEventCount === eventCount) applyUpdateStatus(state);
  }).catch(() => {
    if (!unmounted && updateEventCount === eventCount) applyUpdateStatus({ status: "error", message: "无法读取更新状态，请重新检查" });
  });
  void loadSettings();
  void loadDiagnostics();
  try { currentVersion.value = await window.devToolbox.getCurrentVersion(); }
  catch { currentVersion.value = "--"; }
});

onUnmounted(() => {
  unmounted = true;
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
        <p>从 GitHub Releases 获取稳定版更新。启动 12 秒后自动检查，下载和安装由你确认。</p>

        <p role="status" aria-live="polite">{{ updateStatus?.message || "正在读取更新状态…" }}</p>
        <progress v-if="updateDownloading" :value="updateStatus?.percent || 0" max="100" aria-label="更新下载进度"></progress>
        <p v-if="updateStatus?.activeTasks" class="settings-helper-text">文件任务正在处理，完成后可安装更新。</p>

        <!-- 操作按钮 -->
        <div style="display:flex;gap:8px;flex-wrap:wrap;margin-top:12px;">
          <button
            type="button"
            class="secondary-button"
            :disabled="!canCheckUpdate"
            @click="handleCheckUpdate"
          >
            <i class="ri-search-line" aria-hidden="true" style="margin-right:6px;"></i>
            {{ updateChecking ? '检查中...' : '检测更新' }}
          </button>
          <button
            v-if="updateStatus?.status === 'available'"
            type="button"
            class="primary-button"
            :disabled="updatePending || updateDownloading"
            @click="handleDownloadUpdate"
          >
            <i class="ri-download-line" aria-hidden="true" style="margin-right:6px;"></i>
            {{ updateDownloading ? '下载中...' : '下载更新' }}
          </button>
          <button
            v-if="updateStatus?.status === 'downloaded' || updateInstalling"
            type="button"
            class="primary-button"
            :disabled="updatePending || updateInstalling || Boolean(updateStatus?.activeTasks)"
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
