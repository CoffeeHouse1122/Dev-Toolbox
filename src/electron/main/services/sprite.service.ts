import path from "node:path";
import fs from "node:fs/promises";
import sharp from "sharp";
import type { ConversionResult, SpriteOptions } from "../../../shared/types";
import type { HistoryService } from "./history.service";
import {
  commitTemporaryFile,
  ensureDir,
  mapWithConcurrency,
  removeTemporaryFile,
  safeBaseName,
  temporaryOutputPath,
  uniqueId,
  uniqueOutputPath,
  writeTextFile
} from "./file-utils";

function cssIdentifier(value: string) {
  const clean = value.normalize("NFC").replace(/[^\p{L}\p{N}_-]+/gu, "-").replace(/^-+|-+$/g, "") || "image";
  return /^\d/.test(clean) ? `image-${clean}` : clean;
}

export async function generateSprite(options: SpriteOptions, history: HistoryService): Promise<ConversionResult> {
  const id = uniqueId("sprite");
  const logs: string[] = [];
  const files: string[] = [];

  await history.startTask({
    id,
    toolType: "sprite",
    sourcePath: options.inputPaths.join(";"),
    outputPath: options.outputDir,
    options
  });

  try {
    await ensureDir(options.outputDir);
    const inputStats = await mapWithConcurrency(options.inputPaths, 4, async (inputPath) => ({ inputPath, stat: await fs.stat(inputPath) }));
    for (const { inputPath, stat } of inputStats) {
      if (!stat.isFile() || stat.size > 256 * 1024 * 1024) throw new Error(`${path.basename(inputPath)} exceeds the image safety limit.`);
    }
    const totalInputSize = inputStats.reduce((sum, item) => sum + item.stat.size, 0);
    if (totalInputSize > 512 * 1024 * 1024) throw new Error("Selected images exceed the 512 MiB sprite input safety limit.");
    const images = await mapWithConcurrency(
      options.inputPaths,
      3,
      async (inputPath) => {
        const inputBuffer = await fs.readFile(inputPath);
        const metadata = await sharp(inputBuffer).metadata();
        return {
          inputPath,
          inputBuffer,
          name: safeBaseName(inputPath),
          width: metadata.width ?? 1,
          height: metadata.height ?? 1
        };
      }
    );

    const columns = Math.max(1, Math.min(options.columns || images.length, images.length));
    const padding = Math.max(0, options.padding);
    const cellWidth = Math.max(...images.map((item) => item.width));
    const cellHeight = Math.max(...images.map((item) => item.height));
    const rows = Math.ceil(images.length / columns);
    const spriteWidth = columns * cellWidth + Math.max(0, columns - 1) * padding;
    const spriteHeight = rows * cellHeight + Math.max(0, rows - 1) * padding;
    if (spriteWidth > 32_000 || spriteHeight > 32_000 || spriteWidth * spriteHeight > 100_000_000) {
      throw new Error(`Sprite dimensions ${spriteWidth}x${spriteHeight} exceed the safety limit.`);
    }

    const composites = await mapWithConcurrency(
      images,
      3,
      async (item, index) => {
        const column = index % columns;
        const row = Math.floor(index / columns);
        const left = column * (cellWidth + padding);
        const top = row * (cellHeight + padding);
        return {
          input: await sharp(item.inputBuffer).png().toBuffer(),
          left,
          top
        };
      }
    );

    const base = safeBaseName(options.spriteName || "sprite") || "sprite";
    const spritePath = await uniqueOutputPath(options.outputDir, `${base}.png`);
    const tempSpritePath = temporaryOutputPath(spritePath);
    try {
      await sharp({
      create: {
        width: spriteWidth,
        height: spriteHeight,
        channels: 4,
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      }
    })
      .composite(composites)
      .png()
      .toFile(tempSpritePath);
      await commitTemporaryFile(tempSpritePath, spritePath);
    } catch (error) {
      await removeTemporaryFile(tempSpritePath);
      throw error;
    }

    const css = images
      .map((item, index) => {
        const column = index % columns;
        const row = Math.floor(index / columns);
        const left = column * (cellWidth + padding);
        const top = row * (cellHeight + padding);
        return `.${cssIdentifier(options.classPrefix || "sprite")}-${cssIdentifier(item.name)} {
  width: ${item.width}px;
  height: ${item.height}px;
  background-image: url("./${path.basename(spritePath)}");
  background-position: -${left}px -${top}px;
}`;
      })
      .join("\n\n");
    const cssPath = await uniqueOutputPath(options.outputDir, `${base}.css`);
    await writeTextFile(cssPath, `${css}\n`);

    files.push(spritePath, cssPath);
    logs.push(`Generated ${images.length} sprite item(s).`);
    await history.finishTask(id, "success");
    return { id, status: "success", files, outputPath: options.outputDir, logs };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await history.finishTask(id, "error", message);
    return { id, status: "error", files, outputPath: options.outputDir, logs, errorMessage: message };
  }
}
