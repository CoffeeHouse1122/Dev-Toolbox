import path from "node:path";
import QRCode from "qrcode";
import type { ConversionResult, QrCodeOptions } from "../../../shared/types";
import type { HistoryService } from "./history.service";
import { ensureDir, safeBaseName, uniqueId, writeTextFile } from "./file-utils";

export async function generateQrCode(options: QrCodeOptions, history: HistoryService): Promise<ConversionResult> {
  const id = uniqueId("qr-code");
  const logs: string[] = [];
  const files: string[] = [];

  await history.startTask({
    id,
    toolType: "qr-code",
    sourcePath: "inline-text",
    outputPath: options.outputDir,
    options: { ...options, text: `${options.text.slice(0, 80)}${options.text.length > 80 ? "..." : ""}` }
  });

  try {
    await ensureDir(options.outputDir);
    const base = safeBaseName(options.fileName || "qrcode") || "qrcode";
    const output = path.join(options.outputDir, `${base}.${options.format}`);
    const qrOptions = {
      width: options.size,
      margin: options.margin,
      color: {
        dark: options.darkColor,
        light: options.lightColor
      }
    };

    if (options.format === "svg") {
      const svg = await QRCode.toString(options.text, { ...qrOptions, type: "svg" });
      await writeTextFile(output, svg);
    } else {
      await QRCode.toFile(output, options.text, qrOptions);
    }

    files.push(output);
    logs.push(`Created ${path.basename(output)}.`);
    await history.finishTask(id, "success");
    return { id, status: "success", files, outputPath: options.outputDir, logs };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await history.finishTask(id, "error", message);
    return { id, status: "error", files, outputPath: options.outputDir, logs, errorMessage: message };
  }
}
