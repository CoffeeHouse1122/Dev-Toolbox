import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { spawn } from "node:child_process";
import ffmpegPath from "ffmpeg-static";
import sharp from "sharp";
import type {
  ConversionItemResult,
  ConversionResult,
  MediaInfo,
  VideoAnimationOptions,
  VideoBackgroundOptions,
  VideoCompressOptions,
  VideoLoopAnalyzeOptions,
  VideoLoopInfo,
  VideoMuteOptions
} from "../../../shared/types";
import type { HistoryService } from "./history.service";
import {
  commitTemporaryFile,
  ensureDir,
  removeTemporaryFile,
  replaceWithTemporaryFile,
  safeBaseName,
  temporaryOutputPath,
  uniqueId,
  uniqueOutputPath,
  writeTextFile
} from "./file-utils";

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

async function runFfmpegReplacing(args: string[], output: string, logs: string[]) {
  const tempOutput = temporaryOutputPath(output);
  try {
    await runFfmpeg([...args, tempOutput], logs);
    await replaceWithTemporaryFile(tempOutput, output);
  } finally {
    await removeTemporaryFile(tempOutput);
  }
}

type StagedVideoOutput = { stagedPath: string; finalPath: string };

async function commitStagedVideoOutputs(entries: StagedVideoOutput[], backupDir: string) {
  const committed: StagedVideoOutput[] = [];
  const backups = new Map<string, string>();
  await ensureDir(backupDir);

  try {
    for (const [index, entry] of entries.entries()) {
      const backupPath = path.join(backupDir, `${index}-${path.basename(entry.finalPath)}`);
      try {
        await fs.rename(entry.finalPath, backupPath);
        backups.set(entry.finalPath, backupPath);
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }

      try {
        await fs.rename(entry.stagedPath, entry.finalPath);
        committed.push(entry);
      } catch (error) {
        const backup = backups.get(entry.finalPath);
        if (backup) await fs.rename(backup, entry.finalPath).catch(() => undefined);
        throw error;
      }
    }
  } catch (error) {
    for (const entry of committed.reverse()) {
      await fs.rename(entry.finalPath, entry.stagedPath).catch(() => undefined);
      const backup = backups.get(entry.finalPath);
      if (backup) await fs.rename(backup, entry.finalPath).catch(() => undefined);
    }
    throw error;
  }

  await fs.rm(backupDir, { recursive: true, force: true });
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

async function writeSnippet(outputDir: string) {
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
  return snippetPath;
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

  const stagingDir = path.join(options.outputDir, `.video-background.part-${id}`);
  const backupDir = path.join(options.outputDir, `.video-background.backup-${id}`);
  try {
    await ensureDir(options.outputDir);
    await fs.rm(stagingDir, { recursive: true, force: true });
    await fs.rm(backupDir, { recursive: true, force: true });
    await ensureDir(stagingDir);
    const stagedOutputs: StagedVideoOutput[] = [];

    if (options.mode === "background-pack" || options.mode === "mp4") {
      const output = path.join(options.outputDir, "background.mp4");
      const stagedOutput = path.join(stagingDir, "background.mp4");
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
          stagedOutput
        ],
        logs
      );
      stagedOutputs.push({ stagedPath: stagedOutput, finalPath: output });
    }

    if (options.mode === "background-pack" || options.mode === "webm") {
      const output = path.join(options.outputDir, "background.webm");
      const stagedOutput = path.join(stagingDir, "background.webm");
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
          stagedOutput
        ],
        logs
      );
      stagedOutputs.push({ stagedPath: stagedOutput, finalPath: output });
    }

    if (options.mode === "background-pack" || options.mode === "hls") {
      const hlsDir = path.join(options.outputDir, "hls");
      const stagingHlsDir = path.join(stagingDir, "hls");
      await ensureDir(stagingHlsDir);
      const stagingPlaylist = path.join(stagingHlsDir, "index.m3u8");
      const segmentPattern = path.join(stagingHlsDir, "segment_%03d.ts");
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
          stagingPlaylist
        ],
        logs
      );
      stagedOutputs.push({ stagedPath: stagingHlsDir, finalPath: hlsDir });
    }

    if (options.makePoster) {
      const poster = path.join(options.outputDir, "poster.png");
      const stagedPoster = path.join(stagingDir, "poster.png");
      await runFfmpeg(["-y", "-ss", "00:00:00.100", "-i", options.inputPath, "-frames:v", "1", stagedPoster], logs);
      stagedOutputs.push({ stagedPath: stagedPoster, finalPath: poster });
    }

    if (options.mode === "background-pack") {
      const stagedSnippet = await writeSnippet(stagingDir);
      stagedOutputs.push({ stagedPath: stagedSnippet, finalPath: path.join(options.outputDir, "background-video.html") });
    }

    await commitStagedVideoOutputs(stagedOutputs, backupDir);
    files.push(...stagedOutputs.map((entry) => entry.finalPath));
    const finalHlsDir = path.join(options.outputDir, "hls");
    if (stagedOutputs.some((entry) => entry.finalPath === finalHlsDir)) {
      const hlsFiles = (await fs.readdir(finalHlsDir)).sort((left, right) => left.localeCompare(right, "en"));
      files.splice(files.indexOf(finalHlsDir), 1, path.join(finalHlsDir, "index.m3u8"));
      files.push(...hlsFiles.filter((name) => name.endsWith(".ts")).map((name) => path.join(finalHlsDir, name)));
    }

    await history.finishTask(id, "success");
    return { id, status: "success", files, outputPath: options.outputDir, logs };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await history.finishTask(id, "error", message);
    return { id, status: "error", files: [], outputPath: options.outputDir, logs, errorMessage: message };
  } finally {
    await fs.rm(stagingDir, { recursive: true, force: true }).catch(() => undefined);
    await fs.rm(backupDir, { recursive: true, force: true }).catch(() => undefined);
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
    const output = await uniqueOutputPath(options.outputDir, `${safeBaseName(options.inputPath)}.${options.outputFormat}`);
    const tempOutput = temporaryOutputPath(output);
    const vf = [`fps=${options.fps}`, `scale=${options.width ?? -1}:-2:flags=lanczos`].join(",");

    try {
      if (options.outputFormat === "gif") {
        await runFfmpeg(["-y", ...seekArgs(options.startSeconds, options.durationSeconds), "-i", options.inputPath, "-vf", vf, tempOutput], logs);
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
            tempOutput
          ],
          logs
        );
      }
      await commitTemporaryFile(tempOutput, output);
    } catch (error) {
      await removeTemporaryFile(tempOutput);
      throw error;
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
  const failures: string[] = [];
  const items: ConversionItemResult[] = [];

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
      let tempOutput = "";
      try {
        const extension = path.extname(inputPath) || ".mp4";
        const output = await uniqueOutputPath(options.outputDir, `${safeBaseName(inputPath)}-muted${extension}`);
        tempOutput = temporaryOutputPath(output);
        await runFfmpeg(["-y", "-i", inputPath, "-c", "copy", "-an", tempOutput], logs);
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

    const errorMessage = failures.length ? `${failures.length} of ${options.inputPaths.length} video file(s) failed.` : undefined;
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

export async function compressVideos(options: VideoCompressOptions, history: HistoryService): Promise<ConversionResult> {
  const id = uniqueId("video-compress");
  const logs: string[] = [];
  const files: string[] = [];
  const failures: string[] = [];
  const items: ConversionItemResult[] = [];

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
      let tempOutput = "";
      try {
        const output = await uniqueOutputPath(options.outputDir, `${safeBaseName(inputPath)}-compressed.mp4`);
        tempOutput = temporaryOutputPath(output);
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
          tempOutput
        ];
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

    const errorMessage = failures.length ? `${failures.length} of ${options.inputPaths.length} video file(s) failed.` : undefined;
    const status = failures.length ? (files.length ? "partial" : "error") : "success";
    await history.finishTask(id, status, errorMessage);
    return { id, status, files, outputPath: options.outputDir, logs, errorMessage, items };
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

function parseMediaInfo(raw: string): MediaInfo {
  const durationSeconds = parseDuration(raw);
  const format = raw.match(/Input #0,\s*([^,\n]+)/)?.[1]?.trim() || "未知";
  const bitrate = raw.match(/bitrate:\s*([^\n,]+)/i)?.[1]?.trim() || "未知";
  const videoLine = raw.match(/Stream #\d+:\d+[^\n]*Video:\s*([^\n]+)/i)?.[1] || "";
  const audioLine = raw.match(/Stream #\d+:\d+[^\n]*Audio:\s*([^\n]+)/i)?.[1] || "";
  const videoCodec = videoLine.split(",")[0]?.trim() || "未知";
  const audioCodec = audioLine.split(",")[0]?.trim() || "无音频";
  const resolution = videoLine.match(/(\d{2,5}x\d{2,5})/)?.[1] || "未知";
  const fps = videoLine.match(/([\d.]+)\s*fps/)?.[1] || videoLine.match(/([\d.]+)\s*tbr/)?.[1] || "未知";

  return {
    durationSeconds,
    bitrate,
    format,
    videoCodec,
    audioCodec,
    resolution,
    fps,
    sampleRate: audioLine.match(/(\d+)\s*Hz/i)?.[1] || "未知",
    channels: audioLine.match(/,\s*([^,]*?(?:stereo|mono|\d+\.\d+))\s*,/i)?.[1]?.trim() || "未知",
    raw
  };
}

function buildLoopInfo(
  mediaInfo: MediaInfo,
  frameDiffScore: number | null,
  frameDiffSamples: number[],
  frameDataUrls: { first?: string; last?: string },
  hasAudio: boolean
): VideoLoopInfo {
  const loopRisk = frameDiffScore == null ? "unknown" : frameDiffScore <= 8 ? "low" : frameDiffScore <= 22 ? "medium" : "high";
  const summaryMap = {
    low: "首尾窗口多点差异较小，作为背景视频循环时大概率平滑。",
    medium: "首尾窗口存在可见差异，循环点可能有轻微跳动。",
    high: "首尾窗口差异明显，背景循环播放时很可能出现跳帧感。",
    unknown: "未能完成首尾窗口差异分析，请检查视频是否可读取。"
  } satisfies Record<VideoLoopInfo["loopRisk"], string>;
  const mean = frameDiffSamples.length ? frameDiffSamples.reduce((sum, value) => sum + value, 0) / frameDiffSamples.length : null;
  const stdDev = mean == null
    ? null
    : Math.sqrt(frameDiffSamples.reduce((sum, value) => sum + (value - mean) ** 2, 0) / frameDiffSamples.length);
  const audioNote = hasAudio ? " 检测到音轨；视觉评分不代表音频接缝无跳变，发布前请试听循环点。" : "";

  return {
    ...mediaInfo,
    firstFrameDataUrl: frameDataUrls.first,
    lastFrameDataUrl: frameDataUrls.last,
    frameDiffScore,
    frameDiffSamples,
    frameDiffMean: mean == null ? null : Number(mean.toFixed(2)),
    frameDiffStdDev: stdDev == null ? null : Number(stdDev.toFixed(2)),
    hasAudio,
    loopRisk,
    summary: `${summaryMap[loopRisk]}${audioNote}`
  };
}

function median(values: number[]) {
  if (!values.length) return null;
  const sorted = [...values].sort((left, right) => left - right);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 ? sorted[middle] : (sorted[middle - 1] + sorted[middle]) / 2;
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

async function assertFrameFile(filePath: string, label: string) {
  try {
    const stat = await fs.stat(filePath);
    if (stat.size > 0) return;
  } catch {
    // fall through to the readable error below
  }
  throw new Error(`${label}抽帧失败，请确认视频可读取且包含有效画面。`);
}

export async function analyzeVideoLoop(
  options: VideoLoopAnalyzeOptions,
  history: HistoryService
): Promise<ConversionResult & { info?: VideoLoopInfo }> {
  const id = uniqueId("video-loop");
  const logs: string[] = [];
  const files: string[] = [];
  const outputPath = path.dirname(options.inputPath);
  let tempDir = "";

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
    const mediaInfo = parseMediaInfo(rawInfo);
    tempDir = await fs.mkdtemp(path.join(os.tmpdir(), "dev-toolbox-loop-"));
    await ensureDir(tempDir);
    const baseName = safeBaseName(options.inputPath);
    const edge = Math.max(0.02, options.edgeSeconds || 0.08);
    const duration = mediaInfo.durationSeconds && Number.isFinite(mediaInfo.durationSeconds) ? mediaInfo.durationSeconds : 0;
    const maximumOffset = duration > 0 ? Math.max(0.01, Math.min(edge, duration / 3)) : edge;
    const offsets = [Math.max(0.01, maximumOffset * 0.25), Math.max(0.015, maximumOffset * 0.625), maximumOffset];
    const framePairs: Array<{ first: string; last: string; score: number }> = [];
    for (const [index, offset] of offsets.entries()) {
      const firstFrame = path.join(tempDir, `${baseName}-loop-first-${index}.png`);
      const lastFrame = path.join(tempDir, `${baseName}-loop-last-${index}.png`);
      try {
        await runFfmpeg(["-y", "-ss", String(offset), "-i", options.inputPath, "-frames:v", "1", firstFrame], logs);
        await assertFrameFile(firstFrame, `首窗口样本 ${index + 1}`);
        const lastSeek = duration > 0 ? ["-ss", String(Math.max(0, duration - offset))] : ["-sseof", `-${offset}`];
        await runFfmpeg(["-y", ...lastSeek, "-i", options.inputPath, "-frames:v", "1", lastFrame], logs);
        await assertFrameFile(lastFrame, `尾窗口样本 ${index + 1}`);
        const score = await compareFrames(firstFrame, lastFrame);
        if (score != null) framePairs.push({ first: firstFrame, last: lastFrame, score });
      } catch (error) {
        logs.push(`Skipped loop sample ${index + 1}: ${error instanceof Error ? error.message : String(error)}`);
        await Promise.all([fs.rm(firstFrame, { force: true }), fs.rm(lastFrame, { force: true })]);
      }
    }
    const frameDiffSamples = framePairs.map((item) => item.score);
    const medianScore = median(frameDiffSamples);
    const frameDiffScore = medianScore == null ? null : Number(medianScore.toFixed(2));
    const previewPair = framePairs[Math.floor(framePairs.length / 2)];
    if (!previewPair) throw new Error("No valid frame pairs were produced.");
    const firstFrame = previewPair.first;
    const lastFrame = previewPair.last;
    const [firstFrameBuffer, lastFrameBuffer] = await Promise.all([fs.readFile(firstFrame), fs.readFile(lastFrame)]);
    const hasAudio = /Stream #\d+:\d+[^\n]*Audio:/i.test(rawInfo);
    const info = buildLoopInfo(
      mediaInfo,
      frameDiffScore,
      frameDiffSamples,
      {
        first: `data:image/png;base64,${firstFrameBuffer.toString("base64")}`,
        last: `data:image/png;base64,${lastFrameBuffer.toString("base64")}`
      },
      hasAudio
    );
    logs.push(`Loop median frame diff score: ${frameDiffScore ?? "unknown"}`);
    logs.push(`Loop frame samples: ${frameDiffSamples.join(", ") || "unknown"}; stddev: ${info.frameDiffStdDev ?? "unknown"}`);
    logs.push(`Loop offsets from each edge: ${offsets.map((value) => `${value.toFixed(3)}s`).join(", ")}`);
    logs.push(info.summary);
    await fs.rm(tempDir, { recursive: true, force: true });

    await history.finishTask(id, "success");
    return { id, status: "success", files, outputPath, logs, info };
  } catch (error) {
    if (tempDir) await fs.rm(tempDir, { recursive: true, force: true });
    const message = error instanceof Error ? error.message : String(error);
    await history.finishTask(id, "error", message);
    return { id, status: "error", files, outputPath, logs, errorMessage: message };
  }
}

export async function getMediaInfo(inputPath: string): Promise<MediaInfo> {
  const logs: string[] = [];
  const infoProbe = await runFfmpegCapture(["-hide_banner", "-i", inputPath], logs);
  return parseMediaInfo(`${infoProbe.stdout}${infoProbe.stderr}`);
}
