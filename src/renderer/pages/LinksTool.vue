<script setup lang="ts">
import { AnimatePresence, motion } from "motion-v";
import { computed, onBeforeUnmount, ref, watch, type CSSProperties } from "vue";

type LinkItem = {
  id: string;
  title: string;
  url: string;
  category: string;
  description: string;
};

type ToastTone = "success" | "error" | "info";
type DropPlacement = "before" | "after";

const storageKey = "dev-toolbox.links.v1";
const defaultLinks: LinkItem[] = [
  { id: "mdn", title: "MDN Web Docs", url: "https://developer.mozilla.org/zh-CN/", category: "技术文档", description: "Web API、HTML、CSS、JavaScript 文档" },
  { id: "vue", title: "Vue 文档", url: "https://cn.vuejs.org/", category: "框架", description: "Vue 3 官方中文文档" },
  { id: "vite", title: "Vite 文档", url: "https://cn.vitejs.dev/", category: "构建工具", description: "Vite 官方中文文档" },
  { id: "electron", title: "Electron Docs", url: "https://www.electronjs.org/docs/latest/", category: "桌面端", description: "Electron 官方文档" },
  { id: "remixicon", title: "Remix Icon", url: "https://remixicon.com/", category: "资源", description: "图标库" },
  { id: "caniuse", title: "Can I Use", url: "https://caniuse.com/", category: "兼容性", description: "Web 特性浏览器支持查询" }
];

const links = ref<LinkItem[]>(loadLinks());
const query = ref("");
const category = ref("全部");
const showModal = ref(false);
const draft = ref<LinkItem>(emptyDraft());
const pendingDeleteLink = ref<LinkItem | null>(null);
const draggingLinkId = ref("");
const dragOverLinkId = ref("");
const dragPlacement = ref<DropPlacement>("before");
const categoryMenuOpen = ref(false);
const toast = ref({ visible: false, message: "", tone: "info" as ToastTone });
const editing = computed(() => !!draft.value.id);

let toastTimer: ReturnType<typeof setTimeout> | null = null;

const categoryTones = [
  { background: "#e6f6ff", border: "#84c5f4", color: "#0550ae" },
  { background: "#dcffe4", border: "#7ee787", color: "#1a7f37" },
  { background: "#fff8c5", border: "#eac54f", color: "#7d4e00" },
  { background: "#ffebe9", border: "#ffaba8", color: "#cf222e" },
  { background: "#fbefff", border: "#d8b9ff", color: "#8250df" },
  { background: "#fff1e5", border: "#ffb77c", color: "#9a6700" },
  { background: "#ddf4ff", border: "#80ccff", color: "#0969da" },
  { background: "#e8f7f5", border: "#6ed3cc", color: "#0a6866" }
];
const linkCardTransition = { type: "spring", stiffness: 360, damping: 24, mass: 0.76 };
const linkCardHover = { y: -4, rotateZ: -0.35, boxShadow: "0 12px 28px rgba(1, 4, 9, 0.12)" };
const linkCardPress = { y: -1, scale: 0.992, rotateZ: 0 };
const linkToastEnter = { opacity: 0, y: 12, scale: 0.98 };
const linkToastVisible = { opacity: 1, y: 0, scale: 1 };
const linkToastExit = { opacity: 0, y: 8, scale: 0.98 };
const dialogMaskEnter = { opacity: 0 };
const dialogMaskVisible = { opacity: 1 };
const dialogMaskExit = { opacity: 0 };
const dialogPanelEnter = { opacity: 0, y: 14, scale: 0.975 };
const dialogPanelVisible = { opacity: 1, y: 0, scale: 1 };
const dialogPanelExit = { opacity: 0, y: 8, scale: 0.985 };

const categoryNames = computed(() => Array.from(new Set(links.value.map((item) => item.category).filter(Boolean))));
const categories = computed(() => ["全部", ...categoryNames.value]);
const categoryToneMap = computed(() => new Map(categoryNames.value.map((name, index) => [name, categoryTones[index % categoryTones.length]])));
const filteredLinks = computed(() =>
  links.value.filter((item) => {
    const text = `${item.title} ${item.url} ${item.category} ${item.description}`.toLowerCase();
    const matchesQuery = !query.value.trim() || text.includes(query.value.trim().toLowerCase());
    const matchesCategory = category.value === "全部" || item.category === category.value;
    return matchesQuery && matchesCategory;
  })
);

