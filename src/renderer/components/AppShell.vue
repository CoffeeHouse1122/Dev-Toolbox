<script setup lang="ts">
import { computed, onMounted, ref, watch } from "vue";
import { RouterLink, RouterView } from "vue-router";
import { useThemeStore } from "../stores/theme";

type NavTool = {
  id: string;
  to: string;
  label: string;
  icon: string;
  visible: boolean;
};

type NavGroup = {
  id: string;
  label: string;
  collapsed?: boolean;
  tools: NavTool[];
};

type NavConfig = {
  groups: NavGroup[];
  collapsedGroups: Record<string, boolean>;
};

const navStorageKey = "dev-toolbox.nav.v1";
const collapsedStorageKey = "dev-toolbox.nav-collapsed.v1";
const theme = useThemeStore();
const editingNav = ref(false);
const navImportInput = ref<HTMLInputElement | null>(null);
const navEditorMessage = ref("");
const navConfigLoaded = ref(false);
const alwaysOnTop = ref(false);

const defaultGroups: NavGroup[] = [
  {
    id: "images",
    label: "图片",
    tools: [
      { id: "favicon", to: "/favicon", label: "图标生成", icon: "ri-star-smile-line", visible: true },
      { id: "webp", to: "/webp", label: "图片转换", icon: "ri-image-edit-line", visible: true },
      { id: "image-compress", to: "/image-compress", label: "图片压缩", icon: "ri-image-2-line", visible: true },
      { id: "image-resize", to: "/image-resize", label: "尺寸调整", icon: "ri-crop-line", visible: true },
      { id: "image-crop", to: "/image-crop", label: "自由裁剪", icon: "ri-scissors-cut-line", visible: true },
      { id: "watermark", to: "/watermark", label: "添加水印", icon: "ri-contrast-drop-2-line", visible: true },
      { id: "sprite", to: "/sprite", label: "雪碧图", icon: "ri-layout-grid-line", visible: true },
      { id: "image-placeholder", to: "/image-placeholder", label: "图片占位符", icon: "ri-blur-off-line", visible: true },
      { id: "mark-man", to: "/mark-man", label: "Mark Man", icon: "ri-ruler-line", visible: true },
      { id: "base64-image", to: "/base64-image", label: "Base64 图片", icon: "ri-code-line", visible: true },
      { id: "qr-code", to: "/qr-code", label: "二维码生成", icon: "ri-qr-code-line", visible: true }
    ]
  },
  {
    id: "media",
    label: "音视频",
    tools: [
      { id: "video-background", to: "/video-background", label: "视频转化", icon: "ri-movie-2-line", visible: true },
      { id: "video-animation", to: "/video-animation", label: "视频动图", icon: "ri-file-gif-line", visible: true },
      { id: "sequence-animation", to: "/sequence-animation", label: "序列帧动图", icon: "ri-film-line", visible: true },
      { id: "video-mute", to: "/video-mute", label: "视频去音频", icon: "ri-volume-mute-line", visible: true },
      { id: "audio-convert", to: "/audio-convert", label: "音频转换", icon: "ri-music-2-line", visible: true }
    ]
  },
  {
    id: "font",
    label: "字体",
    tools: [
      { id: "woff2", to: "/woff2", label: "WOFF2 转换", icon: "ri-font-size-2", visible: true },
      { id: "font-preview", to: "/font-preview", label: "字体预览", icon: "ri-font-sans-serif", visible: true },
      { id: "font-subset", to: "/font-subset", label: "字体子集化", icon: "ri-scissors-cut-line", visible: true },
      { id: "font-face", to: "/font-face", label: "@font-face", icon: "ri-braces-line", visible: true }
    ]
  },
  {
    id: "text",
    label: "文本与 CSS",
    tools: [
      { id: "markdown-export", to: "/markdown-export", label: "Markdown", icon: "ri-markdown-line", visible: true },
      { id: "data-convert", to: "/data-convert", label: "JSON/YAML/TOML", icon: "ri-arrow-left-right-line", visible: true },
      { id: "diff", to: "/diff", label: "文本 Diff", icon: "ri-swap-line", visible: true },
      { id: "jwt", to: "/jwt", label: "JWT 解析", icon: "ri-key-2-line", visible: true },
      { id: "url-codec", to: "/url-codec", label: "URL 编解码", icon: "ri-links-line", visible: true },
      { id: "regex-tester", to: "/regex-tester", label: "正则测试器", icon: "ri-parentheses-line", visible: true },
      { id: "css-variables", to: "/css-variables", label: "CSS 变量", icon: "ri-css3-line", visible: true },
      { id: "css-clamp", to: "/css-clamp", label: "Clamp 字号", icon: "ri-font-size", visible: true },
      { id: "color-palette", to: "/color-palette", label: "配色生成器", icon: "ri-palette-line", visible: true },
      { id: "code-screenshot", to: "/code-screenshot", label: "代码截图", icon: "ri-camera-3-line", visible: true },
      { id: "base64-text", to: "/base64-text", label: "Base64 文本", icon: "ri-text-block", visible: true },
      { id: "color-converter", to: "/color-converter", label: "颜色转换器", icon: "ri-contrast-drop-line", visible: true }
    ]
  },
  {
    id: "seo",
    label: "SEO 与发布",
    tools: [
      { id: "seo-files", to: "/seo-files", label: "robots / sitemap", icon: "ri-road-map-line", visible: true },
      { id: "meta-tags", to: "/meta-tags", label: "HTML Meta", icon: "ri-meta-line", visible: true },
      { id: "og-image", to: "/og-image", label: "OG 图片", icon: "ri-image-add-line", visible: true }
    ]
  },
  {
    id: "system-files",
    label: "文件与网络",
    tools: [
      { id: "links", to: "/links", label: "网站与文档", icon: "ri-bookmark-3-line", visible: true },
      { id: "ip-query", to: "/ip-query", label: "IP 查询", icon: "ri-router-line", visible: true },
      { id: "shared-disk", to: "/shared-disk", label: "共享盘登录", icon: "ri-hard-drive-3-line", visible: true },
      { id: "rename", to: "/rename", label: "文件重命名", icon: "ri-edit-2-line", visible: true },
      { id: "asset-manifest", to: "/asset-manifest", label: "资源清单", icon: "ri-file-list-3-line", visible: true },
      { id: "http-tester", to: "/http-tester", label: "HTTP 测试器", icon: "ri-send-plane-line", visible: true },
      { id: "certificate-scan", to: "/certificate-scan", label: "证书扫描", icon: "ri-shield-check-line", visible: true },
      { id: "capture-proxy", to: "/capture-proxy", label: "抓包工具", icon: "ri-radar-line", visible: true }
    ]
  },
  {
    id: "assist",
    label: "开发辅助",
    tools: [
      { id: "timestamp", to: "/timestamp", label: "时间戳", icon: "ri-time-line", visible: true },
      { id: "uuid", to: "/uuid", label: "UUID", icon: "ri-fingerprint-line", visible: true },
      { id: "hash", to: "/hash", label: "Hash 生成", icon: "ri-shield-keyhole-line", visible: true },
      { id: "clipboard-history", to: "/clipboard-history", label: "剪贴板历史", icon: "ri-clipboard-line", visible: true },
      { id: "sticky-notes", to: "/sticky-notes", label: "桌面便签", icon: "ri-sticky-note-line", visible: true }
    ]
  },
  {
    id: "system",
    label: "系统",
    tools: [
      { id: "history", to: "/history", label: "历史记录", icon: "ri-history-line", visible: true },
      { id: "settings", to: "/settings", label: "设置", icon: "ri-settings-3-line", visible: true }
    ]
  }
];

