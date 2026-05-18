import path from "node:path";
import fs from "node:fs/promises";
import { encode } from "blurhash";
import sharp from "sharp";
import type { ConversionResult, ImagePlaceholderOptions } from "../../../shared/types";
import type { HistoryService } from "./history.service";
import { ensureDir, safeBaseName, uniqueId, writeTextFile } from "./file-utils";

async function placeholderFor(inputPath: string, tinyWidth: number, componentX: number, componentY: number) {
  const inputBuffer = await fs.readFile(inputPath);
  const image = sharp(inputBuffer, { limitInputPixels: false }).rotate();
  const metadata = await image.metadata();
  const width = metadata.width ?? 1;
  const height = metadata.height ?? 1;
  const ratio = height / width;
  const tinyHeight = Math.max(1, Math.round(tinyWidth * ratio));

  const dominant = await sharp(inputBuffer, { limitInputPixels: false }).stats();
  const dominantColor = dominant.dominant
    ? `#${[dominant.dominant.r, dominant.dominant.g, dominant.dominant.b].map((item) => item.toString(16).padStart(2, "0")).join("")}`
    : "#f6f8fa";
  const tinyBuffer = await sharp(inputBuffer, { limitInputPixels: false })
    .rotate()
    .resize({ width: tinyWidth, withoutEnlargement: true })
    .jpeg({ quality: 42, mozjpeg: true })
    .toBuffer();

  const raw = await sharp(inputBuffer, { limitInputPixels: false })
    .rotate()
    .resize({ width: 32, withoutEnlargement: true })
    .ensureAlpha()
    .raw()
    .toBuffer({ resolveWithObject: true });
  const blurhash = encode(new Uint8ClampedArray(raw.data), raw.info.width, raw.info.height, componentX, componentY);

  return {
    source: path.basename(inputPath),
    width,
    height,
    dominantColor,
    blurhash,
    tinyPlaceholder: `data:image/jpeg;base64,${tinyBuffer.toString("base64")}`,
    tinySize: { width: tinyWidth, height: tinyHeight }
  };
}

export async function generateImagePlaceholders(
  options: ImagePlaceholderOptions,
  history: HistoryService
): Promise<ConversionResult> {
  const id = uniqueId("image-placeholder");
  const logs: string[] = [];
  const files: string[] = [];

  await history.startTask({
    id,
    toolType: "image-placeholder",
    sourcePath: options.inputPaths.join(";"),
    outputPath: options.outputDir,
    options
  });

  try {
    await ensureDir(options.outputDir);
    const result = await Promise.all(
      options.inputPaths.map((inputPath) => placeholderFor(inputPath, options.tinyWidth, options.componentX, options.componentY))
    );
    const output = path.join(options.outputDir, "image-placeholders.json");
    await writeTextFile(output, `${JSON.stringify({ generatedAt: new Date().toISOString(), images: result }, null, 2)}\n`);
    files.push(output);

    for (const item of result) {
      const cssPath = path.join(options.outputDir, `${safeBaseName(item.source)}-placeholder.css`);
      await writeTextFile(
        cssPath,
        `.placeholder-${safeBaseName(item.source)} {
  background-color: ${item.dominantColor};
  background-image: url("${item.tinyPlaceholder}");
  background-size: cover;
}
`
      );
      files.push(cssPath);
    }

    logs.push(`Generated placeholder data for ${result.length} image(s).`);
    await history.finishTask(id, "success");
    return { id, status: "success", files, outputPath: options.outputDir, logs };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await history.finishTask(id, "error", message);
    return { id, status: "error", files, outputPath: options.outputDir, logs, errorMessage: message };
  }
}