function emptyDraft(): LinkItem {
  return { id: "", title: "", url: "https://", category: "技术文档", description: "" };
}

function loadLinks(): LinkItem[] {
  try {
    const raw = localStorage.getItem(storageKey);
    return raw ? normalizeLinks(JSON.parse(raw) as LinkItem[]) : defaultLinks.map((item) => ({ ...item }));
  } catch {
    return defaultLinks.map((item) => ({ ...item }));
  }
}

function normalizeLinks(input: LinkItem[]) {
  if (!Array.isArray(input)) return [];
  return input
    .filter((item) => item && typeof item.title === "string" && typeof item.url === "string")
    .map((item) => ({
      id: item.id || crypto.randomUUID(),
      title: item.title.trim(),
      url: normalizeUrl(item.url),
      category: item.category?.trim() || "未分类",
      description: item.description?.trim() || ""
    }))
    .filter((item) => item.title && item.url);
}

function showToast(message: string, tone: ToastTone = "info") {
  toast.value = { visible: true, message, tone };
  if (toastTimer) clearTimeout(toastTimer);
  toastTimer = setTimeout(() => {
    toast.value.visible = false;
    toastTimer = null;
  }, 2600);
}

function categoryTagStyle(value: string): CSSProperties {
  const tone = categoryToneMap.value.get(value) || categoryTones[0];
  return {
    backgroundColor: tone.background,
    borderColor: tone.border,
    color: tone.color
  };
}

function categoryTabStyle(value: string): CSSProperties {
  if (value === "全部") {
    return {
      backgroundColor: "color-mix(in srgb, var(--accent) 10%, var(--surface))",
      borderColor: "color-mix(in srgb, var(--accent) 36%, var(--border))",
      color: "var(--accent-strong)"
    };
  }
  return categoryTagStyle(value);
}

function linkCardEnter(index: number) {
  return {
    opacity: 0,
    y: 10,
    x: index % 2 === 0 ? -8 : 8,
    rotateZ: index % 2 === 0 ? -0.5 : 0.5
  };
}

function linkCardVisible(index: number) {
  return {
    opacity: 1,
    y: 0,
    x: 0,
    rotateZ: 0,
    transition: { ...linkCardTransition, delay: Math.min(index * 0.035, 0.18) }
  };
}

