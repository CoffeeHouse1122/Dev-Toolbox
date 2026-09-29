import type { AppUpdater } from "electron-updater";
import type { UpdateStatus } from "../../../shared/types";
import type { UpdateTaskGate } from "./update-task-gate";

type UpdateClient = Pick<AppUpdater, "on" | "autoDownload" | "autoInstallOnAppQuit" | "allowPrerelease" | "allowDowngrade" | "checkForUpdates" | "downloadUpdate" | "quitAndInstall">;

export function supportsUpdates(packaged: boolean, platform: string, arch: string) {
  return packaged && platform === "win32" && arch === "x64";
}

export class UpdateController {
  private state: UpdateStatus;
  private timer: ReturnType<typeof setTimeout> | undefined;
  private requestRunning = false;

  constructor(
    private readonly client: UpdateClient,
    enabled: boolean,
    private readonly gate: UpdateTaskGate,
    private readonly publish: (state: UpdateStatus) => void,
    private readonly prepareInstall: () => Promise<boolean>,
    private readonly setInstalling: (value: boolean) => void
  ) {
    this.state = { status: enabled ? "idle" : "disabled", message: enabled ? "尚未检查更新" : "仅已打包的 Windows x64 版本支持更新" };
    client.autoDownload = false;
    client.autoInstallOnAppQuit = false;
    client.allowPrerelease = false;
    client.allowDowngrade = false;
    gate.subscribe(() => this.publish(this.getState()));
    if (!enabled) return;
    client.on("update-available", (info) => {
      if (this.state.status === "checking") this.change({ status: "available", version: info.version, message: `发现新版本 v${info.version}，可下载更新` });
    });
    client.on("update-not-available", () => {
      if (this.state.status === "checking") this.change({ status: "not-available", version: undefined, message: "当前已是最新版本" });
    });
    client.on("download-progress", (progress) => {
      if (this.state.status !== "downloading") return;
      const percent = Math.round(Math.max(0, Math.min(100, Number.isFinite(progress.percent) ? progress.percent : 0)));
      this.change({ percent, message: `正在下载更新 ${percent}%` });
    });
    client.on("update-downloaded", (info) => {
      if (this.state.status === "downloading") this.change({ status: "downloaded", version: info.version, percent: 100, message: `v${info.version} 已下载，保存并重启后安装` });
    });
    client.on("error", () => this.fail());
  }

  getState(): UpdateStatus { return { ...this.state, activeTasks: this.gate.activeTasks }; }

  private change(next: Partial<UpdateStatus>) {
    this.state = { ...this.state, ...next };
    this.publish(this.getState());
  }

  private fail() {
    if (this.state.status === "disabled") return;
    if (this.state.status === "installing") {
      this.gate.endInstall();
      this.setInstalling(false);
      // electron-updater can retain its internal install claim after an asynchronous spawn failure.
      this.change({ status: "disabled", message: "安装启动失败，请重新启动应用后重试" });
      return;
    }
    this.change({ status: "error", percent: undefined, message: "更新失败，请检查网络或稍后重新检查更新" });
  }

  start() {
    if (this.state.status === "disabled" || this.timer) return;
    this.timer = setTimeout(() => { this.timer = undefined; void this.check(); }, 12_000);
    this.timer.unref();
  }

  stop() { if (this.timer) clearTimeout(this.timer); this.timer = undefined; }

  async check() {
    if (this.requestRunning || !["idle", "available", "not-available", "error"].includes(this.state.status)) return;
    this.requestRunning = true;
    this.change({ status: "checking", version: undefined, percent: undefined, message: "正在检查更新…" });
    try { await this.client.checkForUpdates(); } catch { this.fail(); }
    finally { this.requestRunning = false; }
  }

  async download() {
    if (this.requestRunning || this.state.status !== "available") return;
    this.requestRunning = true;
    this.change({ status: "downloading", percent: 0, message: "正在下载更新 0%" });
    try { await this.client.downloadUpdate(); } catch { this.fail(); }
    finally { this.requestRunning = false; }
  }

  async install() {
    if (this.state.status === "installing") return;
    if (this.requestRunning) throw new Error("更新请求仍在处理中，请稍后再试");
    if (this.state.status !== "downloaded") throw new Error("请先下载更新");
    // Claim before the save barrier yields so duplicate installs and new tasks cannot race it.
    this.gate.beginInstall();
    this.change({ status: "installing", message: "正在保存并准备安装…" });
    try {
      if (!(await this.prepareInstall())) throw new Error("便签或草稿保存失败，已取消安装更新");
    } catch (error) {
      this.gate.endInstall();
      this.change({ status: "downloaded", message: "便签或草稿保存失败，请保存后重试安装" });
      throw error;
    }
    if (this.getState().status !== "installing") return;
    try {
      this.setInstalling(true);
      this.client.quitAndInstall(false, true);
    } catch { if (this.getState().status === "installing") this.fail(); }
  }
}