const groups = ref<NavGroup[]>(loadNavGroups());
const collapsedGroups = ref<Record<string, boolean>>(loadCollapsedState());
const visibleGroups = computed(() =>
  groups.value
    .map((group) => ({ ...group, tools: group.tools.filter((tool) => tool.visible) }))
    .filter((group) => group.tools.length > 0)
);

function toggleGroupCollapse(id: string) {
  collapsedGroups.value = { ...collapsedGroups.value, [id]: !collapsedGroups.value[id] };
  saveNavConfig();
}

function loadCollapsedState(): Record<string, boolean> {
  try {
    const raw = localStorage.getItem(collapsedStorageKey);
    return raw ? (JSON.parse(raw) as Record<string, boolean>) : {};
  } catch {
    return {};
  }
}

function cloneGroups(input: NavGroup[]) {
  return JSON.parse(JSON.stringify(input)) as NavGroup[];
}

function mergeGroups(saved: NavGroup[]) {
  const defaultGroupMap = new Map(defaultGroups.map((group) => [group.id, group]));
  const defaultToolMap = new Map(defaultGroups.flatMap((group) => group.tools.map((tool) => [tool.id, tool] as const)));
  const usedGroupIds = new Set<string>();
  const usedToolIds = new Set<string>();
  const merged: NavGroup[] = [];

  for (const savedGroup of Array.isArray(saved) ? saved : []) {
    const sourceGroup = defaultGroupMap.get(savedGroup.id);
    if (!sourceGroup || usedGroupIds.has(savedGroup.id)) continue;
    usedGroupIds.add(savedGroup.id);
    const tools: NavTool[] = [];
    for (const savedTool of Array.isArray(savedGroup.tools) ? savedGroup.tools : []) {
      const sourceTool = defaultToolMap.get(savedTool.id);
      if (!sourceTool || usedToolIds.has(savedTool.id)) continue;
      usedToolIds.add(savedTool.id);
      tools.push({ ...sourceTool, label: savedTool.label || sourceTool.label, visible: savedTool.visible !== false });
    }
    merged.push({ ...sourceGroup, label: savedGroup.label || sourceGroup.label, tools });
  }

  for (const defaultGroup of defaultGroups) {
    let targetGroup = merged.find((group) => group.id === defaultGroup.id);
    if (!targetGroup) {
      targetGroup = { ...defaultGroup, tools: [] };
      merged.push(targetGroup);
    }
    for (const sourceTool of defaultGroup.tools) {
      if (!usedToolIds.has(sourceTool.id)) {
        targetGroup.tools.push({ ...sourceTool });
        usedToolIds.add(sourceTool.id);
      }
    }
  }
  return merged;
}

