import path from "node:path";
import QRCode from "qrcode";
import type { ConversionResult, QrCodeOptions } from "../../../shared/types";
import type { HistoryService } from "./history.service";
import { ensureDir, safeBaseName, uniqueId, writeFileExclusive } from "./file-utils";

const hexColorPattern = /^#(?:[0-9a-f]{3,4}|[0-9a-f]{6}|[0-9a-f]{8})$/i;

function validateOptions(options: QrCodeOptions) {
  if (!options.text.trim()) throw new Error("二维码内容不能为空");
  if (!Number.isInteger(options.size) || options.size < 64 || options.size > 4096) {
    throw new Error("二维码尺寸必须是 64 到 4096 之间的整数");
  }
  if (!Number.isInteger(options.margin) || options.margin < 0 || options.margin > 32) {
    throw new Error("二维码边距必须是 0 到 32 之间的整数");
  }
  if (!hexColorPattern.test(options.darkColor) || !hexColorPattern.test(options.lightColor)) {
    throw new Error("二维码颜色必须使用 HEX 格式，例如 #1f2328 或 #ffffff");
  }
}

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
    validateOptions(options);
    await ensureDir(options.outputDir);
    const base = safeBaseName(options.fileName || "qrcode") || "qrcode";
    const outputName = `${base}.${options.format}`;
    const qrOptions = {
      width: options.size,
      margin: options.margin,
      color: {
        dark: options.darkColor,
        light: options.lightColor
      }
    };

    let output: string;
    if (options.format === "svg") {
      const svg = await QRCode.toString(options.text, { ...qrOptions, type: "svg" });
      output = await writeFileExclusive(options.outputDir, outputName, svg);
    } else {
      const png = await QRCode.toBuffer(options.text, qrOptions);
      output = await writeFileExclusive(options.outputDir, outputName, png);
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
