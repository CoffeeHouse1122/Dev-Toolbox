import { app } from "electron";
import Database from "better-sqlite3";
import JSZip from "jszip";
import fs from "node:fs/promises";
import path from "node:path";
import type { Readable } from "node:stream";
import { z } from "zod";
import type {
  StickyNote,
  StickyNoteExportOptions,
  StickyNoteStatus,
  StickyNoteStyle,
  StickyNotesImportResult,
  StickyNotesPreferences,
  StickyNotesState
} from "../../../shared/types";
import { readJsonWithBackup, writeFileAtomic } from "./atomic-file";
const settingsFileName = "sticky-notes-settings.json";
const databaseFileName = "sticky-notes.sqlite";
const richNoteMarker = "<!-- dev-toolbox-note-html:v1 -->";
const MAX_IMPORT_FILES = 100;
const MAX_IMPORT_FILE_BYTES = 64 * 1024 * 1024;
const MAX_IMPORT_JSON_CHARS = 32 * 1024 * 1024;
const MAX_NOTE_CONTENT_CHARS = 8 * 1024 * 1024;
const MAX_IMPORTED_NOTES = 2_000;
const MAX_ZIP_ENTRIES = 2_500;
const MAX_ZIP_UNCOMPRESSED_BYTES = 128 * 1024 * 1024;

const defaultPreferences: StickyNotesPreferences = {
  fontFamily: '"Source Han Sans CN", "Microsoft YaHei", ui-sans-serif, system-ui, sans-serif',
  fontSize: 16,
  lineHeight: 1.45,
  padding: 16,
  color: "#1f2328",
  backgroundColor: "#ffffff"
};

type StickyNotesSettings = {
  directory: string;
};

type NoteRow = {
  id: string;
  title: string;
  content: string;
  plain_text: string;
  pinned: number;
  status: StickyNoteStatus;
  style_json: string | null;
  source_path: string | null;
  created_at: number;
  updated_at: number;
  archived_at: number | null;
  trashed_at: number | null;
};

type ImportNotePayload = {
  id?: string;
  title?: string;
  content?: string;
  pinned?: boolean;
  status?: StickyNoteStatus;
  style?: Partial<StickyNoteStyle>;
  createdAt?: number;
  updatedAt?: number;
  archivedAt?: number | null;
  trashedAt?: number | null;
};

const importedStyleSchema = z
  .object({
    fontFamily: z.string().min(1).max(300).optional(),
    fontSize: z.number().finite().min(10).max(48).optional(),
    lineHeight: z.number().finite().min(1).max(2.4).optional(),
    padding: z.number().finite().min(8).max(64).optional(),
    color: z.string().max(100).optional(),
    backgroundColor: z.string().max(100).optional()
  })
  .strict();

const importNoteSchema = z
  .object({
    id: z.string().max(200).optional(),
    fileName: z.string().max(1_024).optional(),
    filePath: z.string().max(32_768).optional(),
    title: z.string().max(200).optional(),
    content: z.string().min(1).max(MAX_NOTE_CONTENT_CHARS),
    pinned: z.boolean().optional(),
    status: z.enum(["active", "archived", "trashed"]).optional(),
    style: importedStyleSchema.optional(),
    createdAt: z.number().int().nonnegative().max(8_640_000_000_000).optional(),
    updatedAt: z.number().int().nonnegative().max(8_640_000_000_000).optional(),
    archivedAt: z.number().int().nonnegative().max(8_640_000_000_000).nullable().optional(),
    trashedAt: z.number().int().nonnegative().max(8_640_000_000_000).nullable().optional()
  })
  .strict();

const importPayloadSchema = z.union([
  z.array(importNoteSchema).max(MAX_IMPORTED_NOTES),
  z.object({
    version: z.number().int().min(1).max(100).optional(),
    exportedAt: z.string().datetime().optional(),
    preferences: importedStyleSchema.optional(),
    notes: z.array(importNoteSchema).max(MAX_IMPORTED_NOTES)
  }).strict()
]);

const allowedRichTags = new Set([
  "a", "b", "blockquote", "br", "code", "div", "em", "h1", "h2", "h3", "h4", "h5", "h6", "i", "img",
  "li", "ol", "p", "pre", "s", "span", "strike", "strong", "u", "ul"
]);
const voidRichTags = new Set(["br", "img"]);
const allowedClassNames = new Set(["note-inline-image", "note-todo-box", "todo-line"]);
const allowedStyleProperties = new Set([
  "background-color", "color", "font-family", "font-size", "font-style", "font-weight", "line-height", "text-decoration"
]);

