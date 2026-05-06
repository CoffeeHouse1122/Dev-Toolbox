import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import ffmpegPath from "ffmpeg-static";
import sharp from "sharp";
import type { ConversionResult, SequenceAnimationOptions } from "../../../shared/types";
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
    child.on("close", (code) =>
      code === 0 ? resolve() : reject(new Error(`ffmpeg exited with code ${code}`))
    );
  });
}

async function runFfmpeg(args: string[], logs: string[]) {
  const candidates = [ffmpegPath ? unpackedPath(ffmpegPath) : null, "ffmpeg"].filter(Boolean) as string[];
  let lastError: unknown = new Error("ffmpeg binary was not found.");

  for (const candidate of candidates) {
    try {
      logs.push(`exec: ${candidate} ${args.join(" ")}`);
      await runFfmpegCandidate(candidate, args, logs);
      return;
    } catch (error) {
      lastError = error;
      logs.push(`ffmpeg candidate failed (${candidate}): ${error instanceof Error ? error.message : String(error)}`);
    }
  }

  throw lastError;
}

function outputName(options: SequenceAnimationOptions) {
  const first = options.inputPaths[0] ?? "sequence";
  const ext = options.outputFormat === "apng" ? "png" : options.outputFormat;
  return `${safeBaseName(first)}-sequence.${ext}`;
}

/**
 * Normalize all input frames into a sequential numbered PNG set inside a temp
 * directory. This avoids fragile concat-demuxer timing and lets us feed ffmpeg
 * the well-tested image2 demuxer with a `frame_%05d.png` pattern.
 *
 * We also enforce a consistent canvas size (the size of the first frame, or
 * the user-supplied target width) so that animated WebP / APNG do not get
 * "ghosting" caused by mixed sizes between frames.
 */
async function prepareFrames(inputPaths: string[], tempDir: string, targetWidth?: number) {
  const first = inputPaths[0];
  if (!first) throw new Error("没有输入帧。");
  const meta = await sharp(first).metadata();
  if (!meta.width || !meta.height) throw new Error("无法读取首帧尺寸。");
  const baseW = targetWidth || meta.width;
  const baseH = Math.max(1, Math.round((baseW / meta.width) * meta.height));

  for (let i = 0; i < inputPaths.length; i += 1) {
    const target = path.join(tempDir, `frame_${String(i + 1).padStart(5, "0")}.png`);
    await sharp(inputPaths[i])
      .resize({
        width: baseW,
        height: baseH,
        fit: "contain",
        background: { r: 0, g: 0, b: 0, alpha: 0 }
      })
      .png({ compressionLevel: 6 })
      .toFile(target);
  }
  return { width: baseW, height: baseH };
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

  const tempDir = path.join(options.outputDir, `.sequence-temp-${id}`);

  try {
    await ensureDir(options.outputDir);
    await ensureDir(tempDir);
    await prepareFrames(options.inputPaths, tempDir, options.width);

    const output = path.join(options.outputDir, outputName(options));
    const pattern = path.join(tempDir, "frame_%05d.png");
    const fps = Math.max(1, Math.min(60, options.fps));
    const loopFlag = options.loop ? "0" : "1";

    if (options.outputFormat === "gif") {
      // Single-pass high-quality GIF using palettegen + paletteuse via split filter.
      await runFfmpeg(
        [
          "-y",
          "-framerate",
          String(fps),
          "-i",
          pattern,
          "-vf",
          "split[a][b];[a]palettegen=stats_mode=full[p];[b][p]paletteuse=dither=sierra2_4a",
          "-loop",
          options.loop ? "0" : "-1",
          output
        ],
        logs
      );
    } else if (options.outputFormat === "webp") {
      // Animated WebP. The image2 demuxer + libwebp encoder produces a clean
      // animated WebP. -loop 0 = infinite, -loop 1 = play once. We force RGBA
      // and a single video stream to avoid the ghosting that came from feeding
      // libwebp via the concat demuxer.
      await runFfmpeg(
        [
          "-y",
          "-framerate",
          String(fps),
          "-i",
          pattern,
          "-vf",
          "format=rgba",
          "-c:v",
          "libwebp",
          "-lossless",
          "0",
          "-q:v",
          "85",
          "-preset",
          "picture",
          "-loop",
          loopFlag,
          "-an",
          "-vsync",
          "0",
          output
        ],
        logs
      );
    } else {
      // APNG. plays=0 means infinite loop, plays=1 means play once.
      await runFfmpeg(
        [
          "-y",
          "-framerate",
          String(fps),
          "-i",
          pattern,
          "-vf",
          "format=rgba",
          "-c:v",
          "apng",
          "-plays",
          options.loop ? "0" : "1",
          "-f",
          "apng",
          output
        ],
        logs
      );
    }

    files.push(output);
    await fs.rm(tempDir, { recursive: true, force: true });
    await history.finishTask(id, "success");
    return { id, status: "success", files, outputPath: options.outputDir, logs };
  } catch (error) {
    await fs.rm(tempDir, { recursive: true, force: true }).catch(() => {});
    const message = error instanceof Error ? error.message : String(error);
    await history.finishTask(id, "error", message);
    return { id, status: "error", files, outputPath: options.outputDir, logs, errorMessage: message };
  }
}
