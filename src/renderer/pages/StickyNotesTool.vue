<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import type { StickyNote } from "../../shared/types";

type ExportBlock =
  | { type: "text"; value: string }
  | { type: "blank" }
  | { type: "image"; src: string };

const imageTokenPattern = /!\[[^\]]*\]\((data:image\/[^)]+)\)/g;
const richNoteMarker = "<!-- dev-toolbox-note-html:v1 -->";
const editorPositionStorageKey = "dev-toolbox.sticky-notes.position.v1";
const urlPattern = /((?:https?:\/\/|www\.)[^\s<>"']+|mailto:[^\s<>"']+)/gi;

type EditorPositionState = {
  activeId: string;
  caretOffset: number;
  scrollTop: number;
};

const directory = ref("");
const notes = ref<StickyNote[]>([]);
const activeId = ref("");
const draftContent = ref("");
const busy = ref(false);
const saveState = ref("未保存");
const fontSize = ref(16);
const fontColor = ref("#1f2328");
const editorRef = ref<HTMLElement | null>(null);
const previewViewportRef = ref<HTMLElement | null>(null);
const previewImage = ref("");
const previewScale = ref(1);
const previewOffset = ref({ x: 0, y: 0 });
const pendingDeleteNote = ref<StickyNote | null>(null);

let saveTimer: ReturnType<typeof setTimeout> | null = null;
let suppressSave = false;
let previewDrag:
  | {
      pointerId: number;
      startX: number;
      startY: number;
      originX: number;
      originY: number;
    }
  | null = null;

const activeNote = computed(() => notes.value.find((note) => note.id === activeId.value) ?? null);

function sortNotes(input: StickyNote[]) {
  return [...input].sort((left, right) => Number(right.pinned) - Number(left.pinned) || right.updatedAt - left.updatedAt);
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

function imageToken(src: string) {
  return `![粘贴图片](${src})`;
}

function normalizeLinkHref(value: string) {
  if (/^www\./i.test(value)) return `https://${value}`;
  return value;
}

function linkifyPlainText(value: string) {
  urlPattern.lastIndex = 0;
  let html = "";
  let cursor = 0;
  let match: RegExpExecArray | null;
  while ((match = urlPattern.exec(value))) {
    const text = match[0];
    html += escapeHtml(value.slice(cursor, match.index));
    html += `<a href="${escapeHtml(normalizeLinkHref(text))}" data-note-link="${escapeHtml(normalizeLinkHref(text))}">${escapeHtml(text)}</a>`;
    cursor = match.index + text.length;
  }
  html += escapeHtml(value.slice(cursor));
  return html;
}

function noteTextToEditorHtml(content: string) {
  const lines = content.split(/\r?\n/);
  return lines
    .map((line) => {
      imageTokenPattern.lastIndex = 0;
      let html = "";
      let cursor = 0;
      let match: RegExpExecArray | null;
      while ((match = imageTokenPattern.exec(line))) {
        html += linkifyPlainText(line.slice(cursor, match.index));
        html += `<img src="${match[1]}" data-note-src="${match[1]}" alt="粘贴图片" class="note-inline-image">`;
        cursor = match.index + match[0].length;
      }
      html += linkifyPlainText(line.slice(cursor));
      return html;
    })
    .join("<br>");
}

function contentToEditorHtml(content: string) {
  return content.startsWith(richNoteMarker) ? content.slice(richNoteMarker.length) : noteTextToEditorHtml(content);
}

function editorDomToStoredContent(root: HTMLElement) {
  return `${richNoteMarker}${root.innerHTML}`;
}

function contentToPlainText(content: string) {
  if (!content.startsWith(richNoteMarker)) return content.replace(imageTokenPattern, "[图片]");
  const container = document.createElement("div");
  container.innerHTML = content.slice(richNoteMarker.length);
  return container.innerText.replace(/\u200b/g, "").trim();
}

function fileBaseName(note: StickyNote) {
  return note.title.replace(/[<>:"/\\|?*\x00-\x1F]/g, " ").replace(/\s+/g, " ").trim().slice(0, 36) || "便签";
}

function loadEditorPosition(): EditorPositionState | null {
  try {
    const raw = localStorage.getItem(editorPositionStorageKey);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<EditorPositionState>;
    return {
      activeId: String(parsed.activeId || ""),
      caretOffset: Number(parsed.caretOffset || 0),
      scrollTop: Number(parsed.scrollTop || 0)
    };
  } catch {
    return null;
  }
}

function textLengthForNode(node: Node) {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent?.length ?? 0;
  if (node instanceof HTMLBRElement) return 1;
  if (node instanceof HTMLImageElement) return 1;
  return 0;
}

function getCaretOffset(root: HTMLElement) {
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return 0;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.startContainer)) return 0;
  let offset = 0;
  let found = false;

  const walk = (node: Node) => {
    if (found) return;
    if (node === range.startContainer) {
      offset += range.startOffset;
      found = true;
      return;
    }
    if (node.nodeType === Node.TEXT_NODE || node instanceof HTMLBRElement || node instanceof HTMLImageElement) {
      offset += textLengthForNode(node);
      return;
    }
    for (const child of Array.from(node.childNodes)) walk(child);
  };

  walk(root);
  return offset;
}

function storeEditorPosition() {
  if (!activeId.value) return;
  const payload: EditorPositionState = {
    activeId: activeId.value,
    caretOffset: editorRef.value ? getCaretOffset(editorRef.value) : 0,
    scrollTop: editorRef.value?.scrollTop ?? 0
  };
  localStorage.setItem(editorPositionStorageKey, JSON.stringify(payload));
}

function restoreEditorPosition(noteId: string) {
  const saved = loadEditorPosition();
  const root = editorRef.value;
  if (!saved || saved.activeId !== noteId || !root) return;

  requestAnimationFrame(() => {
    const selection = window.getSelection();
    if (!selection) return;
    const range = document.createRange();
    let remaining = saved.caretOffset;
    let placed = false;

    const walk = (node: Node) => {
      if (placed) return;
      if (node.nodeType === Node.TEXT_NODE) {
        const length = node.textContent?.length ?? 0;
        if (remaining <= length) {
          range.setStart(node, Math.max(0, remaining));
          range.collapse(true);
          placed = true;
          return;
        }
        remaining -= length;
        return;
      }
      if (node instanceof HTMLBRElement || node instanceof HTMLImageElement) {
        if (remaining <= 1) {
          range.setStartAfter(node);
          range.collapse(true);
          placed = true;
          return;
        }
        remaining -= 1;
        return;
      }
      for (const child of Array.from(node.childNodes)) walk(child);
    };

    walk(root);
    if (!placed) {
      range.selectNodeContents(root);
      range.collapse(false);
    }
    selection.removeAllRanges();
    selection.addRange(range);
    root.scrollTop = saved.scrollTop;
    root.focus();
  });
}

async function saveNoteContent(id: string, content: string) {
  const wasActive = activeId.value === id;
  const saved = await window.devToolbox.saveStickyNote(id, content);
  const oldIndex = notes.value.findIndex((note) => note.id === id);
  if (oldIndex >= 0) {
    notes.value.splice(oldIndex, 1, saved);
  } else {
    notes.value = [saved, ...notes.value];
  }
  notes.value = sortNotes(notes.value);
  if (wasActive) {
    activeId.value = saved.id;
    draftContent.value = saved.content;
    saveState.value = "已保存";
    storeEditorPosition();
  }
  return saved;
}

async function flushPendingSave() {
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  if (activeId.value && saveState.value === "待保存") {
    await saveNoteContent(activeId.value, draftContent.value);
  }
}

async function loadNotes() {
  busy.value = true;
  try {
    const state = await window.devToolbox.loadStickyNotes();
    const savedPosition = loadEditorPosition();
    directory.value = state.directory;
    notes.value = sortNotes(state.notes);
    if (!activeId.value && state.notes[0]) {
      const preferredNote = state.notes.find((note) => note.id === savedPosition?.activeId) ?? state.notes[0];
      await selectNote(preferredNote, true);
    }
    if (activeId.value && !state.notes.some((note) => note.id === activeId.value)) {
      await selectNote(state.notes[0] ?? null, true);
    }
  } finally {
    busy.value = false;
  }
}

async function selectNote(note: StickyNote | null, restorePosition = false) {
  await flushPendingSave();
  suppressSave = true;
  activeId.value = note?.id ?? "";
  draftContent.value = note?.content ?? "";
  saveState.value = note ? "已保存" : "未选择";
  await nextTick();
  if (editorRef.value) editorRef.value.innerHTML = note ? contentToEditorHtml(note.content) : "";
  if (note && restorePosition) restoreEditorPosition(note.id);
  else storeEditorPosition();
  queueMicrotask(() => {
    suppressSave = false;
  });
}

async function createNote() {
  const note = await window.devToolbox.createStickyNote("新便签\n");
  notes.value = [note, ...notes.value];
  await selectNote(note);
}

async function chooseDirectory() {
  const target = await window.devToolbox.selectOutputDir();
  if (!target) return;
  await flushPendingSave();
  const state = await window.devToolbox.setStickyNotesDirectory(target);
  directory.value = state.directory;
  notes.value = sortNotes(state.notes);
  await selectNote(state.notes[0] ?? null);
}

async function toggleNotePinned(note: StickyNote) {
  const state = await window.devToolbox.setStickyNotePinned(note.id, !note.pinned);
  directory.value = state.directory;
  notes.value = sortNotes(state.notes);
  if (activeId.value && !notes.value.some((item) => item.id === activeId.value)) {
    await selectNote(notes.value[0] ?? null);
  }
}

function requestDeleteNote(note: StickyNote) {
  pendingDeleteNote.value = note;
}

async function confirmDeleteNote() {
  const note = pendingDeleteNote.value;
  if (!note) return;
  await window.devToolbox.deleteStickyNote(note.id);
  notes.value = notes.value.filter((item) => item.id !== note.id);
  if (activeId.value === note.id) await selectNote(notes.value[0] ?? null);
  pendingDeleteNote.value = null;
}

async function saveActiveNote() {
  if (!activeId.value) return;
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  saveState.value = "保存中";
  await saveNoteContent(activeId.value, draftContent.value);
}

function scheduleSave() {
  if (suppressSave || !activeId.value) return;
  saveState.value = "待保存";
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    void saveActiveNote();
  }, 650);
}

function syncEditorContent() {
  if (!editorRef.value) return;
  draftContent.value = editorDomToStoredContent(editorRef.value);
  storeEditorPosition();
  scheduleSave();
}

function openPreviewImage(src: string) {
  previewImage.value = src;
  previewScale.value = 1;
  previewOffset.value = { x: 0, y: 0 };
  previewDrag = null;
}

function closePreviewImage() {
  previewImage.value = "";
  previewDrag = null;
}

function setPreviewScale(nextScale: number, anchor?: { clientX: number; clientY: number }) {
  const viewport = previewViewportRef.value;
  const next = Math.min(6, Math.max(0.2, Number(nextScale.toFixed(2))));
  if (!viewport || !anchor) {
    previewScale.value = next;
    return;
  }

  const rect = viewport.getBoundingClientRect();
  const localX = anchor.clientX - rect.left - rect.width / 2;
  const localY = anchor.clientY - rect.top - rect.height / 2;
  const contentX = (localX - previewOffset.value.x) / previewScale.value;
  const contentY = (localY - previewOffset.value.y) / previewScale.value;
  previewScale.value = next;
  previewOffset.value = {
    x: localX - contentX * next,
    y: localY - contentY * next
  };
}

function zoomPreview(delta: number) {
  const viewport = previewViewportRef.value;
  if (!viewport) {
    setPreviewScale(previewScale.value + delta);
    return;
  }
  const rect = viewport.getBoundingClientRect();
  setPreviewScale(previewScale.value + delta, {
    clientX: rect.left + rect.width / 2,
    clientY: rect.top + rect.height / 2
  });
}

function resetPreviewView() {
  previewScale.value = 1;
  previewOffset.value = { x: 0, y: 0 };
}

function handlePreviewWheel(event: WheelEvent) {
  event.preventDefault();
  setPreviewScale(previewScale.value * (event.deltaY < 0 ? 1.12 : 0.88), event);
}

function startPreviewDrag(event: PointerEvent) {
  event.preventDefault();
  previewDrag = {
    pointerId: event.pointerId,
    startX: event.clientX,
    startY: event.clientY,
    originX: previewOffset.value.x,
    originY: previewOffset.value.y
  };
  (event.currentTarget as HTMLElement).setPointerCapture(event.pointerId);
}

function movePreviewDrag(event: PointerEvent) {
  if (!previewDrag || previewDrag.pointerId !== event.pointerId) return;
  event.preventDefault();
  previewOffset.value = {
    x: previewDrag.originX + event.clientX - previewDrag.startX,
    y: previewDrag.originY + event.clientY - previewDrag.startY
  };
}

function endPreviewDrag(event: PointerEvent) {
  if (!previewDrag || previewDrag.pointerId !== event.pointerId) return;
  (event.currentTarget as HTMLElement).releasePointerCapture(event.pointerId);
  previewDrag = null;
}

function handleEditorClick(event: MouseEvent) {
  const target = event.target;
  if (target instanceof Element) {
    const link = target.closest<HTMLAnchorElement>("a[data-note-link]");
    if (link?.href) {
      event.preventDefault();
      void window.devToolbox.openExternal(link.href);
      return;
    }
  }
  if (target instanceof HTMLImageElement) {
    openPreviewImage(target.dataset.noteSrc || target.currentSrc || target.src);
  }
}

function applyBold() {
  editorRef.value?.focus();
  document.execCommand("bold");
  syncEditorContent();
}

function applyForeColor() {
  editorRef.value?.focus();
  document.execCommand("foreColor", false, fontColor.value);
  syncEditorContent();
}

function applyFontSize() {
  const root = editorRef.value;
  const selection = window.getSelection();
  if (!root || !selection || selection.rangeCount === 0) return;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer) || range.collapsed) return;
  const span = document.createElement("span");
  span.style.fontSize = `${fontSize.value}px`;
  span.appendChild(range.extractContents());
  range.insertNode(span);
  range.selectNodeContents(span);
  range.collapse(false);
  selection.removeAllRanges();
  selection.addRange(range);
  syncEditorContent();
}

