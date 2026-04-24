import path from "node:path";
import sharp from "sharp";
import type { ConversionResult, SpriteOptions } from "../../shared/types";
import type { HistoryService } from "./history.service";
import { ensureDir, safeBaseName, uniqueId, writeTextFile } from "./file-utils";

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
    const images = await Promise.all(
      options.inputPaths.map(async (inputPath) => {
        const metadata = await sharp(inputPath).metadata();
        return {
          inputPath,
          name: safeBaseName(inputPath),
          width: metadata.width ?? 1,
          height: metadata.height ?? 1
        };
      })
    );

    const columns = Math.max(1, Math.min(options.columns || images.length, images.length));
    const padding = Math.max(0, options.padding);
    const cellWidth = Math.max(...images.map((item) => item.width));
    const cellHeight = Math.max(...images.map((item) => item.height));
    const rows = Math.ceil(images.length / columns);
    const spriteWidth = columns * cellWidth + Math.max(0, columns - 1) * padding;
    const spriteHeight = rows * cellHeight + Math.max(0, rows - 1) * padding;

    const composites = await Promise.all(
      images.map(async (item, index) => {
        const column = index % columns;
        const row = Math.floor(index / columns);
        const left = column * (cellWidth + padding);
        const top = row * (cellHeight + padding);
        return {
          input: await sharp(item.inputPath).png().toBuffer(),
          left,
          top
        };
      })
    );

    const base = safeBaseName(options.spriteName || "sprite") || "sprite";
    const spritePath = path.join(options.outputDir, `${base}.png`);
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
      .toFile(spritePath);

    const css = images
      .map((item, index) => {
        const column = index % columns;
        const row = Math.floor(index / columns);
        const left = column * (cellWidth + padding);
        const top = row * (cellHeight + padding);
        return `.${options.classPrefix || "sprite"}-${item.name} {
  width: ${item.width}px;
  height: ${item.height}px;
  background-image: url("./${path.basename(spritePath)}");
  background-position: -${left}px -${top}px;
}`;
      })
      .join("\n\n");
    const cssPath = path.join(options.outputDir, `${base}.css`);
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
