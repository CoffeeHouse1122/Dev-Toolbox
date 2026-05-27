import { app } from "electron";
import Database from "better-sqlite3";
import JSZip from "jszip";
import fs from "node:fs/promises";
import path from "node:path";
import type {
  StickyNote,
  StickyNoteExportOptions,
  StickyNoteStatus,
  StickyNoteStyle,
  StickyNotesImportResult,
  StickyNotesPreferences,
  StickyNotesState
} from "../../../shared/types";

const settingsFileName = "sticky-notes-settings.json";
const databaseFileName = "sticky-notes.sqlite";
const richNoteMarker = "<!-- dev-toolbox-note-html:v1 -->";

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
    const raw = await fs.readFile(settingsPath(), "utf8");
    const parsed = JSON.parse(raw) as Partial<StickyNotesSettings>;
    return { directory: parsed.directory || defaultNotesDir() };
  } catch {
    return { directory: defaultNotesDir() };
  }
}

async function saveStickyNotesSettings(settings: StickyNotesSettings) {
  await fs.mkdir(path.dirname(settingsPath()), { recursive: true });
  await fs.writeFile(settingsPath(), `${JSON.stringify(settings, null, 2)}\n`, "utf8");
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
  return {
    id: row.id,
    fileName,
    filePath: `${databasePath()}#${row.id}`,
    title: row.title,
    content: row.content,
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
  return [...notes].sort((left, right) => Number(right.pinned) - Number(left.pinned) || right.updatedAt - left.updatedAt);
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
  const content = payload.content || "新便签\n";
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
    const title = resolveTitle(row.title, content);
    const now = Date.now();
    db.prepare("UPDATE notes SET title = ?, content = ?, plain_text = ?, updated_at = ? WHERE id = ?").run(
      title,
      content,
      notePlainText(content),
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
      await fs.writeFile(target, `${JSON.stringify(exportPayload(notes, preferences), null, 2)}\n`, "utf8");
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
      await fs.writeFile(target, buffer);
      return [target];
    }
    const target = path.join(options.outputDir, notes.length === 1 ? notes[0].fileName : `sticky-notes-${stamp}.txt`);
    const content = notes.length === 1
      ? notePlainText(notes[0].content)
      : notes
          .map((note, index) => [`# ${index + 1}. ${note.title}`, `状态: ${note.status}`, `更新时间: ${new Date(note.updatedAt).toLocaleString()}`, "", notePlainText(note.content)].join("\n"))
          .join("\n\n---\n\n");
    await fs.writeFile(target, content, "utf8");
    return [target];
  } finally {
    db.close();
  }
}

function parseImportPayload(raw: string): ImportNotePayload[] {
  const parsed = JSON.parse(raw) as { notes?: ImportNotePayload[] } | ImportNotePayload[];
  return Array.isArray(parsed) ? parsed : Array.isArray(parsed.notes) ? parsed.notes : [];
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

async function importJsonContent(db: Database.Database, raw: string) {
  let imported = 0;
  let skipped = 0;
  const notes = parseImportPayload(raw);
  const insert = db.transaction((items: ImportNotePayload[]) => {
    for (const item of items) {
      if (!item.content) {
        skipped += 1;
        continue;
      }
      if (importNoteIfUnique(db, { ...item, id: createId(), status: item.status === "trashed" ? "active" : item.status || "active" })) imported += 1;
      else skipped += 1;
    }
  });
  insert(notes);
  return { imported, skipped };
}

export async function importStickyNotes(inputPaths: string[]): Promise<StickyNotesImportResult> {
  const db = openDatabase();
  let imported = 0;
  let skipped = 0;
  try {
    for (const inputPath of inputPaths) {
      const extension = path.extname(inputPath).toLowerCase();
      if (extension === ".json") {
        const result = await importJsonContent(db, await fs.readFile(inputPath, "utf8"));
        imported += result.imported;
        skipped += result.skipped;
        continue;
      }
      if (extension === ".zip") {
        const zip = await JSZip.loadAsync(await fs.readFile(inputPath));
        const jsonEntry = zip.file("sticky-notes.json");
        if (jsonEntry) {
          const result = await importJsonContent(db, await jsonEntry.async("string"));
          imported += result.imported;
          skipped += result.skipped;
          continue;
        }
        for (const entry of Object.values(zip.files)) {
          if (entry.dir || !entry.name.toLowerCase().endsWith(".txt")) continue;
          if (importNoteIfUnique(db, { title: path.basename(entry.name, ".txt"), content: await entry.async("string") })) imported += 1;
          else skipped += 1;
        }
        continue;
      }
      if (extension === ".txt" || extension === ".html") {
        const fileName = path.basename(inputPath, extension);
        const payloads = extension === ".txt" ? parseTxtImportPayload(fileName, await fs.readFile(inputPath, "utf8")) : [{ title: fileName, content: await fs.readFile(inputPath, "utf8") }];
        for (const payload of payloads) {
          if (importNoteIfUnique(db, { ...payload, sourcePath: payloads.length === 1 ? inputPath : null })) imported += 1;
          else skipped += 1;
        }
        continue;
      }
      skipped += 1;
    }
    return { imported, skipped, notes: sortNotes(readAllNotes(db).filter((note) => note.status === "active")) };
  } finally {
    db.close();
  }
}
