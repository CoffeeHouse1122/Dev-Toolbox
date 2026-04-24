import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import ffmpegPath from "ffmpeg-static";
import type { ConversionResult, SequenceAnimationOptions } from "../../shared/types";
import type { HistoryService } from "./history.service";
import { ensureDir, safeBaseName, uniqueId, writeTextFile } from "./file-utils";

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

function ffmpegPathLiteral(filePath: string) {
  return filePath.replace(/\\/g, "/").replace(/'/g, "'\\''");
}

function outputName(options: SequenceAnimationOptions) {
  const first = options.inputPaths[0] ?? "sequence";
  const ext = options.outputFormat === "apng" ? "png" : options.outputFormat;
  return `${safeBaseName(first)}-sequence.${ext}`;
}

export async function convertSequenceAnimation(
  options: SequenceAnimationOptions,
  history: HistoryService
): Promise<ConversionResult> {
  const id = uniqueId("sequence-animation");
  const logs: string[] = [];
  const files: string[] = [];

  await history.startTask({
    id,
    toolType: "sequence-animation",
    sourcePath: options.inputPaths.join(";"),
    outputPath: options.outputDir,
    options
  });

  try {
    await ensureDir(options.outputDir);
    const tempDir = path.join(options.outputDir, `.sequence-temp-${id}`);
    await ensureDir(tempDir);
    const listPath = path.join(tempDir, "frames.txt");
    const duration = Math.max(0.001, 1 / options.fps);
    const list = options.inputPaths
      .flatMap((inputPath) => [`file '${ffmpegPathLiteral(path.resolve(inputPath))}'`, `duration ${duration.toFixed(6)}`])
      .join("\n");
    await writeTextFile(listPath, `${list}\nfile '${ffmpegPathLiteral(path.resolve(options.inputPaths.at(-1) ?? options.inputPaths[0]))}'\n`);

    const output = path.join(options.outputDir, outputName(options));
    const vf = [`fps=${options.fps}`];
    if (options.width) {
      vf.push(`scale=${options.width}:-2:flags=lanczos`);
    }
    const baseArgs = ["-y", "-f", "concat", "-safe", "0", "-i", listPath, "-vf", vf.join(",")];

    if (options.outputFormat === "gif") {
      await runFfmpeg([...baseArgs, "-loop", options.loop ? "0" : "-1", output], logs);
    } else if (options.outputFormat === "webp") {
      await runFfmpeg([...baseArgs, "-loop", options.loop ? "0" : "1", "-an", "-c:v", "libwebp", "-quality", "82", output], logs);
    } else {
      await runFfmpeg([...baseArgs, "-plays", options.loop ? "0" : "1", "-f", "apng", output], logs);
    }

    files.push(output);
    await fs.rm(tempDir, { recursive: true, force: true });
    await history.finishTask(id, "success");
    return { id, status: "success", files, outputPath: options.outputDir, logs };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await history.finishTask(id, "error", message);
    return { id, status: "error", files, outputPath: options.outputDir, logs, errorMessage: message };
  }
}
