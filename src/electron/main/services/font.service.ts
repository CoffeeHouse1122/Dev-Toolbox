import { constants as fsConstants } from "node:fs";
import fs from "node:fs/promises";
import path from "node:path";
import type { ConversionItemResult, ConversionResult, FontWoff2Options } from "../../../shared/types";
import type { HistoryService } from "./history.service";
import {
  commitTemporaryFile,
  ensureDir,
  removeTemporaryFile,
  safeBaseName,
  temporaryOutputPath,
  uniqueId,
  uniqueOutputPath,
  writeTextFile
} from "./file-utils";

async function compressToWoff2(buffer: Buffer): Promise<Buffer> {
  const wawoff2 = (await import("wawoff2")) as {
    compress(input: Uint8Array): Promise<Uint8Array>;
  };
  const output = await wawoff2.compress(buffer);
  return Buffer.from(output);
}

function fontDescriptor(base: string, familyOverride?: string) {
  const weightNames: Array<[RegExp, number]> = [
    [/\b(?:thin|hairline)\b/i, 100],
    [/\b(?:extra[- ]?light|ultra[- ]?light)\b/i, 200],
    [/\blight\b/i, 300],
    [/\b(?:regular|normal|book)\b/i, 400],
    [/\bmedium\b/i, 500],
    [/\b(?:semi[- ]?bold|demi[- ]?bold)\b/i, 600],
    [/\bbold\b/i, 700],
    [/\b(?:extra[- ]?bold|ultra[- ]?bold)\b/i, 800],
    [/\b(?:black|heavy)\b/i, 900]
  ];
  const weight = weightNames.find(([pattern]) => pattern.test(base))?.[1] ?? 400;
  const style = /\bitalic\b/i.test(base) ? "italic" : /\boblique\b/i.test(base) ? "oblique" : "normal";
  const family = familyOverride?.trim() || base
    .replace(/[-_ ]*(?:thin|hairline|extra[-_ ]?light|ultra[-_ ]?light|light|regular|normal|book|medium|semi[-_ ]?bold|demi[-_ ]?bold|extra[-_ ]?bold|ultra[-_ ]?bold|bold|black|heavy|italic|oblique)\b/gi, "")
    .replace(/[-_]+/g, " ")
    .trim() || base;
  return { family: family.replace(/["\\]/g, "\\$&"), weight, style };
}

export async function convertFontsToWoff2(
  options: FontWoff2Options,
  history: HistoryService
): Promise<ConversionResult> {
  const id = uniqueId("woff2");
  const logs: string[] = [];
  const files: string[] = [];
  const failures: string[] = [];
  const items: ConversionItemResult[] = [];

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
      let tempOutput = "";
      try {
        const base = safeBaseName(inputPath);
        const output = await uniqueOutputPath(options.outputDir, `${base}.woff2`);
        tempOutput = temporaryOutputPath(output);
        const ext = path.extname(inputPath).toLowerCase();
        const stat = await fs.stat(inputPath);
        if (!stat.isFile() || stat.size > 128 * 1024 * 1024) throw new Error("Font exceeds the 128 MiB safety limit.");

        if (ext === ".woff2") {
          await fs.copyFile(inputPath, tempOutput, fsConstants.COPYFILE_EXCL);
        } else {
          const buffer = await fs.readFile(inputPath);
          const woff2 = await compressToWoff2(buffer);
          await fs.writeFile(tempOutput, woff2, { flag: "wx" });
        }
        await commitTemporaryFile(tempOutput, output);

        files.push(output);
        items.push({ inputPath, outputPath: output, status: "success" });
        logs.push(`Created ${path.basename(output)}.`);

        if (options.generateCss) {
          const descriptor = fontDescriptor(base, options.fontFamily);
          cssBlocks.push(`@font-face {
  font-family: "${descriptor.family}";
  src: url("./${path.basename(output)}") format("woff2");
  font-weight: ${descriptor.weight};
  font-style: ${descriptor.style};
  font-display: swap;
}`);
        }
      } catch (error) {
        if (tempOutput) await removeTemporaryFile(tempOutput);
        const message = `${path.basename(inputPath)}: ${error instanceof Error ? error.message : String(error)}`;
        failures.push(message);
        items.push({ inputPath, status: "error", errorMessage: message });
        logs.push(`Failed ${message}`);
      }
    }

    if (cssBlocks.length > 0) {
      const cssPath = path.join(options.outputDir, "fonts.css");
      await writeTextFile(cssPath, `${cssBlocks.join("\n\n")}\n`);
      files.push(cssPath);
    }

    const errorMessage = failures.length ? `${failures.length} of ${options.inputPaths.length} font file(s) failed.` : undefined;
    const status = failures.length ? (files.length ? "partial" : "error") : "success";
    await history.finishTask(id, status, errorMessage);
    return { id, status, files, outputPath: options.outputDir, logs, errorMessage, items };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await history.finishTask(id, "error", message);
    return { id, status: "error", files, outputPath: options.outputDir, logs, errorMessage: message };
  }
}