function normalizeUrl(url: string) {
  const trimmed = url.trim();
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function openCreate() {
  draft.value = emptyDraft();
  categoryMenuOpen.value = false;
  showModal.value = true;
}

function openEdit(item: LinkItem) {
  draft.value = { ...item };
  categoryMenuOpen.value = false;
  showModal.value = true;
}

function closeModal() {
  showModal.value = false;
  categoryMenuOpen.value = false;
}

function chooseDraftCategory(value: string) {
  draft.value.category = value;
  categoryMenuOpen.value = false;
}

function saveDraft() {
  const title = draft.value.title.trim();
  const url = normalizeUrl(draft.value.url);
  if (!title || !url) {
    showToast("请填写名称和 URL。", "error");
    return;
  }
  const item = { ...draft.value, id: draft.value.id || crypto.randomUUID(), title, url, category: draft.value.category.trim() || "未分类" };
  const index = links.value.findIndex((link) => link.id === item.id);
  if (index >= 0) {
    links.value[index] = item;
    showToast("已更新链接。", "success");
  } else {
    links.value.unshift(item);
    showToast("已新增链接。", "success");
  }
  showModal.value = false;
  categoryMenuOpen.value = false;
}

function requestDeleteLink(item: LinkItem) {
  pendingDeleteLink.value = item;
}

function confirmDeleteLink() {
  const target = pendingDeleteLink.value;
  if (!target) return;
  links.value = links.value.filter((item) => item.id !== target.id);
  pendingDeleteLink.value = null;
  showToast(`已删除：${target.title}`, "success");
}

function moveLink(id: string, direction: -1 | 1) {
  const index = links.value.findIndex((item) => item.id === id);
  const next = index + direction;
  if (index < 0 || next < 0 || next >= links.value.length) return;
  const copy = [...links.value];
  const [item] = copy.splice(index, 1);
  copy.splice(next, 0, item);
  links.value = copy;
}

function startLinkDrag(event: DragEvent, id: string) {
  draggingLinkId.value = id;
  dragOverLinkId.value = "";
  event.dataTransfer?.setData("text/plain", id);
  if (event.dataTransfer) event.dataTransfer.effectAllowed = "move";
}

function handleLinkDragOver(event: DragEvent, id: string) {
  if (!draggingLinkId.value || draggingLinkId.value === id) return;
  event.preventDefault();
  const rect = (event.currentTarget as HTMLElement).getBoundingClientRect();
  dragOverLinkId.value = id;
  dragPlacement.value = event.clientY > rect.top + rect.height / 2 ? "after" : "before";
  if (event.dataTransfer) event.dataTransfer.dropEffect = "move";
}

function dropLink(event: DragEvent, targetId: string) {
  event.preventDefault();
  const sourceId = event.dataTransfer?.getData("text/plain") || draggingLinkId.value;
  reorderLink(sourceId, targetId, dragPlacement.value);
  endLinkDrag();
}

function endLinkDrag() {
  draggingLinkId.value = "";
  dragOverLinkId.value = "";
  dragPlacement.value = "before";
}

function reorderLink(sourceId: string, targetId: string, placement: DropPlacement) {
  if (!sourceId || sourceId === targetId) return;
  const sourceIndex = links.value.findIndex((item) => item.id === sourceId);
  const targetIndex = links.value.findIndex((item) => item.id === targetId);
  if (sourceIndex < 0 || targetIndex < 0) return;
  const copy = [...links.value];
  const [source] = copy.splice(sourceIndex, 1);
  let insertIndex = targetIndex + (placement === "after" ? 1 : 0);
  if (sourceIndex < insertIndex) insertIndex -= 1;
  copy.splice(insertIndex, 0, source);
  links.value = copy;
}

async function openLink(url: string) {
  await window.devToolbox.openExternal(normalizeUrl(url));
}

async function importConfig() {
  const files = await window.devToolbox.selectFiles([{ name: "JSON", extensions: ["json"] }], false);
  const file = files[0];
  if (!file) return;
  try {
    const content = await window.devToolbox.readTextFile(file);
    const parsed = JSON.parse(content) as { links?: LinkItem[] } | LinkItem[];
    const next = Array.isArray(parsed) ? parsed : parsed.links;
    const imported = normalizeLinks(next || []);
    if (!imported.length) {
      showToast("未找到可导入的链接。", "error");
      return;
    }
    links.value = imported;
    showToast(`已导入 ${links.value.length} 条链接。`, "success");
  } catch (error) {
    showToast(`导入失败：${error instanceof Error ? error.message : String(error)}`, "error");
  }
}

async function exportConfig() {
  try {
    const dir = await window.devToolbox.selectOutputDir();
    if (!dir) return;
    const fileName = `dev-toolbox-links-${new Date().toISOString().slice(0, 10)}.json`;
    const output = await window.devToolbox.writeTextFile(
      dir,
      fileName,
      `${JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), links: links.value }, null, 2)}\n`
    );
    showToast(`已导出：${output}`, "success");
  } catch (error) {
    showToast(`导出失败：${error instanceof Error ? error.message : String(error)}`, "error");
  }
}

function resetLinks() {
  links.value = defaultLinks.map((item) => ({ ...item }));
  showToast("已恢复默认网站。", "success");
}

onBeforeUnmount(() => {
  if (toastTimer) clearTimeout(toastTimer);
});

watch(
  links,
  () => {
    localStorage.setItem(storageKey, JSON.stringify(links.value));
  },
  { deep: true }
);
</script>

<template>
  <section class="tool-page links-tool">
    <div class="tool-header">
      <div>
        <h2>常用网站和技术文档</h2>
        <p>维护本地常用链接，使用系统默认浏览器打开，支持导入导出</p>
      </div>
      <div class="header-actions">
        <button type="button" class="primary-button" @click="openCreate">
          <i class="ri-add-line" aria-hidden="true"></i>
          新增链接
        </button>
        <button type="button" class="secondary-button" @click="importConfig">
          <i class="ri-upload-2-line" aria-hidden="true"></i>
          导入
        </button>
        <button type="button" class="secondary-button" @click="exportConfig">
          <i class="ri-download-2-line" aria-hidden="true"></i>
          导出
        </button>
        <button type="button" class="secondary-button" @click="resetLinks" title="恢复默认链接">
          <i class="ri-reset-left-line" aria-hidden="true"></i>
          默认
        </button>
      </div>
    </div>

    <div class="tool-main">
      <div class="links-toolbar">
        <label class="field links-search-field">
          <span>搜索</span>
          <input v-model="query" placeholder="搜索名称、URL、说明" />
        </label>
        <div class="field links-cat-field">
          <span>分类</span>
          <div class="segmented links-category-tabs">
            <button
              v-for="item in categories"
              :key="item"
              type="button"
              :class="{ selected: item === category }"
              :style="categoryTabStyle(item)"
              @click="category = item"
            >
              {{ item }}
            </button>
          </div>
        </div>
        <div class="links-meta">
          <span class="status-pill">{{ filteredLinks.length }} / {{ links.length }}</span>
        </div>
      </div>

      <div class="links-grid">
        <motion.article
          v-for="(item, index) in filteredLinks"
          :key="item.id"
          class="link-card"
          :class="{
            dragging: item.id === draggingLinkId,
            'drop-before': item.id === dragOverLinkId && dragPlacement === 'before',
            'drop-after': item.id === dragOverLinkId && dragPlacement === 'after'
          }"
          :initial="linkCardEnter(index)"
          :animate="linkCardVisible(index)"
          :whileHover="linkCardHover"
          :whilePress="linkCardPress"
          draggable="true"
          @dragstart="startLinkDrag($event, item.id)"
          @dragover="handleLinkDragOver($event, item.id)"
          @dragleave="dragOverLinkId = dragOverLinkId === item.id ? '' : dragOverLinkId"
          @drop="dropLink($event, item.id)"
          @dragend="endLinkDrag"
        >
          <div class="link-card-head">
            <strong>{{ item.title }}</strong>
            <span class="link-tag" :style="categoryTagStyle(item.category)">{{ item.category }}</span>
          </div>
          <p v-if="item.description">{{ item.description }}</p>
          <small>{{ item.url }}</small>
          <div class="link-card-actions">
            <button type="button" class="primary-button" @click="openLink(item.url)">
              <i class="ri-external-link-line" aria-hidden="true"></i>
              打开
            </button>
            <button type="button" class="icon-button" title="上移" @click="moveLink(item.id, -1)">
              <i class="ri-arrow-up-s-line" aria-hidden="true"></i>
            </button>
            <button type="button" class="icon-button" title="下移" @click="moveLink(item.id, 1)">
              <i class="ri-arrow-down-s-line" aria-hidden="true"></i>
            </button>
            <button type="button" class="icon-button" title="编辑" @click="openEdit(item)">
              <i class="ri-edit-line" aria-hidden="true"></i>
            </button>
            <button type="button" class="icon-button" title="删除" @click="requestDeleteLink(item)">
              <i class="ri-delete-bin-line" aria-hidden="true"></i>
            </button>
          </div>
        </motion.article>
        <p v-if="!filteredLinks.length" class="empty-state link-empty">暂无匹配链接，点击右上角"新增链接"开始添加。</p>
      </div>
    </div>

    <AnimatePresence>
      <motion.div
        v-if="toast.visible"
        key="links-toast"
        class="links-toast"
        :class="toast.tone"
        role="status"
        aria-live="polite"
        :initial="linkToastEnter"
        :animate="linkToastVisible"
        :exit="linkToastExit"
        :transition="{ duration: 0.18, ease: 'easeOut' }"
      >
        <i :class="toast.tone === 'error' ? 'ri-error-warning-line' : toast.tone === 'success' ? 'ri-checkbox-circle-line' : 'ri-information-line'" aria-hidden="true"></i>
        <span>{{ toast.message }}</span>
      </motion.div>
    </AnimatePresence>

    <Teleport to="body">
      <AnimatePresence>
      <motion.div
        v-if="showModal"
        key="link-edit-modal"
        class="dt-modal-mask"
        :initial="dialogMaskEnter"
        :animate="dialogMaskVisible"
        :exit="dialogMaskExit"
        :transition="{ duration: 0.16 }"
        @keydown.esc="closeModal"
      >
        <motion.div
          class="dt-modal"
          role="dialog"
          aria-modal="true"
          :initial="dialogPanelEnter"
          :animate="dialogPanelVisible"
          :exit="dialogPanelExit"
          :transition="{ type: 'spring', stiffness: 420, damping: 34, mass: 0.75 }"
        >
          <header class="dt-modal-head">
            <h3>{{ editing ? "编辑链接" : "新增链接" }}</h3>
            <button type="button" class="icon-button" @click="closeModal" title="关闭">
              <i class="ri-close-line" aria-hidden="true"></i>
            </button>
          </header>
          <div class="dt-modal-body">
            <div class="option-grid">
              <label class="field">
                <span>名称</span>
                <input v-model="draft.title" placeholder="例如 Vue 文档" />
              </label>
              <div class="field links-category-field">
                <span>分类</span>
                <div class="links-category-combobox">
                  <input v-model="draft.category" placeholder="输入新分类或选择已有分类" @focus="categoryMenuOpen = true" @input="categoryMenuOpen = true" />
                  <button type="button" class="icon-button" title="选择已有分类" @click="categoryMenuOpen = !categoryMenuOpen">
                    <i :class="categoryMenuOpen ? 'ri-arrow-up-s-line' : 'ri-arrow-down-s-line'" aria-hidden="true"></i>
                  </button>
                  <div v-if="categoryMenuOpen && categoryNames.length" class="links-category-menu">
                    <button
                      v-for="item in categoryNames"
                      :key="item"
                      type="button"
                      :class="{ active: item === draft.category }"
                      :style="categoryTagStyle(item)"
                      @mousedown.prevent="chooseDraftCategory(item)"
                    >
                      {{ item }}
                    </button>
                  </div>
                </div>
              </div>
              <label class="field span-2">
                <span>URL</span>
                <input v-model="draft.url" placeholder="https://example.com" />
              </label>
              <label class="field span-2">
                <span>说明（可选）</span>
                <textarea v-model="draft.description" class="tool-textarea compact"></textarea>
              </label>
            </div>
          </div>
          <footer class="dt-modal-foot">
            <button type="button" class="secondary-button" @click="closeModal">
              取消
            </button>
            <button type="button" class="primary-button" @click="saveDraft">
              <i class="ri-save-3-line" aria-hidden="true"></i>
              {{ editing ? "保存修改" : "添加" }}
            </button>
          </footer>
        </motion.div>
      </motion.div>

      <motion.div
        v-if="pendingDeleteLink"
        key="link-delete-modal"
        class="dt-modal-mask"
        :initial="dialogMaskEnter"
        :animate="dialogMaskVisible"
        :exit="dialogMaskExit"
        :transition="{ duration: 0.16 }"
      >
        <motion.div
          class="dt-modal links-confirm-dialog"
          role="dialog"
          aria-modal="true"
          :initial="dialogPanelEnter"
          :animate="dialogPanelVisible"
          :exit="dialogPanelExit"
          :transition="{ type: 'spring', stiffness: 420, damping: 34, mass: 0.75 }"
        >
          <header class="dt-modal-head">
            <h3>删除链接</h3>
            <button type="button" class="icon-button" title="关闭" @click="pendingDeleteLink = null">
              <i class="ri-close-line" aria-hidden="true"></i>
            </button>
          </header>
          <div class="dt-modal-body">
            <p>确认删除“{{ pendingDeleteLink.title }}”？删除后不会保留在回收站。</p>
            <small>{{ pendingDeleteLink.url }}</small>
          </div>
          <footer class="dt-modal-foot">
            <button type="button" class="secondary-button" @click="pendingDeleteLink = null">取消</button>
            <button type="button" class="primary-button links-danger-button" @click="confirmDeleteLink">
              <i class="ri-delete-bin-line" aria-hidden="true"></i>
              删除
            </button>
          </footer>
        </motion.div>
      </motion.div>
      </AnimatePresence>
    </Teleport>
  </section>
