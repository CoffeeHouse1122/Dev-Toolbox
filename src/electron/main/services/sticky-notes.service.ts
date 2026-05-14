import { app } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import type { StickyNote, StickyNotesState } from "../../../shared/types";

const settingsFileName = "sticky-notes-settings.json";

type StickyNotesSettings = {
  directory: string;
  pinnedIds: string[];
};

function settingsPath() {
  return path.join(app.getPath("userData"), "data", settingsFileName);
}

function defaultNotesDir() {
  return path.join(app.getPath("userData"), "notes");
}

async function loadStickyNotesSettings(): Promise<StickyNotesSettings> {
  try {
    const raw = await fs.readFile(settingsPath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<StickyNotesSettings>;
    return {
      directory: parsed.directory || defaultNotesDir(),
      pinnedIds: Array.isArray(parsed.pinnedIds) ? parsed.pinnedIds.map(String) : []
    };
  } catch {
    return { directory: defaultNotesDir(), pinnedIds: [] };
  }
}

async function loadNotesDir() {
  return (await loadStickyNotesSettings()).directory;
}

async function saveStickyNotesSettings(settings: StickyNotesSettings) {
  await fs.mkdir(path.dirname(settingsPath()), { recursive: true });
  await fs.writeFile(settingsPath(), `${JSON.stringify(settings, null, 2)}\n`, "utf8");
}

async function saveNotesDir(directory: string) {
  const settings = await loadStickyNotesSettings();
  await saveStickyNotesSettings({ ...settings, directory });
}

async function updatePinnedId(oldId: string, nextId: string) {
  if (oldId === nextId) return;
  const settings = await loadStickyNotesSettings();
  if (!settings.pinnedIds.includes(oldId)) return;
  const pinnedIds = settings.pinnedIds.map((id) => (id === oldId ? nextId : id));
  await saveStickyNotesSettings({ ...settings, pinnedIds: [...new Set(pinnedIds)] });
}

function safeFileName(title: string) {
  const normalized = title.trim().replace(/[<>:"/\\|?*\x00-\x1F]/g, " ").replace(/\s+/g, " ").slice(0, 36);
  return normalized || "未命名便签";
}

async function uniqueNotePath(directory: string, title: string, currentPath?: string) {
  const baseName = safeFileName(title);
  let index = 0;
  while (true) {
    const suffix = index === 0 ? "" : `-${index + 1}`;
    const candidate = path.join(directory, `${baseName}${suffix}.txt`);
    if (currentPath && path.resolve(candidate) === path.resolve(currentPath)) return candidate;
    try {
      await fs.access(candidate);
      index += 1;
    } catch {
      return candidate;
    }
  }
}

function decodeTextEntities(value: string) {
  return value
    .replace(/&nbsp;/g, " ")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&amp;/g, "&");
}

function htmlToPlainText(content: string) {
  return decodeTextEntities(
    content
      .replace(/<img\b[^>]*src=["']([^"']+)["'][^>]*>/gi, (_match, src: string) => `\n![粘贴图片](${src})\n`)
      .replace(/<br\s*\/?\s*>/gi, "\n")
      .replace(/<\/(p|div|section|article|li)>/gi, "\n")
      .replace(/<[^>]+>/g, "")
  ).replace(/\n{3,}/g, "\n\n");
}

function normalizeStoredContent(content: string) {
  return /<[a-z][\s\S]*>/i.test(content) ? htmlToPlainText(content) : content;
}

function resolveTitle(fileName: string, content: string) {
  const plain = normalizeStoredContent(content).replace(/^!\[[^\]]*\]\(data:image\/[^)]+\)\s*$/gim, " ");
  const firstLine = plain.split(/\r?\n/).find((line) => line.trim());
  return firstLine?.trim().slice(0, 36) || path.basename(fileName, ".txt");
}

async function readNote(filePath: string, pinnedIds: string[] = []): Promise<StickyNote> {
  const rawContent = await fs.readFile(filePath, "utf8");
  const content = normalizeStoredContent(rawContent);
  if (content !== rawContent) {
    await fs.writeFile(filePath, content, "utf8");
  }
  const stat = await fs.stat(filePath);
  const fileName = path.basename(filePath);
  return {
    id: fileName,
    fileName,
    filePath,
    title: resolveTitle(fileName, content),
    content,
    updatedAt: stat.mtimeMs,
    pinned: pinnedIds.includes(fileName)
  };
}

