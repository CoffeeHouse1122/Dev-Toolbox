<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import type { SharedDiskConfig, SharedDiskConnectResult, SharedDiskStatus } from "../../shared/types";
import Checkbox from "../components/Checkbox.vue";
import TaskFlowLayout from "../components/TaskFlowLayout.vue";
import { showWorkspaceToast } from "../composables/useWorkspaceToast";

const config = ref<SharedDiskConfig>({
  url: "http://10.0.15.5:5000",
  username: "",
  password: "",
  basePath: "",
  defaultDirectory: "",
  persistent: true
});
const busy = ref(false);
const lastResult = ref<SharedDiskConnectResult | null>(null);
const diskStatus = ref<SharedDiskStatus>({ connected: false, shareRoot: "", message: "未检查" });
let pollTimer: ReturnType<typeof setInterval> | null = null;

const canConnect = computed(() => config.value.url && config.value.basePath && config.value.username && config.value.password);
const openTarget = computed(() => config.value.defaultDirectory || lastResult.value?.baseUncPath || "");
const connectionLabel = computed(() => busy.value ? "运行中" : diskStatus.value.connected ? "已连接" : "未连接");

function friendlyError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/^Error invoking remote method '[^']+': Error:\s*/i, "")
    .replace(/^Error invoking remote method \"[^\"]+\": Error:\s*/i, "");
}

function plainConfig(): SharedDiskConfig {
  return {
    url: config.value.url,
    username: config.value.username,
    password: config.value.password,
    basePath: config.value.basePath,
    defaultDirectory: config.value.defaultDirectory,
    persistent: config.value.persistent
  };
}

async function loadConfig() {
  config.value = await window.devToolbox.loadSharedDiskConfig();
  await refreshStatus();
}

async function refreshStatus() {
  if (!config.value.url || !config.value.basePath) {
    diskStatus.value = { connected: false, shareRoot: "", message: "未配置共享路径" };
    return;
  }
  try {
    diskStatus.value = await window.devToolbox.getSharedDiskStatus(plainConfig());
  } catch (error) {
    diskStatus.value = { connected: false, shareRoot: "", message: friendlyError(error) };
  }
}

async function saveConfig() {
  busy.value = true;
  try {
    config.value = await window.devToolbox.saveSharedDiskConfig(plainConfig());
    showWorkspaceToast("配置已保存", "success");
  } catch (error) {
    showWorkspaceToast(friendlyError(error), "error");
  } finally {
    busy.value = false;
  }
}

async function connect() {
  if (!canConnect.value) return;
  busy.value = true;
  try {
    lastResult.value = await window.devToolbox.connectSharedDisk(plainConfig());
    showWorkspaceToast(lastResult.value.message, "success");
    await refreshStatus();
  } catch (error) {
    showWorkspaceToast(friendlyError(error), "error");
  } finally {
    busy.value = false;
  }
}

async function disconnect() {
  busy.value = true;
  try {
    lastResult.value = await window.devToolbox.disconnectSharedDisk(plainConfig());
    showWorkspaceToast(lastResult.value.message, "success");
    await refreshStatus();
  } catch (error) {
    showWorkspaceToast(friendlyError(error), "error");
  } finally {
    busy.value = false;
  }
}

async function openDefaultDirectory() {
  const target = openTarget.value;
  if (!target) return;
  busy.value = true;
  try {
    await window.devToolbox.openSharedDiskDirectory(target);
    showWorkspaceToast("已打开默认目录", "success");
  } catch (error) {
    showWorkspaceToast(friendlyError(error), "error");
  } finally {
    busy.value = false;
  }
}

onMounted(() => {
  void loadConfig();
  pollTimer = setInterval(refreshStatus, 6000);
});

onBeforeUnmount(() => {
  if (pollTimer) clearInterval(pollTimer);
});
</script>