function insertHtmlAtCursor(html: string) {
  editorRef.value?.focus();
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;
  const range = selection.getRangeAt(0);
  range.deleteContents();
  const fragment = range.createContextualFragment(html);
  const lastChild = fragment.lastChild;
  range.insertNode(fragment);
  if (lastChild) {
    range.setStartAfter(lastChild);
    range.collapse(true);
    selection.removeAllRanges();
    selection.addRange(range);
  }
}

function readClipboardFile(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

async function handlePaste(event: ClipboardEvent) {
  if (!activeNote.value) return;
  const items = Array.from(event.clipboardData?.items || []);
  const imageItems = items.filter((item) => item.type.startsWith("image/"));
  const plainText = event.clipboardData?.getData("text/plain") || "";

  event.preventDefault();
  if (!imageItems.length) {
    insertHtmlAtCursor(linkifyPlainText(plainText).replace(/\r?\n/g, "<br>"));
    syncEditorContent();
    return;
  }

  for (const item of imageItems) {
    const file = item.getAsFile();
    if (!file) continue;
    const dataUrl = await readClipboardFile(file);
    insertHtmlAtCursor(`<img src="${dataUrl}" data-note-src="${dataUrl}" alt="粘贴图片" class="note-inline-image"><br>`);
  }
  syncEditorContent();
}

function formatTime(value: number) {
  const date = new Date(value);
  const pad = (input: number) => String(input).padStart(2, "0");
  return `${date.getFullYear()}/${pad(date.getMonth() + 1)}/${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}`;
}

function wrapText(context: CanvasRenderingContext2D, text: string, maxWidth: number) {
  const lines: string[] = [];
  for (const paragraph of text.split(/\r?\n/)) {
    let line = "";
    for (const char of paragraph) {
      const test = line + char;
      if (context.measureText(test).width > maxWidth && line) {
        lines.push(line);
        line = char;
      } else {
        line = test;
      }
    }
    lines.push(line || " ");
  }
  return lines;
}

function loadImage(src: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.onload = () => resolve(image);
    image.onerror = reject;
    image.src = src;
  });
}

