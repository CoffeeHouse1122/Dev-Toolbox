/** Prevent installation from interrupting output writes, and new work during installation. */
export class UpdateTaskGate {
  private count = 0;
  private installing = false;
  private listeners = new Set<() => void>();

  get activeTasks() { return this.count; }

  subscribe(listener: () => void) {
    this.listeners.add(listener);
    return () => { this.listeners.delete(listener); };
  }

  async run<T>(operation: () => T | Promise<T>): Promise<T> {
    if (this.installing) throw new Error("正在准备安装更新，请重启后再处理文件");
    this.count += 1;
    this.notify();
    try { return await operation(); }
    finally { this.count -= 1; this.notify(); }
  }

  beginInstall() {
    if (this.installing) throw new Error("更新正在安装，请勿重复操作");
    if (this.count) throw new Error("文件任务正在处理，请完成后再安装更新");
    this.installing = true;
  }

  endInstall() { this.installing = false; }

  private notify() { for (const listener of this.listeners) listener(); }
}

export const updateTaskGate = new UpdateTaskGate();

export function isUpdateBlockingTask(channel: string) {
  return channel.startsWith("convert:") || [
    "files:rename", "qr:generate", "assets:manifest", "assets:image-placeholder",
    "seo:files", "seo:og-image", "base64:image-to-base64", "base64:base64-to-image",
    "file:read-text", "file:write-text", "notes:import", "notes:export", "notes:set-directory"
  ].includes(channel);
}
