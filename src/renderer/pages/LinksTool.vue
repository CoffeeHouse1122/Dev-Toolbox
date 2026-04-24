<script setup lang="ts">
import { computed, ref, watch } from "vue";

type LinkItem = {
  id: string;
  title: string;
  url: string;
  category: string;
  description: string;
};

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
const status = ref("");
const showModal = ref(false);
const draft = ref<LinkItem>(emptyDraft());
const editing = computed(() => !!draft.value.id);

const categories = computed(() => ["全部", ...Array.from(new Set(links.value.map((item) => item.category).filter(Boolean)))]);
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
    return raw ? (JSON.parse(raw) as LinkItem[]) : defaultLinks;
  } catch {
    return defaultLinks;
  }
}

function normalizeUrl(url: string) {
  const trimmed = url.trim();
  if (!trimmed) return "";
  return /^https?:\/\//i.test(trimmed) ? trimmed : `https://${trimmed}`;
}

function openCreate() {
  draft.value = emptyDraft();
  showModal.value = true;
}

function openEdit(item: LinkItem) {
  draft.value = { ...item };
  showModal.value = true;
}

function closeModal() {
  showModal.value = false;
}

function saveDraft() {
  const title = draft.value.title.trim();
  const url = normalizeUrl(draft.value.url);
  if (!title || !url) {
    status.value = "请填写名称和 URL。";
    return;
  }
  const item = { ...draft.value, id: draft.value.id || crypto.randomUUID(), title, url, category: draft.value.category.trim() || "未分类" };
  const index = links.value.findIndex((link) => link.id === item.id);
  if (index >= 0) {
    links.value[index] = item;
    status.value = "已更新链接。";
  } else {
    links.value.unshift(item);
    status.value = "已新增链接。";
  }
  showModal.value = false;
}

function removeLink(id: string) {
  const target = links.value.find((item) => item.id === id);
  links.value = links.value.filter((item) => item.id !== id);
  status.value = target ? `已删除：${target.title}` : "已删除。";
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
    if (!next?.length) {
      status.value = "未找到可导入的链接。";
      return;
    }
    links.value = next.map((item) => ({ ...item, id: item.id || crypto.randomUUID() }));
    status.value = `已导入 ${links.value.length} 条。`;
  } catch (error) {
    status.value = error instanceof Error ? error.message : String(error);
  }
}

async function exportConfig() {
  const dir = await window.devToolbox.selectOutputDir();
  if (!dir) return;
  const fileName = `dev-toolbox-links-${new Date().toISOString().slice(0, 10)}.json`;
  const output = await window.devToolbox.writeTextFile(
    dir,
    fileName,
    `${JSON.stringify({ version: 1, exportedAt: new Date().toISOString(), links: links.value }, null, 2)}\n`
  );
  status.value = `已导出：${output}`;
}

function resetLinks() {
  links.value = [...defaultLinks];
  status.value = "已恢复默认网站。";
}

watch(
  links,
  () => {
    localStorage.setItem(storageKey, JSON.stringify(links.value));
  },
  { deep: true }
);
</script>

<template>
  <section class="tool-page">
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
              @click="category = item"
            >
              {{ item }}
            </button>
          </div>
        </div>
        <div class="links-meta">
          <span class="status-pill">{{ filteredLinks.length }} / {{ links.length }}</span>
          <span v-if="status" class="empty-state">{{ status }}</span>
        </div>
      </div>

      <div class="links-grid">
        <article v-for="item in filteredLinks" :key="item.id" class="link-card">
          <div class="link-card-head">
            <strong>{{ item.title }}</strong>
            <span class="link-tag">{{ item.category }}</span>
          </div>
          <p v-if="item.description">{{ item.description }}</p>
          <small>{{ item.url }}</small>
          <div class="link-card-actions">
            <button type="button" class="primary-button" @click="openLink(item.url)">
              <i class="ri-external-link-line" aria-hidden="true"></i>
              打开
            </button>
            <button type="button" class="icon-button" title="编辑" @click="openEdit(item)">
              <i class="ri-edit-line" aria-hidden="true"></i>
            </button>
            <button type="button" class="icon-button" title="删除" @click="removeLink(item.id)">
              <i class="ri-delete-bin-line" aria-hidden="true"></i>
            </button>
          </div>
        </article>
        <p v-if="!filteredLinks.length" class="empty-state link-empty">暂无匹配链接，点击右上角"新增链接"开始添加。</p>
      </div>
    </div>

    <Teleport to="body">
      <div v-if="showModal" class="dt-modal-mask" @click.self="closeModal" @keydown.esc="closeModal">
        <div class="dt-modal" role="dialog" aria-modal="true">
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
              <label class="field">
                <span>分类</span>
                <input v-model="draft.category" placeholder="技术文档" />
              </label>
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
        </div>
      </div>
    </Teleport>
  </section>
</template>