function loadNavGroups() {
  try {
    const raw = localStorage.getItem(navStorageKey);
    if (!raw) return cloneGroups(defaultGroups);
    return mergeGroups(JSON.parse(raw) as NavGroup[]);
  } catch {
    return cloneGroups(defaultGroups);
  }
}

async function loadNavConfig() {
  let shouldSaveInitialConfig = false;
  try {
    const saved = await window.devToolbox.loadToolConfig("navigation") as Partial<NavConfig> | null;
    if (saved?.groups) groups.value = mergeGroups(saved.groups);
    if (saved?.collapsedGroups && typeof saved.collapsedGroups === "object") {
      collapsedGroups.value = saved.collapsedGroups;
    }
    shouldSaveInitialConfig = !saved;
  } catch {
    shouldSaveInitialConfig = true;
  } finally {
    navConfigLoaded.value = true;
  }
  if (shouldSaveInitialConfig) saveNavConfig();
}

function saveNavConfig() {
  if (!navConfigLoaded.value) return;
  void window.devToolbox.saveToolConfig("navigation", {
    groups: cloneGroups(groups.value),
    collapsedGroups: { ...collapsedGroups.value }
  } satisfies NavConfig);
}

function resetNav() {
  groups.value = cloneGroups(defaultGroups);
  navEditorMessage.value = "已恢复默认导航";
}

