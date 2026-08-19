<script setup lang="ts">
import { computed, nextTick, onBeforeUnmount, onMounted, ref } from "vue";
import { onBeforeRouteLeave } from "vue-router";
import { toPng } from "html-to-image";
import type { DevToolboxApi, StickyNote, StickyNoteExportFormat, StickyNoteStyle, StickyNotesPreferences, StickyNotesState } from "../../shared/types";
import { flushRevisionBarrier } from "../../shared/revision-flush";
import GsapTransition from "../components/GsapTransition.vue";
import { showWorkspaceToast as showToast } from "../composables/useWorkspaceToast";

type NoteView = "active" | "archived" | "trash";
type ColorPaletteKind = "text" | "highlight" | "editorBackground";
type ExportBlock =
  | { type: "text"; value: string }
  | { type: "blank" }
  | { type: "image"; src: string };

const imageTokenPattern = /!\[[^\]]*\]\((data:image\/[^)]+)\)/g;
const richNoteMarker = "<!-- dev-toolbox-note-html:v1 -->";
const editorPositionStorageKey = "dev-toolbox.sticky-notes.position.v1";
const urlPattern = /((?:https?:\/\/|www\.)[^\s<>"']+|mailto:[^\s<>"']+)/gi;
const devToolbox = (window as unknown as Window & { devToolbox: DevToolboxApi }).devToolbox;

type EditorPositionState = {
  activeId: string;
  caretOffset: number;
  scrollTop: number;
};

type LinkEditDraft = {
  text: string;
  href: string;
};

const directory = ref("");
const notes = ref<StickyNote[]>([]);
const archivedNotes = ref<StickyNote[]>([]);
const trashNotes = ref<StickyNote[]>([]);
const activeId = ref("");
const draftContent = ref("");
const currentView = ref<NoteView>("active");
const busy = ref(false);
const saveState = ref("未保存");
const selectedExportFormat = ref<StickyNoteExportFormat>("json");
const fontSize = ref(16);
const fontColor = ref("#1f2328");
const highlightColor = ref("#fff3a3");
const selectedFontFamily = ref('"Source Han Sans CN", "Microsoft YaHei", ui-sans-serif, system-ui, sans-serif');
const defaultPreferences: StickyNotesPreferences = {
  fontFamily: selectedFontFamily.value,
  fontSize: 16,
  lineHeight: 1.45,
  padding: 16,
  color: "#1f2328",
  backgroundColor: "#ffffff"
};
const preferences = ref<StickyNotesPreferences>({ ...defaultPreferences });
const draftStyle = ref<StickyNoteStyle>({ ...defaultPreferences });
const fontMenuOpen = ref(false);
const colorPaletteOpen = ref<ColorPaletteKind | "">("");
const notesSidebarCollapsed = ref(false);
const formatToolbarExpanded = ref(false);
const lastExportedFiles = ref<string[]>([]);
const contextMenu = ref({ visible: false, x: 0, y: 0 });
const toolbarState = ref({
  bold: false,
  italic: false,
  underline: false,
  strike: false,
  unorderedList: false,
  orderedList: false
});
const editorRef = ref<HTMLElement | null>(null);
const previewViewportRef = ref<HTMLElement | null>(null);
const previewImage = ref("");
const previewScale = ref(1);
const previewOffset = ref({ x: 0, y: 0 });
const pendingDeleteNote = ref<StickyNote | null>(null);
const pendingLinkEdit = ref<LinkEditDraft | null>(null);

function toggleNotesSidebar() {
  notesSidebarCollapsed.value = !notesSidebarCollapsed.value;
}

function toggleFormatToolbar() {
  formatToolbarExpanded.value = !formatToolbarExpanded.value;
  if (!formatToolbarExpanded.value) {
    fontMenuOpen.value = false;
    colorPaletteOpen.value = "";
  }
}

const noteDialogEnter = { opacity: 0, y: 16, scale: 0.975 };
const noteDialogVisible = { opacity: 1, y: 0, scale: 1 };
const noteDialogExit = { opacity: 0, y: 8, scale: 0.985 };
let saveTimer: ReturnType<typeof setTimeout> | null = null;
let saveQueue: Promise<void> = Promise.resolve();
let lastSaveError: unknown = null;
let draftRevision = 0;
let stopBeforeWindowAction: (() => void) | null = null;
let suppressSave = false;
let applyingHistory = false;
let savedEditorRange: Range | null = null;
let activeStyleSpan: HTMLSpanElement | null = null;
let activeLinkElement: HTMLAnchorElement | null = null;
const undoStack: string[] = [];
const redoStack: string[] = [];
let previewDrag:
  | {
      pointerId: number;
      startX: number;
      startY: number;
      originX: number;
      originY: number;
    }
  | null = null;

const fontFamilies = [
  { label: "思源黑体", value: '"Source Han Sans CN", "Microsoft YaHei", ui-sans-serif, system-ui, sans-serif' },
  { label: "微软雅黑", value: '"Microsoft YaHei", ui-sans-serif, system-ui, sans-serif' },
  { label: "宋体", value: 'SimSun, "Source Han Sans CN", serif' },
  { label: "楷体", value: 'KaiTi, "Source Han Sans CN", serif' },
  { label: "等宽", value: 'Consolas, "Courier New", monospace' }
];

const textColorPalette = [
  { name: "墨黑", value: "#1f2328" },
  { name: "石墨", value: "#57606a" },
  { name: "海蓝", value: "#0969da" },
  { name: "青绿", value: "#0a6866" },
  { name: "松绿", value: "#1a7f37" },
  { name: "金棕", value: "#9a6700" },
  { name: "朱红", value: "#cf222e" },
  { name: "紫藤", value: "#8250df" },
  { name: "玫红", value: "#bf3989" },
  { name: "白色", value: "#ffffff" }
];

const highlightColorPalette = [
  { name: "淡黄", value: "#fff3a3" },
  { name: "薄荷", value: "#dcffe4" },
  { name: "天蓝", value: "#ddf4ff" },
  { name: "浅紫", value: "#fbefff" },
  { name: "暖橙", value: "#fff1e5" },
  { name: "浅红", value: "#ffebe9" },
  { name: "灰雾", value: "#eaeef2" },
  { name: "清除", value: "#ffffff" }
];

const editorBackgroundPalette = [
  { name: "纸白", value: "#ffffff" },
  { name: "暖纸", value: "#fffaf0" },
  { name: "晨雾", value: "#f6f8fa" },
  { name: "薄荷", value: "#f2fbf5" },
  { name: "浅蓝", value: "#f1f8ff" },
  { name: "薰衣", value: "#faf5ff" },
  { name: "杏仁", value: "#fff4e6" },
  { name: "玫瑰", value: "#fff5f7" }
];

const visibleNotes = computed(() => {
  if (currentView.value === "archived") return archivedNotes.value;
  if (currentView.value === "trash") return trashNotes.value;
  return notes.value;
});
const activeNote = computed(() => [...notes.value, ...archivedNotes.value, ...trashNotes.value].find((note) => note.id === activeId.value) ?? null);
const editorBackgroundColor = computed(() => draftStyle.value.backgroundColor || defaultPreferences.backgroundColor || "#ffffff");
const activeCountLabel = computed(() => {
  if (currentView.value === "archived") return `${archivedNotes.value.length} ARCHIVED`;
  if (currentView.value === "trash") return `${trashNotes.value.length} TRASH`;
  return `${notes.value.length} NOTES`;
});
const currentFontLabel = computed(() => fontFamilies.find((font) => font.value === selectedFontFamily.value)?.label || "自定义字体");

function clampNumber(value: unknown, min: number, max: number, fallback: number) {
  const parsed = Number(value);
  if (!Number.isFinite(parsed)) return fallback;
  return Math.min(max, Math.max(min, parsed));
}

function plainStickyStyle(style: Partial<StickyNoteStyle>): StickyNoteStyle {
  return {
    fontFamily: String(style.fontFamily || defaultPreferences.fontFamily),
    fontSize: clampNumber(style.fontSize, 10, 48, defaultPreferences.fontSize),
    lineHeight: clampNumber(style.lineHeight, 1, 2.4, defaultPreferences.lineHeight),
    padding: clampNumber(style.padding, 8, 64, defaultPreferences.padding),
    color: style.color ? String(style.color) : defaultPreferences.color,
    backgroundColor: style.backgroundColor ? String(style.backgroundColor) : defaultPreferences.backgroundColor
  };
}

function rgbToHex(value: string) {
  if (!value || value === "transparent" || value === "rgba(0, 0, 0, 0)") return "";
  if (value.startsWith("#")) return value;
  const match = value.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)/i);
  if (!match) return "";
  return `#${[match[1], match[2], match[3]].map((item) => Number(item).toString(16).padStart(2, "0")).join("")}`;
}

function sortNotes(input: StickyNote[]) {
  return [...input].sort((left, right) => Number(right.pinned) - Number(left.pinned) || right.createdAt - left.createdAt);
}

function applyState(state: StickyNotesState) {
  directory.value = state.directory;
  notes.value = sortNotes(state.notes);
  archivedNotes.value = sortNotes(state.archivedNotes);
  trashNotes.value = sortNotes(state.trashNotes);
  preferences.value = state.preferences;
}

function setCurrentView(view: NoteView) {
  currentView.value = view;
  const list = visibleNotes.value;
  if (!list.some((note) => note.id === activeId.value)) {
    void selectNote(list[0] ?? null);
  }
}

function editorStyleFor(style: StickyNoteStyle) {
  return {
    fontFamily: style.fontFamily,
    fontSize: `${style.fontSize}px`,
    lineHeight: String(style.lineHeight),
    padding: `${style.padding}px`,
    color: style.color || preferences.value.color || "#1f2328",
    backgroundColor: style.backgroundColor || "var(--surface)"
  };
}

