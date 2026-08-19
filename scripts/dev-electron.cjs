const fs = require("node:fs");
const path = require("node:path");
const { spawn } = require("node:child_process");
const waitOn = require("wait-on");
const { prepareBuildConfig } = require("./prepare-build-config.cjs");

const projectRoot = path.resolve(__dirname, "..");
const electronExecutable = require("electron");
const tscEntry = require.resolve("typescript/bin/tsc");
const devServerUrl = process.env.VITE_DEV_SERVER_URL || "http://127.0.0.1:5173";
const watchDirectories = [
  path.join(projectRoot, "src", "electron"),
  path.join(projectRoot, "src", "shared")
];
const watchFiles = [path.join(projectRoot, "tsconfig.node.json")];

let buildProcess = null;
let electronProcess = null;
let rebuildTimer = null;
let buildCycleRunning = false;
let rebuildQueued = false;
let shuttingDown = false;
let launchCount = 0;
const watchers = [];

function log(message) {
  console.log(`[electron-dev] ${message}`);
}

function rendererWaitResource() {
  const parsedUrl = new URL(devServerUrl);
  if (parsedUrl.protocol !== "http:" && parsedUrl.protocol !== "https:") {
    throw new Error(`Unsupported renderer development URL: ${devServerUrl}`);
  }
  const port = parsedUrl.port || (parsedUrl.protocol === "https:" ? "443" : "80");
  return `tcp:${parsedUrl.hostname}:${port}`;
}

function compileMain() {
  log("Building main and preload...");
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [tscEntry, "-p", "tsconfig.node.json"], {
      cwd: projectRoot,
      env: process.env,
      stdio: "inherit",
      windowsHide: true
    });
    buildProcess = child;
    child.once("error", (error) => {
      if (buildProcess === child) buildProcess = null;
      console.error(`[electron-dev] TypeScript compiler failed to start: ${error.message}`);
      resolve(false);
    });
    child.once("exit", (code, signal) => {
      if (buildProcess === child) buildProcess = null;
      if (signal && !shuttingDown) {
        console.error(`[electron-dev] TypeScript compiler stopped by ${signal}.`);
      }
      resolve(code === 0);
    });
  });
}

function waitForExit(child, timeoutMs) {
  if (child.exitCode !== null || child.signalCode !== null) return Promise.resolve();
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, timeoutMs);
    child.once("exit", () => {
      clearTimeout(timer);
      resolve();
    });
  });
}

async function stopElectron() {
  const child = electronProcess;
  electronProcess = null;
  if (!child || child.exitCode !== null || child.signalCode !== null) return;

  if (process.platform === "win32" && child.pid) {
    await new Promise((resolve) => {
      const killer = spawn("taskkill", ["/PID", String(child.pid), "/T", "/F"], {
        stdio: "ignore",
        windowsHide: true
      });
      killer.once("error", () => {
        child.kill();
        resolve();
      });
      killer.once("exit", resolve);
    });
  } else {
    child.kill("SIGTERM");
    await waitForExit(child, 3_000);
    if (child.exitCode === null && child.signalCode === null) child.kill("SIGKILL");
  }
}

function startElectron() {
  launchCount += 1;
  const child = spawn(electronExecutable, [projectRoot], {
    cwd: projectRoot,
    env: { ...process.env, VITE_DEV_SERVER_URL: devServerUrl },
    stdio: "inherit"
  });
  electronProcess = child;
  child.once("error", (error) => {
    if (electronProcess === child) electronProcess = null;
    console.error(`[electron-dev] Electron failed to start: ${error.message}`);
  });
  child.once("exit", (code, signal) => {
    if (electronProcess !== child) return;
    electronProcess = null;
    if (!shuttingDown) {
      log(`Electron exited${signal ? ` (${signal})` : ` with code ${code ?? "unknown"}`}; waiting for a source change.`);
    }
  });
  log(`Electron ${launchCount === 1 ? "started" : "restarted"} (PID ${child.pid}).`);
}

async function restartElectron() {
  await stopElectron();
  if (!shuttingDown) startElectron();
}

async function runBuildCycle() {
  if (buildCycleRunning) {
    rebuildQueued = true;
    return;
  }

  buildCycleRunning = true;
  do {
    rebuildQueued = false;
    const compiled = await compileMain();
    if (compiled && !shuttingDown) {
      try {
        const config = prepareBuildConfig(projectRoot);
        log(`Update feed build config: ${config.configured ? "configured" : "disabled"}.`);
        await restartElectron();
      } catch (error) {
        console.error(`[electron-dev] Build configuration failed: ${error instanceof Error ? error.message : String(error)}`);
      }
    } else if (!compiled && !shuttingDown) {
      log("Build failed; the currently running Electron process was kept alive.");
    }
  } while (rebuildQueued && !shuttingDown);
  buildCycleRunning = false;
}

function scheduleRebuild(changedPath) {
  if (shuttingDown) return;
  clearTimeout(rebuildTimer);
  rebuildTimer = setTimeout(() => {
    log(`Change detected: ${path.relative(projectRoot, changedPath) || changedPath}`);
    void runBuildCycle();
  }, 150);
}

function watchDirectory(directory) {
  const watcher = fs.watch(directory, { recursive: true }, (_eventType, fileName) => {
    if (fileName && !/\.(?:[cm]?ts|json)$/i.test(fileName)) return;
    scheduleRebuild(fileName ? path.join(directory, fileName) : directory);
  });
  watcher.on("error", (error) => {
    console.error(`[electron-dev] Watcher failed for ${directory}: ${error.message}`);
  });
  watchers.push(watcher);
}

function watchFile(filePath) {
  const watcher = fs.watch(filePath, () => scheduleRebuild(filePath));
  watcher.on("error", (error) => {
    console.error(`[electron-dev] Watcher failed for ${filePath}: ${error.message}`);
  });
  watchers.push(watcher);
}

async function shutdown(signal, exitCode = 0) {
  if (shuttingDown) return;
  shuttingDown = true;
  clearTimeout(rebuildTimer);
  log(`Stopping${signal ? ` (${signal})` : ""}...`);
  for (const watcher of watchers) watcher.close();
  if (buildProcess && buildProcess.exitCode === null && buildProcess.signalCode === null) {
    buildProcess.kill("SIGTERM");
  }
  await stopElectron();
  process.exit(exitCode);
}

process.once("SIGINT", () => void shutdown("SIGINT"));
process.once("SIGTERM", () => void shutdown("SIGTERM"));
process.once("uncaughtException", (error) => {
  console.error(error);
  void shutdown("uncaughtException", 1);
});
process.once("unhandledRejection", (error) => {
  console.error(error);
  void shutdown("unhandledRejection", 1);
});

async function main() {
  log(`Waiting for renderer at ${devServerUrl}...`);
  await waitOn({ resources: [rendererWaitResource()] });
  if (shuttingDown) return;
  for (const directory of watchDirectories) watchDirectory(directory);
  for (const filePath of watchFiles) watchFile(filePath);
  await runBuildCycle();
}

void main().catch((error) => {
  console.error(`[electron-dev] Startup failed: ${error instanceof Error ? error.message : String(error)}`);
  void shutdown("startup failure", 1);
});
