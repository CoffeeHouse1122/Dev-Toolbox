import { app } from "electron";
import fs from "node:fs/promises";
import net from "node:net";
import path from "node:path";
import type { AppDiagnostics, PortDiagnostic } from "../../../shared/types";

function logsDir() {
  try {
    return app.getPath("logs");
  } catch {
    return path.join(app.getPath("userData"), "logs");
  }
}

function checkPort(port: number, label: string): Promise<PortDiagnostic> {
  return new Promise((resolve) => {
    const server = net.createServer();
    server.once("error", () => resolve({ label, port, inUse: true }));
    server.once("listening", () => {
      server.close(() => resolve({ label, port, inUse: false }));
    });
    server.listen(port, "127.0.0.1");
  });
}

export async function getAppDiagnostics(): Promise<AppDiagnostics> {
  const userDataDir = app.getPath("userData");
  const appLogsDir = logsDir();
  await fs.mkdir(appLogsDir, { recursive: true });

  const ports = [await checkPort(5173, "Vite 开发服务")];

  return { userDataDir, logsDir: appLogsDir, ports };
}