function pushHistorySnapshot() {
  if (!editorRef.value || applyingHistory) return;
  const current = editorDomToStoredContent(editorRef.value);
  if (undoStack[undoStack.length - 1] === current) return;
  undoStack.push(current);
  if (undoStack.length > 80) undoStack.shift();
  redoStack.length = 0;
}

function restoreHistoryContent(content: string) {
  if (!editorRef.value) return;
  applyingHistory = true;
  editorRef.value.innerHTML = contentToEditorHtml(content);
  draftContent.value = content;
  draftRevision += 1;
  scheduleSave();
  requestAnimationFrame(() => {
    applyingHistory = false;
  });
}

function undoEdit() {
  if (!editorRef.value || undoStack.length === 0) return;
  redoStack.push(editorDomToStoredContent(editorRef.value));
  restoreHistoryContent(undoStack.pop() || "");
}

function redoEdit() {
  if (!editorRef.value || redoStack.length === 0) return;
  undoStack.push(editorDomToStoredContent(editorRef.value));
  restoreHistoryContent(redoStack.pop() || "");
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

const allowedEditorTags = new Set([
  "A", "B", "BLOCKQUOTE", "BR", "CODE", "DIV", "EM", "H1", "H2", "H3", "H4", "H5", "H6", "I", "IMG",
  "LI", "OL", "P", "PRE", "S", "SPAN", "STRIKE", "STRONG", "U", "UL"
]);
const removedEditorTags = new Set(["SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "SVG", "MATH", "FORM", "META", "LINK"]);
const allowedEditorClasses = new Set(["note-inline-image", "note-todo-box", "todo-line"]);
const allowedEditorStyleProperties = [
  "background-color", "color", "font-family", "font-size", "font-style", "font-weight", "line-height", "text-decoration"
] as const;

function sanitizeEditorUrl(value: string) {
  try {
    const url = new URL(normalizeLinkHref(value));
    return ["http:", "https:", "mailto:"].includes(url.protocol.toLowerCase()) ? url.toString() : "";
  } catch {
    return "";
  }
}

/** DOMParser documents are inert; rebuild attributes before returning HTML. */
function sanitizeEditorRichHtml(source: string) {
  const parsed = new DOMParser().parseFromString(source, "text/html");
  const elements = Array.from(parsed.body.querySelectorAll("*"));
  for (const element of elements) {
    if (removedEditorTags.has(element.tagName)) {
      element.remove();
      continue;
    }
    if (!allowedEditorTags.has(element.tagName)) {
      element.replaceWith(...Array.from(element.childNodes));
      continue;
    }

    const originalClassNames = Array.from(element.classList).filter((name) => allowedEditorClasses.has(name));
    const originalStyle = element instanceof HTMLElement
      ? allowedEditorStyleProperties
          .map((property) => [property, element.style.getPropertyValue(property).trim()] as const)
          .filter(([, value]) => value && !/url\s*\(|expression\s*\(|@import|[<>]/i.test(value))
      : [];
    const href = element instanceof HTMLAnchorElement ? sanitizeEditorUrl(element.getAttribute("href") || element.dataset.noteLink || "") : "";
    const imageSrc = element instanceof HTMLImageElement ? element.getAttribute("src") || element.dataset.noteSrc || "" : "";
    const validImageSrc = /^data:image\/(?:png|jpe?g|gif|webp);base64,[a-z0-9+/\s]+=*$/i.test(imageSrc) ? imageSrc : "";
    const isTodo = element instanceof HTMLSpanElement && (element.dataset.noteTodo === "true" || originalClassNames.includes("note-todo-box"));
    const isChecked = isTodo && (element.dataset.checked === "true" || element.getAttribute("aria-checked") === "true");
    const isStyled = element instanceof HTMLSpanElement && element.dataset.noteStyled === "true";

    for (const attribute of Array.from(element.attributes)) element.removeAttribute(attribute.name);
    if (originalClassNames.length) element.className = originalClassNames.join(" ");
    if (element instanceof HTMLElement) {
      for (const [property, value] of originalStyle) element.style.setProperty(property, value);
    }
    if (element instanceof HTMLAnchorElement && href) {
      element.href = href;
      element.dataset.noteLink = href;
      element.rel = "noopener noreferrer";
    }
    if (element instanceof HTMLImageElement) {
      if (!validImageSrc) {
        element.remove();
        continue;
      }
      element.src = validImageSrc;
      element.dataset.noteSrc = validImageSrc;
      element.alt = "粘贴图片";
    }
    if (isTodo && element instanceof HTMLSpanElement) {
      element.classList.add("note-todo-box");
      element.dataset.noteTodo = "true";
      element.dataset.checked = String(isChecked);
      element.setAttribute("aria-checked", String(isChecked));
      element.setAttribute("role", "checkbox");
      element.setAttribute("tabindex", "0");
      element.setAttribute("contenteditable", "false");
    }
    if (isStyled && element instanceof HTMLSpanElement) element.dataset.noteStyled = "true";
  }
  return parsed.body.innerHTML;
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
  const html = content.startsWith(richNoteMarker) ? sanitizeEditorRichHtml(content.slice(richNoteMarker.length)) : noteTextToEditorHtml(content);
  const container = document.createElement("div");
  container.innerHTML = html;
  normalizeTodoControls(container);
  return container.innerHTML;
}

function editorDomToStoredContent(root: HTMLElement) {
  normalizeTodoControls(root);
  const clone = root.cloneNode(true) as HTMLElement;
  clone.querySelectorAll(".note-active-selection").forEach((node) => node.classList.remove("note-active-selection"));
  return `${richNoteMarker}${clone.innerHTML}`;
}

function todoMarkerHtml(checked = false) {
  return `<span class="note-todo-box" role="checkbox" data-note-todo="true" data-checked="${checked}" aria-checked="${checked}" tabindex="0" contenteditable="false"></span>`;
}

function normalizeTodoControls(root: HTMLElement) {
  root.querySelectorAll<HTMLInputElement>("input[data-note-todo]").forEach((checkbox) => {
    checkbox.replaceWith(document.createRange().createContextualFragment(todoMarkerHtml(checkbox.checked || checkbox.hasAttribute("checked"))));
  });
  root.querySelectorAll<HTMLElement>("[data-note-todo]").forEach((marker) => {
    const checked = marker.dataset.checked === "true" || marker.getAttribute("aria-checked") === "true";
    marker.classList.add("note-todo-box");
    marker.setAttribute("role", "checkbox");
    marker.setAttribute("aria-checked", String(checked));
    marker.setAttribute("data-checked", String(checked));
    marker.setAttribute("tabindex", "0");
    marker.setAttribute("contenteditable", "false");
  });
}

function contentToPlainText(content: string) {
  if (!content.startsWith(richNoteMarker)) return content.replace(imageTokenPattern, "[图片]");
  const container = document.createElement("div");
  container.innerHTML = sanitizeEditorRichHtml(content.slice(richNoteMarker.length));
  return container.innerText.replace(/\u200b/g, "").trim();
}

function fileBaseName(note: StickyNote) {
  return (note.fileName || "").replace(/\.txt$/i, "") || note.title.replace(/[<>:"/\\|?*\x00-\x1F]/g, " ").replace(/\s+/g, " ").trim().slice(0, 36) || "便签";
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
  captureEditorSelection();
  if (!activeId.value) return;
  const payload: EditorPositionState = {
    activeId: activeId.value,
    caretOffset: editorRef.value ? getCaretOffset(editorRef.value) : 0,
    scrollTop: editorRef.value?.scrollTop ?? 0
  };
  localStorage.setItem(editorPositionStorageKey, JSON.stringify(payload));
}

function captureEditorSelection() {
  const root = editorRef.value;
  const selection = window.getSelection();
  if (!root || !selection || selection.rangeCount === 0) return;
  const range = selection.getRangeAt(0);
  if (root.contains(range.commonAncestorContainer)) {
    savedEditorRange = range.cloneRange();
    if (activeStyleSpan && !activeStyleSpan.contains(range.commonAncestorContainer)) {
      activeStyleSpan = null;
      clearSelectionMarker();
    }
    updateToolbarStateFromSelection();
  }
}

function restoreEditorSelection() {
  const root = editorRef.value;
  const selection = window.getSelection();
  if (!root || !selection || !savedEditorRange) return false;
  if (!root.contains(savedEditorRange.commonAncestorContainer)) return false;
  selection.removeAllRanges();
  selection.addRange(savedEditorRange);
  root.focus();
  return true;
}

function rememberRange(range: Range) {
  savedEditorRange = range.cloneRange();
  storeEditorPosition();
}

function selectNodeContents(node: Node) {
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  range.selectNodeContents(node);
  editorRef.value?.focus({ preventScroll: true });
  selection.removeAllRanges();
  selection.addRange(range);
  savedEditorRange = range.cloneRange();
  if (node instanceof HTMLElement) markSelectionElement(node);
  updateToolbarStateFromSelection();
}

function setCaretInside(node: Text, offset: number) {
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  range.setStart(node, offset);
  range.collapse(true);
  selection.removeAllRanges();
  selection.addRange(range);
  savedEditorRange = range.cloneRange();
  clearSelectionMarker();
  updateToolbarStateFromSelection();
}

function applyStyleToSpan(span: HTMLSpanElement, style: Partial<CSSStyleDeclaration>) {
  Object.assign(span.style, style);
  span.style.lineHeight = "1.45";
  span.dataset.noteStyled = "true";
}

function clearSelectionMarker() {
  editorRef.value?.querySelectorAll(".note-active-selection").forEach((node) => node.classList.remove("note-active-selection"));
}

function clearActiveInlineSelection() {
  clearSelectionMarker();
  activeStyleSpan = null;
}

function markSelectionElement(node: HTMLElement) {
  clearSelectionMarker();
  node.classList.add("note-active-selection");
}

function prepareSelectionForToolbar() {
  captureEditorSelection();
  const root = editorRef.value;
  const range = getSelectedRange();
  if (!root || !range || range.collapsed) return;
  if (activeStyleSpan && root.contains(activeStyleSpan)) {
    markSelectionElement(activeStyleSpan);
    return;
  }
  const span = document.createElement("span");
  span.dataset.noteStyled = "true";
  span.appendChild(range.extractContents());
  range.insertNode(span);
  activeStyleSpan = span;
  selectNodeContents(span);
}

function handleDocumentPointerDown(event: PointerEvent) {
  const target = event.target;
  if (!(target instanceof Node)) return;
  const targetElement = target instanceof Element ? target : target.parentElement;
  if (targetElement?.closest(".note-color-menu, .note-font-menu, .note-color-trigger, .note-font-trigger, .note-context-menu, .note-link-dialog")) return;
  if (editorRef.value?.contains(target) || targetElement?.closest(".note-format-toolbar")) {
    colorPaletteOpen.value = "";
    fontMenuOpen.value = false;
    return;
  }
  colorPaletteOpen.value = "";
  fontMenuOpen.value = false;
  clearActiveInlineSelection();
  closeContextMenu();
}

function selectionElement() {
  const root = editorRef.value;
  const selection = window.getSelection();
  if (!root || !selection || selection.rangeCount === 0) return null;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return null;
  const node = range.commonAncestorContainer.nodeType === Node.TEXT_NODE ? range.commonAncestorContainer.parentElement : range.commonAncestorContainer;
  return node instanceof HTMLElement ? node : null;
}

function updateToolbarStateFromSelection() {
  const element = selectionElement();
  if (!element) return;
  const style = window.getComputedStyle(element);
  const decoration = style.textDecorationLine || style.textDecoration || "";
  const weight = Number(style.fontWeight);
  toolbarState.value = {
    bold: Number.isFinite(weight) ? weight >= 600 : ["bold", "bolder"].includes(style.fontWeight),
    italic: style.fontStyle === "italic" || style.fontStyle === "oblique",
    underline: decoration.includes("underline"),
    strike: decoration.includes("line-through"),
    unorderedList: document.queryCommandState("insertUnorderedList"),
    orderedList: document.queryCommandState("insertOrderedList")
  };
  const matchedFont = fontFamilies.find((font) => style.fontFamily.includes(font.label) || font.value.split(",")[0].replace(/[\"]/g, "") === style.fontFamily.split(",")[0].replace(/[\"]/g, ""));
  if (matchedFont) selectedFontFamily.value = matchedFont.value;
  const nextSize = Math.round(Number.parseFloat(style.fontSize));
  if (Number.isFinite(nextSize)) fontSize.value = Math.min(48, Math.max(10, nextSize));
  const nextColor = rgbToHex(style.color);
  if (nextColor) fontColor.value = nextColor;
  const nextBackground = rgbToHex(style.backgroundColor);
  if (nextBackground) highlightColor.value = nextBackground;
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

function placeCaretAtOffset(root: HTMLElement, offset: number) {
  const selection = window.getSelection();
  if (!selection) return;
  const range = document.createRange();
  let remaining = offset;
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
  savedEditorRange = range.cloneRange();
}

function linkifyEditorUrls() {
  const root = editorRef.value;
  if (!root) return;
  const caretOffset = getCaretOffset(root);
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT, {
    acceptNode(node) {
      const parent = node.parentElement;
      if (!parent || parent.closest("a, script, style")) return NodeFilter.FILTER_REJECT;
      urlPattern.lastIndex = 0;
      return urlPattern.test(node.textContent || "") ? NodeFilter.FILTER_ACCEPT : NodeFilter.FILTER_REJECT;
    }
  });
  const textNodes: Text[] = [];
  urlPattern.lastIndex = 0;
  while (walker.nextNode()) {
    textNodes.push(walker.currentNode as Text);
    urlPattern.lastIndex = 0;
  }
  if (!textNodes.length) return;
  for (const node of textNodes) {
    const html = linkifyPlainText(node.textContent || "");
    const fragment = document.createRange().createContextualFragment(html);
    node.replaceWith(fragment);
  }
  placeCaretAtOffset(root, caretOffset);
}

function applySavedNote(saved: StickyNote) {
  const id = saved.id;
  notes.value = saved.status === "active" ? sortNotes([...notes.value.filter((note) => note.id !== id), saved]) : notes.value.filter((note) => note.id !== id);
  archivedNotes.value = saved.status === "archived" ? sortNotes([...archivedNotes.value.filter((note) => note.id !== id), saved]) : archivedNotes.value.filter((note) => note.id !== id);
  trashNotes.value = saved.status === "trashed" ? sortNotes([...trashNotes.value.filter((note) => note.id !== id), saved]) : trashNotes.value.filter((note) => note.id !== id);
}

function saveNoteContent(id: string, content: string, revision: number) {
  // Serialize writes so an older request can never finish after a newer one.
  // Revision checks also prevent a completed response from replacing newer UI state.
  saveQueue = saveQueue
    .catch(() => undefined)
    .then(async () => {
      try {
        const saved = await devToolbox.saveStickyNote(id, content);
        applySavedNote(saved);
        lastSaveError = null;
        if (activeId.value === id && draftRevision === revision) {
          saveState.value = "已保存";
          storeEditorPosition();
        }
      } catch (error) {
        lastSaveError = error;
        if (activeId.value === id && draftRevision === revision) saveState.value = "保存失败";
        throw error;
      }
    });
  // Keep the queue usable after an error while preserving lastSaveError for a
  // close/reload handshake to report and block the destructive action.
  saveQueue = saveQueue.catch(() => undefined);
  return saveQueue;
}
async function flushPendingSave() {
  await flushRevisionBarrier(
    () => draftRevision,
    async (revision) => {
      if (saveTimer) {
        clearTimeout(saveTimer);
        saveTimer = null;
      }
      if (activeId.value && saveState.value === "待保存") {
        const id = activeId.value;
        const content = draftContent.value;
        saveState.value = "保存中";
        await saveNoteContent(id, content, revision);
      }
      await saveQueue;
      if (lastSaveError) throw lastSaveError;
    }
  );
}

async function loadNotes() {
  busy.value = true;
  try {
    const state = await devToolbox.loadStickyNotes();
    const savedPosition = loadEditorPosition();
    applyState(state);
    if (!activeId.value && visibleNotes.value[0]) {
      const preferredNote = visibleNotes.value.find((note) => note.id === savedPosition?.activeId) ?? visibleNotes.value[0];
      await selectNote(preferredNote, true);
    }
    if (activeId.value && !visibleNotes.value.some((note) => note.id === activeId.value)) {
      await selectNote(visibleNotes.value[0] ?? null, true);
    }
  } finally {
    busy.value = false;
  }
}

async function selectNote(note: StickyNote | null, restorePosition = false) {
  await flushPendingSave();
  suppressSave = true;
  savedEditorRange = null;
  activeStyleSpan = null;
  undoStack.length = 0;
  redoStack.length = 0;
  activeId.value = note?.id ?? "";
  draftContent.value = note?.content ?? "";
  draftRevision += 1;
  draftStyle.value = note?.style ?? { ...preferences.value };
  fontSize.value = draftStyle.value.fontSize;
  fontColor.value = draftStyle.value.color || preferences.value.color || "#1f2328";
  selectedFontFamily.value = draftStyle.value.fontFamily;
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
  const note = await devToolbox.createStickyNote("新便签\n");
  notes.value = sortNotes([...notes.value, note]);
  await selectNote(note);
}

async function chooseDirectory() {
  const target = await devToolbox.selectOutputDir();
  if (!target) return;
  await flushPendingSave();
  const state = await devToolbox.setStickyNotesDirectory(target);
  applyState(state);
  await selectNote(visibleNotes.value[0] ?? null);
}

async function toggleNotePinned(note: StickyNote) {
  const state = await devToolbox.setStickyNotePinned(note.id, !note.pinned);
  applyState(state);
  if (activeId.value && !visibleNotes.value.some((item) => item.id === activeId.value)) {
    await selectNote(visibleNotes.value[0] ?? null);
  }
}

function requestDeleteNote(note: StickyNote) {
  pendingDeleteNote.value = note;
}

async function confirmDeleteNote() {
  const note = pendingDeleteNote.value;
  if (!note) return;
  await devToolbox.deleteStickyNote(note.id);
  await loadNotes();
  if (activeId.value === note.id) await selectNote(visibleNotes.value[0] ?? null);
  pendingDeleteNote.value = null;
}

async function archiveNote(note: StickyNote, archived: boolean) {
  const state = await devToolbox.archiveStickyNote(note.id, archived);
  applyState(state);
  if (activeId.value === note.id) await selectNote(visibleNotes.value[0] ?? null);
}

async function restoreNote(note: StickyNote) {
  const state = await devToolbox.restoreStickyNote(note.id);
  applyState(state);
  currentView.value = "active";
  await selectNote(state.notes.find((item) => item.id === note.id) ?? state.notes[0] ?? null);
}

async function emptyTrash() {
  const state = await devToolbox.emptyStickyNotesTrash();
  applyState(state);
  if (currentView.value === "trash") await selectNote(visibleNotes.value[0] ?? null);
}

async function resolveExportDirectory() {
  if (directory.value) return directory.value;
  const target = await devToolbox.selectOutputDir();
  if (!target) return "";
  const state = await devToolbox.setStickyNotesDirectory(target);
  applyState(state);
  return target;
}

async function exportNotes(format: StickyNoteExportFormat, onlyActive = false) {
  await flushPendingSave();
  const target = await resolveExportDirectory();
  if (!target) return;
  try {
    lastExportedFiles.value = await devToolbox.exportStickyNotes({
      outputDir: target,
      ids: onlyActive && activeId.value ? [activeId.value] : undefined,
      format,
      includeArchived: true,
      includeTrash: false
    });
    showToast(`已导出 ${lastExportedFiles.value.length} 个文件`, "success");
  } catch (error) {
    showToast(`导出失败：${error instanceof Error ? error.message : String(error)}`, "error");
  }
}

async function exportSelectedNotes() {
  await exportNotes(selectedExportFormat.value);
}

async function exportActiveAsText() {
  if (!activeNote.value) return;
  await exportNotes("txt", true);
}

async function importNotes() {
  const inputPaths = await devToolbox.selectFiles(
    [{ name: "便签文件", extensions: ["json", "txt", "zip", "html"] }],
    true
  );
  if (!inputPaths.length) return;
  try {
    const result = await devToolbox.importStickyNotes(inputPaths);
    await loadNotes();
    showToast(`导入完成：新增 ${result.imported}，跳过 ${result.skipped}`, "success");
  } catch (error) {
    showToast(`导入失败：${error instanceof Error ? error.message : String(error)}`, "error");
  }
}

async function saveActiveNote() {
  if (!activeId.value) return;
  if (saveTimer) {
    clearTimeout(saveTimer);
    saveTimer = null;
  }
  saveState.value = "保存中";
  await saveNoteContent(activeId.value, draftContent.value, draftRevision);
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
  draftRevision += 1;
  storeEditorPosition();
  scheduleSave();
}

function handleEditorInput() {
  clearActiveInlineSelection();
  syncEditorContent();
  ensureCaretVisible();
}

function handleEditorKeydown(event: KeyboardEvent) {
  const target = event.target;
  if ((event.key === " " || event.key === "Enter") && target instanceof Element) {
    const marker = target.closest<HTMLElement>("[data-note-todo]");
    if (marker) {
      event.preventDefault();
      toggleTodoMarker(marker);
      return;
    }
  }
  if (event.key === "Tab") {
    event.preventDefault();
    applyTabIndent(event.shiftKey);
    return;
  }
  const ctrl = event.ctrlKey || event.metaKey;
  if (ctrl && event.key.toLowerCase() === "s") {
    event.preventDefault();
    void saveActiveNote();
    return;
  }
  if (ctrl && event.key.toLowerCase() === "z" && !event.shiftKey) {
    event.preventDefault();
    undoEdit();
    return;
  }
  if ((ctrl && event.key.toLowerCase() === "y") || (ctrl && event.shiftKey && event.key.toLowerCase() === "z")) {
    event.preventDefault();
    redoEdit();
    return;
  }
  if (ctrl && event.key.toLowerCase() === "b") {
    event.preventDefault();
    applyBold();
    return;
  }
  if (ctrl && event.key.toLowerCase() === "i") {
    event.preventDefault();
    applyItalic();
    return;
  }
  if (ctrl && event.key.toLowerCase() === "u") {
    event.preventDefault();
    applyUnderline();
  }
}

function toggleTodoMarker(marker: HTMLElement) {
  if (!activeNote.value || currentView.value === "trash") return;
  pushHistorySnapshot();
  const checked = marker.dataset.checked !== "true";
  marker.dataset.checked = String(checked);
  marker.setAttribute("aria-checked", String(checked));
  syncEditorContent();
}

function applyTabIndent(outdent: boolean) {
  const root = editorRef.value;
  if (!root || !activeNote.value || currentView.value === "trash") return;
  pushHistorySnapshot();
  restoreEditorSelection() || root.focus();
  const selection = window.getSelection();
  if (!selection || selection.rangeCount === 0) return;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return;
  if (range.collapsed && !outdent) {
    document.execCommand("insertText", false, "    ");
  } else {
    document.execCommand(outdent ? "outdent" : "indent");
  }
  syncEditorContent();
  updateToolbarStateFromSelection();
}

function handleEditorKeyup(event: KeyboardEvent) {
  if ([" ", "Enter"].includes(event.key)) {
    linkifyEditorUrls();
    syncEditorContent();
  }
  updateToolbarStateFromSelection();
  storeEditorPosition();
  ensureCaretVisible();
}

function ensureCaretVisible() {
  const root = editorRef.value;
  const selection = window.getSelection();
  if (!root || !selection || selection.rangeCount === 0) return;
  requestAnimationFrame(() => {
    const range = selection.getRangeAt(0);
    const rect = range.getBoundingClientRect();
    const rootRect = root.getBoundingClientRect();
    if (!rect.width && !rect.height) return;
    if (rect.bottom > rootRect.bottom - 72) {
      root.scrollTop += rect.bottom - rootRect.bottom + 110;
    } else if (rect.top < rootRect.top + 28) {
      root.scrollTop -= rootRect.top - rect.top + 48;
    }
  });
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
  colorPaletteOpen.value = "";
  fontMenuOpen.value = false;
  closeContextMenu();
  const target = event.target;
  if (target instanceof Element && !target.closest(".note-active-selection")) {
    clearActiveInlineSelection();
  }
  if (target instanceof Element) {
    const marker = target.closest<HTMLElement>("[data-note-todo]");
    if (marker) {
      event.preventDefault();
      toggleTodoMarker(marker);
      return;
    }
    const link = target.closest<HTMLAnchorElement>("a[data-note-link]");
    if (link?.href) {
      event.preventDefault();
      openLinkEditor(link);
      return;
    }
  }
  if (target instanceof HTMLImageElement) {
    openPreviewImage(target.dataset.noteSrc || target.currentSrc || target.src);
  }
  ensureCaretVisible();
}

function openLinkEditor(link: HTMLAnchorElement) {
  activeLinkElement = link;
  pendingLinkEdit.value = {
    text: link.textContent || link.dataset.noteLink || link.href,
    href: link.dataset.noteLink || link.getAttribute("href") || link.href
  };
  selectNodeContents(link);
}

function closeLinkEditor() {
  pendingLinkEdit.value = null;
  activeLinkElement = null;
  clearSelectionMarker();
}

function activeEditableLink() {
  const root = editorRef.value;
  if (!root || !activeLinkElement || !root.contains(activeLinkElement)) return null;
  return activeLinkElement;
}

function saveLinkEdit() {
  const link = activeEditableLink();
  const draft = pendingLinkEdit.value;
  if (!link || !draft) {
    closeLinkEditor();
    return;
  }
  const href = normalizeLinkHref(draft.href.trim());
  if (!href) {
    showToast("请填写链接地址。", "error");
    return;
  }
  pushHistorySnapshot();
  link.href = href;
  link.dataset.noteLink = href;
  link.textContent = draft.text.trim() || href;
  syncEditorContent();
  closeLinkEditor();
}

function openEditedLink() {
  const href = pendingLinkEdit.value?.href.trim();
  if (href) void devToolbox.openExternal(normalizeLinkHref(href));
}

function removeLinkFormat() {
  const link = activeEditableLink();
  const draft = pendingLinkEdit.value;
  if (!link || !draft) {
    closeLinkEditor();
    return;
  }
  pushHistorySnapshot();
  link.replaceWith(document.createTextNode(draft.text.trim() || link.textContent || draft.href));
  syncEditorContent();
  closeLinkEditor();
}

function openEditorContextMenu(event: MouseEvent) {
  if (!activeNote.value || currentView.value === "trash") return;
  event.preventDefault();
  captureEditorSelection();
  updateToolbarStateFromSelection();
  const menuWidth = 220;
  const menuHeight = 260;
  contextMenu.value = {
    visible: true,
    x: Math.min(event.clientX, window.innerWidth - menuWidth - 12),
    y: Math.min(event.clientY, window.innerHeight - menuHeight - 12)
  };
}

function closeContextMenu() {
  contextMenu.value.visible = false;
}

function getSelectedRange() {
  const root = editorRef.value;
  restoreEditorSelection();
  const selection = window.getSelection();
  if (!root || !selection || selection.rangeCount === 0) return;
  const range = selection.getRangeAt(0);
  if (!root.contains(range.commonAncestorContainer)) return;
  return range;
}

function applyInlineStyle(style: Partial<CSSStyleDeclaration>) {
  const root = editorRef.value;
  const range = getSelectedRange();
  if (!root || !range) return;
  pushHistorySnapshot();

  if (activeStyleSpan && root.contains(activeStyleSpan) && !range.collapsed) {
    applyStyleToSpan(activeStyleSpan, style);
    selectNodeContents(activeStyleSpan);
    syncEditorContent();
    return;
  }

  const span = document.createElement("span");
  applyStyleToSpan(span, style);

  if (range.collapsed) {
    const marker = document.createTextNode("\u200b");
    span.appendChild(marker);
    range.insertNode(span);
    activeStyleSpan = span;
    setCaretInside(marker, 1);
    syncEditorContent();
    return;
  }

  span.appendChild(range.extractContents());
  range.insertNode(span);
  activeStyleSpan = span;
  selectNodeContents(span);
  syncEditorContent();
}

function applyBold() {
  const nextWeight = activeStyleSpan?.style.fontWeight === "700" || activeStyleSpan?.style.fontWeight === "bold" ? "400" : "700";
  applyInlineStyle({ fontWeight: nextWeight });
}

function applyItalic() {
  const nextStyle = activeStyleSpan?.style.fontStyle === "italic" ? "normal" : "italic";
  applyInlineStyle({ fontStyle: nextStyle });
}

function nextTextDecoration(decoration: "underline" | "line-through") {
  const current = activeStyleSpan?.style.textDecoration || "";
  const parts = new Set(current.split(/\s+/).filter(Boolean));
  if (parts.has(decoration)) parts.delete(decoration);
  else parts.add(decoration);
  return Array.from(parts).join(" ") || "none";
}

function applyUnderline() {
  applyInlineStyle({ textDecoration: nextTextDecoration("underline") });
}

function applyStrike() {
  applyInlineStyle({ textDecoration: nextTextDecoration("line-through") });
}

function applyForeColor() {
  applyInlineStyle({ color: fontColor.value });
}

function chooseForeColor(value: string) {
  fontColor.value = value;
  applyForeColor();
  colorPaletteOpen.value = "";
}

function resetForeColor() {
  fontColor.value = draftStyle.value.color || preferences.value.color || "#1f2328";
  applyInlineStyle({ color: fontColor.value });
  colorPaletteOpen.value = "";
}

function applyHighlightColor() {
  applyInlineStyle({ backgroundColor: highlightColor.value });
}

function chooseHighlightColor(value: string) {
  highlightColor.value = value;
  applyHighlightColor();
  colorPaletteOpen.value = "";
}

function resetHighlightColor() {
  highlightColor.value = "#ffffff";
  applyInlineStyle({ backgroundColor: "#ffffff" });
  colorPaletteOpen.value = "";
}

async function chooseEditorBackground(value: string) {
  const note = activeNote.value;
  if (!note || currentView.value === "trash") return;
  const nextStyle = plainStickyStyle({ ...draftStyle.value, backgroundColor: value });
  draftStyle.value = nextStyle;
  colorPaletteOpen.value = "";
  try {
    const state = await devToolbox.applyStickyNotePreset(note.id, "current", nextStyle);
    applyState(state);
  } catch (error) {
    showToast(`背景色保存失败：${error instanceof Error ? error.message : String(error)}`, "error");
  }
}

function applyFontFamily(value: string) {
  selectedFontFamily.value = value;
  applyInlineStyle({ fontFamily: value });
}

function chooseFontFamily(value: string) {
  fontMenuOpen.value = false;
  colorPaletteOpen.value = "";
  applyFontFamily(value);
}

function toggleColorPalette(kind: ColorPaletteKind) {
  colorPaletteOpen.value = colorPaletteOpen.value === kind ? "" : kind;
  fontMenuOpen.value = false;
}

function chooseContextFontFamily(value: string) {
  chooseFontFamily(value);
  closeContextMenu();
}

function applyFontSize() {
  fontSize.value = clampNumber(fontSize.value, 10, 48, 16);
  applyInlineStyle({ fontSize: `${fontSize.value}px` });
}

function clampFontSizeInput() {
  fontSize.value = clampNumber(fontSize.value, 10, 48, 16);
}

function adjustFontSize(delta: number) {
  fontSize.value = Math.min(48, Math.max(10, fontSize.value + delta));
  applyFontSize();
}

function runEditorCommand(command: "insertUnorderedList" | "insertOrderedList") {
  pushHistorySnapshot();
  restoreEditorSelection() || editorRef.value?.focus();
  document.execCommand(command);
  syncEditorContent();
}

function insertTodoItem() {
  pushHistorySnapshot();
  insertHtmlAtCursor(`<div class="todo-line">${todoMarkerHtml(false)} <span>待办事项</span></div>`);
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
    rememberRange(range);
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
  const target = await resolveExportDirectory();
  if (!target) return;
  const background = "#ffffff";
  const textColor = draftStyle.value.color || "#1f2328";
  const borderColor = "#d0d7de";
  const accentColor = "#0969da";
  const frame = document.createElement("div");
  const html = draftContent.value.trim() ? contentToEditorHtml(draftContent.value) : escapeHtml(note.title);
  frame.innerHTML = html;
  Object.assign(frame.style, {
    position: "fixed",
    left: "0",
    top: "0",
    zIndex: "-1",
    width: "980px",
    minHeight: "360px",
    padding: `${Math.max(24, draftStyle.value.padding * 2)}px`,
    boxSizing: "border-box",
    background,
    color: textColor,
    fontFamily: draftStyle.value.fontFamily,
    fontSize: `${draftStyle.value.fontSize}px`,
    fontWeight: "400",
    lineHeight: String(draftStyle.value.lineHeight),
    whiteSpace: "normal",
    overflowWrap: "anywhere",
  } satisfies Partial<CSSStyleDeclaration>);
  frame.querySelectorAll("a").forEach((link) => {
    if (!(link instanceof HTMLElement)) return;
    link.style.color = accentColor;
    link.style.textDecoration = "underline";
    link.style.textUnderlineOffset = "3px";
  });
  frame.querySelectorAll("img").forEach((image) => {
    if (!(image instanceof HTMLImageElement)) return;
    image.style.display = "block";
    image.style.maxWidth = "100%";
    image.style.maxHeight = "520px";
    image.style.margin = "12px 0";
    image.style.border = `1px solid ${borderColor}`;
    image.style.borderRadius = "8px";
    image.style.objectFit = "contain";
  });
  frame.querySelectorAll<HTMLElement>("[data-note-todo]").forEach((checkbox) => {
    const checked = checkbox.dataset.checked === "true" || checkbox.getAttribute("aria-checked") === "true";
    const marker = document.createElement("span");
    marker.textContent = checked ? "✓" : "";
    Object.assign(marker.style, {
      display: "inline-grid",
      placeItems: "center",
      width: "16px",
      height: "16px",
      minWidth: "16px",
      minHeight: "16px",
      boxSizing: "border-box",
      marginRight: "0",
      border: `1px solid ${checked ? accentColor : borderColor}`,
      borderRadius: "4px",
      background: checked ? accentColor : "#ffffff",
      color: "#ffffff",
      fontSize: "13px",
      lineHeight: "16px",
      fontWeight: "700",
      verticalAlign: "-2px"
    } satisfies Partial<CSSStyleDeclaration>);
    checkbox.replaceWith(marker);
  });
  frame.querySelectorAll<HTMLElement>("[data-note-styled]").forEach((node) => {
    node.style.lineHeight = node.style.lineHeight || "1.45";
  });
  document.body.appendChild(frame);
  await Promise.all(
    Array.from(frame.querySelectorAll("img")).map((image) => {
      if (!(image instanceof HTMLImageElement) || image.complete) return Promise.resolve();
      return image.decode().catch(() => undefined);
    })
  );
  await new Promise<void>((resolve) => requestAnimationFrame(() => resolve()));
  try {
    const dataUrl = await toPng(frame, { pixelRatio: 2, cacheBust: true, backgroundColor: background });
    await devToolbox.base64ToImage(dataUrl, target, `${fileBaseName(note)}.png`);
    showToast("便签图片已导出", "success");
  } catch (error) {
    showToast(`图片导出失败：${error instanceof Error ? error.message : String(error)}`, "error");
  } finally {
    frame.remove();
  }
}

onMounted(async () => {
  document.addEventListener("pointerdown", handleDocumentPointerDown, true);
  stopBeforeWindowAction = devToolbox.onBeforeWindowAction(async () => {
    if (editorRef.value && activeId.value) syncEditorContent();
    await flushPendingSave();
  });
  await loadNotes();
});

onBeforeRouteLeave(async () => {
  try {
    await flushPendingSave();
    return true;
  } catch (error) {
    showToast(`保存失败，已取消离开：${error instanceof Error ? error.message : String(error)}`, "error");
    return false;
  }
});

onBeforeUnmount(() => {
  document.removeEventListener("pointerdown", handleDocumentPointerDown, true);
  stopBeforeWindowAction?.();
  stopBeforeWindowAction = null;
});
</script>

<template>
  <section class="tool-page sticky-notes-tool">
    <div class="notes-workbench" :class="{ 'sidebar-collapsed': notesSidebarCollapsed }">
      <aside id="notes-sidebar" class="notes-side">
        <section class="tool-main notes-control-panel">
          <div class="section-title notes-panel-title">
            <h2>桌面便签</h2>
            <span class="status-pill" :class="{ running: busy }">{{ activeCountLabel }}</span>
          </div>
          <div class="notes-action-grid">
            <button type="button" class="primary-button" @click="createNote">
              <i class="ri-add-line" aria-hidden="true"></i>
              新建
            </button>
            <button type="button" class="secondary-button" @click="importNotes">
              <i class="ri-upload-2-line" aria-hidden="true"></i>
              导入
            </button>
          </div>
          <div class="notes-action-grid compact-actions">
            <button type="button" class="secondary-button" @click="chooseDirectory">
              <i class="ri-folder-open-line" aria-hidden="true"></i>
            </button>
            <button type="button" class="secondary-button" :class="{ selected: selectedExportFormat === 'json' }" @click="selectedExportFormat = 'json'">JSON</button>
            <button type="button" class="secondary-button" :class="{ selected: selectedExportFormat === 'txt' }" @click="selectedExportFormat = 'txt'">TXT</button>
            <button type="button" class="secondary-button" :class="{ selected: selectedExportFormat === 'zip' }" @click="selectedExportFormat = 'zip'">ZIP</button>
            <button type="button" class="primary-button" @click="exportSelectedNotes">
              <i class="ri-download-2-line" aria-hidden="true"></i>
              导出
            </button>
          </div>
          <div class="notes-pathbar" :title="directory">
            <span>导出目录</span>
            <strong>{{ directory || "加载中..." }}</strong>
          </div>
        </section>

        <section class="tool-main notes-directory-panel">
          <div class="note-view-tabs" role="tablist" aria-label="便签视图">
            <button type="button" :class="{ active: currentView === 'active' }" @click="setCurrentView('active')">当前</button>
            <button type="button" :class="{ active: currentView === 'archived' }" @click="setCurrentView('archived')">归档</button>
            <button type="button" :class="{ active: currentView === 'trash' }" @click="setCurrentView('trash')">回收站</button>
          </div>
          <div class="notes-list-head">
            <strong>便签目录</strong>
            <small>{{ visibleNotes.length }} 条记录</small>
          </div>
          <div v-if="visibleNotes.length" class="notes-list">
            <article
              v-for="note in visibleNotes"
              :key="note.id"
              class="note-card"
              :class="{ active: note.id === activeId, pinned: note.pinned, trash: currentView === 'trash' }"
              :title="note.title"
              @click="selectNote(note)"
            >
              <div class="note-card-text">
                <strong>{{ note.title }}</strong>
                <small>{{ formatTime(note.createdAt) }}</small>
              </div>
              <button v-if="currentView !== 'trash'" type="button" class="icon-button" :title="note.pinned ? '取消置顶' : '置顶便签'" @click.stop="toggleNotePinned(note)">
                <i :class="note.pinned ? 'ri-pushpin-2-fill' : 'ri-pushpin-line'" aria-hidden="true"></i>
              </button>
              <button v-if="currentView === 'active'" type="button" class="icon-button" title="归档便签" @click.stop="archiveNote(note, true)">
                <i class="ri-archive-line" aria-hidden="true"></i>
              </button>
              <button v-else-if="currentView === 'archived'" type="button" class="icon-button" title="取消归档" @click.stop="archiveNote(note, false)">
                <i class="ri-inbox-unarchive-line" aria-hidden="true"></i>
              </button>
              <button v-else type="button" class="icon-button" title="恢复便签" @click.stop="restoreNote(note)">
                <i class="ri-restart-line" aria-hidden="true"></i>
              </button>
              <button v-if="currentView !== 'trash'" type="button" class="icon-button" title="移入回收站" @click.stop="requestDeleteNote(note)">
                <i class="ri-delete-bin-line" aria-hidden="true"></i>
              </button>
            </article>
          </div>
          <div v-else class="empty-state">当前视图没有便签。</div>
          <button v-if="currentView === 'trash' && trashNotes.length" type="button" class="secondary-button danger-outline" @click="emptyTrash">
            <i class="ri-delete-bin-6-line" aria-hidden="true"></i>
            清空回收站
          </button>
        </section>
      </aside>

      <section class="tool-main note-editor-panel" :class="{ 'toolbar-collapsed': !formatToolbarExpanded }">
        <div class="section-title note-editor-head">
          <div class="note-editor-identity">
            <button
              type="button"
              class="icon-button note-sidebar-toggle"
              :title="notesSidebarCollapsed ? '展开便签管理栏' : '收起便签管理栏'"
              :aria-label="notesSidebarCollapsed ? '展开便签管理栏' : '收起便签管理栏'"
              :aria-expanded="!notesSidebarCollapsed"
              aria-controls="notes-sidebar"
              @click="toggleNotesSidebar"
            >
              <i class="ri-side-bar-line" aria-hidden="true"></i>
            </button>
            <div class="note-editor-title-copy">
              <h2 :title="activeNote?.title || ''">{{ activeNote?.title || "未选择便签" }}</h2>
              <span :title="activeNote?.fileName || ''">{{ activeNote?.fileName || "" }}</span>
            </div>
          </div>
          <div class="header-actions note-editor-actions">
            <span class="status-pill note-save-state">{{ saveState }}</span>
            <button
              type="button"
              class="secondary-button note-toolbar-toggle"
              :title="formatToolbarExpanded ? '收起格式工具栏' : '展开格式工具栏'"
              :aria-label="formatToolbarExpanded ? '收起格式工具栏' : '展开格式工具栏'"
              :aria-expanded="formatToolbarExpanded"
              aria-controls="note-format-toolbar"
              @click="toggleFormatToolbar"
            >
              <i class="ri-font-family" aria-hidden="true"></i>
              格式工具
              <i :class="formatToolbarExpanded ? 'ri-arrow-up-s-line' : 'ri-arrow-down-s-line'" aria-hidden="true"></i>
            </button>
            <button type="button" class="secondary-button" :disabled="!activeNote" @click="exportActiveAsText">
              <i class="ri-file-text-line" aria-hidden="true"></i>
              导出TXT
            </button>
            <button type="button" class="secondary-button" :disabled="!activeNote" @click="exportActiveAsImage">
              <i class="ri-image-line" aria-hidden="true"></i>
              导出图片
            </button>
          </div>
        </div>
        <div
          v-show="formatToolbarExpanded"
          id="note-format-toolbar"
          class="note-format-toolbar"
          :class="{ disabled: !activeNote }"
          aria-label="便签格式工具栏"
          @mousedown="captureEditorSelection"
        >
          <button type="button" class="icon-button" :class="{ active: toolbarState.bold }" title="粗体" :disabled="!activeNote" @mousedown.prevent="captureEditorSelection" @click="applyBold">
            <i class="ri-bold" aria-hidden="true"></i>
          </button>
          <button type="button" class="icon-button" :class="{ active: toolbarState.italic }" title="斜体" :disabled="!activeNote" @mousedown.prevent="captureEditorSelection" @click="applyItalic">
            <i class="ri-italic" aria-hidden="true"></i>
          </button>
          <button type="button" class="icon-button" :class="{ active: toolbarState.underline }" title="下划线" :disabled="!activeNote" @mousedown.prevent="captureEditorSelection" @click="applyUnderline">
            <i class="ri-underline" aria-hidden="true"></i>
          </button>
          <button type="button" class="icon-button" :class="{ active: toolbarState.strike }" title="删除线" :disabled="!activeNote" @mousedown.prevent="captureEditorSelection" @click="applyStrike">
            <i class="ri-strikethrough" aria-hidden="true"></i>
          </button>
          <button type="button" class="icon-button" title="撤销" :disabled="!activeNote" @mousedown.prevent @click="undoEdit">
            <i class="ri-arrow-go-back-line" aria-hidden="true"></i>
          </button>
          <button type="button" class="icon-button" title="重做" :disabled="!activeNote" @mousedown.prevent @click="redoEdit">
            <i class="ri-arrow-go-forward-line" aria-hidden="true"></i>
          </button>
          <div class="note-font-dropdown" title="字体">
            <button type="button" class="note-font-trigger" :disabled="!activeNote" @mousedown.prevent="captureEditorSelection" @click="fontMenuOpen = !fontMenuOpen">
              <i class="ri-font-family" aria-hidden="true"></i>
              <span :style="{ fontFamily: selectedFontFamily }">{{ currentFontLabel }}</span>
              <i class="ri-arrow-down-s-line" aria-hidden="true"></i>
            </button>
            <div v-if="fontMenuOpen" class="note-font-menu" role="menu">
              <button
                v-for="font in fontFamilies"
                :key="font.label"
                type="button"
                role="menuitem"
                :class="{ active: selectedFontFamily === font.value }"
                :style="{ fontFamily: font.value }"
                @mousedown.prevent="captureEditorSelection"
                @click="chooseFontFamily(font.value)"
              >
                {{ font.label }}
              </button>
            </div>
          </div>
          <div class="note-format-stepper" title="字号">
            <i class="ri-font-size" aria-hidden="true"></i>
            <button type="button" class="note-step-button" title="减小字号" :disabled="!activeNote" @mousedown.prevent="captureEditorSelection" @click="adjustFontSize(-1)">
              <i class="ri-subtract-line" aria-hidden="true"></i>
            </button>
            <input
              v-model.number="fontSize"
              class="note-size-input"
              type="number"
              min="10"
              max="48"
              step="1"
              :disabled="!activeNote"
              @pointerdown="captureEditorSelection"
              @input="clampFontSizeInput"
              @change="applyFontSize"
            />
            <button type="button" class="note-step-button" title="增大字号" :disabled="!activeNote" @mousedown.prevent="captureEditorSelection" @click="adjustFontSize(1)">
              <i class="ri-add-line" aria-hidden="true"></i>
            </button>
          </div>
          <div class="note-color-field" title="文字色值">
            <button type="button" class="note-color-trigger" :disabled="!activeNote" @mousedown.prevent="prepareSelectionForToolbar" @click="toggleColorPalette('text')">
              <i class="ri-palette-line" aria-hidden="true"></i>
              <span class="note-color-preview" :style="{ backgroundColor: fontColor }"></span>
            </button>
            <div v-if="colorPaletteOpen === 'text'" class="note-color-menu" role="menu" aria-label="文字色值">
              <strong>文字色板</strong>
              <button
                v-for="color in textColorPalette"
                :key="color.value"
                type="button"
                class="note-color-swatch"
                :class="{ active: fontColor.toLowerCase() === color.value }"
                :title="`${color.name} ${color.value}`"
                :style="{ backgroundColor: color.value }"
                @mousedown.prevent="prepareSelectionForToolbar"
                @click="chooseForeColor(color.value)"
              >
                <i v-if="fontColor.toLowerCase() === color.value" class="ri-check-line" aria-hidden="true"></i>
              </button>
            </div>
          </div>
          <button type="button" class="icon-button" title="文字色恢复默认" :disabled="!activeNote" @mousedown.prevent="captureEditorSelection" @click="resetForeColor">
            <i class="ri-format-clear" aria-hidden="true"></i>
          </button>
          <div class="note-color-field" title="背景高亮">
            <button type="button" class="note-color-trigger" :disabled="!activeNote" @mousedown.prevent="prepareSelectionForToolbar" @click="toggleColorPalette('highlight')">
              <i class="ri-mark-pen-line" aria-hidden="true"></i>
              <span class="note-color-preview" :style="{ backgroundColor: highlightColor }"></span>
            </button>
            <div v-if="colorPaletteOpen === 'highlight'" class="note-color-menu" role="menu" aria-label="背景高亮">
              <strong>高亮色板</strong>
              <button
                v-for="color in highlightColorPalette"
                :key="color.value"
                type="button"
                class="note-color-swatch"
                :class="{ active: highlightColor.toLowerCase() === color.value }"
                :title="`${color.name} ${color.value}`"
                :style="{ backgroundColor: color.value }"
                @mousedown.prevent="prepareSelectionForToolbar"
                @click="chooseHighlightColor(color.value)"
              >
                <i v-if="highlightColor.toLowerCase() === color.value" class="ri-check-line" aria-hidden="true"></i>
              </button>
            </div>
          </div>
          <button type="button" class="icon-button" title="高亮恢复默认" :disabled="!activeNote" @mousedown.prevent="captureEditorSelection" @click="resetHighlightColor">
            <i class="ri-eraser-line" aria-hidden="true"></i>
          </button>
          <div class="note-color-field" title="编辑器背景色">
            <button type="button" class="note-color-trigger" :disabled="!activeNote || currentView === 'trash'" @mousedown.prevent="prepareSelectionForToolbar" @click="toggleColorPalette('editorBackground')">
              <i class="ri-brush-line" aria-hidden="true"></i>
              <span class="note-color-preview" :style="{ backgroundColor: editorBackgroundColor }"></span>
            </button>
            <div v-if="colorPaletteOpen === 'editorBackground'" class="note-color-menu" role="menu" aria-label="编辑器背景色">
              <strong>背景色板</strong>
              <button
                v-for="color in editorBackgroundPalette"
                :key="color.value"
                type="button"
                class="note-color-swatch"
                :class="{ active: editorBackgroundColor.toLowerCase() === color.value }"
                :title="`${color.name} ${color.value}`"
                :style="{ backgroundColor: color.value }"
                @mousedown.prevent="prepareSelectionForToolbar"
                @click="chooseEditorBackground(color.value)"
              >
                <i v-if="editorBackgroundColor.toLowerCase() === color.value" class="ri-check-line" aria-hidden="true"></i>
              </button>
            </div>
          </div>
          <button type="button" class="icon-button" :class="{ active: toolbarState.unorderedList }" title="无序列表" :disabled="!activeNote" @mousedown.prevent="captureEditorSelection" @click="runEditorCommand('insertUnorderedList')">
            <i class="ri-list-unordered" aria-hidden="true"></i>
          </button>
          <button type="button" class="icon-button" :class="{ active: toolbarState.orderedList }" title="有序列表" :disabled="!activeNote" @mousedown.prevent="captureEditorSelection" @click="runEditorCommand('insertOrderedList')">
            <i class="ri-list-ordered" aria-hidden="true"></i>
          </button>
          <button type="button" class="icon-button" title="待办事项" :disabled="!activeNote" @mousedown.prevent="captureEditorSelection" @click="insertTodoItem">
            <i class="ri-checkbox-line" aria-hidden="true"></i>
          </button>
        </div>
        <div
          ref="editorRef"
          class="note-editor"
          :class="{ disabled: !activeNote || currentView === 'trash' }"
          :style="editorStyleFor(draftStyle)"
          :contenteditable="activeNote && currentView !== 'trash' ? 'true' : 'false'"
          spellcheck="false"
          data-placeholder="选择或新建一个便签后开始输入。可直接粘贴图片。"
          @click="handleEditorClick"
          @contextmenu="openEditorContextMenu"
          @beforeinput="pushHistorySnapshot"
          @input="handleEditorInput"
          @keydown="handleEditorKeydown"
          @keyup="handleEditorKeyup"
          @mouseup="storeEditorPosition"
          @scroll="storeEditorPosition"
          @blur="storeEditorPosition"
          @paste="handlePaste"
        ></div>
      </section>
    </div>

    <Teleport to="body">
      <div v-if="contextMenu.visible" class="note-context-scrim" @mousedown="closeContextMenu"></div>
      <div
        v-if="contextMenu.visible"
        class="note-context-menu"
        :style="{ left: `${contextMenu.x}px`, top: `${contextMenu.y}px` }"
        role="menu"
        @mousedown.prevent
      >
        <div class="note-context-row">
          <button type="button" :class="{ active: toolbarState.bold }" title="粗体" @click="applyBold"><i class="ri-bold" aria-hidden="true"></i></button>
          <button type="button" :class="{ active: toolbarState.italic }" title="斜体" @click="applyItalic"><i class="ri-italic" aria-hidden="true"></i></button>
          <button type="button" :class="{ active: toolbarState.underline }" title="下划线" @click="applyUnderline"><i class="ri-underline" aria-hidden="true"></i></button>
          <button type="button" :class="{ active: toolbarState.strike }" title="删除线" @click="applyStrike"><i class="ri-strikethrough" aria-hidden="true"></i></button>
          <button type="button" title="文字色恢复默认" @click="resetForeColor"><i class="ri-format-clear" aria-hidden="true"></i></button>
          <button type="button" title="高亮恢复默认" @click="resetHighlightColor"><i class="ri-eraser-line" aria-hidden="true"></i></button>
        </div>
        <div class="note-context-fonts">
          <button
            v-for="font in fontFamilies"
            :key="font.label"
            type="button"
            :class="{ active: selectedFontFamily === font.value }"
            :style="{ fontFamily: font.value }"
            @click="chooseContextFontFamily(font.value)"
          >
            {{ font.label }}
          </button>
        </div>
      </div>

      <GsapTransition
        child-selector=".note-link-dialog"
        :from="{ opacity: 0 }" :to="{ opacity: 1 }" :leave="{ opacity: 0 }"
        :child-from="noteDialogEnter" :child-to="noteDialogVisible" :child-leave="noteDialogExit"
        :duration="0.2"
      >
      <div
        v-if="pendingLinkEdit"
        key="note-link-dialog"
        class="note-link-mask"
        @mousedown.self="closeLinkEditor"
      >
        <div
          class="note-link-dialog"
          role="dialog"
          aria-modal="true"
          @mousedown.stop
        >
          <header class="note-link-head">
            <h3>编辑超链接</h3>
            <button type="button" class="icon-button" title="关闭" @click="closeLinkEditor">
              <i class="ri-close-line" aria-hidden="true"></i>
            </button>
          </header>
          <div class="note-link-body">
            <label class="field">
              <span>显示文本</span>
              <input v-model="pendingLinkEdit.text" placeholder="链接文本" />
            </label>
            <label class="field">
              <span>链接地址</span>
              <input v-model="pendingLinkEdit.href" placeholder="https://example.com" />
            </label>
          </div>
          <footer class="note-link-actions">
            <button type="button" class="secondary-button" @click="openEditedLink">
              <i class="ri-external-link-line" aria-hidden="true"></i>
              打开链接
            </button>
            <button type="button" class="secondary-button" @click="removeLinkFormat">
              <i class="ri-link-unlink" aria-hidden="true"></i>
              取消链接
            </button>
            <button type="button" class="primary-button" @click="saveLinkEdit">
              <i class="ri-save-3-line" aria-hidden="true"></i>
              保存
            </button>
          </footer>
        </div>
      </div>
      </GsapTransition>

      <GsapTransition
        child-selector=".note-preview-dialog"
        :from="{ opacity: 0 }" :to="{ opacity: 1 }" :leave="{ opacity: 0 }"
        :child-from="noteDialogEnter" :child-to="noteDialogVisible" :child-leave="noteDialogExit"
        :duration="0.2"
      >
      <div
        v-if="previewImage"
        key="note-preview-dialog"
        class="note-preview-mask"
      >
        <div
          class="note-preview-dialog"
          role="dialog"
          aria-modal="true"
        >
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
      </GsapTransition>

      <GsapTransition
        child-selector=".note-confirm-dialog"
        :from="{ opacity: 0 }" :to="{ opacity: 1 }" :leave="{ opacity: 0 }"
        :child-from="noteDialogEnter" :child-to="noteDialogVisible" :child-leave="noteDialogExit"
        :duration="0.2"
      >
      <div
        v-if="pendingDeleteNote"
        key="note-delete-dialog"
        class="note-confirm-mask"
      >
        <div
          class="note-confirm-dialog"
          role="dialog"
          aria-modal="true"
        >
          <h3>移入回收站</h3>
          <p>确认将“{{ pendingDeleteNote.title }}”移入回收站？之后仍可恢复，清空回收站才会彻底删除。</p>
          <div class="note-confirm-actions">
            <button type="button" class="secondary-button" @click="pendingDeleteNote = null">取消</button>
            <button type="button" class="primary-button danger-button" @click="confirmDeleteNote">
              <i class="ri-delete-bin-line" aria-hidden="true"></i>
              移入回收站
            </button>
          </div>
        </div>
      </div>
      </GsapTransition>
    </Teleport>
  </section>
</template>

<style scoped>
.sticky-notes-tool {
  height: calc(100vh - 90px);
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

.notes-workbench.sidebar-collapsed {
  grid-template-columns: minmax(0, 1fr);
}

.notes-workbench.sidebar-collapsed .notes-side {
  display: none;
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

.compact-actions {
  grid-template-columns: repeat(4, minmax(0, 0.82fr)) 1.4fr;
  margin-top: 8px;
}

.notes-action-grid .secondary-button,
.notes-action-grid .primary-button {
  min-width: 0;
  padding-inline: 10px;
}

.notes-directory-panel {
  grid-template-rows: auto auto minmax(0, 1fr) auto;
  align-content: start;
  overflow: hidden;
}

.note-view-tabs {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 6px;
  padding: 4px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface-subtle);
}

.note-view-tabs button {
  min-width: 0;
  height: 30px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--muted);
  font-weight: 700;
  cursor: pointer;
}

.note-view-tabs button.active {
  background: var(--surface);
  color: var(--accent-strong);
  box-shadow: inset 0 0 0 1px var(--border);
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
  grid-template-columns: minmax(0, 1fr) repeat(3, 30px);
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

.note-card.trash {
  grid-template-columns: minmax(0, 1fr) 30px;
}

.note-card.trash .icon-button {
  justify-self: end;
}

.note-card.active {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 8%, var(--surface));
}

.note-card.pinned {
  border-color: color-mix(in srgb, var(--accent) 42%, var(--border));
  background: linear-gradient(90deg, color-mix(in srgb, var(--accent) 13%, var(--surface-subtle)), var(--surface-subtle) 42%);
  box-shadow: inset 3px 0 0 var(--accent);
}

.note-card.pinned.active {
  background: linear-gradient(90deg, color-mix(in srgb, var(--accent) 18%, var(--surface)), color-mix(in srgb, var(--accent) 8%, var(--surface)) 48%);
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
  padding-bottom: 8px;
}

.note-editor-panel.toolbar-collapsed {
  grid-template-rows: auto minmax(0, 1fr);
}

.note-editor-head {
  align-items: center;
}

.note-editor-head > div:first-child {
  min-width: 0;
}

.note-editor-identity {
  display: grid;
  grid-template-columns: 34px minmax(0, 1fr);
  align-items: center;
  gap: 10px;
}

.note-editor-title-copy {
  min-width: 0;
}

.note-sidebar-toggle {
  width: 34px;
  height: 34px;
  padding: 0;
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

.note-toolbar-toggle {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  gap: 6px;
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

.note-format-toolbar .icon-button.active,
.note-context-menu button.active {
  border-color: var(--accent);
  background: color-mix(in srgb, var(--accent) 14%, var(--surface));
  color: var(--accent-strong);
}

.note-font-dropdown {
  position: relative;
  min-width: 148px;
}

.note-font-trigger {
  display: grid;
  grid-template-columns: 20px minmax(0, 1fr) 18px;
  align-items: center;
  gap: 6px;
  width: 100%;
  height: 34px;
  padding: 0 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface);
  color: var(--text);
  cursor: pointer;
}

.note-font-trigger span {
  min-width: 0;
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
  text-align: left;
}

.note-font-menu {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 20;
  display: grid;
  gap: 4px;
  width: 180px;
  padding: 6px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  box-shadow: 0 16px 38px rgba(1, 4, 9, 0.18);
}

.note-font-menu button {
  height: 32px;
  padding: 0 10px;
  border: 0;
  border-radius: 6px;
  background: transparent;
  color: var(--text);
  text-align: left;
  cursor: pointer;
}

.note-font-menu button:hover,
.note-font-menu button.active {
  color: var(--accent-strong);
  background: color-mix(in srgb, var(--accent) 8%, var(--surface));
}

.note-format-stepper {
  display: grid;
  grid-template-columns: 22px minmax(0, 1fr);
  align-items: center;
  gap: 6px;
  min-height: 34px;
  padding: 0 8px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface);
  color: var(--muted);
}

.note-format-stepper {
  grid-template-columns: 20px 28px 58px 28px;
  /* width: 154px; */
}

.note-color-field {
  position: relative;
  width: 54px;
  height: 34px;
}

.note-color-trigger {
  display: grid;
  grid-template-columns: 18px 18px;
  place-items: center;
  align-items: center;
  gap: 5px;
  width: 54px;
  height: 34px;
  padding: 0 7px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface);
  color: var(--muted);
  cursor: pointer;
}

.note-color-trigger:hover:not(:disabled),
.note-color-field:has(.note-color-menu) .note-color-trigger {
  border-color: var(--accent);
  color: var(--accent-strong);
  background: color-mix(in srgb, var(--accent) 8%, var(--surface));
}

.note-color-preview {
  display: block;
  width: 18px;
  height: 18px;
  border: 1px solid var(--border-strong);
  border-radius: 999px;
  box-shadow: inset 0 0 0 2px rgba(255, 255, 255, 0.72);
}

.note-color-menu {
  position: absolute;
  top: calc(100% + 6px);
  left: 0;
  z-index: 24;
  display: grid;
  grid-template-columns: repeat(5, 24px);
  gap: 6px;
  width: max-content;
  padding: 8px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  box-shadow: 0 16px 38px rgba(1, 4, 9, 0.18);
}

.note-color-menu strong {
  grid-column: 1 / -1;
  color: var(--muted);
  font-size: 12px;
  line-height: 18px;
}

.note-color-swatch {
  display: grid;
  place-items: center;
  width: 24px;
  height: 24px;
  padding: 0;
  border: 1px solid var(--border-strong);
  border-radius: 6px;
  color: #ffffff;
  cursor: pointer;
}

.note-color-swatch:hover,
.note-color-swatch.active {
  border-color: var(--accent);
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 18%, transparent);
}

.note-color-swatch i {
  filter: drop-shadow(0 1px 1px rgba(0, 0, 0, 0.35));
  font-size: 15px;
}

.note-size-input {
  appearance: textfield;
  width: 58px;
  height: 28px;
  min-width: 0;
  padding: 0 4px;
  border: 0;
  border-radius: 4px;
  background: var(--surface-subtle);
  color: var(--text);
  font-size: 12px;
  line-height: 1;
  text-align: center;
  box-shadow: none;
}

.note-size-input::-webkit-inner-spin-button,
.note-size-input::-webkit-outer-spin-button {
  margin: 0;
  -webkit-appearance: none;
  appearance: none;
}

.note-step-button {
  display: grid;
  place-items: center;
  width: 28px;
  height: 28px;
  padding: 0;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface-subtle);
  color: var(--text);
  cursor: pointer;
}

.note-step-button:hover:not(:disabled) {
  border-color: var(--accent);
  color: var(--accent-strong);
}

.note-editor {
  width: 100%;
  height: 100%;
  min-width: 0;
  min-height: 100%;
  overflow: auto;
  padding: 16px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  color: var(--text);
  font: 14px/1.45 "Source Han Sans CN", "Microsoft YaHei", ui-sans-serif, system-ui, sans-serif;
  outline: none;
  overflow-wrap: anywhere;
  scroll-padding-block: 96px;
  word-break: break-word;
  white-space: pre-wrap;
  user-select: text;
  -webkit-user-select: text;
}

.note-editor:focus {
  border-color: var(--accent);
}

.note-editor.disabled {
  color: var(--muted);
  background: var(--surface-subtle);
  cursor: default;
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

.note-editor :deep([data-note-styled="true"]) {
  line-height: 1.45;
}

.note-editor :deep(.note-active-selection) {
  border-radius: 4px;
  background-image: linear-gradient(color-mix(in srgb, var(--accent) 18%, transparent), color-mix(in srgb, var(--accent) 18%, transparent));
  box-shadow: 0 0 0 2px color-mix(in srgb, var(--accent) 24%, transparent);
}

.note-editor :deep(ul),
.note-editor :deep(ol) {
  margin: 8px 0;
  padding-left: 24px;
}

.note-editor :deep(li) {
  margin: 4px 0;
}

.note-editor :deep(.todo-line) {
  display: flex;
  align-items: center;
  gap: 8px;
  min-height: 28px;
}

.note-editor :deep(.note-todo-box[data-note-todo]) {
  position: relative;
  flex: 0 0 auto;
  display: inline-block !important;
  width: 16px !important;
  height: 16px !important;
  min-width: 16px !important;
  max-width: 16px !important;
  min-height: 16px !important;
  max-height: 16px !important;
  aspect-ratio: 1 / 1;
  margin: 0 !important;
  padding: 0 !important;
  box-sizing: border-box !important;
  border: 1px solid #d0d7de !important;
  border-radius: 4px;
  background: #ffffff !important;
  box-shadow: none !important;
  outline: none !important;
  cursor: pointer;
}

.note-editor :deep(.note-todo-box[data-note-todo]:focus),
.note-editor :deep(.note-todo-box[data-note-todo]:focus-visible) {
  outline: none;
  box-shadow: 0 0 0 3px color-mix(in srgb, #0969da 16%, transparent) !important;
}

.note-editor :deep(.note-todo-box[data-note-todo][data-checked="true"]) {
  border-color: #0969da !important;
  background: #0969da !important;
}

.note-editor :deep(.note-todo-box[data-note-todo][data-checked="true"]::after) {
  content: "";
  position: absolute;
  left: 4px;
  top: 1px;
  width: 5px;
  height: 9px;
  border: solid #ffffff;
  border-width: 0 2px 2px 0;
  transform: rotate(45deg);
}

.danger-outline {
  border-color: color-mix(in srgb, #d1242f 40%, var(--border));
  color: #d1242f;
}

.note-context-menu {
  position: fixed;
  z-index: 120;
  display: grid;
  gap: 7px;
  width: 220px;
  padding: 8px;
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  box-shadow: 0 14px 34px rgba(1, 4, 9, 0.22);
  -webkit-app-region: no-drag;
}

.note-context-scrim {
  position: fixed;
  inset: 0;
  z-index: 119;
  background: transparent;
  -webkit-app-region: no-drag;
}

.note-context-row {
  display: grid;
  grid-template-columns: repeat(6, 1fr);
  gap: 5px;
}

.note-context-row button,
.note-context-fonts button {
  min-width: 0;
  height: 30px;
  border: 1px solid var(--border);
  border-radius: 6px;
  background: var(--surface-subtle);
  color: var(--text);
  cursor: pointer;
  transition: background 0.16s ease, border-color 0.16s ease, color 0.16s ease;
}

.note-context-row button:hover,
.note-context-fonts button:hover {
  border-color: var(--accent);
  color: var(--accent-strong);
  background: color-mix(in srgb, var(--accent) 8%, var(--surface));
}

.note-context-fonts {
  display: grid;
  gap: 5px;
}

.note-context-fonts button {
  padding: 0 9px;
  text-align: left;
}

.note-preview-mask,
.note-confirm-mask,
.note-link-mask {
  position: fixed;
  inset: var(--titlebar-height) 0 0 0;
  z-index: 80;
  display: grid;
  place-items: center;
  padding: 28px;
  background: rgba(1, 4, 9, 0.58);
  -webkit-app-region: no-drag;
}

.note-link-mask {
  z-index: 82;
}

.note-link-dialog {
  display: grid;
  grid-template-rows: auto auto auto;
  width: min(520px, 92vw);
  border: 1px solid var(--border);
  border-radius: 8px;
  background: var(--surface);
  box-shadow: var(--shadow);
  overflow: hidden;
}

.note-link-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 12px;
  padding: 12px 14px;
  border-bottom: 1px solid var(--border);
  background: var(--surface-subtle);
}

.note-link-head h3 {
  margin: 0;
  font-size: 15px;
}

.note-link-body {
  display: grid;
  gap: 12px;
  padding: 14px;
}

.note-link-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  padding: 12px 14px;
  border-top: 1px solid var(--border);
  background: var(--surface-subtle);
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
    min-height: calc(100vh - 90px);
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