function exportNavConfig() {
  const payload = {
    version: 1,
    exportedAt: new Date().toISOString(),
    groups: groups.value
  };
  const blob = new Blob([`${JSON.stringify(payload, null, 2)}\n`], { type: "application/json" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = `dev-toolbox-nav-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(url);
  navEditorMessage.value = "已导出导航 JSON";
}

function pickNavConfigFile() {
  navImportInput.value?.click();
}

async function importNavConfig(event: Event) {
  const input = event.target as HTMLInputElement;
  const file = input.files?.[0];
  input.value = "";
  if (!file) return;

  try {
    const raw = await file.text();
    const parsed = JSON.parse(raw) as { groups?: NavGroup[] } | NavGroup[];
    const importedGroups = Array.isArray(parsed) ? parsed : parsed.groups;
    if (!Array.isArray(importedGroups)) throw new Error("JSON 中缺少 groups 数组");
    groups.value = mergeGroups(importedGroups);
    navEditorMessage.value = `已导入 ${file.name}`;
  } catch (error) {
    navEditorMessage.value = error instanceof Error ? error.message : String(error);
  }
}

function moveGroup(index: number, direction: -1 | 1) {
  const next = index + direction;
  if (next < 0 || next >= groups.value.length) return;
  const copy = [...groups.value];
  const [item] = copy.splice(index, 1);
  copy.splice(next, 0, item);
  groups.value = copy;
}

function moveTool(groupIndex: number, toolIndex: number, direction: -1 | 1) {
  const group = groups.value[groupIndex];
  const next = toolIndex + direction;
  if (!group || next < 0 || next >= group.tools.length) return;
  const tools = [...group.tools];
  const [item] = tools.splice(toolIndex, 1);
  tools.splice(next, 0, item);
  groups.value[groupIndex] = { ...group, tools };
}

// === Drag & drop reordering ===
type DragState =
  | { kind: "group"; from: number }
  | { kind: "tool"; fromGroup: number; fromIndex: number };

const dragState = ref<DragState | null>(null);
const dropHover = ref<{ kind: "group"; index: number } | { kind: "tool"; group: number; index: number; pos: "before" | "after" } | null>(null);

function onGroupDragStart(event: DragEvent, index: number) {
  dragState.value = { kind: "group", from: index };
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", `group:${index}`);
  }
}

function onGroupDragOver(event: DragEvent, index: number) {
  if (!dragState.value) return;
  event.preventDefault();
  if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
  if (dragState.value.kind === "group") {
    dropHover.value = { kind: "group", index };
  } else {
    // tool dragging onto a group means append to that group
    dropHover.value = { kind: "tool", group: index, index: groups.value[index]?.tools.length ?? 0, pos: "before" };
  }
}

function onGroupDrop(event: DragEvent, index: number) {
  event.preventDefault();
  const state = dragState.value;
  if (!state) return;
  if (state.kind === "group") {
    if (state.from === index) return;
    const copy = [...groups.value];
    const [item] = copy.splice(state.from, 1);
    copy.splice(index, 0, item);
    groups.value = copy;
  } else {
    moveToolAcross(state.fromGroup, state.fromIndex, index, groups.value[index]?.tools.length ?? 0);
  }
  dragState.value = null;
  dropHover.value = null;
}

function onToolDragStart(event: DragEvent, groupIndex: number, toolIndex: number) {
  dragState.value = { kind: "tool", fromGroup: groupIndex, fromIndex: toolIndex };
  if (event.dataTransfer) {
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("text/plain", `tool:${groupIndex}:${toolIndex}`);
  }
  event.stopPropagation();
}

function onToolDragOver(event: DragEvent, groupIndex: number, toolIndex: number) {
  const state = dragState.value;
  if (!state || state.kind !== "tool") return;
  event.preventDefault();
  event.stopPropagation();
  if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
  const target = event.currentTarget as HTMLElement | null;
  let pos: "before" | "after" = "before";
  if (target) {
    const rect = target.getBoundingClientRect();
    pos = event.clientY - rect.top > rect.height / 2 ? "after" : "before";
  }
  dropHover.value = { kind: "tool", group: groupIndex, index: toolIndex, pos };
}

function onToolDrop(event: DragEvent, groupIndex: number, toolIndex: number) {
  event.preventDefault();
  event.stopPropagation();
  const state = dragState.value;
  const hover = dropHover.value;
  if (!state || state.kind !== "tool") return;
  let targetIndex = toolIndex;
  if (hover?.kind === "tool" && hover.group === groupIndex && hover.index === toolIndex && hover.pos === "after") {
    targetIndex = toolIndex + 1;
  }
  moveToolAcross(state.fromGroup, state.fromIndex, groupIndex, targetIndex);
  dragState.value = null;
  dropHover.value = null;
}

function moveToolAcross(fromGroup: number, fromIndex: number, toGroup: number, toIndex: number) {
  if (fromGroup === toGroup && (toIndex === fromIndex || toIndex === fromIndex + 1)) return;
  const copy = groups.value.map((group) => ({ ...group, tools: [...group.tools] }));
  const source = copy[fromGroup];
  const target = copy[toGroup];
  if (!source || !target) return;
  const [item] = source.tools.splice(fromIndex, 1);
  let insertIndex = toIndex;
  if (fromGroup === toGroup && toIndex > fromIndex) insertIndex -= 1;
  insertIndex = Math.max(0, Math.min(insertIndex, target.tools.length));
  target.tools.splice(insertIndex, 0, item);
  groups.value = copy;
}

function onDragEnd() {
  dragState.value = null;
  dropHover.value = null;
}

function isToolDropBefore(groupIndex: number, toolIndex: number) {
  const h = dropHover.value;
  return !!(h && h.kind === "tool" && h.group === groupIndex && h.index === toolIndex && h.pos === "before");
}

function isToolDropAfter(groupIndex: number, toolIndex: number) {
  const h = dropHover.value;
  return !!(h && h.kind === "tool" && h.group === groupIndex && h.index === toolIndex && h.pos === "after");
}

function isGroupDropTarget(groupIndex: number) {
  const h = dropHover.value;
  if (!h) return false;
  if (h.kind === "group") return h.index === groupIndex;
  if (dragState.value?.kind === "tool" && h.kind === "tool" && h.group === groupIndex) {
    const group = groups.value[groupIndex];
    return !group?.tools.length;
  }
  return false;
}

async function syncAlwaysOnTop() {
  alwaysOnTop.value = await window.devToolbox.getAlwaysOnTop();
}

async function toggleAlwaysOnTop() {
  alwaysOnTop.value = await window.devToolbox.setAlwaysOnTop(!alwaysOnTop.value);
}

watch(
  groups,
  () => {
    saveNavConfig();
  },
  { deep: true }
);

watch(
  collapsedGroups,
  () => {
    saveNavConfig();
  },
  { deep: true }
);

onMounted(async () => {
  await loadNavConfig();
  await syncAlwaysOnTop();
  theme.sync();
  window.matchMedia("(prefers-color-scheme: dark)").addEventListener("change", theme.sync);
});

</script>

<template>
  <div class="app-shell">
    <div class="window-drag-strip">
      <button
        type="button"
        class="titlebar-window-button titlebar-pin-button"
        :title="alwaysOnTop ? '取消窗口置顶' : '窗口置顶'"
        :aria-label="alwaysOnTop ? '取消窗口置顶' : '窗口置顶'"
        :aria-pressed="alwaysOnTop"
        @click="toggleAlwaysOnTop"
      >
        <i :class="alwaysOnTop ? 'ri-pushpin-2-fill' : 'ri-pushpin-line'" aria-hidden="true"></i>
      </button>
    </div>
    <aside class="sidebar">
      <div class="brand">
        <div class="brand-mark"><img src="/icons/favicon-128x128.png" alt="Dev Toolbox" width="30" height="30" /></div>
        <div>
          <strong>Dev Toolbox</strong>
          <span>开发工具箱</span>
        </div>
      </div>

      <div class="sidebar-actions">
        <button type="button" class="secondary-button" @click="editingNav = true">
          <i class="ri-list-settings-line" aria-hidden="true"></i>
          编辑导航
        </button>
      </div>

      <div class="sidebar-body">
        <nav class="nav-list grouped-nav" aria-label="工具">
          <section v-for="group in visibleGroups" :key="group.id" class="nav-group" :class="{ collapsed: collapsedGroups[group.id] }">
            <button type="button" class="nav-group-head" @click="toggleGroupCollapse(group.id)">
              <i class="nav-group-chevron" :class="collapsedGroups[group.id] ? 'ri-arrow-right-s-line' : 'ri-arrow-down-s-line'" aria-hidden="true"></i>
              <span>{{ group.label }}</span>
              <span class="nav-group-count">{{ group.tools.length }}</span>
            </button>
            <div v-show="!collapsedGroups[group.id]" class="nav-group-items">
              <RouterLink v-for="tool in group.tools" :key="tool.to" :to="tool.to" class="nav-item">
                <i class="nav-icon" :class="tool.icon" aria-hidden="true"></i>
                <span>{{ tool.label }}</span>
              </RouterLink>
            </div>
          </section>
        </nav>
      </div>
    </aside>

    <main class="workspace">
      <!-- <header class="topbar" aria-hidden="true"></header> -->

      <div class="workspace-body">
        <RouterView />
      </div>
    </main>

    <Teleport to="body">
      <div v-if="editingNav" class="dt-modal-mask">
        <div class="dt-modal nav-editor-modal" role="dialog" aria-modal="true">
          <header class="dt-modal-head">
            <div>
              <h3>编辑导航</h3>
              <p style="margin: 4px 0 0; color: var(--muted); font-size: 12px;">拖动分组或工具调整顺序，可跨分组移动；取消勾选可隐藏</p>
            </div>
            <div style="display: flex; gap: 8px; align-items: center;">
              <input ref="navImportInput" type="file" accept="application/json,.json" class="visually-hidden-input" @change="importNavConfig" />
              <button type="button" class="secondary-button" @click="pickNavConfigFile">
                <i class="ri-upload-2-line" aria-hidden="true"></i>
                导入 JSON
              </button>
              <button type="button" class="secondary-button" @click="exportNavConfig">
                <i class="ri-download-2-line" aria-hidden="true"></i>
                导出 JSON
              </button>
              <button type="button" class="secondary-button" @click="resetNav">
                <i class="ri-reset-left-line" aria-hidden="true"></i>
                恢复默认
              </button>
              <button type="button" class="icon-button" @click="editingNav = false" title="完成">
                <i class="ri-close-line" aria-hidden="true"></i>
              </button>
            </div>
          </header>
          <!-- <p v-if="navEditorMessage" class="nav-editor-message">{{ navEditorMessage }}</p> -->
          <div class="dt-modal-body nav-editor-modal-body">
            <section
              v-for="(group, groupIndex) in groups"
              :key="group.id"
              class="nav-editor-group"
              :class="{ 'drop-target': isGroupDropTarget(groupIndex) }"
              @dragover="onGroupDragOver($event, groupIndex)"
              @drop="onGroupDrop($event, groupIndex)"
              @dragleave="dropHover = null"
            >
              <div
                class="nav-editor-group-head"
                draggable="true"
                @dragstart="onGroupDragStart($event, groupIndex)"
                @dragend="onDragEnd"
              >
                <span class="drag-handle" title="拖动排序"><i class="ri-draggable" aria-hidden="true"></i></span>
                <span class="group-badge">分组</span>
                <input v-model="group.label" aria-label="导航分组名称" />
                <button type="button" class="icon-button" title="上移分组" @click="moveGroup(groupIndex, -1)">
                  <i class="ri-arrow-up-s-line" aria-hidden="true"></i>
                </button>
                <button type="button" class="icon-button" title="下移分组" @click="moveGroup(groupIndex, 1)">
                  <i class="ri-arrow-down-s-line" aria-hidden="true"></i>
                </button>
              </div>
              <div class="nav-editor-tools">
                <article
                  v-for="(tool, toolIndex) in group.tools"
                  :key="tool.id"
                  class="nav-editor-tool"
                  :class="{
                    dragging: dragState && dragState.kind === 'tool' && dragState.fromGroup === groupIndex && dragState.fromIndex === toolIndex,
                    'drop-before': isToolDropBefore(groupIndex, toolIndex),
                    'drop-after': isToolDropAfter(groupIndex, toolIndex)
                  }"
                  draggable="true"
                  @dragstart="onToolDragStart($event, groupIndex, toolIndex)"
                  @dragover="onToolDragOver($event, groupIndex, toolIndex)"
                  @drop="onToolDrop($event, groupIndex, toolIndex)"
                  @dragend="onDragEnd"
                >
                  <span class="drag-handle" title="拖动排序"><i class="ri-draggable" aria-hidden="true"></i></span>
                  <label class="nav-visible-toggle" :title="tool.visible ? '点击隐藏' : '点击显示'">
                    <input v-model="tool.visible" type="checkbox" />
                  </label>
                  <i class="tool-icon" :class="tool.icon" aria-hidden="true"></i>
                  <input v-model="tool.label" class="tool-input" aria-label="导航名称" placeholder="导航名称" />
                  <button type="button" class="icon-button" title="上移" @click="moveTool(groupIndex, toolIndex, -1)">
                    <i class="ri-arrow-up-s-line" aria-hidden="true"></i>
                  </button>
                  <button type="button" class="icon-button" title="下移" @click="moveTool(groupIndex, toolIndex, 1)">
                    <i class="ri-arrow-down-s-line" aria-hidden="true"></i>
                  </button>
                </article>
                <p v-if="!group.tools.length" class="empty-state" style="padding: 6px 4px; font-size: 12px;">
                  拖动工具到此分组
                </p>
              </div>
            </section>
          </div>
          <footer class="dt-modal-foot">
            <button type="button" class="primary-button" @click="editingNav = false">
              <i class="ri-check-line" aria-hidden="true"></i>
              完成
            </button>
          </footer>
        </div>
      </div>
    </Teleport>
  </div>
</template>
