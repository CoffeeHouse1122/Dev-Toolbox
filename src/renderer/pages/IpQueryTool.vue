<script setup lang="ts">
import { computed, onMounted, ref } from "vue";
import { reportWorkspaceError, showWorkspaceToast } from "../composables/useWorkspaceToast";
import type { DomainIpLookupResult, IpInfo } from "../../shared/types";

const busy = ref(false);
const domainBusy = ref(false);
const domainInput = ref("");
const info = ref<IpInfo | null>(null);
const domainResult = ref<DomainIpLookupResult | null>(null);

const ipv4List = computed(() => info.value?.internal.filter((item) => item.family === "IPv4") ?? []);
const ipv6List = computed(() => info.value?.internal.filter((item) => item.family === "IPv6") ?? []);
const domainIpv4List = computed(() => domainResult.value?.addresses.filter((item) => item.family === "IPv4") ?? []);
const domainIpv6List = computed(() => domainResult.value?.addresses.filter((item) => item.family === "IPv6") ?? []);

async function refresh() {
  busy.value = true;
  domainBusy.value = false;
  domainInput.value = "";
  domainResult.value = null;
  try {
    info.value = await window.devToolbox.getIpInfo();
    if (info.value.externalError) showWorkspaceToast(`获取外网 IP 失败：${info.value.externalError}`, "error");
  } catch (cause) {
    reportWorkspaceError(cause, "获取 IP 信息失败");
  } finally {
    busy.value = false;
  }
}

async function lookupDomain() {
  const domain = domainInput.value.trim();
  if (!domain) return;
  domainBusy.value = true;
  try {
    domainResult.value = await window.devToolbox.lookupDomainIp(domain);
    if (domainResult.value.status === "error") showWorkspaceToast(domainResult.value.errorMessage || "域名解析失败", "error");
  } catch (cause) {
    domainResult.value = null;
    reportWorkspaceError(cause, "域名解析失败");
  } finally {
    domainBusy.value = false;
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
        <div class="domain-lookup-panel">
          <div class="section-title">
            <h2>域名解析</h2>
            <span class="status-pill" :class="{ running: domainBusy }">{{ domainBusy ? "RUNNING" : "DNS" }}</span>
          </div>
          <div class="domain-lookup-row">
            <input v-model="domainInput" placeholder="输入域名，例如 example.com" @keydown.enter.prevent="lookupDomain" />
            <button type="button" class="primary-button" :disabled="domainBusy || !domainInput.trim()" @click="lookupDomain">
              <i class="ri-search-line" aria-hidden="true"></i>
              查询
            </button>
          </div>
          <div v-if="domainResult" class="domain-result">
            <div class="domain-result-head">
              <strong>{{ domainResult.host || domainResult.query }}</strong>
              <span :class="domainResult.status === 'success' ? 'domain-ok' : 'domain-error'">
                {{ domainResult.status === "success" ? `${domainResult.addresses.length} 个地址` : "解析失败" }}
              </span>
            </div>
            <div v-if="domainResult.status === 'success'" class="domain-address-grid">
              <article class="domain-address-card">
                <span>IPv4</span>
                <strong v-if="domainIpv4List.length">{{ domainIpv4List.map((item) => item.address).join(" / ") }}</strong>
                <strong v-else>-</strong>
              </article>
              <article class="domain-address-card">
                <span>IPv6</span>
                <strong v-if="domainIpv6List.length">{{ domainIpv6List.map((item) => item.address).join(" / ") }}</strong>
                <strong v-else>-</strong>
              </article>
            </div>
          </div>
        </div>

        <div class="metric-card">
          <span>外网 IP</span>
          <strong>{{ info?.externalIp || "未获取" }}</strong>
          <small v-if="info?.externalSource">来源：{{ info.externalSource }}</small>
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

<style scoped>
.domain-lookup-panel {
  display: grid;
  gap: 12px;
}

.domain-lookup-row {
  display: grid;
  grid-template-columns: minmax(0, 1fr) auto;
  gap: 10px;
}

.domain-result {
  display: grid;
  gap: 10px;
  padding: 12px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface-subtle);
}

.domain-result-head,
.domain-address-card {
  min-width: 0;
}

.domain-result-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
}

.domain-result-head strong,
.domain-address-card strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.domain-ok {
  color: var(--success);
  font-size: 12px;
  font-weight: 800;
}

.domain-error {
  color: var(--danger);
  font-size: 12px;
  font-weight: 800;
}

.domain-address-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.domain-address-card {
  display: grid;
  gap: 6px;
  padding: 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface);
}

.domain-address-card span {
  color: var(--muted);
  font-size: 12px;
  font-weight: 700;
}

.domain-address-card strong {
  font-family: var(--font-mono);
  font-size: 13px;
}

@media (max-width: 760px) {
  .domain-lookup-row,
  .domain-address-grid {
    grid-template-columns: 1fr;
  }
}
</style>