<template>
  <TaskFlowLayout
    title="共享盘登录"
    description="记录 Windows 共享凭据，快速连接并打开默认目录"
    source-title="共享目标"
    source-description="填写服务器地址和共享路径，状态会每 6 秒自动检查"
    settings-title="凭据与目录"
    settings-description="设置 Windows 登录凭据、默认打开位置和连接持久性"
    preview-title="连接状态"
    preview-description="查看当前连接、最近操作结果并快速打开共享目录"
    :file-label="busy ? '处理中' : connectionLabel"
  >
    <template #source>
      <div class="disk-target-grid">
        <label class="field">
          <span>共享盘地址</span>
          <input v-model="config.url" placeholder="http://10.0.15.5:5000 或 10.0.15.5" />
        </label>
        <label class="field">
          <span>基础路径</span>
          <input v-model="config.basePath" placeholder="/共享名/子目录，例如 /需求素材同步共享" />
        </label>
      </div>
    </template>

    <template #settings>
      <div class="option-grid disk-credential-grid">
        <label class="field">
          <span>账号</span>
          <input v-model="config.username" autocomplete="username" />
        </label>
        <label class="field">
          <span>密码</span>
          <input v-model="config.password" type="password" autocomplete="current-password" />
        </label>
        <label class="field span-2">
          <span>打开文件默认目录</span>
          <input v-model="config.defaultDirectory" placeholder="例如 \\10.0.15.5\需求素材同步共享" />
        </label>
        <Checkbox v-model="config.persistent" class="check-row span-2" label="Windows 持久连接" />
      </div>

      <p class="warning-banner disk-security-note">
        密码仅用于本机 Windows 共享连接；系统安全存储不可用时，重启后需要重新输入。
      </p>
    </template>

    <template #preview-actions>
      <span
        class="status-pill"
        :class="{ success: diskStatus.connected, error: !diskStatus.connected && !busy, running: busy }"
      >{{ connectionLabel }}</span>
    </template>

    <template #preview>
      <div class="disk-status-content">
        <div class="disk-status-card" :class="{ connected: diskStatus.connected, running: busy }">
          <i :class="diskStatus.connected ? 'ri-hard-drive-3-line' : 'ri-link-unlink-m'" aria-hidden="true"></i>
          <div>
            <strong>{{ connectionLabel }}</strong>
            <span>{{ diskStatus.message }}</span>
          </div>
        </div>

        <button v-if="openTarget" type="button" class="file-item disk-directory" :disabled="busy" @click="openDefaultDirectory">
          <i class="ri-folder-open-line" aria-hidden="true"></i>
          <span>{{ openTarget }}</span>
        </button>

        <div v-if="lastResult" class="disk-operation-result">
          <i class="ri-checkbox-circle-line" aria-hidden="true"></i>
          <div>
            <strong>最近操作</strong>
            <span>{{ lastResult.message }}</span>
          </div>
        </div>

        <div class="disk-status-actions">
          <button type="button" class="secondary-button" :disabled="busy" @click="refreshStatus">
            <i class="ri-refresh-line" aria-hidden="true"></i>
            刷新状态
          </button>
          <button type="button" class="secondary-button" :disabled="busy" @click="disconnect">
            <i class="ri-logout-box-line" aria-hidden="true"></i>
            断开连接
          </button>
        </div>
      </div>
    </template>

    <template #summary>
      <i :class="diskStatus.connected ? 'ri-link' : 'ri-link-unlink'" aria-hidden="true"></i>
      <span>{{ busy ? "正在处理共享盘请求" : diskStatus.message }}</span>
    </template>

    <template #actions>
      <button type="button" class="secondary-button" :disabled="busy" @click="saveConfig">
        <i class="ri-save-line" aria-hidden="true"></i>
        保存配置
      </button>
      <button type="button" class="primary-button" :disabled="!canConnect || busy" @click="connect">
        <i class="ri-login-box-line" aria-hidden="true"></i>
        {{ busy ? "处理中…" : "登录共享盘" }}
      </button>
    </template>
  </TaskFlowLayout>
</template>

<style scoped>
.disk-target-grid {
  display: grid;
  grid-template-columns: minmax(280px, 0.9fr) minmax(320px, 1.1fr);
  gap: 12px;
}

.disk-security-note {
  margin: 0;
}

.disk-status-content {
  display: grid;
  align-content: start;
  gap: 12px;
  width: 100%;
  min-height: 100%;
}

.disk-status-card,
.disk-operation-result {
  display: grid;
  grid-template-columns: 44px minmax(0, 1fr);
  gap: 12px;
  align-items: center;
  padding: 14px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface-subtle);
}

.disk-status-card > i,
.disk-operation-result > i {
  display: grid;
  place-items: center;
  width: 44px;
  height: 44px;
  border-radius: 10px;
  background: color-mix(in srgb, var(--danger) 10%, transparent);
  color: var(--danger);
  font-size: 23px;
}

.disk-status-card.connected > i,
.disk-operation-result > i {
  background: color-mix(in srgb, var(--success) 12%, transparent);
  color: var(--success);
}

.disk-status-card.running > i {
  background: color-mix(in srgb, var(--accent) 12%, transparent);
  color: var(--accent-strong);
}

.disk-status-card div,
.disk-operation-result div {
  display: grid;
  gap: 5px;
  min-width: 0;
}

.disk-status-card span,
.disk-operation-result span {
  color: var(--muted);
  font-size: 12px;
  overflow-wrap: anywhere;
}

.disk-directory {
  min-height: 44px;
}

.disk-status-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 8px;
  margin-top: auto;
}

@media (max-width: 900px) {
  .disk-target-grid {
    grid-template-columns: 1fr;
  }
}

@media (max-width: 520px) {
  .disk-credential-grid {
    grid-template-columns: 1fr;
  }

  .disk-credential-grid .span-2 {
    grid-column: 1;
  }
}
</style>