function parseExportBlocks(content: string): ExportBlock[] {
  if (content.startsWith(richNoteMarker)) {
    const container = document.createElement("div");
    container.innerHTML = content.slice(richNoteMarker.length);
    const blocks: ExportBlock[] = [];
    const pushText = (value: string) => {
      for (const line of value.replace(/\u200b/g, "").split(/\r?\n/)) {
        blocks.push(line.trim() ? { type: "text", value: line.replace(/\s+$/, "") } : { type: "blank" });
      }
    };
    const walk = (node: Node) => {
      if (node.nodeType === Node.TEXT_NODE) {
        pushText(node.textContent || "");
        return;
      }
      if (!(node instanceof HTMLElement)) return;
      if (node instanceof HTMLImageElement) {
        blocks.push({ type: "image", src: node.dataset.noteSrc || node.currentSrc || node.src });
        return;
      }
      if (node instanceof HTMLBRElement) {
        blocks.push({ type: "blank" });
        return;
      }
      for (const child of Array.from(node.childNodes)) walk(child);
      if (["div", "p", "section", "article", "li"].includes(node.tagName.toLowerCase())) blocks.push({ type: "blank" });
    };
    for (const child of Array.from(container.childNodes)) walk(child);
    return blocks.filter((block, index, list) => !(block.type === "blank" && list[index - 1]?.type === "blank"));
  }

  const lines = (content || "").split(/\r?\n/);
  const parsedBlocks: ExportBlock[] = [];
  for (const line of lines) {
    if (!line) {
      parsedBlocks.push({ type: "blank" });
      continue;
    }
    const blocks: ExportBlock[] = [];
    imageTokenPattern.lastIndex = 0;
    let cursor = 0;
    let match: RegExpExecArray | null;
    while ((match = imageTokenPattern.exec(line))) {
      const text = line.slice(cursor, match.index).replace(/\s+$/, "");
      if (text) blocks.push({ type: "text", value: text });
      blocks.push({ type: "image", src: match[1] });
      cursor = match.index + match[0].length;
    }
    const rest = line.slice(cursor).replace(/\s+$/, "");
    if (rest) blocks.push({ type: "text", value: rest });
    parsedBlocks.push(...(blocks.length ? blocks : [{ type: "blank" } satisfies ExportBlock]));
  }
  return parsedBlocks;
}

