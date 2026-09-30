<script setup lang="ts">
import ToolTitle from "../components/ToolTitle.vue";
import { computed, ref, watch } from "vue";
import { reportWorkspaceError } from "../composables/useWorkspaceToast";
import type { CertificateScanResult } from "../../shared/types";

type CertificateRowStatus = "pending" | CertificateScanResult["status"];

interface CertificateRow {
  projectName: string;
  domain: string;
  host: string;
  port: number;
  issuer: string;
  validFrom: string;
  validTo: string;
  remainingDays: number | null;
  status: CertificateRowStatus;
  errorMessage?: string;
}

const storageKey = "dev-toolbox.certificate-domains.v2";
const legacyStorageKey = "dev-toolbox.certificate-domains.v1";
const projectNameInput = ref("");
const domainInput = ref("");
const rows = ref<CertificateRow[]>(loadRows());
const timeoutSeconds = ref(8);
const busy = ref(false);

const canScan = computed(() => rows.value.length > 0 && !busy.value);
const scannedCount = computed(() => rows.value.filter((item) => item.status !== "pending").length);
const expiringCount = computed(() => rows.value.filter((item) => isExpiring(item)).length);

function createPendingRow(rawDomain: string): CertificateRow {
  const projectName = resolveProjectName(rawDomain);
  return {
    projectName,
    domain: rawDomain,
    host: projectName,
    port: 443,
    issuer: "",
    validFrom: "",
    validTo: "",
    remainingDays: null,
    status: "pending"
  };
}

function loadRows() {
  try {
    const raw = localStorage.getItem(storageKey) || localStorage.getItem(legacyStorageKey);
    const parsed = raw ? JSON.parse(raw) : [];
    if (!Array.isArray(parsed)) return [];

    return parsed
      .map((item) => {
        if (typeof item === "string") return createPendingRow(item.trim());
        const domain = String(item?.domain || item?.projectName || "").trim();
        if (!domain) return null;
        return {
          ...createPendingRow(domain),
          projectName: String(item?.projectName || resolveProjectName(domain)).trim(),
          host: String(item?.host || resolveProjectName(domain)).trim(),
          port: Number.isInteger(item?.port) ? item.port : 443,
          issuer: String(item?.issuer || ""),
          validFrom: String(item?.validFrom || ""),
          validTo: String(item?.validTo || ""),
          remainingDays: typeof item?.remainingDays === "number" ? item.remainingDays : null,
          status: ["pending", "success", "error"].includes(item?.status) ? item.status : "pending",
          errorMessage: item?.errorMessage ? String(item.errorMessage) : undefined
        } satisfies CertificateRow;
      })
      .filter((item): item is CertificateRow => Boolean(item));
  } catch {
    return [];
  }
}

function resolveProjectName(value: string) {
  const source = value.trim();
  if (!source) return "未命名项目";

  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:\/\//i.test(source) ? source : `https://${source}`);
    return url.hostname || source;
  } catch {
    return source.replace(/^https?:\/\//i, "").split("/")[0] || source;
  }
}

function normalizeInputs(value: string) {
  return value
    .split(/[\n,，\s]+/)
    .map((item) => item.trim())
    .filter(Boolean);
}

function addDomains() {
  const projectName = projectNameInput.value.trim();
  const domain = domainInput.value.trim();
  if (!projectName || !domain) return;

  const seen = new Set(rows.value.map((item) => item.domain.toLowerCase()));
  const key = domain.toLowerCase();
  if (seen.has(key)) return;

  rows.value = [...rows.value, { ...createPendingRow(domain), projectName }];
  projectNameInput.value = "";
  domainInput.value = "";
}

function removeRow(index: number) {
  rows.value = rows.value.filter((_, currentIndex) => currentIndex !== index);
}

async function scan() {
  if (!canScan.value) return;
  busy.value = true;
  rows.value = rows.value.map((item) => ({ ...item, status: "pending", errorMessage: undefined }));

  try {
    const scanResults = await window.devToolbox.scanCertificates({
      domains: rows.value.map((item) => item.domain),
      timeoutMs: Math.round(timeoutSeconds.value * 1000)
    });

    rows.value = rows.value.map((item, index) => {
      const result = scanResults[index];
      if (!result) return item;
      return {
        ...item,
        domain: result.domain || item.domain,
        host: result.host || item.host,
        port: result.port || item.port,
        issuer: result.issuer,
        validFrom: result.validFrom,
        validTo: result.validTo,
        remainingDays: result.remainingDays,
        status: result.status,
        errorMessage: result.errorMessage
      };
    });
  } catch (error) {
    reportWorkspaceError(error, "证书扫描失败");
  } finally {
    busy.value = false;
  }
}

function isExpiring(item: CertificateRow) {
  return item.status === "success" && item.remainingDays !== null && item.remainingDays < 30;
}

function remainingLabel(item: CertificateRow) {
  if (item.status === "pending") return "待扫描";
  if (item.status === "error") return "扫描失败";
  if (item.remainingDays === null) return "未知";
  if (item.remainingDays < 0) return `已过期 ${Math.abs(item.remainingDays)} 天`;
  return `${item.remainingDays} 天`;
}