</template>

<style scoped>
.links-tool {
  position: relative;
}

.link-card {
  cursor: grab;
}

.link-card:active {
  cursor: grabbing;
}

.link-card.dragging {
  opacity: 0.52;
  transform: scale(0.985);
}

.link-card.drop-before {
  box-shadow: inset 0 3px 0 0 var(--accent), 0 4px 14px color-mix(in srgb, var(--accent) 14%, transparent);
}

.link-card.drop-after {
  box-shadow: inset 0 -3px 0 0 var(--accent), 0 4px 14px color-mix(in srgb, var(--accent) 14%, transparent);
}

.link-card-actions,
.link-card-actions button {
  cursor: pointer;
}

.links-category-field {
  position: relative;
}

.links-category-combobox {
  position: relative;
  display: grid;
  grid-template-columns: minmax(0, 1fr) 34px;
  gap: 8px;
  align-items: center;
}

.links-category-combobox .icon-button {
  width: 34px;
  height: 34px;
}

.links-category-menu {
  position: absolute;
  z-index: 45;
  top: calc(100% + 6px);
  left: 0;
  right: 42px;
  display: flex;
  flex-wrap: wrap;
  gap: 6px;
  max-height: 148px;
  overflow: auto;
  padding: 8px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  box-shadow: 0 16px 38px rgba(1, 4, 9, 0.18);
}

