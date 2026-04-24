<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import type { SharedDiskConfig, SharedDiskConnectResult } from "../../shared/types";

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

onMounted(loadConfig);
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
          <span v-if="busy" class="status-pill running">运行中</span>
        </div>
        <div class="result-content">
          <p class="empty-state">{{ status || "尚未连接" }}</p>
          <div v-if="lastResult" class="file-list">
            <button type="button" class="file-item" @click="openDefaultDirectory">
              <i class="ri-folder-open-line" aria-hidden="true"></i>
              <span>{{ config.defaultDirectory || lastResult.baseUncPath }}</span>
            </button>
          </div>
          <button type="button" class="secondary-button" :disabled="busy" @click="disconnect">
            <i class="ri-logout-box-line" aria-hidden="true"></i>
            断开连接
          </button>
        </div>
      </aside>
    </div>
  </section>
</template>