async function exportActiveAsImage() {
  if (!activeNote.value) return;
  await flushPendingSave();
  const note = activeNote.value;
  if (!note) return;
  const target = await window.devToolbox.selectOutputDir();
  if (!target) return;

  const blocks = parseExportBlocks(draftContent.value || note.title);
  const loadedImages = await Promise.all(
    blocks.map((block) => (block.type === "image" ? loadImage(block.src).catch(() => null) : Promise.resolve(null)))
  );
  const canvas = document.createElement("canvas");
  const context = canvas.getContext("2d");
  if (!context) return;

  const width = 980;
  const padding = 48;
  const contentWidth = width - padding * 2;
  const fontFamily = '"Source Han Sans CN", "Microsoft YaHei", sans-serif';
  context.font = `24px ${fontFamily}`;

  const blockHeights = blocks.map((block, index) => {
    if (block.type === "blank") return 28;
    if (block.type === "text") return wrapText(context, block.value, contentWidth).length * 36;
    const image = loadedImages[index];
    if (!image) return 0;
    const scale = Math.min(1, contentWidth / image.naturalWidth, 360 / image.naturalHeight);
    return Math.max(80, Math.round(image.naturalHeight * scale)) + 18;
  });
  const height = Math.max(360, padding * 2 + blockHeights.reduce((sum, item) => sum + item, 0));

  canvas.width = width;
  canvas.height = height;
  context.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--surface").trim() || "#ffffff";
  context.fillRect(0, 0, width, height);
  context.fillStyle = getComputedStyle(document.documentElement).getPropertyValue("--text").trim() || "#1f2328";
  context.font = `24px ${fontFamily}`;

  let y = padding;
  blocks.forEach((block, index) => {
    if (block.type === "blank") {
      y += 28;
      return;
    }
    if (block.type === "text") {
      for (const line of wrapText(context, block.value, contentWidth)) {
        context.fillText(line, padding, y);
        y += 36;
      }
      return;
    }

    const image = loadedImages[index];
    if (!image) return;
    const drawHeight = blockHeights[index] - 18;
    const drawWidth = Math.min(contentWidth, Math.round(image.naturalWidth * (drawHeight / image.naturalHeight)));
    context.drawImage(image, padding, y, drawWidth, drawHeight);
    y += drawHeight + 18;
  });

  await window.devToolbox.base64ToImage(canvas.toDataURL("image/png"), target, `${fileBaseName(note)}.png`);
}

