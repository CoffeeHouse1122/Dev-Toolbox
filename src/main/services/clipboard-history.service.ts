import { clipboard, nativeImage, ipcMain, BrowserWindow } from "electron";
import crypto from "node:crypto";
import type { ClipboardEntry } from "../../shared/types";

const MAX_ENTRIES = 100;
const POLL_INTERVAL_MS = 700;

let entries: ClipboardEntry[] = [];
let timer: NodeJS.Timeout | null = null;
let lastHash = "";
let watching = false;

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
    if (entries.length > MAX_ENTRIES) {
      // Drop oldest non-pinned entries.
      const trimmed: ClipboardEntry[] = [];
      let kept = 0;
      for (const e of entries) {
        if (e.pinned || kept < MAX_ENTRIES) {
          trimmed.push(e);
          if (!e.pinned) kept += 1;
        }
      }
      entries = trimmed;
    }
  }
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
  ipcMain.handle("clipboard:start", () => {
    startWatching();
    return { watching, count: entries.length };
  });

  ipcMain.handle("clipboard:stop", () => {
    stopWatching();
    return { watching, count: entries.length };
  });

  ipcMain.handle("clipboard:list", () => entries);

  ipcMain.handle("clipboard:clear", () => {
    entries = entries.filter((e) => e.pinned);
    broadcast();
    return entries;
  });

  ipcMain.handle("clipboard:remove", (_event, id: string) => {
    entries = entries.filter((e) => e.id !== id);
    broadcast();
    return entries;
  });

  ipcMain.handle("clipboard:pin", (_event, id: string, pinned: boolean) => {
    const target = entries.find((e) => e.id === id);
    if (target) {
      target.pinned = !!pinned;
      broadcast();
    }
    return entries;
  });

  ipcMain.handle("clipboard:write", (_event, id: string) => {
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
