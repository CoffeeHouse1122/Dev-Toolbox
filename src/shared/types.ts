export type ToolType =
  | "favicon"
  | "webp"
  | "woff2"
  | "video-background"
  | "sequence-animation"
  | "base64-image"
  | "video-animation"
  | "video-mute"
  | "markdown-export"
  | "batch-rename"
  | "image-compress"
  | "image-resize"
  | "image-crop"
  | "sprite"
  | "image-placeholder"
  | "seo-files"
  | "og-image"
  | "qr-code"
  | "audio-convert"
  | "font-subset"
  | "asset-manifest";

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

export interface ImageCropOptions {
  inputPath: string;
  outputDir: string;
  x: number;
  y: number;
  width: number;
  height: number;
  outputFormat: ImageOutputFormat;
  quality: number;
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

export interface SequenceAnimationOptions {
  inputPaths: string[];
  outputDir: string;
  outputFormat: "gif" | "apng" | "webp";
  fps: number;
  width?: number;
  loop: boolean;
}

export interface AudioConvertOptions {
  inputPaths: string[];
  outputDir: string;
  outputFormat: "mp3" | "wav" | "aac" | "ogg" | "flac" | "m4a";
  bitrate?: string;
  sampleRate?: number;
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

export interface QrCodeOptions {
  text: string;
  outputDir: string;
  fileName: string;
  format: "png" | "svg";
  size: number;
  margin: number;
  darkColor: string;
  lightColor: string;
}

export interface IpAddressItem {
  name: string;
  family: "IPv4" | "IPv6";
  address: string;
  internal: boolean;
  mac: string;
}

export interface IpInfo {
  internal: IpAddressItem[];
  externalIp: string;
  externalSource?: string;
  externalError?: string;
}

export interface FontSubsetOptions {
  inputPath: string;
  outputDir: string;
  text: string;
  outputFormat: "ttf" | "woff2";
  fontFamily?: string;
  generateCss: boolean;
}

export interface AssetManifestOptions {
  sourceDir: string;
  outputDir: string;
  baseName: string;
  includeHash: boolean;
}

export interface SpriteOptions {
  inputPaths: string[];
  outputDir: string;
  spriteName: string;
  classPrefix: string;
  columns: number;
  padding: number;
}

export interface SeoFilesOptions {
  outputDir: string;
  siteUrl: string;
  disallow: string;
  pages: string;
  changefreq: string;
  priority: string;
  includeRobots: boolean;
  includeSitemap: boolean;
}

export interface ImagePlaceholderOptions {
  inputPaths: string[];
  outputDir: string;
  tinyWidth: number;
  componentX: number;
  componentY: number;
}

export interface OgImageOptions {
  outputDir: string;
  fileName: string;
  title: string;
  subtitle: string;
  siteName: string;
  width: number;
  height: number;
  backgroundColor: string;
  accentColor: string;
  textColor: string;
}

export interface SharedDiskConfig {
  url: string;
  username: string;
  password: string;
  basePath: string;
  defaultDirectory: string;
  persistent: boolean;
}

export interface SharedDiskConnectResult {
  shareRoot: string;
  baseUncPath: string;
  defaultDirectory: string;
  message: string;
}

export interface SharedDiskStatus {
  connected: boolean;
  shareRoot: string;
  message: string;
}

export type AppCloseBehavior = "minimize-to-tray" | "exit";

export interface AppSettings {
  closeBehavior: AppCloseBehavior;
}

export interface Base64ImageResult {
  mimeType: string;
  base64: string;
  dataUrl: string;
}

export interface ClipboardEntry {
  id: string;
  kind: "text" | "image";
  text: string;
  preview?: string;
  hash: string;
  capturedAt: number;
  pinned: boolean;
}

export interface ClipboardWatcherStatus {
  watching: boolean;
  count: number;
}

export interface DevToolboxApi {
  selectFiles(filters?: DialogFileFilter[], multiSelections?: boolean): Promise<string[]>;
  selectOutputDir(): Promise<string | null>;
  convertFavicon(options: FaviconOptions): Promise<ConversionResult>;
  convertWebp(options: WebpOptions): Promise<ConversionResult>;
  compressImages(options: ImageCompressOptions): Promise<ConversionResult>;
  resizeImages(options: ImageResizeOptions): Promise<ConversionResult>;
  cropImage(options: ImageCropOptions): Promise<ConversionResult>;
  generateSprite(options: SpriteOptions): Promise<ConversionResult>;
  generateImagePlaceholders(options: ImagePlaceholderOptions): Promise<ConversionResult>;
  convertFontWoff2(options: FontWoff2Options): Promise<ConversionResult>;
  subsetFont(options: FontSubsetOptions): Promise<ConversionResult>;
  convertVideoBackground(options: VideoBackgroundOptions): Promise<ConversionResult>;
  convertSequenceAnimation(options: SequenceAnimationOptions): Promise<ConversionResult>;
  convertVideoAnimation(options: VideoAnimationOptions): Promise<ConversionResult>;
  removeVideoAudio(options: VideoMuteOptions): Promise<ConversionResult>;
  convertAudio(options: AudioConvertOptions): Promise<ConversionResult>;
  exportMarkdown(options: MarkdownExportOptions): Promise<ConversionResult>;
  renameFiles(options: RenameOptions): Promise<ConversionResult>;
  generateQrCode(options: QrCodeOptions): Promise<ConversionResult>;
  getIpInfo(): Promise<IpInfo>;
  generateAssetManifest(options: AssetManifestOptions): Promise<ConversionResult>;
  generateSeoFiles(options: SeoFilesOptions): Promise<ConversionResult>;
  generateOgImage(options: OgImageOptions): Promise<ConversionResult>;
  getDroppedFilePaths(files: unknown[]): string[];
  loadSharedDiskConfig(): Promise<SharedDiskConfig>;
  saveSharedDiskConfig(config: SharedDiskConfig): Promise<SharedDiskConfig>;
  connectSharedDisk(config: SharedDiskConfig): Promise<SharedDiskConnectResult>;
  disconnectSharedDisk(config: SharedDiskConfig): Promise<SharedDiskConnectResult>;
  getSharedDiskStatus(config: SharedDiskConfig): Promise<SharedDiskStatus>;
  openSharedDiskDirectory(targetPath: string): Promise<string>;
  imageToBase64(inputPath: string): Promise<Base64ImageResult>;
  base64ToImage(data: string, outputDir: string, fileName: string): Promise<ConversionResult>;
  listHistory(limit?: number): Promise<ConversionRecord[]>;
  clearHistory(): Promise<void>;
  revealPath(filePath: string): Promise<void>;
  openExternal(url: string): Promise<void>;
  readTextFile(filePath: string): Promise<string>;
  writeTextFile(outputDir: string, fileName: string, content: string): Promise<string>;
  startClipboardWatcher(): Promise<ClipboardWatcherStatus>;
  stopClipboardWatcher(): Promise<ClipboardWatcherStatus>;
  listClipboard(): Promise<ClipboardEntry[]>;
  clearClipboardHistory(): Promise<ClipboardEntry[]>;
  removeClipboardEntry(id: string): Promise<ClipboardEntry[]>;
  pinClipboardEntry(id: string, pinned: boolean): Promise<ClipboardEntry[]>;
  writeClipboardEntry(id: string): Promise<boolean>;
  onClipboardUpdate(handler: (entries: ClipboardEntry[]) => void): () => void;
  loadAppSettings(): Promise<AppSettings>;
  saveAppSettings(settings: AppSettings): Promise<AppSettings>;
}