function issuerLabel(item: CertificateRow) {
  if (item.status === "pending") return "待扫描";
  return item.issuer && item.issuer !== "-" ? item.issuer : "未获取到签发者";
}

function formatDate(value: string) {
  if (!value) return "-";
  const date = new Date(value);
  if (!Number.isFinite(date.getTime())) return value;

  const pad = (input: number) => String(input).padStart(2, "0");
  return [
    `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())}`,
    `${pad(date.getHours())}:${pad(date.getMinutes())}`
  ].join(" ");
}

watch(
  rows,
  () => {
    localStorage.setItem(storageKey, JSON.stringify(rows.value));
  },
  { deep: true }
);
</script>

<template>
  <section class="tool-page certificate-tool">
    <div class="tool-header">
      <div>
        <ToolTitle tool-id="certificate-scan" />
        <p>使用本机 TLS 连接读取 HTTPS 证书，批量检查证书有效期</p>
      </div>
      <div class="header-actions">
        <button type="button" class="primary-button" :disabled="!canScan" @click="scan">
          <i class="ri-shield-check-line" aria-hidden="true"></i>
          {{ busy ? "扫描中" : "一键扫描" }}
        </button>
      </div>
    </div>

    <div class="certificate-stack">
      <section class="tool-main certificate-panel certificate-add-panel">
        <div class="section-title certificate-section-title">
          <h2>添加项目</h2>
          <span class="status-pill">ADD</span>
        </div>
        <div class="certificate-input-row">
          <input
            v-model="projectNameInput"
            class="certificate-input"
            placeholder="项目名，例如：官网、后台、活动页"
            @keydown.enter.prevent="addDomains"
          />
          <input
            v-model="domainInput"
            class="certificate-input"
            placeholder="域名，例如：example.com 或 https://example.com:443"
            @keydown.enter.prevent="addDomains"
          />
          <label class="certificate-timeout">
            <span>超时</span>
            <input v-model.number="timeoutSeconds" type="number" min="1" max="30" />
            <span>秒</span>
          </label>
          <button type="button" class="secondary-button" :disabled="!projectNameInput.trim() || !domainInput.trim()" @click="addDomains">
            <i class="ri-add-line" aria-hidden="true"></i>
            添加到列表
          </button>
        </div>
      </section>

      <section class="tool-main certificate-panel certificate-overview-panel">
        <div class="section-title certificate-section-title">
          <h2>概览</h2>
          <span class="status-pill" :class="{ running: busy, warning: expiringCount > 0 }">
            {{ busy ? "RUNNING" : expiringCount > 0 ? "WARNING" : "READY" }}
          </span>
        </div>
        <div class="certificate-metrics">
          <div>
            <span>项目数</span>
            <strong>{{ rows.length }}</strong>
          </div>
          <div>
            <span>已扫描</span>
            <strong>{{ scannedCount }}</strong>
          </div>
          <div>
            <span>即将过期</span>
            <strong>{{ expiringCount }}</strong>
          </div>
          <div>
            <span>扫描方式</span>
            <strong>TLS</strong>
          </div>
        </div>
      </section>

      <section class="tool-main certificate-panel certificate-result-panel">
        <div class="certificate-result-head">
          <div>
            <strong>扫描结果</strong>
            <span>{{ rows.length }} 个项目</span>
          </div>
          <span class="status-pill" :class="{ warning: expiringCount > 0, running: busy }">
            {{ busy ? "RUNNING" : expiringCount > 0 ? `${expiringCount} EXPIRING` : "READY" }}
          </span>
        </div>


        <div v-if="rows.length" class="certificate-table-wrap">
          <table class="certificate-table">
            <thead>
              <tr>
                <th>项目名</th>
                <th>域名</th>
                <th>签发者</th>
                <th>有效期起始</th>
                <th>有效期截止</th>
                <th>剩余天数</th>
                <th>操作</th>
              </tr>
            </thead>
            <tbody>
              <tr
                v-for="(item, index) in rows"
                :key="`${item.domain}-${index}`"
                :class="{ expiring: isExpiring(item), failed: item.status === 'error', pending: item.status === 'pending' }"
              >
                <td>
                  <strong>{{ item.projectName }}</strong>
                </td>
                <td>
                  <strong>{{ item.domain }}</strong>
                </td>
                <td class="certificate-issuer-cell" :title="issuerLabel(item)">
                  <!-- <span class="issuer-column-label">签发者</span> -->
                  <strong>{{ issuerLabel(item) }}</strong>
                  <small v-if="item.status === 'error' && item.errorMessage">{{ item.errorMessage }}</small>
                </td>
                <td>{{ formatDate(item.validFrom) }}</td>
                <td>{{ formatDate(item.validTo) }}</td>
                <td>
                  <span class="days-badge" :class="{ danger: isExpiring(item), muted: item.status !== 'success' }">
                    {{ remainingLabel(item) }}
                  </span>
                </td>
                <td>
                  <button type="button" class="icon-button certificate-remove" title="删除项目" @click="removeRow(index)">
                    <i class="ri-delete-bin-line" aria-hidden="true"></i>
                  </button>
                </td>
              </tr>
            </tbody>
          </table>
        </div>
        <p v-else class="empty-state">添加项目后会在这里显示扫描结果。</p>
      </section>
    </div>
  </section>
