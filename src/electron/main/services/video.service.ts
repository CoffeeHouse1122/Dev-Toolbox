import fs from "node:fs/promises";
import path from "node:path";
import { spawn } from "node:child_process";
import ffmpegPath from "ffmpeg-static";
import type { ConversionResult, VideoAnimationOptions, VideoBackgroundOptions, VideoMuteOptions } from "../../../shared/types";
import type { HistoryService } from "./history.service";
import { ensureDir, uniqueId, writeTextFile } from "./file-utils";

function unpackedPath(filePath: string) {
  return filePath.replace("app.asar", "app.asar.unpacked");
}

function runFfmpegCandidate(executable: string, args: string[], logs: string[]): Promise<void> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { windowsHide: true });
    child.stderr.on("data", (chunk) => {
      const line = String(chunk).trim();
      if (line) {
        logs.push(line);
      }
    });
    child.on("error", reject);
    child.on("close", (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`ffmpeg exited with code ${code}`));
      }
    });
  });
}

async function runFfmpeg(args: string[], logs: string[]): Promise<void> {
  const candidates = [ffmpegPath ? unpackedPath(ffmpegPath) : null, "ffmpeg"].filter(Boolean) as string[];
  let lastError: unknown = new Error("ffmpeg binary was not found.");

  for (const candidate of candidates) {
    try {
      await runFfmpegCandidate(candidate, args, logs);
      return;
    } catch (error) {
      lastError = error;
      const message = error instanceof Error ? error.message : String(error);
      logs.push(`ffmpeg candidate failed (${candidate}): ${message}`);
    }
  }

  throw lastError;
}

function scaleArgs(width?: number) {
  return width ? ["-vf", `scale=${width}:-2`] : [];
}

function seekArgs(startSeconds?: number, durationSeconds?: number) {
  const args: string[] = [];
  if (startSeconds && startSeconds > 0) {
    args.push("-ss", String(startSeconds));
  }
  if (durationSeconds && durationSeconds > 0) {
    args.push("-t", String(durationSeconds));
  }
  return args;
}

async function writeSnippet(outputDir: string, files: string[]) {
  const snippetPath = path.join(outputDir, "background-video.html");
  await writeTextFile(
    snippetPath,
    `<video class="site-bg-video" autoplay muted loop playsinline poster="./poster.png">
  <source src="./background.webm" type="video/webm" />
  <source src="./background.mp4" type="video/mp4" />
</video>

<!-- Safari can also consume ./hls/index.m3u8 with HLS segments. -->
`
  );
  files.push(snippetPath);
}