onMounted(async () => {
  await loadNotes();
});

onBeforeUnmount(() => {
  void flushPendingSave();
});
</script>

<template>
  <section class="tool-page sticky-notes-tool">
    <div class="notes-workbench">
      <aside class="notes-side">
        <section class="tool-main notes-control-panel">
          <div class="section-title notes-panel-title">
            <h2>桌面便签</h2>
            <span class="status-pill" :class="{ running: busy }">{{ notes.length }} NOTES</span>
          </div>
          <div class="notes-action-grid">
            <button type="button" class="primary-button" @click="createNote">
              <i class="ri-add-line" aria-hidden="true"></i>
              新建
            </button>
            <button type="button" class="secondary-button" @click="chooseDirectory">
              <i class="ri-folder-open-line" aria-hidden="true"></i>
              目录
            </button>
          </div>
        </section>

        <section class="tool-main notes-directory-panel">
          <div class="notes-pathbar" :title="directory">
            <span>存储目录</span>
            <strong>{{ directory || "加载中..." }}</strong>
          </div>
          <div class="notes-list-head">
            <strong>便签目录</strong>
            <small>{{ notes.length }} 个文件</small>
          </div>
          <div v-if="notes.length" class="notes-list">
            <article
              v-for="note in notes"
              :key="note.id"
              class="note-card"
              :class="{ active: note.id === activeId, pinned: note.pinned }"
              :title="note.title"
              @click="selectNote(note)"
            >
              <div class="note-card-text">
                <strong>{{ note.title }}</strong>
                <small>{{ formatTime(note.updatedAt) }}</small>
              </div>
              <button type="button" class="icon-button" :title="note.pinned ? '取消置顶' : '置顶便签'" @click.stop="toggleNotePinned(note)">
                <i :class="note.pinned ? 'ri-pushpin-2-fill' : 'ri-pushpin-line'" aria-hidden="true"></i>
              </button>
              <button type="button" class="icon-button" title="删除便签" @click.stop="requestDeleteNote(note)">
                <i class="ri-delete-bin-line" aria-hidden="true"></i>
              </button>
            </article>
          </div>
          <p v-else class="empty-state">当前目录还没有 .txt 便签。</p>
        </section>
      </aside>

      <section class="tool-main note-editor-panel">
        <div class="section-title note-editor-head">
          <div>
            <h2 :title="activeNote?.title || ''">{{ activeNote?.title || "未选择便签" }}</h2>
            <span :title="activeNote?.fileName || ''">{{ activeNote?.fileName || "" }}</span>
          </div>
          <div class="header-actions note-editor-actions">
            <span class="status-pill note-save-state">{{ saveState }}</span>
            <button type="button" class="secondary-button" :disabled="!activeNote" @click="exportActiveAsImage">
              <i class="ri-image-line" aria-hidden="true"></i>
              导出图片
            </button>
          </div>
        </div>
        <div class="note-format-toolbar" :class="{ disabled: !activeNote }" aria-label="便签格式工具栏">
          <button type="button" class="icon-button" title="粗体" :disabled="!activeNote" @click="applyBold">
            <i class="ri-bold" aria-hidden="true"></i>
          </button>
          <label class="note-format-field" title="字号">
            <i class="ri-font-size" aria-hidden="true"></i>
            <input v-model.number="fontSize" type="number" min="10" max="48" step="1" :disabled="!activeNote" @change="applyFontSize" />
          </label>
          <label class="note-color-field" title="文字色值">
            <i class="ri-palette-line" aria-hidden="true"></i>
            <input v-model="fontColor" type="color" :disabled="!activeNote" @input="applyForeColor" />
          </label>
        </div>
        <div
          ref="editorRef"
          class="note-editor"
          :class="{ disabled: !activeNote }"
          contenteditable="true"
          spellcheck="false"
          data-placeholder="选择或新建一个便签后开始输入。可直接粘贴图片。"
          @click="handleEditorClick"
          @input="syncEditorContent"
          @keyup="storeEditorPosition"
          @mouseup="storeEditorPosition"
          @scroll="storeEditorPosition"
          @blur="storeEditorPosition"
          @paste="handlePaste"
        ></div>
      </section>
    </div>

    <Teleport to="body">
      <div v-if="previewImage" class="note-preview-mask">
        <div class="note-preview-dialog" role="dialog" aria-modal="true">
          <header class="note-preview-head">
            <strong>图片预览</strong>
            <div class="note-preview-actions">
              <button type="button" class="icon-button" title="缩小" @click="zoomPreview(-0.2)">
                <i class="ri-zoom-out-line" aria-hidden="true"></i>
              </button>
              <span>{{ Math.round(previewScale * 100) }}%</span>
              <button type="button" class="icon-button" title="放大" @click="zoomPreview(0.2)">
                <i class="ri-zoom-in-line" aria-hidden="true"></i>
              </button>
              <button type="button" class="secondary-button" @click="resetPreviewView">重置</button>
              <button type="button" class="icon-button" title="关闭预览" @click="closePreviewImage">
                <i class="ri-close-line" aria-hidden="true"></i>
              </button>
            </div>
          </header>
          <div
            ref="previewViewportRef"
            class="note-preview-viewport"
            @selectstart.prevent
            @dragstart.prevent
            @wheel="handlePreviewWheel"
            @pointerdown="startPreviewDrag"
            @pointermove="movePreviewDrag"
            @pointerup="endPreviewDrag"
            @pointercancel="endPreviewDrag"
          >
            <div
              class="note-preview-layer"
              :style="{
                transform: `translate(${previewOffset.x}px, ${previewOffset.y}px) scale(${previewScale})`
              }"
            >
              <img
                :src="previewImage"
                alt="便签图片预览"
                draggable="false"
              />
            </div>
          </div>
        </div>
      </div>

      <div v-if="pendingDeleteNote" class="note-confirm-mask">
        <div class="note-confirm-dialog" role="dialog" aria-modal="true">
          <h3>删除便签</h3>
          <p>确认删除“{{ pendingDeleteNote.title }}”？本地 .txt 文件也会被删除。</p>
          <div class="note-confirm-actions">
            <button type="button" class="secondary-button" @click="pendingDeleteNote = null">取消</button>
            <button type="button" class="primary-button danger-button" @click="confirmDeleteNote">
              <i class="ri-delete-bin-line" aria-hidden="true"></i>
              删除
            </button>
          </div>
        </div>
      </div>
    </Teleport>
  </section>
