<script setup lang="ts">
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import type { SharedDiskConfig, SharedDiskConnectResult, SharedDiskStatus } from "../../shared/types";

const config = ref<SharedDiskConfig>({
  url: "http://10.0.15.5:5000",
  username: "",
  password: "",
  basePath: "",
  defaultDirectory: "",
  persistent: true
});
const busy = ref(false);
const status = ref("");
const lastResult = ref<SharedDiskConnectResult | null>(null);
const diskStatus = ref<SharedDiskStatus>({ connected: false, shareRoot: "", message: "未检查" });
let pollTimer: ReturnType<typeof setInterval> | null = null;

const canConnect = computed(() => config.value.url && config.value.basePath && config.value.username && config.value.password);

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
    diskStatus.value = { connected: false, shareRoot: "", message: error instanceof Error ? error.message : String(error) };
  }
}

async function saveConfig() {
  busy.value = true;
  try {
    config.value = await window.devToolbox.saveSharedDiskConfig(plainConfig());
    status.value = "配置已保存";
  } catch (error) {
    status.value = error instanceof Error ? error.message : String(error);
  } finally {
    busy.value = false;
  }
}

async function connect() {
  if (!canConnect.value) return;
  busy.value = true;
  try {
    lastResult.value = await window.devToolbox.connectSharedDisk(plainConfig());
    status.value = lastResult.value.message;
    await refreshStatus();
  } catch (error) {
    status.value = error instanceof Error ? error.message : String(error);
  } finally {
    busy.value = false;
  }
}

async function disconnect() {
  busy.value = true;
  try {
    lastResult.value = await window.devToolbox.disconnectSharedDisk(plainConfig());
    status.value = lastResult.value.message;
    await refreshStatus();
  } catch (error) {
    status.value = error instanceof Error ? error.message : String(error);
  } finally {
    busy.value = false;
  }
}

async function openDefaultDirectory() {
  const target = config.value.defaultDirectory || lastResult.value?.baseUncPath || "";
  if (!target) return;
  busy.value = true;
  try {
    await window.devToolbox.openSharedDiskDirectory(target);
    status.value = "已打开默认目录";
  } catch (error) {
    status.value = error instanceof Error ? error.message : String(error);
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
  <section class="tool-page">
    <div class="tool-header">
      <div>
        <h2>共享盘登录</h2>
        <p>记录 Windows 共享凭据，快速连接并打开默认目录</p>
      </div>
      <div class="header-actions">
        <button type="button" class="secondary-button" :disabled="busy" @click="saveConfig">
          <i class="ri-save-line" aria-hidden="true"></i>
          保存
        </button>
        <button type="button" class="primary-button" :disabled="!canConnect || busy" @click="connect">
          <i class="ri-login-box-line" aria-hidden="true"></i>
          登录
        </button>
      </div>
    </div>

    <div class="tool-layout">
      <section class="tool-main">
        <div class="option-grid">
          <label class="field span-2">
            <span>共享盘地址</span>
            <input v-model="config.url" placeholder="http://10.0.15.5:5000 或 10.0.15.5" />
          </label>
          <label class="field">
            <span>账号</span>
            <input v-model="config.username" autocomplete="username" />
          </label>
          <label class="field">
            <span>密码</span>
            <input v-model="config.password" type="password" autocomplete="current-password" />
          </label>
          <label class="field span-2">
            <span>基础路径</span>
            <input v-model="config.basePath" placeholder="/共享名/子目录，例如 /需求素材同步共享" />
          </label>
          <label class="field span-2">
            <span>打开文件默认目录</span>
            <input v-model="config.defaultDirectory" placeholder="例如 \\10.0.15.5\需求素材同步共享" />
          </label>
          <label class="check-row span-2">
            <input v-model="config.persistent" type="checkbox" />
            <span>Windows 持久连接</span>
          </label>
        </div>
      </section>

      <aside class="result-panel">
        <div class="section-title">
          <h2>连接状态</h2>
          <span
            class="status-pill"
            :class="{ success: diskStatus.connected, error: !diskStatus.connected && !busy, running: busy }"
          >{{ busy ? "运行中" : diskStatus.connected ? "已连接" : "未连接" }}</span>
        </div>
        <div class="result-content">
          <p class="empty-state">{{ diskStatus.message }}</p>
          <p v-if="status" class="empty-state">{{ status }}</p>
          <div v-if="lastResult || diskStatus.shareRoot" class="file-list">
            <button type="button" class="file-item" @click="openDefaultDirectory">
              <i class="ri-folder-open-line" aria-hidden="true"></i>
              <span>{{ config.defaultDirectory || lastResult?.baseUncPath || diskStatus.shareRoot }}</span>
            </button>
          </div>
          <div style="display: flex; gap: 8px;">
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
      </aside>
    </div>
  </section>
</template>
