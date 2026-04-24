export type ToolType =
  | "favicon"
  | "webp"
  | "woff2"
  | "video-background"
  | "base64-image"
  | "video-animation"
  | "video-mute"
  | "markdown-export"
  | "batch-rename"
  | "image-compress"
  | "image-resize";

export type TaskStatus = "success" | "error";

export interface ConversionRecord {
  id: string;
  toolType: ToolType;
  sourcePath: string;
  outputPath: string;
  status: TaskStatus;
  optionsJson: string;
  errorMessage: string | null;
  createdAt: string;
  finishedAt: string | null;
}

export interface ConversionResult {
  id: string;
  status: TaskStatus;
  files: string[];
  outputPath: string;
  logs: string[];
  errorMessage?: string;
}

export interface DialogFileFilter {
  name: string;
  extensions: string[];
}

export interface FaviconOptions {
  inputPath: string;
  outputDir: string;
  sizes: number[];
  includePng: boolean;
  includeManifest: boolean;
}

export type ImageOutputFormat = "webp" | "png" | "jpeg" | "avif";

export interface WebpOptions {
  inputPaths: string[];
  outputDir: string;
  outputFormat: ImageOutputFormat;
  quality: number;
  lossless: boolean;
  keepMetadata: boolean;
  maxWidth?: number;
  maxHeight?: number;
}

export interface ImageCompressOptions {
  inputPaths: string[];
  outputDir: string;
  quality: number;
  keepMetadata: boolean;
}

export interface ImageResizeOptions {
  inputPaths: string[];
  outputDir: string;
  mode: "size" | "scale";
  width?: number;
  height?: number;
  scale?: number;
}

export interface FontWoff2Options {
  inputPaths: string[];
  outputDir: string;
  generateCss: boolean;
  fontFamily?: string;
}

export type VideoPackMode = "background-pack" | "mp4" | "webm" | "hls";

export interface VideoBackgroundOptions {
  inputPath: string;
  outputDir: string;
  mode: VideoPackMode;
  width?: number;
  crf: number;
  makePoster: boolean;
}

export interface VideoAnimationOptions {
  inputPath: string;
  outputDir: string;
  outputFormat: "gif" | "webp";
  width?: number;
  fps: number;
  startSeconds?: number;
  durationSeconds?: number;
}

export interface VideoMuteOptions {
  inputPaths: string[];
  outputDir: string;
}

export interface MarkdownExportOptions {
  markdown: string;
  outputDir: string;
  baseName: string;
  formats: Array<"html" | "png" | "pdf">;
}

export interface RenameOptions {
  inputPaths: string[];
  pattern: string;
  start: number;
  replaceFrom?: string;
  replaceTo?: string;
}

export interface Base64ImageResult {
  mimeType: string;
  base64: string;
  dataUrl: string;
}

export interface DevToolboxApi {
  selectFiles(filters?: DialogFileFilter[], multiSelections?: boolean): Promise<string[]>;
  selectOutputDir(): Promise<string | null>;
  convertFavicon(options: FaviconOptions): Promise<ConversionResult>;
  convertWebp(options: WebpOptions): Promise<ConversionResult>;
  compressImages(options: ImageCompressOptions): Promise<ConversionResult>;
  resizeImages(options: ImageResizeOptions): Promise<ConversionResult>;
  convertFontWoff2(options: FontWoff2Options): Promise<ConversionResult>;
  convertVideoBackground(options: VideoBackgroundOptions): Promise<ConversionResult>;
  convertVideoAnimation(options: VideoAnimationOptions): Promise<ConversionResult>;
  removeVideoAudio(options: VideoMuteOptions): Promise<ConversionResult>;
  exportMarkdown(options: MarkdownExportOptions): Promise<ConversionResult>;
  renameFiles(options: RenameOptions): Promise<ConversionResult>;
  imageToBase64(inputPath: string): Promise<Base64ImageResult>;
  base64ToImage(data: string, outputDir: string, fileName: string): Promise<ConversionResult>;
  listHistory(limit?: number): Promise<ConversionRecord[]>;
  clearHistory(): Promise<void>;
  revealPath(filePath: string): Promise<void>;
}
