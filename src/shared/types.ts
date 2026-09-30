export type ToolType =
  | "favicon"
  | "svg-toolbox"
  | "pwa-icons"
  | "webp"
  | "woff2"
  | "video-background"
  | "sequence-animation"
  | "base64-image"
  | "video-animation"
  | "video-mute"
  | "video-compress"
  | "audio-compress"
  | "code-minify"
  | "video-loop"
  | "markdown-export"
  | "batch-rename"
  | "image-compress"
  | "image-resize"
  | "image-crop"
  | "watermark"
  | "image-placeholder"
  | "seo-files"
  | "og-image"
  | "qr-code"
  | "audio-convert"
  | "font-subset"
  | "asset-manifest"
  | "certificate-scan"
  | "sticky-notes";

export type TaskStatus = "success" | "partial" | "error" | "cancelled";

export type TextFileEncoding = "auto" | "utf8" | "utf16le" | "utf16be" | "gb18030" | "big5" | "shift_jis" | "latin1";
export type HistoryTaskStatus = TaskStatus | "running" | "interrupted";

export interface ConversionRecord {
  id: string;
  toolType: ToolType;
  sourcePath: string;
  outputPath: string;
  status: HistoryTaskStatus;
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
  items?: ConversionItemResult[];
}

export interface ConversionItemResult {
  inputPath: string;
  outputPath?: string;
  status: "success" | "error" | "skipped";
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

export type SvgOutputFormat = "svg" | "png" | "webp";

export interface SvgToolboxOptions {
  inputPaths: string[];
  outputDir: string;
  outputFormat: SvgOutputFormat;
  precision: number;
  removeDimensions: boolean;
  cleanupIds: boolean;
  width?: number;
  height?: number;
  quality?: number;
}

export interface PwaIconPackageOptions {
  inputPaths: string[];
  outputDir: string;
  appName: string;
  shortName: string;
  themeColor: string;
  backgroundColor: string;
  maskablePadding: number;
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
  keepOriginalName: boolean;
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

export interface VideoCompressOptions {
  inputPaths: string[];
  outputDir: string;
  crf: number;
  width?: number;
  preset: "slow" | "medium" | "fast";
  keepAudio: boolean;
  audioBitrate?: string;
}

export interface MediaInfo {
  durationSeconds: number | null;
  bitrate: string;
  format: string;
  videoCodec: string;
  audioCodec: string;
  resolution: string;
  fps: string;
  sampleRate: string;
  channels: string;
  raw: string;
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

export interface AudioCompressOptions {
  inputPaths: string[];
  outputDir: string;
  outputFormat: "mp3" | "aac" | "ogg" | "m4a";
  bitrate: string;
  sampleRate?: number;
}

export interface CodeMinifyOptions {
  inputPaths: string[];
  outputDir: string;
  removeConsole: boolean;
  beautify: boolean;
  target: "defaults" | "legacy";
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
  dryRun?: boolean;
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
  sharePath: string;
  authMode: "windows" | "account";
  username: string;
  password: string;
  defaultDirectory: string;
  rememberCredentials: boolean;
  hasSavedPassword?: boolean;
  migrationNotice?: string;
}

export interface SharedDiskConnectResult {
  shareRoot: string;
  baseUncPath: string;
  defaultDirectory: string;
  message: string;
}

export interface SharedDiskSession {
  shareRoot: string;
  username: string;
  openFiles: number;
}

export interface SharedDiskStatus {
  connected: boolean;
  shareRoot: string;
  message: string;
  state?: "connected" | "disconnected" | "unknown";
  username?: string;
  sessions?: SharedDiskSession[];
}

export type AppCloseBehavior = "minimize-to-tray" | "exit";

export interface AppSettings {
  closeBehavior: AppCloseBehavior;
  autoLaunch: boolean;
}

export type ToolConfigKey = "navigation" | "output-picker";

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

export interface OpenDirectoryResult {
  status: "opened" | "blocked" | "missing";
  path: string;
  message?: string;
}

export type StickyNoteStatus = "active" | "archived" | "trashed";

export interface StickyNoteStyle {
  fontFamily: string;
  fontSize: number;
  lineHeight: number;
  padding: number;
  color?: string;
  backgroundColor?: string;
}

export interface StickyNotesPreferences extends StickyNoteStyle {}

export type StickyNoteExportFormat = "json" | "txt" | "zip";

export interface StickyNoteExportOptions {
  outputDir: string;
  ids?: string[];
  format: StickyNoteExportFormat;
  includeArchived?: boolean;
  includeTrash?: boolean;
}

export interface StickyNotesImportResult {
  imported: number;
  skipped: number;
  notes: StickyNote[];
}

export interface StickyNote {
  id: string;
  fileName: string;
  filePath: string;
  title: string;
  content: string;
  updatedAt: number;
  pinned: boolean;
  status: StickyNoteStatus;
  style: StickyNoteStyle;
  createdAt: number;
  archivedAt: number | null;
  trashedAt: number | null;
}

export interface StickyNotesState {
  directory: string;
  databasePath: string;
  notes: StickyNote[];
  archivedNotes: StickyNote[];
  trashNotes: StickyNote[];
  preferences: StickyNotesPreferences;
}

export interface DevToolboxApi {
  selectFiles(filters?: DialogFileFilter[], multiSelections?: boolean): Promise<string[]>;
  selectOutputDir(defaultPath?: string): Promise<string | null>;
  pathExists(targetPath: string): Promise<boolean>;
  openDirectory(targetPath: string): Promise<OpenDirectoryResult>;
  convertFavicon(options: FaviconOptions): Promise<ConversionResult>;
  processSvgFiles(options: SvgToolboxOptions): Promise<ConversionResult>;
  generatePwaIconPackages(options: PwaIconPackageOptions): Promise<ConversionResult>;
  convertWebp(options: WebpOptions): Promise<ConversionResult>;
  compressImages(options: ImageCompressOptions): Promise<ConversionResult>;
  resizeImages(options: ImageResizeOptions): Promise<ConversionResult>;
  cropImage(options: ImageCropOptions): Promise<ConversionResult>;
  applyWatermark(options: WatermarkOptions): Promise<ConversionResult>;
  generateImagePlaceholders(options: ImagePlaceholderOptions): Promise<ConversionResult>;
  convertFontWoff2(options: FontWoff2Options): Promise<ConversionResult>;
  subsetFont(options: FontSubsetOptions): Promise<ConversionResult>;
  convertVideoBackground(options: VideoBackgroundOptions): Promise<ConversionResult>;
  convertSequenceAnimation(options: SequenceAnimationOptions): Promise<ConversionResult>;
  convertVideoAnimation(options: VideoAnimationOptions): Promise<ConversionResult>;
  removeVideoAudio(options: VideoMuteOptions): Promise<ConversionResult>;
  compressVideos(options: VideoCompressOptions): Promise<ConversionResult>;
  getMediaInfo(inputPath: string): Promise<MediaInfo>;
  convertAudio(options: AudioConvertOptions): Promise<ConversionResult>;
  compressAudio(options: AudioCompressOptions): Promise<ConversionResult>;
  minifyCode(options: CodeMinifyOptions): Promise<ConversionResult>;
  exportMarkdown(options: MarkdownExportOptions): Promise<ConversionResult>;
  renameFiles(options: RenameOptions): Promise<ConversionResult>;
  generateQrCode(options: QrCodeOptions): Promise<ConversionResult>;
  getIpInfo(): Promise<IpInfo>;
  lookupDomainIp(domain: string): Promise<DomainIpLookupResult>;
  scanCertificates(options: CertificateScanOptions): Promise<CertificateScanResult[]>;
  generateAssetManifest(options: AssetManifestOptions): Promise<ConversionResult>;
  generateSeoFiles(options: SeoFilesOptions): Promise<ConversionResult>;
  generateOgImage(options: OgImageOptions): Promise<ConversionResult>;
  getDroppedFilePaths(files: unknown[]): string[];
  loadSharedDiskConfig(): Promise<SharedDiskConfig>;
  saveSharedDiskConfig(config: SharedDiskConfig): Promise<SharedDiskConfig>;
  connectSharedDisk(config: SharedDiskConfig): Promise<SharedDiskConnectResult>;
  disconnectSharedDisk(config: { sharePath: string }): Promise<SharedDiskConnectResult>;
  getSharedDiskStatus(config: { sharePath: string }): Promise<SharedDiskStatus>;
  forgetSharedDiskCredentials(): Promise<SharedDiskConfig>;
  openSharedDiskDirectory(targetPath: string): Promise<string>;
  openExistingSharedDiskDirectory(config: { sharePath: string; defaultDirectory: string }): Promise<string>;
  imageToBase64(inputPath: string): Promise<Base64ImageResult>;
  base64ToImage(data: string, outputDir: string, fileName: string): Promise<ConversionResult>;
  listHistory(limit?: number): Promise<ConversionRecord[]>;
  openHistoryOutput(recordId: string): Promise<OpenDirectoryResult>;
  clearHistory(): Promise<void>;
  revealPath(filePath: string): Promise<void>;
  openExternal(url: string): Promise<void>;
  readTextFile(filePath: string, encoding?: TextFileEncoding): Promise<string>;
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
  getUpdateState(): Promise<UpdateStatus>;
  /** 监听更新状态变化，返回取消监听的函数 */
  onUpdateStatus(handler: (status: UpdateStatus) => void): () => void;
  /** 通知主进程更新标题栏背景色 */
  setThemeBackground(payload: ThemeTitleBarPayload): void;
  getWindowState(): Promise<WindowFrameState>;
  minimizeWindow(): Promise<WindowFrameState>;
  toggleMaximizeWindow(): Promise<WindowFrameState>;
  closeWindow(): Promise<void>;
  reloadWindow(): Promise<void>;
  /** Flush renderer-owned drafts before reload, close, or update install. */
  onBeforeWindowAction(handler: () => void | Promise<void>): () => void;
  onWindowStateChange(handler: (state: WindowFrameState) => void): () => void;
  getAlwaysOnTop(): Promise<boolean>;
  setAlwaysOnTop(enabled: boolean): Promise<boolean>;
  loadStickyNotes(): Promise<StickyNotesState>;
  setStickyNotesDirectory(directory: string): Promise<StickyNotesState>;
  createStickyNote(content?: string): Promise<StickyNote>;
  saveStickyNote(id: string, content: string): Promise<StickyNote>;
  setStickyNotePinned(id: string, pinned: boolean): Promise<StickyNotesState>;
  archiveStickyNote(id: string, archived: boolean): Promise<StickyNotesState>;
  deleteStickyNote(id: string): Promise<void>;
  restoreStickyNote(id: string): Promise<StickyNotesState>;
  emptyStickyNotesTrash(): Promise<StickyNotesState>;
  saveStickyNotesPreferences(preferences: StickyNotesPreferences): Promise<StickyNotesState>;
  applyStickyNotePreset(id: string | null, scope: "current" | "all", style: StickyNoteStyle): Promise<StickyNotesState>;
  importStickyNotes(inputPaths: string[]): Promise<StickyNotesImportResult>;
  exportStickyNotes(outputDirOrOptions: string | StickyNoteExportOptions, ids?: string[]): Promise<string[]>;
}

/** 更新状态 */
export interface UpdateStatus {
  status: "idle" | "disabled" | "checking" | "available" | "not-available" | "downloading" | "downloaded" | "installing" | "error";
  activeTasks?: number;
  version?: string;
  percent?: number;
  message?: string;
}
