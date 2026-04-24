import path from "node:path";
import { spawn } from "node:child_process";
import ffmpegPath from "ffmpeg-static";
import type { AudioConvertOptions, ConversionResult } from "../../shared/types";
import type { HistoryService } from "./history.service";
import { ensureDir, safeBaseName, uniqueId } from "./file-utils";

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
      const output = path.join(options.outputDir, `${safeBaseName(inputPath)}.${options.outputFormat}`);
      const args = ["-y", "-i", inputPath, "-vn", ...codecArgs(options.outputFormat)];
      if (options.bitrate && options.outputFormat !== "wav" && options.outputFormat !== "flac") {
        args.push("-b:a", options.bitrate);
      }
      if (options.sampleRate) {
        args.push("-ar", String(options.sampleRate));
      }
      args.push(output);
      await runFfmpeg(args, logs);
      files.push(output);
    }

    await history.finishTask(id, "success");
    return { id, status: "success", files, outputPath: options.outputDir, logs };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await history.finishTask(id, "error", message);
    return { id, status: "error", files, outputPath: options.outputDir, logs, errorMessage: message };
  }
}