function escapeRichText(value: string) {
  // Keep existing entities intact so normal editor text is not double encoded.
  return value.replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function escapeRichAttribute(value: string) {
  return value.replace(/&/g, "&amp;").replace(/"/g, "&quot;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function decodeAttributeEntities(value: string) {
  return value
    .replace(/&#x([0-9a-f]+);?/gi, (_match, hex: string) => {
      const codePoint = Number.parseInt(hex, 16);
      return codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : "";
    })
    .replace(/&#(\d+);?/g, (_match, decimal: string) => {
      const codePoint = Number.parseInt(decimal, 10);
      return codePoint <= 0x10ffff ? String.fromCodePoint(codePoint) : "";
    })
    .replace(/&(colon|tab|newline|amp|quot|apos|lt|gt);/gi, (_match, name: string) => ({
      colon: ":", tab: "\t", newline: "\n", amp: "&", quot: '"', apos: "'", lt: "<", gt: ">"
    })[name.toLowerCase()] || "");
}

function safeExternalHref(value: string) {
  const decoded = decodeAttributeEntities(value).replace(/[\u0000-\u0020\u007f]+/g, "").trim();
  try {
    const protocol = new URL(decoded).protocol.toLowerCase();
    return ["http:", "https:", "mailto:"].includes(protocol) ? decoded : "";
  } catch {
    return "";
  }
}

function safeInlineImage(value: string) {
  const decoded = decodeAttributeEntities(value).replace(/\s+/g, "");
  if (decoded.length > MAX_NOTE_CONTENT_CHARS) return "";
  return /^data:image\/(?:png|jpe?g|gif|webp);base64,[a-z0-9+/]+=*$/i.test(decoded) ? decoded : "";
}

function sanitizeInlineStyle(value: string) {
  value = decodeAttributeEntities(value);
  const declarations: string[] = [];
  for (const item of value.split(";")) {
    const separator = item.indexOf(":");
    if (separator < 1) continue;
    const property = item.slice(0, separator).trim().toLowerCase();
    const styleValue = item.slice(separator + 1).trim();
    if (!allowedStyleProperties.has(property) || !styleValue || /url\s*\(|expression\s*\(|@import|[<>]/i.test(styleValue)) continue;
    if (styleValue.length > 300) continue;
    declarations.push(`${property}: ${styleValue}`);
  }
  return declarations.join("; ");
}

function richAttributes(tagName: string, rawAttributes: string) {
  const parsed = new Map<string, string>();
  const pattern = /([^\s=/>]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
  let match: RegExpExecArray | null;
  while ((match = pattern.exec(rawAttributes))) {
    parsed.set(match[1].toLowerCase(), match[2] ?? match[3] ?? match[4] ?? "");
  }

  const attributes: string[] = [];
  const style = sanitizeInlineStyle(parsed.get("style") || "");
  if (style) attributes.push(`style="${escapeRichAttribute(style)}"`);
  const classes = (parsed.get("class") || "").split(/\s+/).filter((name) => allowedClassNames.has(name));
  if (classes.length) attributes.push(`class="${classes.join(" ")}"`);

  if (tagName === "a") {
    const href = safeExternalHref(parsed.get("href") || parsed.get("data-note-link") || "");
    if (href) {
      attributes.push(`href="${escapeRichAttribute(href)}"`, `data-note-link="${escapeRichAttribute(href)}"`, 'rel="noopener noreferrer"');
    }
  }
  if (tagName === "img") {
    const src = safeInlineImage(parsed.get("src") || parsed.get("data-note-src") || "");
    if (!src) return null;
    attributes.push(`src="${escapeRichAttribute(src)}"`, `data-note-src="${escapeRichAttribute(src)}"`, 'alt="粘贴图片"');
  }
  if (tagName === "span" && (parsed.get("data-note-todo") === "true" || classes.includes("note-todo-box"))) {
    const checked = parsed.get("data-checked") === "true" || parsed.get("aria-checked") === "true";
    attributes.push('data-note-todo="true"', `data-checked="${checked}"`, `aria-checked="${checked}"`, 'role="checkbox"', 'tabindex="0"', 'contenteditable="false"');
  }
  if (tagName === "span" && parsed.get("data-note-styled") === "true") attributes.push('data-note-styled="true"');
  return attributes.length ? ` ${attributes.join(" ")}` : "";
}

/** Rebuild rich HTML from a small allowlist; no source attribute is copied verbatim. */
export function sanitizeStickyNoteHtml(source: string) {
  let output = "";
  let cursor = 0;
  const tokenPattern = /<!--[\s\S]*?-->|<\/?[a-z][^>]*>/gi;
  let match: RegExpExecArray | null;
  while ((match = tokenPattern.exec(source))) {
    output += escapeRichText(source.slice(cursor, match.index));
    cursor = match.index + match[0].length;
    if (match[0].startsWith("<!--")) continue;
    const tagMatch = match[0].match(/^<\s*(\/?)\s*([a-z0-9]+)([\s\S]*?)\/?\s*>$/i);
    if (!tagMatch) continue;
    const closing = Boolean(tagMatch[1]);
    const tagName = tagMatch[2].toLowerCase();
    if (!allowedRichTags.has(tagName)) continue;
    if (closing) {
      if (!voidRichTags.has(tagName)) output += `</${tagName}>`;
      continue;
    }
    const attributes = richAttributes(tagName, tagMatch[3]);
    if (attributes === null) continue;
    output += `<${tagName}${attributes}>`;
  }
  output += escapeRichText(source.slice(cursor));
  return output;
}

function sanitizeStoredContent(content: string) {
  if (content.length > MAX_NOTE_CONTENT_CHARS) throw new Error("单条便签内容不能超过 8 MiB");
  return content.startsWith(richNoteMarker)
    ? `${richNoteMarker}${sanitizeStickyNoteHtml(content.slice(richNoteMarker.length))}`
    : content.replace(/\0/g, "");
}

function settingsPath() {
  return path.join(app.getPath("userData"), "data", settingsFileName);
}

function defaultNotesDir() {
  return path.join(app.getPath("userData"), "notes");
}

function databasePath() {
  return path.join(app.getPath("userData"), "data", databaseFileName);
}

async function loadStickyNotesSettings(): Promise<StickyNotesSettings> {
  try {
    const parsed = await readJsonWithBackup<Partial<StickyNotesSettings>>(settingsPath());
    return { directory: parsed.directory || defaultNotesDir() };
  } catch {
    return { directory: defaultNotesDir() };
  }
}

async function saveStickyNotesSettings(settings: StickyNotesSettings) {
  await fs.mkdir(path.dirname(settingsPath()), { recursive: true });
  await writeFileAtomic(settingsPath(), `${JSON.stringify(settings, null, 2)}\n`);
}

function openDatabase() {
  const dbPath = databasePath();
  const db = new Database(dbPath);
  db.pragma("journal_mode = WAL");
  db.pragma("foreign_keys = ON");
  db.exec(`
    CREATE TABLE IF NOT EXISTS notes (
      id TEXT PRIMARY KEY,
      title TEXT NOT NULL,
      content TEXT NOT NULL,
      plain_text TEXT NOT NULL,
      pinned INTEGER NOT NULL DEFAULT 0,
      status TEXT NOT NULL DEFAULT 'active',
      style_json TEXT,
      source_path TEXT UNIQUE,
      created_at INTEGER NOT NULL,
      updated_at INTEGER NOT NULL,
      archived_at INTEGER,
      trashed_at INTEGER
    );

    CREATE TABLE IF NOT EXISTS settings (
      key TEXT PRIMARY KEY,
      value TEXT NOT NULL
    );

    CREATE INDEX IF NOT EXISTS idx_notes_status_updated ON notes(status, updated_at DESC);
    CREATE INDEX IF NOT EXISTS idx_notes_plain_text ON notes(plain_text);
  `);
  return db;
}

function readSetting<T>(db: Database.Database, key: string, fallback: T): T {
  const row = db.prepare("SELECT value FROM settings WHERE key = ?").get(key) as { value: string } | undefined;
  if (!row) return fallback;
  try {
    return { ...fallback, ...(JSON.parse(row.value) as Partial<T>) };
  } catch {
    return fallback;
  }
}

function writeSetting(db: Database.Database, key: string, value: unknown) {
  db.prepare("INSERT INTO settings(key, value) VALUES(?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value").run(
    key,
    JSON.stringify(value)
  );
}

function safeFileName(title: string) {
  const normalized = title.trim().replace(/[<>:"/\\|?*\x00-\x1F]/g, " ").replace(/\s+/g, " ").slice(0, 36);
  return normalized || "未命名便签";
}

function formatDateName(value: number) {
  const date = new Date(value);
  const pad = (input: number) => String(input).padStart(2, "0");
  return `${date.getFullYear()}${pad(date.getMonth() + 1)}${pad(date.getDate())}`;
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
      .replace(richNoteMarker, "")
      .replace(/<input\b[^>]*type=["']checkbox["'][^>]*checked[^>]*>/gi, "[x] ")
      .replace(/<input\b[^>]*type=["']checkbox["'][^>]*>/gi, "[ ] ")
      .replace(/<img\b[^>]*src=["']([^"']+)["'][^>]*>/gi, (_match, src: string) => `\n![粘贴图片](${src})\n`)
      .replace(/<br\s*\/?\s*>/gi, "\n")
      .replace(/<\/(p|div|section|article|li|h\d)>/gi, "\n")
      .replace(/<[^>]+>/g, "")
  )
    .replace(/\u200b/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function stripTxtExportEnvelope(value: string) {
  return value
    .replace(/^#\s*\d+\.\s*[^\r\n]+\r?\n状态:\s*[^\r\n]*\r?\n更新时间:\s*[^\r\n]*\r?\n\r?\n/, "")
    .trim();
}

function parseTxtImportPayload(fileName: string, raw: string): ImportNotePayload[] {
  const parts = raw.replace(/\r\n/g, "\n").split(/\n{2,}---\n{2,}/);
  const exportedParts = parts.filter((part) => /^#\s*\d+\.\s*[^\n]+\n状态:/m.test(part));
  if (!exportedParts.length) return [{ title: fileName, content: stripTxtExportEnvelope(raw) }];
  return exportedParts.map((part) => ({
    title: part.match(/^#\s*\d+\.\s*([^\n]+)/m)?.[1]?.trim() || fileName,
    content: stripTxtExportEnvelope(part)
  }));
}

function normalizeDuplicateText(value: string) {
  return stripTxtExportEnvelope(value).replace(/\r\n/g, "\n").replace(/[ \t]+$/gm, "").trim();
}

function notePlainText(content: string) {
  return normalizeDuplicateText(htmlToPlainText(content) || content);
}

function resolveTitle(fallback: string, content: string) {
  const plain = (content.startsWith(richNoteMarker) || /<[a-z][\s\S]*>/i.test(content) ? htmlToPlainText(content) : content).replace(
    /^!\[[^\]]*\]\(data:image\/[^)]+\)\s*$/gim,
    " "
  );
  const firstLine = plain.split(/\r?\n/).find((line) => line.trim());
  return firstLine?.trim().slice(0, 36) || fallback.replace(/\.[^.]+$/, "") || "未命名便签";
}

function normalizeStyle(style?: Partial<StickyNoteStyle> | null): StickyNoteStyle {
  return {
    ...defaultPreferences,
    ...(style || {}),
    fontSize: Math.min(48, Math.max(10, Number(style?.fontSize || defaultPreferences.fontSize))),
    lineHeight: Math.min(2.4, Math.max(1, Number(style?.lineHeight || defaultPreferences.lineHeight))),
    padding: Math.min(64, Math.max(8, Number(style?.padding || defaultPreferences.padding)))
  };
}

function rowToNote(row: NoteRow): StickyNote {
  let style: StickyNoteStyle;
  try {
    style = normalizeStyle(row.style_json ? (JSON.parse(row.style_json) as Partial<StickyNoteStyle>) : null);
  } catch {
    style = normalizeStyle();
  }
  const fileName = `${safeFileName(row.title)}-${formatDateName(row.updated_at)}.txt`;
  const content = sanitizeStoredContent(row.content);
  return {
    id: row.id,
    fileName,
    filePath: `${databasePath()}#${row.id}`,
    title: row.title,
    content,
    updatedAt: row.updated_at,
    pinned: Boolean(row.pinned),
    status: row.status,
    style,
    createdAt: row.created_at,
    archivedAt: row.archived_at,
    trashedAt: row.trashed_at
  };
}

function sortNotes(notes: StickyNote[]) {
  return [...notes].sort((left, right) => Number(right.pinned) - Number(left.pinned) || right.createdAt - left.createdAt);
}

function readAllNotes(db: Database.Database) {
  const rows = db.prepare("SELECT * FROM notes").all() as NoteRow[];
  return rows.map(rowToNote);
}

function createId() {
  return `note-${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

function upsertNote(db: Database.Database, payload: ImportNotePayload & { sourcePath?: string | null }) {
  const now = Date.now();
  const content = sanitizeStoredContent(payload.content || "新便签\n");
  const title = resolveTitle(payload.title || "未命名便签", content);
  const id = payload.id || createId();
  const style = normalizeStyle(payload.style);
  db.prepare(
    `INSERT INTO notes(
      id, title, content, plain_text, pinned, status, style_json, source_path, created_at, updated_at, archived_at, trashed_at
    ) VALUES(
      @id, @title, @content, @plainText, @pinned, @status, @styleJson, @sourcePath, @createdAt, @updatedAt, @archivedAt, @trashedAt
    )`
  ).run({
    id,
    title,
    content,
    plainText: notePlainText(content),
    pinned: payload.pinned ? 1 : 0,
    status: payload.status || "active",
    styleJson: JSON.stringify(style),
    sourcePath: payload.sourcePath || null,
    createdAt: payload.createdAt || now,
    updatedAt: payload.updatedAt || now,
    archivedAt: payload.archivedAt ?? null,
    trashedAt: payload.trashedAt ?? null
  });
  return id;
}

async function buildState(): Promise<StickyNotesState> {
  const settings = await loadStickyNotesSettings();
  await fs.mkdir(path.dirname(databasePath()), { recursive: true });
  const db = openDatabase();
  try {
    const preferences = readSetting(db, "preferences", defaultPreferences);
    const all = readAllNotes(db);
    return {
      directory: settings.directory,
      databasePath: databasePath(),
      notes: sortNotes(all.filter((note) => note.status === "active")),
      archivedNotes: sortNotes(all.filter((note) => note.status === "archived")),
      trashNotes: sortNotes(all.filter((note) => note.status === "trashed")),
      preferences: normalizeStyle(preferences)
    };
  } finally {
    db.close();
  }
}

export async function loadStickyNotes(): Promise<StickyNotesState> {
  return buildState();
}

export async function setStickyNotesDirectory(directory: string): Promise<StickyNotesState> {
  const normalized = path.resolve(directory);
  await fs.mkdir(normalized, { recursive: true });
  await saveStickyNotesSettings({ directory: normalized });
  return buildState();
}

export async function createStickyNote(content = ""): Promise<StickyNote> {
  await fs.mkdir(path.dirname(databasePath()), { recursive: true });
  const db = openDatabase();
  try {
    const preferences = readSetting(db, "preferences", defaultPreferences);
    const id = upsertNote(db, { content: content || "新便签\n", style: preferences });
    const row = db.prepare("SELECT * FROM notes WHERE id = ?").get(id) as NoteRow;
    return rowToNote(row);
  } finally {
    db.close();
  }
}

export async function saveStickyNote(id: string, content: string): Promise<StickyNote> {
  const db = openDatabase();
  try {
    const row = db.prepare("SELECT * FROM notes WHERE id = ?").get(id) as NoteRow | undefined;
    if (!row) throw new Error("便签不存在或已被移除。");
    const sanitizedContent = sanitizeStoredContent(content);
    const title = resolveTitle(row.title, sanitizedContent);
    const now = Date.now();
    db.prepare("UPDATE notes SET title = ?, content = ?, plain_text = ?, updated_at = ? WHERE id = ?").run(
      title,
      sanitizedContent,
      notePlainText(sanitizedContent),
      now,
      id
    );
    return rowToNote(db.prepare("SELECT * FROM notes WHERE id = ?").get(id) as NoteRow);
  } finally {
    db.close();
  }
}

export async function setStickyNotePinned(id: string, pinned: boolean): Promise<StickyNotesState> {
  const db = openDatabase();
  try {
    db.prepare("UPDATE notes SET pinned = ?, updated_at = ? WHERE id = ?").run(pinned ? 1 : 0, Date.now(), id);
  } finally {
    db.close();
  }
  return buildState();
}

export async function archiveStickyNote(id: string, archived: boolean): Promise<StickyNotesState> {
  const db = openDatabase();
  try {
    const now = Date.now();
    db.prepare("UPDATE notes SET status = ?, archived_at = ?, trashed_at = NULL, pinned = CASE WHEN ? = 'archived' THEN 0 ELSE pinned END, updated_at = ? WHERE id = ?").run(
      archived ? "archived" : "active",
      archived ? now : null,
      archived ? "archived" : "active",
      now,
      id
    );
  } finally {
    db.close();
  }
  return buildState();
}

export async function deleteStickyNote(id: string): Promise<void> {
  const db = openDatabase();
  try {
    const now = Date.now();
    db.prepare("UPDATE notes SET status = 'trashed', pinned = 0, trashed_at = ?, updated_at = ? WHERE id = ?").run(now, now, id);
  } finally {
    db.close();
  }
}

export async function restoreStickyNote(id: string): Promise<StickyNotesState> {
  const db = openDatabase();
  try {
    db.prepare("UPDATE notes SET status = 'active', archived_at = NULL, trashed_at = NULL, updated_at = ? WHERE id = ?").run(Date.now(), id);
  } finally {
    db.close();
  }
  return buildState();
}

export async function emptyStickyNotesTrash(): Promise<StickyNotesState> {
  const db = openDatabase();
  try {
    db.prepare("DELETE FROM notes WHERE status = 'trashed'").run();
  } finally {
    db.close();
  }
  return buildState();
}

export async function saveStickyNotesPreferences(preferences: StickyNotesPreferences): Promise<StickyNotesState> {
  const db = openDatabase();
  try {
    writeSetting(db, "preferences", normalizeStyle(preferences));
  } finally {
    db.close();
  }
  return buildState();
}

export async function applyStickyNotePreset(id: string | null, scope: "current" | "all", style: StickyNoteStyle): Promise<StickyNotesState> {
  const db = openDatabase();
  try {
    const styleJson = JSON.stringify(normalizeStyle(style));
    if (scope === "all") {
      db.prepare("UPDATE notes SET style_json = ?, updated_at = ? WHERE status != 'trashed'").run(styleJson, Date.now());
    } else if (id) {
      db.prepare("UPDATE notes SET style_json = ?, updated_at = ? WHERE id = ?").run(styleJson, Date.now(), id);
    }
  } finally {
    db.close();
  }
  return buildState();
}

function exportableNotes(db: Database.Database, options: StickyNoteExportOptions) {
  const all = readAllNotes(db);
  const allowed = new Set<StickyNoteStatus>(["active"]);
  if (options.includeArchived) allowed.add("archived");
  if (options.includeTrash) allowed.add("trashed");
  return sortNotes(all.filter((note) => allowed.has(note.status) && (!options.ids?.length || options.ids.includes(note.id))));
}

function exportPayload(notes: StickyNote[], preferences: StickyNotesPreferences) {
  return {
    version: 1,
    exportedAt: new Date().toISOString(),
    preferences,
    notes
  };
}

function uniqueZipName(usedNames: Set<string>, fileName: string) {
  const extension = path.extname(fileName);
  const baseName = path.basename(fileName, extension);
  let candidate = fileName;
  let index = 2;
  while (usedNames.has(candidate)) {
    candidate = `${baseName}-${index}${extension}`;
    index += 1;
  }
  usedNames.add(candidate);
  return candidate;
}

export async function exportStickyNotes(outputDirOrOptions: string | StickyNoteExportOptions, ids?: string[]): Promise<string[]> {
  const options: StickyNoteExportOptions =
    typeof outputDirOrOptions === "string"
      ? { outputDir: outputDirOrOptions, ids, format: "txt", includeArchived: false, includeTrash: false }
      : outputDirOrOptions;
  await fs.mkdir(options.outputDir, { recursive: true });
  const db = openDatabase();
  try {
    const preferences = readSetting(db, "preferences", defaultPreferences);
    const notes = exportableNotes(db, options);
    const stamp = new Date().toISOString().replace(/[:.]/g, "-");
    if (options.format === "json") {
      const target = path.join(options.outputDir, `sticky-notes-${stamp}.json`);
      await writeFileAtomic(target, `${JSON.stringify(exportPayload(notes, preferences), null, 2)}\n`);
      return [target];
    }
    if (options.format === "zip") {
      const zip = new JSZip();
      zip.file("sticky-notes.json", `${JSON.stringify(exportPayload(notes, preferences), null, 2)}\n`);
      const usedNames = new Set<string>();
      for (const note of notes) {
        zip.file(uniqueZipName(usedNames, note.fileName), htmlToPlainText(note.content) || note.content);
      }
      const buffer = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
      const target = path.join(options.outputDir, `sticky-notes-${stamp}.zip`);
      await writeFileAtomic(target, buffer);
      return [target];
    }
    const target = path.join(options.outputDir, notes.length === 1 ? notes[0].fileName : `sticky-notes-${stamp}.txt`);
    const content = notes.length === 1
      ? notePlainText(notes[0].content)
      : notes
          .map((note, index) => [`# ${index + 1}. ${note.title}`, `状态: ${note.status}`, `更新时间: ${new Date(note.updatedAt).toLocaleString()}`, "", notePlainText(note.content)].join("\n"))
          .join("\n\n---\n\n");
    await writeFileAtomic(target, content);
    return [target];
  } finally {
    db.close();
  }
}

function parseImportPayload(raw: string): ImportNotePayload[] {
  if (raw.length > MAX_IMPORT_JSON_CHARS) throw new Error("便签 JSON 解压后不能超过 32 MiB");
  const parsed = importPayloadSchema.parse(JSON.parse(raw));
  return Array.isArray(parsed) ? parsed : parsed.notes;
}

function hasDuplicateNote(db: Database.Database, content: string, title?: string, sourcePath?: string | null) {
  const plainText = notePlainText(content);
  if (sourcePath) {
    const bySource = db.prepare("SELECT id FROM notes WHERE source_path = ?").get(sourcePath);
    if (bySource) return true;
  }
  const row = db.prepare("SELECT id FROM notes WHERE plain_text = ? LIMIT 1").get(plainText);
  return Boolean(row);
}

function importNoteIfUnique(db: Database.Database, payload: ImportNotePayload & { sourcePath?: string | null }) {
  const content = payload.content || "";
  if (!content || hasDuplicateNote(db, content, payload.title, payload.sourcePath)) return false;
  upsertNote(db, payload);
  return true;
}

type PreparedImportNote = ImportNotePayload & { content: string; sourcePath?: string | null };

type PreparedImportBatch = {
  notes: PreparedImportNote[];
  skipped: number;
};

function ensureImportCapacity(batch: PreparedImportBatch, additional = 1) {
  if (batch.notes.length + batch.skipped + additional > MAX_IMPORTED_NOTES) {
    throw new Error(`一次最多导入 ${MAX_IMPORTED_NOTES} 条便签`);
  }
}

function appendPreparedNote(
  batch: PreparedImportBatch,
  payload: ImportNotePayload,
  options: { sourcePath?: string | null; reactivateTrash?: boolean } = {}
) {
  ensureImportCapacity(batch);
  const content = sanitizeStoredContent(payload.content || "");
  if (!content) {
    batch.skipped += 1;
    return;
  }
  batch.notes.push({
    ...payload,
    id: undefined,
    content,
    status: options.reactivateTrash && payload.status === "trashed" ? "active" : payload.status,
    sourcePath: options.sourcePath
  });
}

function appendJsonContent(batch: PreparedImportBatch, raw: string) {
  const notes = parseImportPayload(raw);
  ensureImportCapacity(batch, notes.length);
  for (const note of notes) appendPreparedNote(batch, note, { reactivateTrash: true });
}

async function readImportText(inputPath: string) {
  const stat = await fs.stat(inputPath);
  if (!stat.isFile()) throw new Error(`不是可导入的文件：${path.basename(inputPath)}`);
  if (stat.size > MAX_IMPORT_FILE_BYTES) throw new Error(`导入文件不能超过 64 MiB：${path.basename(inputPath)}`);
  const content = await fs.readFile(inputPath, "utf8");
  if (content.length > MAX_IMPORT_JSON_CHARS) throw new Error(`导入文本不能超过 32 MiB：${path.basename(inputPath)}`);
  return content;
}

type ZipEntryData = {
  uncompressedSize?: number;
  crc32?: number;
};

function zipEntryData(entry: JSZip.JSZipObject) {
  return (entry as unknown as { _data?: ZipEntryData })._data;
}

function zipEntryDeclaredSize(entry: JSZip.JSZipObject) {
  const size = zipEntryData(entry)?.uncompressedSize;
  if (entry.dir && size === undefined) return 0;
  if (!Number.isSafeInteger(size) || (size ?? -1) < 0) throw new Error(`ZIP 条目大小无效：${entry.name}`);
  return size as number;
}

const crc32Table = new Uint32Array(256);
for (let index = 0; index < crc32Table.length; index += 1) {
  let value = index;
  for (let bit = 0; bit < 8; bit += 1) value = (value & 1) !== 0 ? 0xedb88320 ^ (value >>> 1) : value >>> 1;
  crc32Table[index] = value >>> 0;
}

function calculateCrc32(content: Buffer) {
  let crc = 0xffffffff;
  for (const byte of content) crc = crc32Table[(crc ^ byte) & 0xff] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

async function readZipEntryBuffer(
  entry: JSZip.JSZipObject,
  maxEntryBytes: number,
  remainingArchiveBytes: number,
  tooLargeMessage: string
) {
  const declaredSize = zipEntryDeclaredSize(entry);
  if (declaredSize > maxEntryBytes) throw new Error(tooLargeMessage);
  if (declaredSize > remainingArchiveBytes) throw new Error("ZIP 解压后内容不能超过 128 MiB");

  const stream = entry.nodeStream("nodebuffer") as Readable & { _helper?: { pause(): void } };
  const content = await new Promise<Buffer>((resolve, reject) => {
    const chunks: Buffer[] = [];
    let actualSize = 0;
    let settled = false;

    const cleanup = () => {
      stream.removeListener("data", onData);
      stream.removeListener("error", onError);
      stream.removeListener("end", onEnd);
    };
    const fail = (error: unknown) => {
      if (settled) return;
      settled = true;
      cleanup();
      // JSZip's public Node stream adapter does not destroy its underlying
      // worker. Pause it explicitly and absorb a possible late worker error.
      stream.pause();
      stream._helper?.pause();
      stream.on("error", () => undefined);
      stream.destroy();
      reject(error);
    };
    const onData = (value: unknown) => {
      const chunk = Buffer.isBuffer(value) ? value : Buffer.from(value as Uint8Array);
      actualSize += chunk.length;
      if (actualSize > maxEntryBytes) {
        fail(new Error(tooLargeMessage));
        return;
      }
      if (actualSize > remainingArchiveBytes) {
        fail(new Error("ZIP 解压后内容不能超过 128 MiB"));
        return;
      }
      chunks.push(chunk);
    };
    const onError = (error: Error) => fail(error);
    const onEnd = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(Buffer.concat(chunks, actualSize));
    };

    stream.on("data", onData);
    stream.once("error", onError);
    stream.once("end", onEnd);
  });

  const expectedCrc32 = zipEntryData(entry)?.crc32;
  if (Number.isInteger(expectedCrc32) && calculateCrc32(content) !== ((expectedCrc32 as number) >>> 0)) {
    throw new Error(`ZIP 条目 CRC32 校验失败：${entry.name}`);
  }
  return content;
}

export async function importStickyNotes(inputPaths: string[]): Promise<StickyNotesImportResult> {
  if (inputPaths.length > MAX_IMPORT_FILES) throw new Error(`一次最多导入 ${MAX_IMPORT_FILES} 个文件`);
  const batch: PreparedImportBatch = { notes: [], skipped: 0 };

  // Parse, bound, verify, and sanitize the entire batch before opening a write
  // transaction. A late malformed file or ZIP entry must not leave earlier data.
  for (const inputPath of inputPaths) {
    const extension = path.extname(inputPath).toLowerCase();
    if (extension === ".json") {
      appendJsonContent(batch, await readImportText(inputPath));
      continue;
    }
    if (extension === ".zip") {
      const stat = await fs.stat(inputPath);
      if (!stat.isFile() || stat.size > MAX_IMPORT_FILE_BYTES) throw new Error(`ZIP 文件不能超过 64 MiB：${path.basename(inputPath)}`);
      // Loading with checkCRC32 would inflate every entry before we can inspect
      // the central-directory limits. Validate metadata first, then stream and
      // verify only the entries that are actually imported.
      const zip = await JSZip.loadAsync(await fs.readFile(inputPath), { checkCRC32: false });
      const entries = Object.values(zip.files);
      if (entries.length > MAX_ZIP_ENTRIES) throw new Error(`ZIP 条目不能超过 ${MAX_ZIP_ENTRIES} 个`);
      let declaredSize = 0;
      for (const entry of entries) {
        const entrySize = zipEntryDeclaredSize(entry);
        if (entrySize > MAX_ZIP_UNCOMPRESSED_BYTES - declaredSize) throw new Error("ZIP 解压后内容不能超过 128 MiB");
        declaredSize += entrySize;
      }
      let expandedSize = 0;
      const jsonEntry = zip.file("sticky-notes.json");
      if (jsonEntry) {
        const content = await readZipEntryBuffer(
          jsonEntry,
          MAX_IMPORT_JSON_CHARS,
          MAX_ZIP_UNCOMPRESSED_BYTES - expandedSize,
          "便签 JSON 解压后不能超过 32 MiB"
        );
        expandedSize += content.length;
        appendJsonContent(batch, content.toString("utf8"));
        continue;
      }
      for (const entry of entries) {
        if (entry.dir || !entry.name.toLowerCase().endsWith(".txt")) continue;
        const contentBuffer = await readZipEntryBuffer(
          entry,
          MAX_NOTE_CONTENT_CHARS,
          MAX_ZIP_UNCOMPRESSED_BYTES - expandedSize,
          `ZIP 中的便签过大：${entry.name}`
        );
        expandedSize += contentBuffer.length;
        appendPreparedNote(batch, { title: path.basename(entry.name, ".txt"), content: contentBuffer.toString("utf8") });
      }
      continue;
    }
    if (extension === ".txt" || extension === ".html") {
      const fileName = path.basename(inputPath, extension);
      const raw = await readImportText(inputPath);
      const payloads = extension === ".txt"
        ? parseTxtImportPayload(fileName, raw)
        : [{ title: fileName, content: `${richNoteMarker}${sanitizeStickyNoteHtml(raw)}` }];
      for (const payload of payloads) {
        appendPreparedNote(batch, payload, { sourcePath: payloads.length === 1 ? inputPath : null });
      }
      continue;
    }
    ensureImportCapacity(batch);
    batch.skipped += 1;
  }

  await fs.mkdir(path.dirname(databasePath()), { recursive: true });
  const db = openDatabase();
  try {
    const commitBatch = db.transaction((notes: PreparedImportNote[]) => {
      let imported = 0;
      let skipped = batch.skipped;
      for (const note of notes) {
        if (importNoteIfUnique(db, note)) imported += 1;
        else skipped += 1;
      }
      return {
        imported,
        skipped,
        notes: sortNotes(readAllNotes(db).filter((note) => note.status === "active"))
      };
    });
    return commitBatch(batch.notes);
  } finally {
    db.close();
  }
}
