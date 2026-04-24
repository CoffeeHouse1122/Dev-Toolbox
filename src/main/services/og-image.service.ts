import path from "node:path";
import sharp from "sharp";
import type { ConversionResult, OgImageOptions } from "../../shared/types";
import type { HistoryService } from "./history.service";
import { ensureDir, safeBaseName, uniqueId } from "./file-utils";

function escapeXml(value: string) {
  return value.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

function wrapText(value: string, maxChars: number) {
  const chars = [...value.trim()];
  const lines: string[] = [];
  for (let index = 0; index < chars.length; index += maxChars) {
    lines.push(chars.slice(index, index + maxChars).join(""));
  }
  return lines.slice(0, 3);
}

export async function generateOgImage(options: OgImageOptions, history: HistoryService): Promise<ConversionResult> {
  const id = uniqueId("og-image");
  const logs: string[] = [];
  const files: string[] = [];

  await history.startTask({
    id,
    toolType: "og-image",
    sourcePath: "inline-og-content",
    outputPath: options.outputDir,
    options
  });

  try {
    await ensureDir(options.outputDir);
    const width = options.width || 1200;
    const height = options.height || 630;
    const titleLines = wrapText(options.title, 22);
    const titleSvg = titleLines
      .map((line, index) => `<tspan x="86" dy="${index === 0 ? 0 : 78}">${escapeXml(line)}</tspan>`)
      .join("");
    const svg = `<svg width="${width}" height="${height}" viewBox="0 0 ${width} ${height}" xmlns="http://www.w3.org/2000/svg">
  <rect width="${width}" height="${height}" fill="${escapeXml(options.backgroundColor)}"/>
  <rect x="48" y="48" width="${width - 96}" height="${height - 96}" rx="32" fill="none" stroke="${escapeXml(options.accentColor)}" stroke-width="3"/>
  <circle cx="${width - 140}" cy="140" r="54" fill="${escapeXml(options.accentColor)}" opacity="0.88"/>
  <text x="86" y="118" fill="${escapeXml(options.accentColor)}" font-family="Source Han Sans CN, Arial, sans-serif" font-size="32" font-weight="700">${escapeXml(options.siteName)}</text>
  <text x="86" y="280" fill="${escapeXml(options.textColor)}" font-family="Source Han Sans CN, Arial, sans-serif" font-size="68" font-weight="800">${titleSvg}</text>
  <text x="86" y="${height - 104}" fill="${escapeXml(options.textColor)}" opacity="0.78" font-family="Source Han Sans CN, Arial, sans-serif" font-size="34">${escapeXml(options.subtitle)}</text>
</svg>`;
    const output = path.join(options.outputDir, `${safeBaseName(options.fileName || "og-image") || "og-image"}.png`);
    await sharp(Buffer.from(svg)).png().toFile(output);
    files.push(output);
    logs.push(`Generated ${path.basename(output)}.`);
    await history.finishTask(id, "success");
    return { id, status: "success", files, outputPath: options.outputDir, logs };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await history.finishTask(id, "error", message);
    return { id, status: "error", files, outputPath: options.outputDir, logs, errorMessage: message };
  }
}