function resolveNotePath(directory: string, id: string) {
  return path.join(directory, path.basename(id));
}

export async function loadStickyNotes(): Promise<StickyNotesState> {
  const settings = await loadStickyNotesSettings();
  const directory = settings.directory;
  await fs.mkdir(directory, { recursive: true });
  const entries = await fs.readdir(directory, { withFileTypes: true });
  const noteFiles = entries
    .filter((entry) => entry.isFile() && entry.name.toLowerCase().endsWith(".txt"))
    .map((entry) => path.join(directory, entry.name));

  const notes: StickyNote[] = [];
  for (const filePath of noteFiles) {
    const note = await readNote(filePath, settings.pinnedIds);
    const syncedPath = await uniqueNotePath(directory, note.title, note.filePath);
    if (path.resolve(syncedPath) !== path.resolve(note.filePath)) {
      await fs.rename(note.filePath, syncedPath);
      await updatePinnedId(note.id, path.basename(syncedPath));
      const nextSettings = await loadStickyNotesSettings();
      notes.push(await readNote(syncedPath, nextSettings.pinnedIds));
    } else {
      notes.push(note);
    }
  }
  notes.sort((left, right) => Number(right.pinned) - Number(left.pinned) || right.updatedAt - left.updatedAt);
  return { directory, notes };
}

export async function setStickyNotesDirectory(directory: string): Promise<StickyNotesState> {
  const normalized = path.resolve(directory);
  await fs.mkdir(normalized, { recursive: true });
  await saveNotesDir(normalized);
  return loadStickyNotes();
}

export async function createStickyNote(content = ""): Promise<StickyNote> {
  const directory = await loadNotesDir();
  await fs.mkdir(directory, { recursive: true });
  const normalizedContent = normalizeStoredContent(content || "新便签\n");
  const title = resolveTitle("未命名便签.txt", normalizedContent) || "未命名便签";
  const filePath = await uniqueNotePath(directory, title);
  await fs.writeFile(filePath, normalizedContent, "utf8");
  return readNote(filePath);
}

export async function saveStickyNote(id: string, content: string): Promise<StickyNote> {
  const directory = await loadNotesDir();
  const settings = await loadStickyNotesSettings();
  const filePath = resolveNotePath(directory, id);
  const normalizedContent = normalizeStoredContent(content);
  await fs.writeFile(filePath, normalizedContent, "utf8");

  const title = resolveTitle(path.basename(filePath), normalizedContent);
  const nextPath = await uniqueNotePath(directory, title, filePath);
  if (path.resolve(nextPath) !== path.resolve(filePath)) {
    await fs.rename(filePath, nextPath);
    await updatePinnedId(id, path.basename(nextPath));
    const nextSettings = await loadStickyNotesSettings();
    return readNote(nextPath, nextSettings.pinnedIds);
  }

  return readNote(filePath, settings.pinnedIds);
}

export async function setStickyNotePinned(id: string, pinned: boolean): Promise<StickyNotesState> {
  const settings = await loadStickyNotesSettings();
  const basename = path.basename(id);
  const pinnedIds = pinned
    ? [...new Set([...settings.pinnedIds, basename])]
    : settings.pinnedIds.filter((item) => item !== basename);
  await saveStickyNotesSettings({ ...settings, pinnedIds });
  return loadStickyNotes();
}

export async function deleteStickyNote(id: string): Promise<void> {
  const directory = await loadNotesDir();
  await setStickyNotePinned(id, false);
  await fs.rm(resolveNotePath(directory, id), { force: true });
}

export async function exportStickyNotes(outputDir: string, ids?: string[]): Promise<string[]> {
  const { notes } = await loadStickyNotes();
  await fs.mkdir(outputDir, { recursive: true });
  const selected = ids?.length ? notes.filter((note) => ids.includes(note.id)) : notes;
  const exported: string[] = [];
  for (const note of selected) {
    const target = path.join(outputDir, note.fileName);
    await fs.copyFile(note.filePath, target);
    exported.push(target);
  }
  return exported;
}