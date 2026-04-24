import { BrowserWindow } from "electron";
import fs from "node:fs/promises";
import path from "node:path";
import type { Base64ImageResult, ConversionResult, MarkdownExportOptions, RenameOptions } from "../../shared/types";
import type { HistoryService } from "./history.service";
import { ensureDir, safeBaseName, uniqueId, writeTextFile } from "./file-utils";

const mimeByExt: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".avif": "image/avif",
  ".gif": "image/gif",
  ".svg": "image/svg+xml"
};

function escapeHtml(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function renderInline(value: string) {
  return escapeHtml(value)
    .replace(/`([^`]+)`/g, "<code>$1</code>")
    .replace(/\*\*([^*]+)\*\*/g, "<strong>$1</strong>")
    .replace(/\*([^*]+)\*/g, "<em>$1</em>")
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2">$1</a>');
}

function markdownToHtml(markdown: string) {
  const lines = markdown.split(/\r?\n/);
  const html: string[] = [];
  let inList = false;

  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed) {
      if (inList) {
        html.push("</ul>");
        inList = false;
      }
      continue;
    }

    const heading = trimmed.match(/^(#{1,6})\s+(.+)$/);
    if (heading) {
      if (inList) {
        html.push("</ul>");
        inList = false;
      }
      html.push(`<h${heading[1].length}>${renderInline(heading[2])}</h${heading[1].length}>`);
      continue;
    }

    const item = trimmed.match(/^[-*]\s+(.+)$/);
    if (item) {
      if (!inList) {
        html.push("<ul>");
        inList = true;
      }
      html.push(`<li>${renderInline(item[1])}</li>`);
      continue;
    }

    if (inList) {
      html.push("</ul>");
      inList = false;
    }
    html.push(`<p>${renderInline(trimmed)}</p>`);
  }

  if (inList) {
    html.push("</ul>");
  }

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <style>
    body { max-width: 860px; margin: 40px auto; padding: 0 28px; font: 15px/1.7 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; color: #1f2328; }
    h1, h2, h3 { line-height: 1.25; }
    code { padding: 2px 5px; border-radius: 4px; background: #f6f8fa; }
    a { color: #0969da; }
  </style>
</head>
<body>
${html.join("\n")}
</body>
</html>
`;
}

async function renderHtml(html: string, outputPath: string, format: "png" | "pdf") {
  const win = new BrowserWindow({
    width: 960,
    height: 1200,
    show: false,
    webPreferences: { offscreen: true }
  });

  try {
    await win.loadURL(`data:text/html;charset=utf-8,${encodeURIComponent(html)}`);
    if (format === "pdf") {
      const pdf = await win.webContents.printToPDF({ printBackground: true, pageSize: "A4" });
      await fs.writeFile(outputPath, pdf);
    } else {
      const image = await win.webContents.capturePage();
      await fs.writeFile(outputPath, image.toPNG());
    }
  } finally {
    win.destroy();
  }
}

export async function imageToBase64(inputPath: string): Promise<Base64ImageResult> {
  const buffer = await fs.readFile(inputPath);
  const mimeType = mimeByExt[path.extname(inputPath).toLowerCase()] ?? "application/octet-stream";
  const base64 = buffer.toString("base64");
  return { mimeType, base64, dataUrl: `data:${mimeType};base64,${base64}` };
}

export async function base64ToImage(data: string, outputDir: string, fileName: string): Promise<ConversionResult> {
  const id = uniqueId("base64-image");
  const logs: string[] = [];
  const clean = data.includes(",") ? data.split(",").pop() ?? "" : data;
  const output = path.join(outputDir, fileName || `base64-${Date.now()}.png`);
  await ensureDir(outputDir);
  await fs.writeFile(output, Buffer.from(clean.trim(), "base64"));
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
    const html = markdownToHtml(options.markdown);

    if (options.formats.includes("html")) {
      const htmlPath = path.join(options.outputDir, `${base}.html`);
      await writeTextFile(htmlPath, html);
      files.push(htmlPath);
    }
    if (options.formats.includes("pdf")) {
      const pdfPath = path.join(options.outputDir, `${base}.pdf`);
      await renderHtml(html, pdfPath, "pdf");
      files.push(pdfPath);
    }
    if (options.formats.includes("png")) {
      const pngPath = path.join(options.outputDir, `${base}.png`);
      await renderHtml(html, pngPath, "png");
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

export async function renameFiles(options: RenameOptions, history: HistoryService): Promise<ConversionResult> {
  const id = uniqueId("batch-rename");
  const files: string[] = [];
  const logs: string[] = [];

  await history.startTask({
    id,
    toolType: "batch-rename",
    sourcePath: options.inputPaths.join(";"),
    outputPath: path.dirname(options.inputPaths[0] ?? ""),
    options
  });

  try {
    for (const [index, inputPath] of options.inputPaths.entries()) {
      const dir = path.dirname(inputPath);
      const ext = path.extname(inputPath);
      const original = path.basename(inputPath, ext);
      const serial = String(options.start + index).padStart(3, "0");
      const replaced = options.replaceFrom ? original.replaceAll(options.replaceFrom, options.replaceTo ?? "") : original;
      const nextBase = (options.pattern || "{name}-{n}").replaceAll("{name}", replaced).replaceAll("{n}", serial);
      const output = path.join(dir, `${safeBaseName(nextBase)}${ext}`);
      await fs.rename(inputPath, output);
      files.push(output);
      logs.push(`${path.basename(inputPath)} -> ${path.basename(output)}`);
    }

    await history.finishTask(id, "success");
    return { id, status: "success", files, outputPath: path.dirname(files[0] ?? ""), logs };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await history.finishTask(id, "error", message);
    return { id, status: "error", files, outputPath: path.dirname(files[0] ?? ""), logs, errorMessage: message };
  }
}

