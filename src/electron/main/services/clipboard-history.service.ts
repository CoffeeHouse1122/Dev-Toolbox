import { app, clipboard, nativeImage, BrowserWindow } from "electron";
import crypto from "node:crypto";
import path from "node:path";
import type { ClipboardEntry } from "../../../shared/types";
import { readJsonWithBackup, writeFileAtomic } from "./atomic-file";
import { handleTrustedIpc, parseBooleanPayload, parseUuidPayload } from "../utils/ipc-security";

const MAX_ENTRIES = 100;
const MAX_PINNED_ENTRIES = 50;
const MAX_PERSISTED_TEXT_BYTES = 5 * 1024 * 1024;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_TOTAL_IMAGE_BYTES = 32 * 1024 * 1024;
const POLL_INTERVAL_MS = 700;

let entries: ClipboardEntry[] = [];
let timer: NodeJS.Timeout | null = null;
let lastHash = "";
let watching = false;
let loadPromise: Promise<void> | null = null;

function persistencePath() {
  return path.join(app.getPath("userData"), "data", "clipboard-pinned-text.json");
}

function validPersistedEntry(value: unknown): value is ClipboardEntry {
  if (!value || typeof value !== "object") return false;
  const entry = value as Partial<ClipboardEntry>;
  return entry.kind === "text" && entry.pinned === true && typeof entry.id === "string" && typeof entry.text === "string" &&
    typeof entry.hash === "string" && typeof entry.capturedAt === "number" && Buffer.byteLength(entry.text) <= 1024 * 1024;
}

async function ensureLoaded() {
  if (!loadPromise) {
    loadPromise = (async () => {
      try {
        const stored = await readJsonWithBackup<unknown>(persistencePath());
        if (!Array.isArray(stored)) return;
        let totalBytes = 0;
        entries = stored
          .filter(validPersistedEntry)
          .filter((entry) => {
            totalBytes += Buffer.byteLength(entry.text);
            return totalBytes <= MAX_PERSISTED_TEXT_BYTES;
          })
          .slice(0, MAX_PINNED_ENTRIES);
      } catch {
        entries = [];
      }
    })();
  }
  await loadPromise;
}

async function persistPinnedText() {
  const persisted: ClipboardEntry[] = [];
  let totalBytes = 0;
  for (const entry of entries) {
    if (!entry.pinned || entry.kind !== "text") continue;
    const size = Buffer.byteLength(entry.text);
    if (size > 1024 * 1024 || totalBytes + size > MAX_PERSISTED_TEXT_BYTES) continue;
    persisted.push({ ...entry, preview: undefined });
    totalBytes += size;
    if (persisted.length >= MAX_PINNED_ENTRIES) break;
  }
  // Pinned clipboard text may still be sensitive; do not retain deleted values
  // in an automatic .bak file.
  await writeFileAtomic(persistencePath(), `${JSON.stringify(persisted, null, 2)}\n`, { backup: false });
}

function hashOf(content: string) {
  return crypto.createHash("sha1").update(content).digest("hex");
}

function broadcast() {
  for (const win of BrowserWindow.getAllWindows()) {
    win.webContents.send("clipboard:update", entries);
  }
}

function pushEntry(entry: ClipboardEntry) {
  // Move existing entry with same hash to top, otherwise prepend.
  const existingIndex = entries.findIndex((e) => e.hash === entry.hash);
  if (existingIndex >= 0) {
    const [existing] = entries.splice(existingIndex, 1);
    existing.capturedAt = entry.capturedAt;
    entries.unshift(existing);
  } else {
    entries.unshift(entry);
  }
  const pinned = entries.filter((item) => item.pinned).slice(0, MAX_PINNED_ENTRIES);
  const regular = entries.filter((item) => !item.pinned).slice(0, MAX_ENTRIES);
  entries = [...pinned, ...regular].sort((left, right) => right.capturedAt - left.capturedAt);
  let imageBytes = 0;
  entries = entries.filter((item) => {
    if (item.kind !== "image" || !item.preview) return true;
    const size = Math.ceil((item.preview.length * 3) / 4);
    imageBytes += size;
    return imageBytes <= MAX_TOTAL_IMAGE_BYTES;
  });
  broadcast();
}

function pollOnce() {
  try {
    const formats = clipboard.availableFormats();
    if (formats.some((f) => f.startsWith("image/"))) {
      const image = clipboard.readImage();
      if (!image.isEmpty()) {
        const buf = image.toPNG();
        const hash = crypto.createHash("sha1").update(buf).digest("hex");
        if (hash !== lastHash) {
          lastHash = hash;
          if (buf.length > MAX_IMAGE_BYTES) return;
          const size = image.getSize();
          pushEntry({
            id: crypto.randomUUID(),
            kind: "image",
            text: `图片 ${size.width}×${size.height}`,
            preview: `data:image/png;base64,${buf.toString("base64")}`,
            hash,
            capturedAt: Date.now(),
            pinned: false
          });
        }
        return;
      }
    }

    const text = clipboard.readText();
    if (text) {
      const hash = hashOf(text);
      if (hash !== lastHash) {
        lastHash = hash;
        pushEntry({
          id: crypto.randomUUID(),
          kind: "text",
          text,
          hash,
          capturedAt: Date.now(),
          pinned: false
        });
      }
    }
  } catch {
    // ignore transient clipboard read errors
  }
}

function startWatching() {
  if (watching) return;
  watching = true;
  // Initial snapshot
  lastHash = "";
  pollOnce();
  timer = setInterval(pollOnce, POLL_INTERVAL_MS);
}

function stopWatching() {
  watching = false;
  if (timer) {
    clearInterval(timer);
    timer = null;
  }
}

export function registerClipboardIpc() {
  handleTrustedIpc("clipboard:start", async () => {
    await ensureLoaded();
    startWatching();
    return { watching, count: entries.length };
  });

  handleTrustedIpc("clipboard:stop", () => {
    stopWatching();
    return { watching, count: entries.length };
  });

  handleTrustedIpc("clipboard:list", async () => {
    await ensureLoaded();
    return entries;
  });

  handleTrustedIpc("clipboard:clear", async () => {
    await ensureLoaded();
    entries = entries.filter((e) => e.pinned);
    await persistPinnedText();
    broadcast();
    return entries;
  });

  handleTrustedIpc("clipboard:remove", async (_event, rawId: unknown) => {
    await ensureLoaded();
    const id = parseUuidPayload(rawId);
    entries = entries.filter((e) => e.id !== id);
    await persistPinnedText();
    broadcast();
    return entries;
  });

  handleTrustedIpc("clipboard:pin", async (_event, rawId: unknown, rawPinned: unknown) => {
    await ensureLoaded();
    const id = parseUuidPayload(rawId);
    const pinned = parseBooleanPayload(rawPinned);
    const target = entries.find((e) => e.id === id);
    if (target) {
      target.pinned = pinned;
      await persistPinnedText();
      broadcast();
    }
    return entries;
  });

  handleTrustedIpc("clipboard:write", async (_event, rawId: unknown) => {
    await ensureLoaded();
    const id = parseUuidPayload(rawId);
    const target = entries.find((e) => e.id === id);
    if (!target) return false;
    if (target.kind === "image" && target.preview?.startsWith("data:image")) {
      const base64 = target.preview.split(",")[1] ?? "";
      const buf = Buffer.from(base64, "base64");
      clipboard.writeImage(nativeImage.createFromBuffer(buf));
      lastHash = crypto.createHash("sha1").update(buf).digest("hex");
    } else {
      clipboard.writeText(target.text);
      lastHash = hashOf(target.text);
    }
    return true;
  });
}
