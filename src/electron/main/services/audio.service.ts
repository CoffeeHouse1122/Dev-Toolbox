import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import ffmpegPath from "ffmpeg-static";
import type { AudioCompressOptions, AudioConvertOptions, ConversionItemResult, ConversionResult } from "../../../shared/types";
import type { HistoryService } from "./history.service";
import { commitTemporaryFile, ensureDir, removeTemporaryFile, safeBaseName, temporaryOutputPath, uniqueId, uniqueOutputPath } from "./file-utils";

function unpackedPath(filePath: string) {
  return filePath.replace("app.asar", "app.asar.unpacked");
}

function runFfmpegCandidate(executable: string, args: string[], logs: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { windowsHide: true });
    child.stderr.on("data", (chunk) => {
      const line = String(chunk).trim();
      if (line) logs.push(line);
    });
    child.on("error", reject);
    child.on("close", (code) => (code === 0 ? resolve() : reject(new Error(`ffmpeg exited with code ${code}`))));
  });
}

async function runFfmpeg(args: string[], logs: string[]) {
  const candidates = [ffmpegPath ? unpackedPath(ffmpegPath) : null, "ffmpeg"].filter(Boolean) as string[];
  let lastError: unknown = new Error("ffmpeg binary was not found.");

  for (const candidate of candidates) {
    try {
      await runFfmpegCandidate(candidate, args, logs);
      return;
    } catch (error) {
      lastError = error;
      logs.push(`ffmpeg candidate failed (${candidate}): ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  throw lastError;
}

function codecArgs(format: AudioConvertOptions["outputFormat"]) {
  if (format === "mp3") return ["-c:a", "libmp3lame"];
  if (format === "aac" || format === "m4a") return ["-c:a", "aac"];
  if (format === "ogg") return ["-c:a", "libvorbis"];
  if (format === "flac") return ["-c:a", "flac"];
  return [];
}

export async function convertAudio(options: AudioConvertOptions, history: HistoryService): Promise<ConversionResult> {
  const id = uniqueId("audio-convert");
  const logs: string[] = [];
  const files: string[] = [];
  const failures: string[] = [];
  const items: ConversionItemResult[] = [];

  await history.startTask({
    id,
    toolType: "audio-convert",
    sourcePath: options.inputPaths.join(";"),
    outputPath: options.outputDir,
    options
  });

  try {
    await ensureDir(options.outputDir);

    for (const inputPath of options.inputPaths) {
      let tempOutput = "";
      try {
        const output = await uniqueOutputPath(options.outputDir, `${safeBaseName(inputPath)}.${options.outputFormat}`);
        tempOutput = temporaryOutputPath(output);
        const args = ["-y", "-i", inputPath, "-vn", ...codecArgs(options.outputFormat)];
        if (options.bitrate && options.outputFormat !== "wav" && options.outputFormat !== "flac") args.push("-b:a", options.bitrate);
        if (options.sampleRate) args.push("-ar", String(options.sampleRate));
        args.push(tempOutput);
        await runFfmpeg(args, logs);
        await commitTemporaryFile(tempOutput, output);
        files.push(output);
        items.push({ inputPath, outputPath: output, status: "success" });
      } catch (error) {
        if (tempOutput) await removeTemporaryFile(tempOutput);
        const message = `${path.basename(inputPath)}: ${error instanceof Error ? error.message : String(error)}`;
        failures.push(message);
        items.push({ inputPath, status: "error", errorMessage: message });
        logs.push(`Failed ${message}`);
      }
    }

    const errorMessage = failures.length ? `${failures.length} of ${options.inputPaths.length} audio file(s) failed.` : undefined;
    const status = failures.length ? (files.length ? "partial" : "error") : "success";
    await history.finishTask(id, status, errorMessage);
    return { id, status, files, outputPath: options.outputDir, logs, errorMessage, items };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await history.finishTask(id, "error", message);
    return { id, status: "error", files, outputPath: options.outputDir, logs, errorMessage: message };
  }
}

function formatSize(bytes: number) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  let size = bytes;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }
  return `${size.toFixed(index === 0 ? 0 : 2)} ${units[index]}`;
}

export async function compressAudio(options: AudioCompressOptions, history: HistoryService): Promise<ConversionResult> {
  const id = uniqueId("audio-compress");
  const logs: string[] = [];
  const files: string[] = [];
  const failures: string[] = [];
  const items: ConversionItemResult[] = [];

  await history.startTask({
    id,
    toolType: "audio-compress",
    sourcePath: options.inputPaths.join(";"),
    outputPath: options.outputDir,
    options
  });

  try {
    await ensureDir(options.outputDir);

    for (const inputPath of options.inputPaths) {
      let tempOutput = "";
      try {
        const output = await uniqueOutputPath(options.outputDir, `${safeBaseName(inputPath)}-compressed.${options.outputFormat}`);
        tempOutput = temporaryOutputPath(output);
        const args = ["-y", "-i", inputPath, "-vn", ...codecArgs(options.outputFormat), "-b:a", options.bitrate];
        if (options.sampleRate) args.push("-ar", String(options.sampleRate));
        args.push(tempOutput);
        await runFfmpeg(args, logs);
        await commitTemporaryFile(tempOutput, output);
        files.push(output);
        items.push({ inputPath, outputPath: output, status: "success" });

        const [sourceStat, outputStat] = await Promise.all([fs.stat(inputPath), fs.stat(output)]);
        const ratio = sourceStat.size > 0 ? Math.max(0, 100 - (outputStat.size / sourceStat.size) * 100) : 0;
        logs.push(`${path.basename(inputPath)}: ${formatSize(sourceStat.size)} -> ${formatSize(outputStat.size)} (${ratio.toFixed(1)}% smaller)`);
      } catch (error) {
        if (tempOutput) await removeTemporaryFile(tempOutput);
        const message = `${path.basename(inputPath)}: ${error instanceof Error ? error.message : String(error)}`;
        failures.push(message);
        items.push({ inputPath, status: "error", errorMessage: message });
        logs.push(`Failed ${message}`);
      }
    }

    const errorMessage = failures.length ? `${failures.length} of ${options.inputPaths.length} audio file(s) failed.` : undefined;
    const status = failures.length ? (files.length ? "partial" : "error") : "success";
    await history.finishTask(id, status, errorMessage);
    return { id, status, files, outputPath: options.outputDir, logs, errorMessage, items };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await history.finishTask(id, "error", message);
    return { id, status: "error", files, outputPath: options.outputDir, logs, errorMessage: message };
  }
}
