import fs from "node:fs/promises";
import path from "node:path";
import type { ConversionResult, FontWoff2Options } from "../../../shared/types";
import type { HistoryService } from "./history.service";
import { ensureDir, safeBaseName, uniqueId, writeTextFile } from "./file-utils";

async function compressToWoff2(buffer: Buffer): Promise<Buffer> {
  const wawoff2 = (await import("wawoff2")) as {
    compress(input: Uint8Array): Promise<Uint8Array>;
  };
  const output = await wawoff2.compress(buffer);
  return Buffer.from(output);
}

export async function convertFontsToWoff2(
  options: FontWoff2Options,
  history: HistoryService
): Promise<ConversionResult> {
  const id = uniqueId("woff2");
  const logs: string[] = [];
  const files: string[] = [];

  await history.startTask({
    id,
    toolType: "woff2",
    sourcePath: options.inputPaths.join(";"),
    outputPath: options.outputDir,
    options
  });

  try {
    await ensureDir(options.outputDir);
    const cssBlocks: string[] = [];

    for (const inputPath of options.inputPaths) {
      const base = safeBaseName(inputPath);
      const output = path.join(options.outputDir, `${base}.woff2`);
      const ext = path.extname(inputPath).toLowerCase();

      if (ext === ".woff2") {
        await fs.copyFile(inputPath, output);
      } else {
        const buffer = await fs.readFile(inputPath);
        const woff2 = await compressToWoff2(buffer);
        await fs.writeFile(output, woff2);
      }

      files.push(output);
      logs.push(`Created ${path.basename(output)}.`);

      if (options.generateCss) {
        const family = options.fontFamily?.trim() || base;
        cssBlocks.push(`@font-face {
  font-family: "${family}";
  src: url("./${path.basename(output)}") format("woff2");
  font-weight: 400;
  font-style: normal;
  font-display: swap;
}`);
      }
    }

    if (cssBlocks.length > 0) {
      const cssPath = path.join(options.outputDir, "fonts.css");
      await writeTextFile(cssPath, `${cssBlocks.join("\n\n")}\n`);
      files.push(cssPath);
    }

    await history.finishTask(id, "success");
    return { id, status: "success", files, outputPath: options.outputDir, logs };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await history.finishTask(id, "error", message);
    return { id, status: "error", files, outputPath: options.outputDir, logs, errorMessage: message };
  }
}