export async function createVideoBackgroundPack(
  options: VideoBackgroundOptions,
  history: HistoryService
): Promise<ConversionResult> {
  const id = uniqueId("video");
  const logs: string[] = [];
  const files: string[] = [];

  await history.startTask({
    id,
    toolType: "video-background",
    sourcePath: options.inputPath,
    outputPath: options.outputDir,
    options
  });

  try {
    await ensureDir(options.outputDir);

    if (options.mode === "background-pack" || options.mode === "mp4") {
      const output = path.join(options.outputDir, "background.mp4");
      await runFfmpeg(
        [
          "-y",
          "-i",
          options.inputPath,
          ...scaleArgs(options.width),
          "-an",
          "-c:v",
          "libx264",
          "-preset",
          "medium",
          "-crf",
          String(options.crf),
          "-pix_fmt",
          "yuv420p",
          "-movflags",
          "+faststart",
          output
        ],
        logs
      );
      files.push(output);
    }

    if (options.mode === "background-pack" || options.mode === "webm") {
      const output = path.join(options.outputDir, "background.webm");
      await runFfmpeg(
        [
          "-y",
          "-i",
          options.inputPath,
          ...scaleArgs(options.width),
          "-an",
          "-c:v",
          "libvpx-vp9",
          "-b:v",
          "0",
          "-crf",
          String(Math.min(options.crf + 8, 40)),
          output
        ],
        logs
      );
      files.push(output);
    }

    if (options.mode === "background-pack" || options.mode === "hls") {
      const hlsDir = path.join(options.outputDir, "hls");
      await ensureDir(hlsDir);
      const playlist = path.join(hlsDir, "index.m3u8");
      const segmentPattern = path.join(hlsDir, "segment_%03d.ts");
      await runFfmpeg(
        [
          "-y",
          "-i",
          options.inputPath,
          ...scaleArgs(options.width),
          "-an",
          "-c:v",
          "libx264",
          "-profile:v",
          "baseline",
          "-level",
          "3.0",
          "-pix_fmt",
          "yuv420p",
          "-crf",
          String(options.crf),
          "-hls_time",
          "4",
          "-hls_playlist_type",
          "vod",
          "-hls_segment_filename",
          segmentPattern,
          playlist
        ],
        logs
      );
      files.push(playlist);
      const hlsFiles = await fs.readdir(hlsDir);
      files.push(...hlsFiles.filter((name) => name.endsWith(".ts")).map((name) => path.join(hlsDir, name)));
    }

    if (options.makePoster) {
      const poster = path.join(options.outputDir, "poster.png");
      await runFfmpeg(["-y", "-ss", "00:00:00.100", "-i", options.inputPath, "-frames:v", "1", poster], logs);
      files.push(poster);
    }

    if (options.mode === "background-pack") {
      await writeSnippet(options.outputDir, files);
    }

    await history.finishTask(id, "success");
    return { id, status: "success", files, outputPath: options.outputDir, logs };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await history.finishTask(id, "error", message);
    return { id, status: "error", files, outputPath: options.outputDir, logs, errorMessage: message };
  }
}

export async function convertVideoAnimation(
  options: VideoAnimationOptions,
  history: HistoryService
): Promise<ConversionResult> {
  const id = uniqueId("video-animation");
  const logs: string[] = [];
  const files: string[] = [];

  await history.startTask({
    id,
    toolType: "video-animation",
    sourcePath: options.inputPath,
    outputPath: options.outputDir,
    options
  });

  try {
    await ensureDir(options.outputDir);
    const output = path.join(options.outputDir, `${path.basename(options.inputPath, path.extname(options.inputPath))}.${options.outputFormat}`);
    const vf = [`fps=${options.fps}`, `scale=${options.width ?? -1}:-2:flags=lanczos`].join(",");

    if (options.outputFormat === "gif") {
      await runFfmpeg(["-y", ...seekArgs(options.startSeconds, options.durationSeconds), "-i", options.inputPath, "-vf", vf, output], logs);
    } else {
      await runFfmpeg(
        [
          "-y",
          ...seekArgs(options.startSeconds, options.durationSeconds),
          "-i",
          options.inputPath,
          "-vf",
          vf,
          "-an",
          "-loop",
          "0",
          "-c:v",
          "libwebp",
          "-quality",
          "82",
          output
        ],
        logs
      );
    }

    files.push(output);
    await history.finishTask(id, "success");
    return { id, status: "success", files, outputPath: options.outputDir, logs };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await history.finishTask(id, "error", message);
    return { id, status: "error", files, outputPath: options.outputDir, logs, errorMessage: message };
  }
}

export async function removeVideoAudio(options: VideoMuteOptions, history: HistoryService): Promise<ConversionResult> {
  const id = uniqueId("video-mute");
  const logs: string[] = [];
  const files: string[] = [];

  await history.startTask({
    id,
    toolType: "video-mute",
    sourcePath: options.inputPaths.join(";"),
    outputPath: options.outputDir,
    options
  });

  try {
    await ensureDir(options.outputDir);

    for (const inputPath of options.inputPaths) {
      const output = path.join(options.outputDir, `${path.basename(inputPath, path.extname(inputPath))}-muted${path.extname(inputPath) || ".mp4"}`);
      await runFfmpeg(["-y", "-i", inputPath, "-c", "copy", "-an", output], logs);
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
