import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import ffmpegPath from "ffmpeg-static";
import sharp from "sharp";
import type {
  ConversionResult,
  VideoAnimationOptions,
  VideoBackgroundOptions,
  VideoCompressOptions,
  VideoLoopAnalyzeOptions,
  VideoLoopInfo,
  VideoMuteOptions
} from "../../../shared/types";
import type { HistoryService } from "./history.service";
import { ensureDir, safeBaseName, uniqueId, uniqueOutputPath, writeTextFile } from "./file-utils";

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

function runFfmpegCaptureCandidate(executable: string, args: string[]): Promise<{ stdout: string; stderr: string; code: number }> {
  return new Promise((resolve, reject) => {
    const child = spawn(executable, args, { windowsHide: true });
    const stdout: string[] = [];
    const stderr: string[] = [];
    child.stdout.on("data", (chunk) => stdout.push(String(chunk)));
    child.stderr.on("data", (chunk) => stderr.push(String(chunk)));
    child.on("error", reject);
    child.on("close", (code) => resolve({ stdout: stdout.join(""), stderr: stderr.join(""), code: code ?? 0 }));
  });
}

async function runFfmpegCapture(args: string[], logs: string[]) {
  const candidates = [ffmpegPath ? unpackedPath(ffmpegPath) : null, "ffmpeg"].filter(Boolean) as string[];
  let lastError: unknown = new Error("ffmpeg binary was not found.");

  for (const candidate of candidates) {
    try {
      const result = await runFfmpegCaptureCandidate(candidate, args);
      return result;
    } catch (error) {
      lastError = error;
      logs.push(`ffmpeg candidate failed (${candidate}): ${error instanceof Error ? error.message : String(error)}`);
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

export async function compressVideos(options: VideoCompressOptions, history: HistoryService): Promise<ConversionResult> {
  const id = uniqueId("video-compress");
  const logs: string[] = [];
  const files: string[] = [];

  await history.startTask({
    id,
    toolType: "video-compress",
    sourcePath: options.inputPaths.join(";"),
    outputPath: options.outputDir,
    options
  });

  try {
    await ensureDir(options.outputDir);

    for (const inputPath of options.inputPaths) {
      const output = await uniqueOutputPath(options.outputDir, `${safeBaseName(inputPath)}-compressed.mp4`);
      const args = [
        "-y",
        "-i",
        inputPath,
        ...scaleArgs(options.width),
        "-map",
        "0:v:0",
        ...(options.keepAudio ? ["-map", "0:a?"] : []),
        "-c:v",
        "libx264",
        "-preset",
        options.preset,
        "-crf",
        String(options.crf),
        "-pix_fmt",
        "yuv420p",
        ...(options.keepAudio ? ["-c:a", "aac", "-b:a", options.audioBitrate || "128k"] : ["-an"]),
        "-movflags",
        "+faststart",
        output
      ];
      await runFfmpeg(args, logs);
      files.push(output);

      const [sourceStat, outputStat] = await Promise.all([fs.stat(inputPath), fs.stat(output)]);
      const ratio = sourceStat.size > 0 ? Math.max(0, 100 - (outputStat.size / sourceStat.size) * 100) : 0;
      logs.push(`${path.basename(inputPath)}: ${formatSize(sourceStat.size)} -> ${formatSize(outputStat.size)} (${ratio.toFixed(1)}% smaller)`);
    }

    await history.finishTask(id, "success");
    return { id, status: "success", files, outputPath: options.outputDir, logs };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await history.finishTask(id, "error", message);
    return { id, status: "error", files, outputPath: options.outputDir, logs, errorMessage: message };
  }
}

function parseDuration(raw: string) {
  const match = raw.match(/Duration:\s*(\d+):(\d+):(\d+(?:\.\d+)?)/i);
  if (!match) return null;
  return Number(match[1]) * 3600 + Number(match[2]) * 60 + Number(match[3]);
}

function parseMediaInfo(raw: string, frameDiffScore: number | null, frameFiles: { first?: string; last?: string }): VideoLoopInfo {
  const durationSeconds = parseDuration(raw);
  const format = raw.match(/Input #0,\s*([^,\n]+)/)?.[1]?.trim() || "未知";
  const bitrate = raw.match(/bitrate:\s*([^\n,]+)/i)?.[1]?.trim() || "未知";
  const videoLine = raw.match(/Stream #\d+:\d+[^\n]*Video:\s*([^\n]+)/i)?.[1] || "";
  const audioLine = raw.match(/Stream #\d+:\d+[^\n]*Audio:\s*([^\n]+)/i)?.[1] || "";
  const videoCodec = videoLine.split(",")[0]?.trim() || "未知";
  const audioCodec = audioLine.split(",")[0]?.trim() || "无音频";
  const resolution = videoLine.match(/(\d{2,5}x\d{2,5})/)?.[1] || "未知";
  const fps = videoLine.match(/([\d.]+)\s*fps/)?.[1] || videoLine.match(/([\d.]+)\s*tbr/)?.[1] || "未知";
  const loopRisk = frameDiffScore == null ? "unknown" : frameDiffScore <= 8 ? "low" : frameDiffScore <= 22 ? "medium" : "high";
  const summaryMap = {
    low: "首尾帧差异较小，作为背景视频循环时大概率平滑。",
    medium: "首尾帧存在可见差异，循环点可能有轻微跳动。",
    high: "首尾帧差异明显，背景循环播放时很可能出现跳帧感。",
    unknown: "未能完成首尾帧差异分析，请检查视频是否可读取。"
  } satisfies Record<VideoLoopInfo["loopRisk"], string>;

  return {
    durationSeconds,
    bitrate,
    format,
    videoCodec,
    audioCodec,
    resolution,
    fps,
    firstFramePath: frameFiles.first,
    lastFramePath: frameFiles.last,
    frameDiffScore,
    loopRisk,
    summary: summaryMap[loopRisk],
    raw
  };
}

async function compareFrames(firstFrame: string, lastFrame: string) {
  const [firstBuffer, lastBuffer] = await Promise.all([
    sharp(firstFrame).resize(32, 32, { fit: "fill" }).removeAlpha().raw().toBuffer(),
    sharp(lastFrame).resize(32, 32, { fit: "fill" }).removeAlpha().raw().toBuffer()
  ]);
  const length = Math.min(firstBuffer.length, lastBuffer.length);
  if (!length) return null;
  let diff = 0;
  for (let index = 0; index < length; index += 1) {
    diff += Math.abs(firstBuffer[index] - lastBuffer[index]);
  }
  return Number(((diff / length / 255) * 100).toFixed(2));
}

export async function analyzeVideoLoop(
  options: VideoLoopAnalyzeOptions,
  history: HistoryService
): Promise<ConversionResult & { info?: VideoLoopInfo }> {
  const id = uniqueId("video-loop");
  const logs: string[] = [];
  const files: string[] = [];
  const outputPath = options.outputDir || path.dirname(options.inputPath);

  await history.startTask({
    id,
    toolType: "video-loop",
    sourcePath: options.inputPath,
    outputPath,
    options
  });

  try {
    const infoProbe = await runFfmpegCapture(["-hide_banner", "-i", options.inputPath], logs);
    const rawInfo = `${infoProbe.stdout}${infoProbe.stderr}`;
    const tempDir = options.outputDir || await fs.mkdtemp(path.join(os.tmpdir(), "dev-toolbox-loop-"));
    await ensureDir(tempDir);
    const baseName = safeBaseName(options.inputPath);
    const firstFrame = await uniqueOutputPath(tempDir, `${baseName}-loop-first.png`);
    const lastFrame = await uniqueOutputPath(tempDir, `${baseName}-loop-last.png`);
    const edge = Math.max(0.02, options.edgeSeconds || 0.08);

    await runFfmpeg(["-y", "-ss", String(edge), "-i", options.inputPath, "-frames:v", "1", firstFrame], logs);
    await runFfmpeg(["-y", "-sseof", `-${edge}`, "-i", options.inputPath, "-frames:v", "1", lastFrame], logs);
    if (options.outputDir) files.push(firstFrame, lastFrame);

    const frameDiffScore = await compareFrames(firstFrame, lastFrame);
    const info = parseMediaInfo(rawInfo, frameDiffScore, { first: options.outputDir ? firstFrame : undefined, last: options.outputDir ? lastFrame : undefined });
    logs.push(`Loop frame diff score: ${frameDiffScore ?? "unknown"}`);
    logs.push(info.summary);

    await history.finishTask(id, "success");
    return { id, status: "success", files, outputPath, logs, info };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await history.finishTask(id, "error", message);
    return { id, status: "error", files, outputPath, logs, errorMessage: message };
  }
}
