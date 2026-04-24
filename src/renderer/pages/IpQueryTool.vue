<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import type { IpInfo } from "../../shared/types";

const busy = ref(false);
const info = ref<IpInfo | null>(null);

const ipv4List = computed(() => info.value?.internal.filter((item) => item.family === "IPv4") ?? []);
const ipv6List = computed(() => info.value?.internal.filter((item) => item.family === "IPv6") ?? []);

async function refresh() {
  busy.value = true;
  try {
    info.value = await window.devToolbox.getIpInfo();
  } finally {
    busy.value = false;
  }
}

onMounted(() => {
  void refresh();
});
</script>

<template>
  <section class="tool-page">
    <div class="tool-header">
      <div>
        <h2>IP 查询</h2>
        <p>显示本机内网地址，并尝试获取当前外网 IP</p>
      </div>
      <button type="button" class="primary-button" :disabled="busy" @click="refresh">
        <i class="ri-refresh-line" aria-hidden="true"></i>
        刷新
      </button>
    </div>

    <div class="tool-layout">
      <section class="tool-main">
        <div class="metric-card">
          <span>外网 IP</span>
          <strong>{{ info?.externalIp || "未获取" }}</strong>
          <small v-if="info?.externalError">获取失败：{{ info.externalError }}</small>
        </div>

        <div class="info-grid">
          <article class="info-panel">
            <h3>IPv4</h3>
            <div v-if="ipv4List.length" class="info-list">
              <div v-for="item in ipv4List" :key="`${item.name}-${item.address}`" class="info-row">
                <span>{{ item.name }}</span>
                <strong>{{ item.address }}</strong>
                <small>{{ item.mac }}</small>
              </div>
            </div>
            <p v-else class="empty-state">暂无 IPv4 地址</p>
          </article>

          <article class="info-panel">
            <h3>IPv6</h3>
            <div v-if="ipv6List.length" class="info-list">
              <div v-for="item in ipv6List" :key="`${item.name}-${item.address}`" class="info-row">
                <span>{{ item.name }}</span>
                <strong>{{ item.address }}</strong>
                <small>{{ item.mac }}</small>
              </div>
            </div>
            <p v-else class="empty-state">暂无 IPv6 地址</p>
          </article>
        </div>
      </section>

      <aside class="result-panel">
        <div class="section-title">
          <h2>说明</h2>
          <span class="status-pill" :class="{ running: busy }">{{ busy ? "RUNNING" : "READY" }}</span>
        </div>
        <p class="empty-state">外网 IP 依赖当前网络访问公网服务；离线或代理不可用时，仍会显示内网地址。</p>
      </aside>
    </div>
  </section>
</template>