</template>

<style scoped>
.sticky-notes-tool {
  height: calc(100vh - 108px);
  min-height: 0;
  overflow: hidden;
}

.notes-workbench {
  display: grid;
  grid-template-columns: 320px minmax(0, 1fr);
  gap: 16px;
  height: 100%;
  min-height: 0;
}

.notes-side {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  gap: 16px;
  min-width: 0;
  min-height: 0;
}

.notes-control-panel,
.notes-directory-panel,
.note-editor-panel {
  min-width: 0;
}

.notes-panel-title,
.note-editor-head {
  min-width: 0;
}

.notes-action-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.notes-action-grid .secondary-button,
.notes-action-grid .primary-button {
  min-width: 0;
  padding-inline: 10px;
}

.notes-directory-panel {
  grid-template-rows: auto auto minmax(0, 1fr);
  align-content: start;
  overflow: hidden;
}

.notes-pathbar {
  min-width: 0;
  min-height: 62px;
  padding: 10px;
  overflow: hidden;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface-subtle);
}

.notes-pathbar span,
.notes-pathbar strong {
  display: block;
  min-width: 0;
  max-width: 100%;
}

.notes-pathbar span {
  margin-bottom: 4px;
  color: var(--muted);
  font-size: 12px;
}

.notes-pathbar strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  font-size: 13px;
}

