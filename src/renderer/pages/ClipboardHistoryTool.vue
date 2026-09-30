<script setup lang="ts">
import ToolTitle from "../components/ToolTitle.vue";
import { computed, onBeforeUnmount, onMounted, ref } from "vue";
import type { ClipboardEntry } from "../../shared/types";
import { showWorkspaceToast } from "../composables/useWorkspaceToast";

const entries = ref<ClipboardEntry[]>([]);
const watching = ref(false);
const query = ref("");
const filterKind = ref<"all" | "text" | "image">("all");
const expandedId = ref<string | null>(null);
let unsubscribe: (() => void) | null = null;

const filtered = computed(() =>
  entries.value
    .filter((e) => filterKind.value === "all" || e.kind === filterKind.value)
    .filter((e) => {
      if (!query.value.trim()) return true;
      const q = query.value.trim().toLowerCase();
      return e.text.toLowerCase().includes(q);
    })
    .sort((a, b) => {
      if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
      return b.capturedAt - a.capturedAt;
    })
);

async function refresh() {
  entries.value = await window.devToolbox.listClipboard();
}

async function start() {
  const status = await window.devToolbox.startClipboardWatcher();
  watching.value = status.watching;
  await refresh();
}

async function stop() {
  const status = await window.devToolbox.stopClipboardWatcher();
  watching.value = status.watching;
}

async function removeEntry(id: string) {
  entries.value = await window.devToolbox.removeClipboardEntry(id);
}

async function clearHistory() {
  entries.value = await window.devToolbox.clearClipboardHistory();
  showWorkspaceToast("已清空（保留固定项）。", "success");
}

async function togglePin(entry: ClipboardEntry) {
  entries.value = await window.devToolbox.pinClipboardEntry(entry.id, !entry.pinned);
}

async function writeBack(entry: ClipboardEntry) {
  const ok = await window.devToolbox.writeClipboardEntry(entry.id);
  showWorkspaceToast(ok ? "已写回剪贴板。" : "写回失败。", ok ? "success" : "error");
}

function formatTime(ms: number) {
  const diff = Date.now() - ms;
  if (diff < 60_000) return `${Math.max(1, Math.floor(diff / 1000))} 秒前`;
  if (diff < 3_600_000) return `${Math.floor(diff / 60_000)} 分钟前`;
  if (diff < 86_400_000) return `${Math.floor(diff / 3_600_000)} 小时前`;
  return new Date(ms).toLocaleString();
}

function toggleExpand(id: string) {
  expandedId.value = expandedId.value === id ? null : id;
}

onMounted(async () => {
  unsubscribe = window.devToolbox.onClipboardUpdate((next) => {
    entries.value = next;
  });
  await start();
});

onBeforeUnmount(() => {
  unsubscribe?.();
});
</script>

<template>
  <section class="tool-page">
    <div class="tool-header">
      <div>
        <ToolTitle tool-id="clipboard-history" />
        <p>本地后台监听剪贴板，记录最近的文本和图片，支持固定、写回、检索（应用关闭后清空）</p>
      </div>
      <div class="header-actions">
        <span class="status-pill" :class="{ success: watching, error: !watching }">
          {{ watching ? "监听中" : "已暂停" }}
        </span>
        <button v-if="!watching" type="button" class="primary-button" @click="start">
          <i class="ri-play-fill" aria-hidden="true"></i>
          开始
        </button>
        <button v-else type="button" class="secondary-button" @click="stop">
          <i class="ri-pause-fill" aria-hidden="true"></i>
          暂停
        </button>
        <button type="button" class="secondary-button" @click="clearHistory">
          <i class="ri-delete-bin-line" aria-hidden="true"></i>
          清空
        </button>
      </div>
    </div>

    <div class="tool-main">
      <div class="links-toolbar">
        <label class="field links-search-field">
          <span>搜索</span>
          <input v-model="query" placeholder="搜索文本内容" />
        </label>
        <div class="field">
          <span>类型</span>
          <div class="segmented">
            <button type="button" :class="{ selected: filterKind === 'all' }" @click="filterKind = 'all'">全部</button>
            <button type="button" :class="{ selected: filterKind === 'text' }" @click="filterKind = 'text'">文本</button>
            <button type="button" :class="{ selected: filterKind === 'image' }" @click="filterKind = 'image'">图片</button>
          </div>
        </div>
        <div class="links-meta">
          <span class="status-pill">{{ filtered.length }} / {{ entries.length }}</span>
        </div>
      </div>

      <div class="clip-list">
        <article
          v-for="entry in filtered"
          :key="entry.id"
          class="clip-item"
          :class="{ pinned: entry.pinned }"
        >
          <div class="clip-kind">
            <i v-if="entry.kind === 'text'" class="ri-text" aria-hidden="true"></i>
            <i v-else class="ri-image-line" aria-hidden="true"></i>
          </div>
          <div class="clip-content">
            <img v-if="entry.kind === 'image' && entry.preview" :src="entry.preview" alt="clipboard image" style="max-width: 240px; max-height: 160px; border-radius: 6px; border: 1px solid var(--border);" />
            <p
              v-else
              class="clip-text"
              :class="{ expanded: expandedId === entry.id }"
              @click="toggleExpand(entry.id)"
            >{{ entry.text }}</p>
            <div class="clip-meta">
              <span>{{ formatTime(entry.capturedAt) }}</span>
              <span v-if="entry.kind === 'text'">{{ entry.text.length }} 字符</span>
            </div>
          </div>
          <div class="clip-actions">
            <button type="button" class="icon-button" :title="entry.pinned ? '取消固定' : '固定'" @click="togglePin(entry)">
              <i :class="entry.pinned ? 'ri-pushpin-2-fill' : 'ri-pushpin-line'" aria-hidden="true"></i>
            </button>
            <button type="button" class="icon-button" title="写回剪贴板" @click="writeBack(entry)">
              <i class="ri-clipboard-line" aria-hidden="true"></i>
            </button>
            <button type="button" class="icon-button" title="删除" @click="removeEntry(entry.id)">
              <i class="ri-delete-bin-line" aria-hidden="true"></i>
            </button>
          </div>
        </article>
        <p v-if="!filtered.length" class="empty-state link-empty">
          {{ watching ? "暂无内容，复制一些东西试试。" : "监听已暂停，点击右上角开始。" }}
        </p>
      </div>
    </div>
  </section>
</template>
