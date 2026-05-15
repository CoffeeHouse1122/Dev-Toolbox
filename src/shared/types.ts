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
  | "watermark"
  | "sprite"
  | "image-placeholder"
  | "mark-man"
  | "seo-files"
  | "og-image"
  | "qr-code"
  | "audio-convert"
  | "font-subset"
  | "asset-manifest"
  | "certificate-scan"
  | "capture-proxy"
  | "sticky-notes";

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

export type WatermarkPosition = "tile" | "bottom-right" | "center" | "top-left" | "top-right" | "bottom-left";
export type WatermarkOutputFormat = "same" | ImageOutputFormat;

export interface WatermarkOptions {
  inputPaths: string[];
  outputDir: string;
  text: string;
  patternPath?: string;
  position: WatermarkPosition;
  outputFormat: WatermarkOutputFormat;
  opacity: number;
  rotation: number;
  scale: number;
  gap: number;
  margin: number;
  quality: number;
  keepMetadata: boolean;
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

export interface DomainIpAddress {
  family: "IPv4" | "IPv6";
  address: string;
}

export interface DomainIpLookupResult {
  query: string;
  host: string;
  addresses: DomainIpAddress[];
  status: "success" | "error";
  errorMessage?: string;
}

export interface CertificateScanOptions {
  domains: string[];
  timeoutMs?: number;
}

export interface CertificateScanResult {
  domain: string;
  host: string;
  port: number;
  issuer: string;
  validFrom: string;
  validTo: string;
  remainingDays: number | null;
  status: "success" | "error";
  errorMessage?: string;
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
  autoLaunch: boolean;
}

export type ToolConfigKey = "navigation" | "capture-proxy";

export interface PortDiagnostic {
  label: string;
  port: number;
  inUse: boolean;
}

export interface AppDiagnostics {
  userDataDir: string;
  logsDir: string;
  ports: PortDiagnostic[];
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

export interface ThemeTitleBarPayload {
  accentColor: string;
  surfaceColor: string;
  textColor: string;
}

export interface WindowFrameState {
  isMaximized: boolean;
  isMinimized: boolean;
  isAlwaysOnTop: boolean;
}

export interface StickyNote {
  id: string;
  fileName: string;
  filePath: string;
  title: string;
  content: string;
  updatedAt: number;
  pinned: boolean;
}

export interface StickyNotesState {
  directory: string;
  notes: StickyNote[];
}

export interface CaptureProxyStartOptions {
  host: string;
  port: number;
  captureBodies: boolean;
  maxBodySize: number;
  enableHttps: boolean;
}

export interface CaptureProxyStatus {
  running: boolean;
  host: string;
  port: number;
  startedAt: number | null;
  recordCount: number;
  caCertPath?: string;
  errorMessage?: string;
}

export interface CaptureProxyRecord {
  id: string;
  startedAt: number;
  method: string;
  url: string;
  host: string;
  path: string;
  protocol: "http" | "https";
  status: "pending" | "success" | "error" | "tunnel";
  statusCode: number | null;
  durationMs: number | null;
  requestHeaders: Record<string, string>;
  responseHeaders: Record<string, string>;
  requestBody: string;
  responseBody: string;
  requestSize: number;
  responseSize: number;
  errorMessage?: string;
}

export interface DevToolboxApi {
  selectFiles(filters?: DialogFileFilter[], multiSelections?: boolean): Promise<string[]>;
  selectOutputDir(): Promise<string | null>;
  convertFavicon(options: FaviconOptions): Promise<ConversionResult>;
  convertWebp(options: WebpOptions): Promise<ConversionResult>;
  compressImages(options: ImageCompressOptions): Promise<ConversionResult>;
  resizeImages(options: ImageResizeOptions): Promise<ConversionResult>;
  cropImage(options: ImageCropOptions): Promise<ConversionResult>;
  applyWatermark(options: WatermarkOptions): Promise<ConversionResult>;
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
  lookupDomainIp(domain: string): Promise<DomainIpLookupResult>;
  scanCertificates(options: CertificateScanOptions): Promise<CertificateScanResult[]>;
  startCaptureProxy(options: CaptureProxyStartOptions): Promise<CaptureProxyStatus>;
  stopCaptureProxy(): Promise<CaptureProxyStatus>;
  getCaptureProxyStatus(): Promise<CaptureProxyStatus>;
  listCaptureProxyRecords(): Promise<CaptureProxyRecord[]>;
  clearCaptureProxyRecords(): Promise<CaptureProxyRecord[]>;
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
  getAppDiagnostics(): Promise<AppDiagnostics>;
  loadToolConfig(key: ToolConfigKey): Promise<unknown | null>;
  saveToolConfig(key: ToolConfigKey, value: unknown): Promise<unknown>;
  /** 手动检查更新 */
  checkForUpdates(): Promise<void>;
  /** 手动下载已发现的更新 */
  downloadUpdate(): Promise<void>;
  /** 安装已下载的更新（退出并安装） */
  installUpdate(): Promise<void>;
  /** 获取当前应用版本号 */
  getCurrentVersion(): Promise<string>;
  /** 监听更新状态变化，返回取消监听的函数 */
  onUpdateStatus(handler: (status: UpdateStatus) => void): () => void;
  /** 通知主进程更新标题栏背景色 */
  setThemeBackground(payload: ThemeTitleBarPayload): void;
  getWindowState(): Promise<WindowFrameState>;
  minimizeWindow(): Promise<WindowFrameState>;
  toggleMaximizeWindow(): Promise<WindowFrameState>;
  closeWindow(): Promise<void>;
  onWindowStateChange(handler: (state: WindowFrameState) => void): () => void;
  getAlwaysOnTop(): Promise<boolean>;
  setAlwaysOnTop(enabled: boolean): Promise<boolean>;
  loadStickyNotes(): Promise<StickyNotesState>;
  setStickyNotesDirectory(directory: string): Promise<StickyNotesState>;
  createStickyNote(content?: string): Promise<StickyNote>;
  saveStickyNote(id: string, content: string): Promise<StickyNote>;
  setStickyNotePinned(id: string, pinned: boolean): Promise<StickyNotesState>;
  deleteStickyNote(id: string): Promise<void>;
  exportStickyNotes(outputDir: string, ids?: string[]): Promise<string[]>;
  testCaptureProxy(): Promise<CaptureProxyRecord>;
}

/** 更新状态 */
export interface UpdateStatus {
  status: "checking" | "available" | "not-available" | "downloading" | "downloaded" | "error";
  version?: string;
  percent?: number;
  message?: string;
}
