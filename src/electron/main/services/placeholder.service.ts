import path from "node:path";
import fs from "node:fs/promises";
import { encode } from "blurhash";
import sharp from "sharp";
import type { ConversionItemResult, ConversionResult, ImagePlaceholderOptions } from "../../../shared/types";
import type { HistoryService } from "./history.service";
import { ensureDir, mapWithConcurrency, safeBaseName, uniqueId, uniqueOutputPath, writeTextFile } from "./file-utils";

const MAX_IMAGE_INPUT_BYTES = 256 * 1024 * 1024;

function cssIdentifier(value: string) {
  const clean = value.normalize("NFC").replace(/[^\p{L}\p{N}_-]+/gu, "-").replace(/^-+|-+$/g, "") || "image";
  return /^\d/.test(clean) ? `image-${clean}` : clean;
}

async function placeholderFor(inputPath: string, tinyWidth: number, componentX: number, componentY: number) {
  const stat = await fs.stat(inputPath);
  if (!stat.isFile() || stat.size > MAX_IMAGE_INPUT_BYTES) throw new Error("Image is not a file or exceeds the 256 MiB safety limit.");
  const inputBuffer = await fs.readFile(inputPath);
  const image = sharp(inputBuffer).rotate();
  const metadata = await image.metadata();
  const width = metadata.width ?? 1;
  const height = metadata.height ?? 1;

  const dominant = await sharp(inputBuffer).stats();
  const dominantColor = dominant.dominant
    ? `#${[dominant.dominant.r, dominant.dominant.g, dominant.dominant.b].map((item) => item.toString(16).padStart(2, "0")).join("")}`
    : "#f6f8fa";
  const tiny = await sharp(inputBuffer)
    .rotate()
    .resize({ width: tinyWidth, withoutEnlargement: true })
    .jpeg({ quality: 42, mozjpeg: true })
    .toBuffer({ resolveWithObject: true });

  const raw = await sharp(inputBuffer)
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
    tinyPlaceholder: `data:image/jpeg;base64,${tiny.data.toString("base64")}`,
    tinySize: { width: tiny.info.width, height: tiny.info.height }
  };
}

type PlaceholderValue = Awaited<ReturnType<typeof placeholderFor>>;

export async function generateImagePlaceholders(
  options: ImagePlaceholderOptions,
  history: HistoryService
): Promise<ConversionResult> {
  const id = uniqueId("image-placeholder");
  const logs: string[] = [];
  const files: string[] = [];
  const items: ConversionItemResult[] = [];

  await history.startTask({
    id,
    toolType: "image-placeholder",
    sourcePath: options.inputPaths.join(";"),
    outputPath: options.outputDir,
    options
  });

  try {
    await ensureDir(options.outputDir);
    const attempts = await mapWithConcurrency(options.inputPaths, 3, async (inputPath) => {
      try {
        return { inputPath, value: await placeholderFor(inputPath, options.tinyWidth, options.componentX, options.componentY) };
      } catch (error) {
        return { inputPath, error: error instanceof Error ? error.message : String(error) };
      }
    });
    const result = attempts
      .filter((attempt): attempt is { inputPath: string; value: PlaceholderValue } => "value" in attempt && Boolean(attempt.value))
      .map((attempt) => attempt.value);
    const failures = attempts.filter((attempt): attempt is { inputPath: string; error: string } => "error" in attempt);
    items.push(
      ...attempts.map((attempt) =>
        "value" in attempt
          ? { inputPath: attempt.inputPath, status: "success" as const }
          : { inputPath: attempt.inputPath, status: "error" as const, errorMessage: attempt.error }
      )
    );
    const output = path.join(options.outputDir, "image-placeholders.json");
    await writeTextFile(output, `${JSON.stringify({ generatedAt: new Date().toISOString(), images: result }, null, 2)}\n`);
    files.push(output);

    for (const item of result) {
      const cssPath = await uniqueOutputPath(options.outputDir, `${safeBaseName(item.source)}-placeholder.css`);
      await writeTextFile(
        cssPath,
        `.placeholder-${cssIdentifier(safeBaseName(item.source))} {
  background-color: ${item.dominantColor};
  background-image: url("${item.tinyPlaceholder}");
  background-size: cover;
}
`
      );
      files.push(cssPath);
    }

    logs.push(`Generated placeholder data for ${result.length} image(s).`);
    logs.push(...failures.map((attempt) => `Failed ${path.basename(attempt.inputPath)}: ${attempt.error}`));
    const errorMessage = failures.length ? `${failures.length} of ${options.inputPaths.length} image(s) failed.` : undefined;
    const status = failures.length ? (result.length ? "partial" : "error") : "success";
    await history.finishTask(id, status, errorMessage);
    return { id, status, files, outputPath: options.outputDir, logs, errorMessage, items };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await history.finishTask(id, "error", message);
    return { id, status: "error", files, outputPath: options.outputDir, logs, errorMessage: message };
  }
}
