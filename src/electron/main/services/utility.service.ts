import { BrowserWindow } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import MarkdownIt from "markdown-it";
import type { Base64ImageResult, ConversionItemResult, ConversionResult, MarkdownExportOptions, RenameOptions } from "../../../shared/types";
import type { HistoryService } from "./history.service";
import { embeddedCjkFontFamily, embeddedCjkFontStyle } from "./embedded-font";
import {
  commitTemporaryFile,
  ensureDir,
  pathKey,
  safeBaseName,
  sanitizeFileComponent,
  sanitizeFileName,
  temporaryOutputPath,
  uniqueId,
  uniqueOutputPath,
  writeFileExclusive
} from "./file-utils";

const mimeByExt: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".svg": "image/svg+xml"
};

const markdownRenderer = new MarkdownIt({ html: false, linkify: true, typographer: false, breaks: false });

async function markdownToHtml(markdown: string) {
  const body = markdownRenderer.render(markdown);
  const fontStyle = await embeddedCjkFontStyle(markdown);
  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src data: http: https:; style-src 'unsafe-inline'; font-src data:" />
  ${fontStyle}
  <style>
    body { max-width: 860px; margin: 40px auto; padding: 0 28px; font: 15px/1.7 '${embeddedCjkFontFamily}', sans-serif; color: #1f2328; overflow-wrap: anywhere; }
    h1, h2, h3, h4, h5, h6 { line-height: 1.25; margin: 1.5em 0 .6em; }
    pre { overflow: auto; padding: 16px; border-radius: 8px; background: #f6f8fa; }
    code { padding: 2px 5px; border-radius: 4px; background: #f6f8fa; }
    pre code { padding: 0; background: transparent; }
    a { color: #0969da; }
    blockquote { margin-left: 0; padding-left: 16px; color: #656d76; border-left: 4px solid #d0d7de; }
    table { width: 100%; border-collapse: collapse; }
    th, td { padding: 8px 12px; border: 1px solid #d0d7de; text-align: left; }
    img { max-width: 100%; height: auto; }
    hr { height: 1px; border: 0; background: #d0d7de; }
  </style>
</head>
<body>
${body}
</body>
</html>
`;
}

async function renderHtml(html: string, outputPath: string, format: "png" | "pdf") {
  const win = new BrowserWindow({
    width: 960,
    height: 1200,
    show: false,
    webPreferences: { offscreen: true, sandbox: true, contextIsolation: true, nodeIntegration: false, webSecurity: true }
  });

  try {
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    await win.webContents.executeJavaScript(`Promise.all([
      document.fonts?.ready ?? Promise.resolve(),
      ...Array.from(document.images, image => image.complete ? Promise.resolve() : new Promise(resolve => {
        image.addEventListener('load', resolve, { once: true });
        image.addEventListener('error', resolve, { once: true });
      }))
    ])`);
    if (format === "pdf") {
      const pdf = await win.webContents.printToPDF({ printBackground: true, pageSize: "A4" });
      await fs.writeFile(outputPath, pdf);
    } else {
      const bounds = await win.webContents.executeJavaScript(`(() => {
        const root = document.documentElement;
        const body = document.body;
        return {
          width: Math.ceil(Math.max(root.scrollWidth, body.scrollWidth, root.offsetWidth, body.offsetWidth, 960)),
          height: Math.ceil(Math.max(root.scrollHeight, body.scrollHeight, root.offsetHeight, body.offsetHeight, 1200))
        };
      })()`);
      win.setContentSize(bounds.width, bounds.height);
      await new Promise((resolve) => setTimeout(resolve, 80));
      const image = await win.webContents.capturePage({ x: 0, y: 0, width: bounds.width, height: bounds.height });
      await fs.writeFile(outputPath, image.toPNG());
    }
  } finally {
    win.destroy();
  }
}

export async function imageToBase64(inputPath: string): Promise<Base64ImageResult> {
  const stat = await fs.stat(inputPath);
  if (!stat.isFile()) throw new Error("The selected path is not a file.");
  if (stat.size > MAX_BASE64_IMAGE_BYTES) throw new Error("Image is larger than the 50 MiB safety limit.");
  const buffer = await fs.readFile(inputPath);
  const mimeType = mimeByExt[path.extname(inputPath).toLowerCase()] ?? "application/octet-stream";
  const base64 = buffer.toString("base64");
  return { mimeType, base64, dataUrl: `data:${mimeType};base64,${base64}` };
}

const MAX_BASE64_IMAGE_BYTES = 50 * 1024 * 1024;
const supportedImageMimes = new Set(["image/png", "image/jpeg", "image/webp", "image/avif", "image/gif", "image/svg+xml"]);
const extensionByMime: Record<string, string> = {
  "image/png": ".png",
  "image/jpeg": ".jpg",
  "image/webp": ".webp",
  "image/avif": ".avif",
  "image/gif": ".gif",
  "image/svg+xml": ".svg"
};

function detectImageMime(buffer: Buffer) {
  if (buffer.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))) return "image/png";
  if (buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff) return "image/jpeg";
  if (buffer.subarray(0, 6).toString("ascii") === "GIF87a" || buffer.subarray(0, 6).toString("ascii") === "GIF89a") return "image/gif";
  if (buffer.subarray(0, 4).toString("ascii") === "RIFF" && buffer.subarray(8, 12).toString("ascii") === "WEBP") return "image/webp";
  if (buffer.subarray(4, 12).toString("ascii").includes("ftypavif")) return "image/avif";
  const beginning = buffer.subarray(0, Math.min(buffer.length, 2048)).toString("utf8").replace(/^\uFEFF/, "").trimStart();
  if (/^(?:<\?xml[^>]*>\s*)?<svg[\s>]/i.test(beginning)) return "image/svg+xml";
  return null;
}

function decodeBase64Image(data: string) {
  if (data.length > Math.ceil((MAX_BASE64_IMAGE_BYTES * 4) / 3) + 4096) {
    throw new Error("Base64 image is larger than the 50 MiB safety limit.");
  }
  const dataUrl = data.trim().match(/^data:([^;,]+);base64,([\s\S]*)$/i);
  const declaredMime = dataUrl?.[1]?.toLowerCase();
  if (declaredMime && !supportedImageMimes.has(declaredMime)) throw new Error(`Unsupported image MIME type: ${declaredMime}`);

  let encoded = (dataUrl?.[2] ?? data).replace(/[\r\n\t ]/g, "");
  if (!encoded || !/^[A-Za-z0-9+/]*={0,2}$/.test(encoded) || encoded.length % 4 === 1) {
    throw new Error("Invalid Base64 image data.");
  }
  encoded = encoded.padEnd(encoded.length + ((4 - (encoded.length % 4)) % 4), "=");
  const buffer = Buffer.from(encoded, "base64");
  if (!buffer.length || buffer.length > MAX_BASE64_IMAGE_BYTES) throw new Error("Invalid or oversized Base64 image data.");
  const canonical = buffer.toString("base64").replace(/=+$/g, "");
  if (canonical !== encoded.replace(/=+$/g, "")) throw new Error("Invalid Base64 image data.");

  const detectedMime = detectImageMime(buffer);
  if (!detectedMime) throw new Error("Decoded data is not a supported image file.");
  if (declaredMime && declaredMime !== detectedMime) {
    throw new Error(`Image content (${detectedMime}) does not match declared MIME type (${declaredMime}).`);
  }
  return { buffer, mimeType: detectedMime };
}

export async function base64ToImage(data: string, outputDir: string, fileName: string): Promise<ConversionResult> {
  const id = uniqueId("base64-image");
  const logs: string[] = [];
  const { buffer, mimeType } = decodeBase64Image(data);
  const requiredExtension = extensionByMime[mimeType];
  if (fileName && (/[\\/]/.test(fileName) || fileName === "." || fileName === "..")) {
    throw new Error("File name must not contain a directory path.");
  }
  const requestedName = sanitizeFileName(fileName || `base64-${Date.now()}${requiredExtension}`);
  const requestedExtension = path.extname(requestedName).toLowerCase();
  const compatibleExtensions = mimeType === "image/jpeg" ? new Set([".jpg", ".jpeg"]) : new Set([requiredExtension]);
  if (requestedExtension && !compatibleExtensions.has(requestedExtension)) {
    throw new Error(`File extension ${requestedExtension} does not match decoded ${mimeType} content.`);
  }
  const safeName = requestedExtension ? requestedName : `${requestedName}${requiredExtension}`;
  const output = await writeFileExclusive(outputDir, safeName, buffer);
  logs.push(`Saved ${path.basename(output)}.`);
  return { id, status: "success", files: [output], outputPath: outputDir, logs };
}

export async function exportMarkdown(options: MarkdownExportOptions, history: HistoryService): Promise<ConversionResult> {
  const id = uniqueId("markdown-export");
  const files: string[] = [];
  const logs: string[] = [];
  const base = safeBaseName(options.baseName || "markdown");

  await history.startTask({
    id,
    toolType: "markdown-export",
    sourcePath: "inline-markdown",
    outputPath: options.outputDir,
    options
  });

  try {
    await ensureDir(options.outputDir);
    const html = await markdownToHtml(options.markdown);

    if (options.formats.includes("html")) {
      const htmlPath = await writeFileExclusive(options.outputDir, `${base}.html`, html);
      files.push(htmlPath);
    }
    if (options.formats.includes("pdf")) {
      const pdfPath = await uniqueOutputPath(options.outputDir, `${base}.pdf`);
      const temporary = temporaryOutputPath(pdfPath);
      try {
        await renderHtml(html, temporary, "pdf");
        await commitTemporaryFile(temporary, pdfPath);
      } catch (error) {
        await fs.rm(temporary, { force: true }).catch(() => undefined);
        throw error;
      }
      files.push(pdfPath);
    }
    if (options.formats.includes("png")) {
      const pngPath = await uniqueOutputPath(options.outputDir, `${base}.png`);
      const temporary = temporaryOutputPath(pngPath);
      try {
        await renderHtml(html, temporary, "png");
        await commitTemporaryFile(temporary, pngPath);
      } catch (error) {
        await fs.rm(temporary, { force: true }).catch(() => undefined);
        throw error;
      }
      files.push(pngPath);
    }

    logs.push(`Exported ${files.length} file(s).`);
    await history.finishTask(id, "success");
    return { id, status: "success", files, outputPath: options.outputDir, logs };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await history.finishTask(id, "error", message);
    return { id, status: "error", files, outputPath: options.outputDir, logs, errorMessage: message };
  }
}

export interface RenamePlanEntry {
  source: string;
  target: string;
  temporary: string;
  noChange: boolean;
}

async function pathExists(filePath: string) {
  try {
    await fs.lstat(filePath);
    return true;
  } catch (error) {
    if ((error as NodeJS.ErrnoException).code === "ENOENT") return false;
    throw error;
  }
}

async function findPortableNameCollision(filePath: string, cache: Map<string, Map<string, string>>) {
  const directory = path.dirname(filePath);
  const directoryKey = pathKey(directory);
  let byName = cache.get(directoryKey);
  if (!byName) {
    byName = new Map(
      (await fs.readdir(directory)).map((name) => [name.normalize("NFC").toLocaleLowerCase("en-US"), path.join(directory, name)])
    );
    cache.set(directoryKey, byName);
  }
  const expected = path.basename(filePath).normalize("NFC").toLocaleLowerCase("en-US");
  return byName.get(expected) ?? null;
}

/** Create the exact plan used by execution. Calling this function is a dry run. */
export async function planRenameFiles(options: RenameOptions): Promise<RenamePlanEntry[]> {
  const sources = options.inputPaths.map((item) => path.resolve(item));
  const sourceKeys = new Set<string>();
  for (const source of sources) {
    const key = pathKey(source);
    if (sourceKeys.has(key)) throw new Error(`Duplicate input path: ${path.basename(source)}`);
    sourceKeys.add(key);
    const stat = await fs.lstat(source);
    if (!stat.isFile()) throw new Error(`Only files can be renamed: ${path.basename(source)}`);
  }

  const targetKeys = new Set<string>();
  const directoryCache = new Map<string, Map<string, string>>();
  const plans: RenamePlanEntry[] = [];
  for (const [index, source] of sources.entries()) {
    const dir = path.dirname(source);
    const ext = path.extname(source).normalize("NFC");
    const original = path.basename(source, ext).normalize("NFC");
    const serial = String(options.start + index).padStart(3, "0");
    const replaced = options.replaceFrom ? original.replaceAll(options.replaceFrom, options.replaceTo ?? "") : original;
    const generated = (options.pattern || "{name}-{n}").replaceAll("{name}", replaced).replaceAll("{n}", serial);
    const target = path.join(dir, sanitizeFileName(`${sanitizeFileComponent(generated)}${ext}`));
    const targetKey = pathKey(target);
    if (targetKeys.has(targetKey)) {
      throw new Error(`Multiple files would be renamed to ${path.basename(target)}.`);
    }
    targetKeys.add(targetKey);

    const existingTarget = await findPortableNameCollision(target, directoryCache);
    if (existingTarget && !sourceKeys.has(pathKey(existingTarget))) {
      throw new Error(`Target already exists and is not part of this batch: ${path.basename(target)}`);
    }

    let temporary = temporaryOutputPath(source);
    while (await pathExists(temporary)) temporary = temporaryOutputPath(source);
    plans.push({ source, target, temporary, noChange: source === target });
  }
  return plans;
}

async function rollbackRenamePlan(active: RenamePlanEntry[], committed: Set<string>, logs: string[]) {
  const recovery = new Map<RenamePlanEntry, string>();
  const failures: string[] = [];

  // Evacuate all current names first. This makes rollback safe for swaps and
  // rename cycles such as A -> B, B -> A.
  for (const item of active) {
    const current = committed.has(pathKey(item.source)) ? item.target : item.temporary;
    if (!(await pathExists(current))) continue;
    let rollbackTemp = temporaryOutputPath(item.source);
    while (await pathExists(rollbackTemp)) rollbackTemp = temporaryOutputPath(item.source);
    try {
      await fs.rename(current, rollbackTemp);
      recovery.set(item, rollbackTemp);
    } catch (error) {
      failures.push(`${path.basename(current)}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  for (const [item, rollbackTemp] of recovery) {
    try {
      await commitTemporaryFile(rollbackTemp, item.source);
      logs.push(`Rolled back ${path.basename(item.source)}.`);
    } catch (error) {
      failures.push(`${path.basename(item.source)} remains at ${rollbackTemp}: ${error instanceof Error ? error.message : String(error)}`);
    }
  }
  if (failures.length) throw new Error(`Rollback needs manual recovery: ${failures.join("; ")}`);
}

export async function renameFiles(options: RenameOptions, history: HistoryService): Promise<ConversionResult> {
  const id = uniqueId("batch-rename");
  const files: string[] = [];
  const logs: string[] = [];
  const items: ConversionItemResult[] = [];

  await history.startTask({
    id,
    toolType: "batch-rename",
    sourcePath: options.inputPaths.join(";"),
    outputPath: path.dirname(options.inputPaths[0] ?? ""),
    options
  });

  try {
    const plan = await planRenameFiles(options);
    for (const item of plan) logs.push(`${path.basename(item.source)} -> ${path.basename(item.target)}${item.noChange ? " (unchanged)" : ""}`);

    if (options.dryRun) {
      logs.unshift(`Dry run passed: ${plan.length} file(s), no changes were made.`);
      items.push(...plan.map((item) => ({ inputPath: item.source, outputPath: item.target, status: "skipped" as const })));
      await history.finishTask(id, "success");
      return { id, status: "success", files: [], outputPath: path.dirname(plan[0]?.source ?? ""), logs, items };
    }

    const active = plan.filter((item) => !item.noChange);
    const moved: RenamePlanEntry[] = [];
    const committed = new Set<string>();
    try {
      // Phase one vacates every source name, allowing swaps/cycles safely.
      for (const item of active) {
        await fs.rename(item.source, item.temporary);
        moved.push(item);
      }
      // Phase two uses an exclusive commit, so a racing external file is never
      // overwritten silently.
      for (const item of active) {
        await commitTemporaryFile(item.temporary, item.target);
        committed.add(pathKey(item.source));
      }
    } catch (error) {
      await rollbackRenamePlan(moved, committed, logs);
      throw error;
    }

    files.push(...plan.map((item) => item.target));
    items.push(...plan.map((item) => ({ inputPath: item.source, outputPath: item.target, status: "success" as const })));

    await history.finishTask(id, "success");
    return { id, status: "success", files, outputPath: path.dirname(files[0] ?? ""), logs, items };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await history.finishTask(id, "error", message);
    return { id, status: "error", files, outputPath: path.dirname(files[0] ?? ""), logs, errorMessage: message };
  }
}