.notes-list-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  min-width: 0;
}

.notes-list-head strong,
.notes-list-head small {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.notes-list-head small {
  color: var(--muted);
}

.notes-list {
  display: grid;
  align-content: start;
  align-items: start;
  gap: 8px;
  min-height: 0;
  overflow-y: auto;
  overflow-x: hidden;
  padding-right: 4px;
}

.note-card {
  display: grid;
  grid-template-columns: minmax(0, 1fr) 30px 30px;
  gap: 9px;
  align-items: center;
  width: 100%;
  height: 58px;
  min-width: 0;
  padding: 8px 10px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface-subtle);
  cursor: pointer;
}

.note-card.pinned {
  border-color: color-mix(in srgb, var(--accent) 42%, var(--border));
  background: color-mix(in srgb, var(--accent) 7%, var(--surface));
}

.note-card.pinned .note-card-text strong::before {
  content: "置顶 · ";
  color: var(--accent-strong);
}

.note-card.active {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 8%, var(--surface));
}

.note-card-text {
  min-width: 0;
}

.note-card strong,
.note-card small {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.note-card small {
  margin-top: 4px;
  color: var(--muted);
  font-size: 12px;
}

.note-card .icon-button {
  display: grid;
  place-items: center;
  width: 30px;
  height: 30px;
  min-width: 30px;
  padding: 0;
}

.note-card .icon-button i {
  display: grid;
  place-items: center;
  width: 100%;
  height: 100%;
  line-height: 1;
}

.note-editor-panel {
  display: grid;
  grid-template-rows: auto auto minmax(0, 1fr);
  height: 100%;
  min-height: 0;
  overflow: hidden;
}

.note-editor-head {
  align-items: center;
}

.note-editor-head > div:first-child {
  min-width: 0;
}

.note-editor-head h2,
.note-editor-head span {
  display: block;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.note-editor-head span {
  margin-top: 4px;
  color: var(--muted);
  font-size: 12px;
}

.note-editor-actions {
  flex: 0 0 auto;
  align-items: center;
}

.note-save-state {
  display: inline-grid;
  place-items: center;
  min-width: 62px;
  min-height: 28px;
  padding: 4px 10px;
  line-height: 22px;
  text-align: center;
}

.note-format-toolbar {
  display: flex;
  flex-wrap: wrap;
  align-items: center;
  gap: 8px;
  min-width: 0;
  padding: 8px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface-subtle);
}

.note-format-toolbar.disabled {
  opacity: 0.62;
}

.note-format-field,
.note-color-field {
  display: grid;
  grid-template-columns: 22px minmax(0, 1fr);
  align-items: center;
  gap: 6px;
  width: 104px;
  min-height: 34px;
  padding: 0 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface);
  color: var(--muted);
}

.note-format-field input,
.note-color-field input {
  min-height: 28px;
  padding: 0;
  border: 0;
  box-shadow: none;
}

.note-color-field {
  width: 76px;
}