</template>

<style scoped>
.certificate-stack {
  display: grid;
  gap: 16px;
}

.certificate-panel {
  min-width: 0;
}

.certificate-section-title {
  margin-bottom: 12px;
}

.certificate-input-row {
  display: grid;
  grid-template-columns: minmax(160px, 0.55fr) minmax(260px, 1fr) auto auto;
  gap: 10px;
  align-items: center;
}

.certificate-input {
  width: 100%;
  min-height: 38px;
  padding: 8px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface);
  color: var(--text);
  outline: none;
}

.certificate-input:focus {
  border-color: var(--accent);
}

.certificate-timeout {
  display: inline-flex;
  align-items: center;
  gap: 6px;
  min-height: 38px;
  padding: 5px 10px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface-subtle);
  color: var(--muted);
  font-size: 12px;
  font-weight: 700;
  white-space: nowrap;
}

.certificate-timeout input {
  width: 42px;
  min-height: 0;
  padding: 2px 4px;
  border: 0;
  background: transparent;
  color: var(--text);
  text-align: center;
  outline: none;
}

.certificate-result-head {
  display: flex;
  justify-content: space-between;
  gap: 12px;
  align-items: center;
  margin-bottom: 10px;
}

.certificate-result-head div {
  display: flex;
  align-items: baseline;
  gap: 8px;
}

.certificate-result-head span {
  color: var(--muted);
  font-size: 12px;
}

.certificate-table-wrap {
  overflow-x: hidden;
  overflow-y: auto;
  border: 1px solid var(--border);
  border-radius: 8px;
}

.certificate-table {
  width: 100%;
  border-collapse: collapse;
  table-layout: fixed;
  font-size: 13px;
}

.certificate-table th:nth-child(1),
.certificate-table td:nth-child(1) {
  width: 15%;
}

.certificate-table th:nth-child(2),
.certificate-table td:nth-child(2) {
  width: 18%;
}

.certificate-table th:nth-child(3),
.certificate-table td:nth-child(3) {
  width: 22%;
}

.certificate-table th:nth-child(4),
.certificate-table td:nth-child(4),
.certificate-table th:nth-child(5),
.certificate-table td:nth-child(5) {
  width: 14%;
}

.certificate-table th:nth-child(6),
.certificate-table td:nth-child(6) {
  width: 11%;
}

.certificate-table th:nth-child(7),
.certificate-table td:nth-child(7) {
  width: 6%;
}

.certificate-table th,
.certificate-table td {
  padding: 11px 12px;
  border-bottom: 1px solid var(--border);
  text-align: left;
  vertical-align: top;
  overflow-wrap: anywhere;
}

.certificate-table th {
  position: sticky;
  top: 0;
  z-index: 1;
  background: var(--surface-subtle);
  color: var(--muted);
  font-size: 12px;
  font-weight: 800;
}

.certificate-table tbody tr:last-child td {
  border-bottom: 0;
}

.certificate-table td small {
  display: block;
  margin-top: 2px;
  color: var(--muted);
}

.certificate-issuer-cell strong {
  display: block;
  color: var(--text);
  font-weight: 700;
}

.issuer-column-label {
  display: block;
  margin-bottom: 2px;
  color: var(--muted);
  font-size: 11px;
  font-weight: 800;
}

.certificate-table tr.expiring {
  background: color-mix(in srgb, var(--danger) 10%, var(--surface));
}

.certificate-table tr.failed {
  color: var(--muted);
  background: var(--surface-subtle);
}

.certificate-table tr.pending {
  background: color-mix(in srgb, var(--accent) 4%, var(--surface));
}

.days-badge {
  display: inline-flex;
  align-items: center;
  min-height: 24px;
  padding: 2px 8px;
  border-radius: 999px;
  background: color-mix(in srgb, var(--success) 12%, var(--surface));
  color: var(--success);
  font-weight: 800;
  white-space: nowrap;
}

.days-badge.danger {
  background: color-mix(in srgb, var(--danger) 14%, var(--surface));
  color: var(--danger);
}

.days-badge.muted {
  background: var(--surface);
  color: var(--muted);
}

.certificate-remove {
  width: 30px;
  height: 30px;
}

.certificate-metrics {
  display: grid;
  grid-template-columns: repeat(4, minmax(0, 1fr));
  gap: 10px;
}

.certificate-metrics div {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 10px 12px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface-subtle);
}

.certificate-metrics span {
  color: var(--muted);
  font-size: 12px;
}

.certificate-metrics strong {
  font-size: 18px;
}

.status-pill.warning {
  color: var(--danger);
  border-color: color-mix(in srgb, var(--danger) 38%, var(--border));
  background: color-mix(in srgb, var(--danger) 10%, var(--surface));
}

@media (max-width: 1100px) {
  .certificate-metrics {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 900px) {
  .certificate-input-row,
  .certificate-metrics {
    grid-template-columns: 1fr;
  }
}
</style>