.links-category-menu button {
  min-height: 26px;
  padding: 3px 9px;
  border: 1px solid var(--border);
  border-radius: 999px;
  font-size: 12px;
  font-weight: 700;
  cursor: pointer;
}

.links-category-menu button:hover,
.links-category-menu button.active {
  box-shadow: inset 0 0 0 1px currentColor;
}

.links-category-tabs button {
  box-shadow: inset 0 0 0 0 transparent;
  transition: box-shadow 0.14s ease, transform 0.14s ease;
}

.links-category-tabs button:hover,
.links-category-tabs button.selected {
  box-shadow: inset 0 0 0 1px currentColor;
}

.links-category-tabs button.selected {
  transform: translateY(-1px);
}

.links-toast {
  position: fixed;
  right: 24px;
  bottom: 24px;
  z-index: 90;
  display: grid;
  grid-template-columns: 18px minmax(0, 1fr);
  align-items: center;
  gap: 8px;
  max-width: min(440px, calc(100vw - 48px));
  padding: 11px 14px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  color: var(--text);
  box-shadow: 0 16px 38px rgba(1, 4, 9, 0.2);
  -webkit-app-region: no-drag;
}

.links-toast span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.links-toast.success {
  border-color: color-mix(in srgb, var(--success) 42%, var(--border));
}

.links-toast.success i {
  color: var(--success);
}

.links-toast.error {
  border-color: color-mix(in srgb, var(--danger) 46%, var(--border));
}

.links-toast.error i {
  color: var(--danger);
}

.links-toast.info i {
  color: var(--accent-strong);
}

.links-confirm-dialog .dt-modal-body {
  display: grid;
  gap: 8px;
}

.links-confirm-dialog p {
  margin: 0;
  line-height: 1.7;
}

.links-confirm-dialog small {
  overflow: hidden;
  color: var(--muted);
  font-family: var(--font-mono);
  font-size: 12px;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.links-danger-button {
  border-color: var(--danger);
  background: color-mix(in srgb, var(--danger) 92%, var(--surface));
}

.links-danger-button:hover:not(:disabled) {
  border-color: var(--danger);
  background: color-mix(in srgb, var(--danger) 82%, var(--surface));
}
</style>