.note-color-field input {
  height: 24px;
  cursor: pointer;
}

.note-editor {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 0;
  overflow: auto;
  padding: 16px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  color: var(--text);
  font: 14px/1.75 "Source Han Sans CN", "Microsoft YaHei", ui-sans-serif, system-ui, sans-serif;
  outline: none;
  overflow-wrap: anywhere;
  word-break: break-word;
  white-space: pre-wrap;
  user-select: text;
  -webkit-user-select: text;
}

.note-editor:focus {
  border-color: var(--accent);
}

.note-editor.disabled {
  pointer-events: none;
  color: var(--muted);
  background: var(--surface-subtle);
}

.note-editor:empty::before {
  content: attr(data-placeholder);
  color: var(--muted);
}

.note-editor :deep(img),
.note-editor :deep(.note-inline-image) {
  display: block;
  max-width: min(100%, 520px);
  max-height: 360px;
  object-fit: contain;
  margin: 10px 0;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface-subtle);
  cursor: zoom-in;
}

.note-editor :deep(a) {
  color: var(--accent-strong);
  text-decoration: underline;
  text-underline-offset: 3px;
  cursor: pointer;
}

.note-preview-mask,
.note-confirm-mask {
  position: fixed;
  inset: var(--titlebar-height) 0 0 0;
  z-index: 80;
  display: grid;
  place-items: center;
  padding: 28px;
  background: rgba(1, 4, 9, 0.58);
  -webkit-app-region: no-drag;
}

.note-preview-dialog {
  display: grid;
  grid-template-rows: auto minmax(0, 1fr);
  width: min(94vw, 1180px);
  height: min(90vh, 820px);
  min-width: 0;
  min-height: 0;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  box-shadow: var(--shadow);
  overflow: hidden;
}

.note-preview-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  min-width: 0;
  padding: 10px 12px;
  border-bottom: 1px solid var(--border);
  background: var(--surface-subtle);
}

.note-preview-head strong {
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}

.note-preview-actions {
  display: flex;
  align-items: center;
  gap: 8px;
}

.note-preview-actions span {
  min-width: 52px;
  color: var(--muted);
  font-size: 12px;
  font-weight: 700;
  text-align: center;
}

.note-preview-actions .secondary-button {
  min-height: 34px;
  padding-inline: 10px;
}

.note-preview-viewport {
  position: relative;
  display: grid;
  place-items: center;
  min-width: 0;
  min-height: 0;
  overflow: hidden;
  cursor: grab;
  touch-action: none;
  user-select: none;
  -webkit-user-select: none;
  background:
    linear-gradient(45deg, color-mix(in srgb, var(--border) 24%, transparent) 25%, transparent 25%),
    linear-gradient(-45deg, color-mix(in srgb, var(--border) 24%, transparent) 25%, transparent 25%),
    var(--surface);
  background-size: 18px 18px;
}

.note-preview-viewport:active {
  cursor: grabbing;
}

.note-preview-layer {
  position: absolute;
  inset: 0;
  display: grid;
  place-items: center;
  transform-origin: center center;
  will-change: transform;
  pointer-events: none;
}

.note-preview-layer img {
  display: block;
  max-width: calc(100% - 36px);
  max-height: calc(100% - 36px);
  object-fit: contain;
  user-select: none;
  -webkit-user-select: none;
  -webkit-user-drag: none;
}

.note-confirm-dialog {
  display: grid;
  gap: 14px;
  width: min(420px, 92vw);
  padding: 20px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  box-shadow: var(--shadow);
}

.note-confirm-dialog h3,
.note-confirm-dialog p {
  margin: 0;
}

.note-confirm-dialog p {
  color: var(--muted);
  line-height: 1.7;
}

.note-confirm-actions {
  display: flex;
  justify-content: flex-end;
  gap: 10px;
}

.danger-button {
  border-color: var(--danger);
  background: color-mix(in srgb, var(--danger) 92%, var(--surface));
}

.danger-button:hover:not(:disabled) {
  border-color: var(--danger);
  background: color-mix(in srgb, var(--danger) 82%, var(--surface));
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--danger) 12%, transparent);
}

.secondary-button.selected {
  border-color: var(--accent);
  color: var(--accent-strong);
  background: color-mix(in srgb, var(--accent) 8%, var(--surface));
}

@media (max-width: 960px) {
  .sticky-notes-tool {
    height: auto;
    min-height: calc(100vh - 108px);
    overflow: visible;
  }

  .notes-workbench {
    grid-template-columns: 1fr;
  }

  .notes-list {
    max-height: 260px;
  }
}
</style>