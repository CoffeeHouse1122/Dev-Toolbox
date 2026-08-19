const test = require("node:test");
const assert = require("node:assert/strict");
const { EventEmitter } = require("node:events");
const fs = require("node:fs/promises");
const Module = require("node:module");
const os = require("node:os");
const path = require("node:path");

const originalLoad = Module._load;
const actualChildProcess = require("node:child_process");
let userDataDir = os.tmpdir();
let encryptionAvailable = true;
let netUseOutput = "";
let dnsLookup = async () => [];
const spawnCalls = [];
const failingSpawnCalls = new Set();

const electronMock = {
  app: {
    getPath(name) {
      assert.equal(name, "userData");
      return userDataDir;
    }
  },
  net: {
    async fetch() {
      throw new Error("Unexpected Electron network request");
    }
  },
  safeStorage: {
    isEncryptionAvailable: () => encryptionAvailable,
    encryptString(value) {
      return Buffer.from(`encrypted:${value}`, "utf8");
    },
    decryptString(value) {
      const decoded = value.toString("utf8");
      if (!decoded.startsWith("encrypted:")) throw new Error("Invalid encrypted value");
      return decoded.slice("encrypted:".length);
    }
  },
  shell: {
    async openPath() {
      return "";
    }
  }
};

function mockedSpawn(command, args, options) {
  const child = new EventEmitter();
  child.stdout = new EventEmitter();
  child.stderr = new EventEmitter();
  spawnCalls.push({ command, args: [...args], options });
  const spawnCallNumber = spawnCalls.length;

  queueMicrotask(async () => {
    try {
      if (command === "net" && args.length === 1 && args[0] === "use") {
        child.stdout.emit("data", Buffer.from(netUseOutput));
        child.emit("close", 0);
        return;
      }

      if (failingSpawnCalls.has(spawnCallNumber)) {
        child.stderr.emit("data", Buffer.from("mock ffmpeg failure"));
        child.emit("close", 1);
        return;
      }

      // Audio/video services place their atomic temporary output last.
      const outputPath = args.at(-1);
      if (typeof outputPath === "string" && path.isAbsolute(outputPath)) {
        await fs.mkdir(path.dirname(outputPath), { recursive: true });
        await fs.writeFile(outputPath, Buffer.from("mock-media-output"));
      }
      child.stderr.emit("data", Buffer.from("mock ffmpeg completed"));
      child.emit("close", 0);
    } catch (error) {
      child.emit("error", error);
    }
  });
  return child;
}

Module._load = function loadForMainServiceTests(request, parent, isMain) {
  if (request === "electron") return electronMock;
  if (request === "node:dns/promises") return { lookup: (...args) => dnsLookup(...args) };
  if (request === "node:child_process") return { ...actualChildProcess, spawn: mockedSpawn };
  return originalLoad.call(this, request, parent, isMain);
};

const { minifyCode } = require("../dist/electron/main/services/code-minify.service.js");
const { getIpInfo, lookupDomainIp } = require("../dist/electron/main/services/network.service.js");
const { convertFontsToWoff2 } = require("../dist/electron/main/services/font.service.js");
const { convertAudio } = require("../dist/electron/main/services/audio.service.js");
const { compressVideos, createVideoBackgroundPack } = require("../dist/electron/main/services/video.service.js");
const { loadSharedDiskConfig, saveSharedDiskConfig, connectSharedDisk } = require("../dist/electron/main/services/shared-disk.service.js");
const { getSharedDiskStatus } = require("../dist/electron/main/services/shared-disk-status.service.js");
Module._load = originalLoad;

function createHistory() {
  const starts = [];
  const finishes = [];
  return {
    starts,
    finishes,
    async startTask(value) { starts.push(value); },
    async finishTask(...value) { finishes.push(value); }
  };
}

async function withTempDir(run) {
  const directory = await fs.mkdtemp(path.join(os.tmpdir(), "dev-toolbox-main-services-"));
  try {
    return await run(directory);
  } finally {
    await fs.rm(directory, { recursive: true, force: true });
  }
}

test("code minifier drops every console call, emits a source map, and reports unsupported items as partial", async () => {
  await withTempDir(async (directory) => {
    const input = path.join(directory, "app.js");
    const unsupported = path.join(directory, "notes.txt");
    const outputDir = path.join(directory, "output");
    await fs.writeFile(input, `window.answer = () => { console.log("debug"); console.warn("warn"); return 42; };\n//# sourceMappingURL=missing.map\n`);
    await fs.writeFile(unsupported, "plain text");
    const history = createHistory();

    const result = await minifyCode(
      { inputPaths: [unsupported, input], outputDir, removeConsole: true, beautify: false, target: "defaults" },
      history
    );

    assert.equal(result.status, "partial");
    assert.deepEqual(result.items.map((item) => item.status), ["error", "success"]);
    assert.match(result.items[0].errorMessage, /不支持的文件类型/);
    assert.equal(result.files.length, 2);
    const codePath = result.files.find((file) => file.endsWith(".min.js"));
    const mapPath = result.files.find((file) => file.endsWith(".map"));
    assert.ok(codePath && mapPath);
    const output = await fs.readFile(codePath, "utf8");
    assert.doesNotMatch(output, /console\.(?:log|warn)/);
    assert.match(output, /sourceMappingURL=/);
    const sourceMap = JSON.parse(await fs.readFile(mapPath, "utf8"));
    assert.equal(sourceMap.version, 3);
    assert.ok(sourceMap.sources.some((source) => source.endsWith("app.js")));
    assert.equal(history.finishes.at(-1)[1], "partial");
  });
});

test("domain lookup normalizes a full URL and maps IPv4/IPv6 records", async () => {
  let requestedHost = "";
  dnsLookup = async (host, options) => {
    requestedHost = host;
    assert.deepEqual(options, { all: true, verbatim: false });
    return [{ address: "203.0.113.7", family: 4 }, { address: "2001:db8::7", family: 6 }];
  };

  const result = await lookupDomainIp("https://example.test:8443/docs?q=1");
  assert.equal(requestedHost, "example.test");
  assert.equal(result.status, "success");
  assert.deepEqual(result.addresses, [
    { family: "IPv4", address: "203.0.113.7" },
    { family: "IPv6", address: "2001:db8::7" }
  ]);
});

test("external IP lookup falls back from global fetch to concurrent Electron sources without waiting serially", async () => {
  const originalFetch = global.fetch;
  global.fetch = async () => { throw new Error("global transport unavailable"); };
  electronMock.net.fetch = async (url) => {
    if (String(url).includes("api.ip.sb")) return new Response("198.51.100.42\n", { status: 200 });
    throw new Error("source unavailable");
  };
  try {
    const result = await getIpInfo();
    assert.equal(result.externalIp, "198.51.100.42");
    assert.equal(result.externalSource, "ip.sb / electron");
  } finally {
    global.fetch = originalFetch;
  }
});

test("font conversion preserves WOFF2 bytes and infers family, weight, and style per file", async () => {
  await withTempDir(async (directory) => {
    const input = path.join(directory, "Acme-SemiBold-Italic.woff2");
    const outputDir = path.join(directory, "output");
    const bytes = Buffer.from("mock-woff2");
    await fs.writeFile(input, bytes);
    const result = await convertFontsToWoff2(
      { inputPaths: [input], outputDir, generateCss: true },
      createHistory()
    );

    assert.equal(result.status, "success");
    const fontPath = result.files.find((file) => file.endsWith(".woff2"));
    assert.ok(fontPath);
    assert.deepEqual(await fs.readFile(fontPath), bytes);
    const css = await fs.readFile(path.join(outputDir, "fonts.css"), "utf8");
    assert.match(css, /font-family: "Acme"/);
    assert.match(css, /font-weight: 600/);
    assert.match(css, /font-style: italic/);
  });
});

test("audio conversion uses the AAC codec for M4A and commits only the final output", async () => {
  await withTempDir(async (directory) => {
    spawnCalls.length = 0;
    const input = path.join(directory, "中文音频.wav");
    const outputDir = path.join(directory, "output");
    await fs.writeFile(input, "mock input");
    const result = await convertAudio(
      { inputPaths: [input], outputDir, outputFormat: "m4a", bitrate: "128k", sampleRate: 44100 },
      createHistory()
    );

    assert.equal(result.status, "success");
    assert.equal(path.extname(result.files[0]), ".m4a");
    const args = spawnCalls.at(-1).args;
    assert.ok(args.includes("aac"));
    assert.deepEqual(args.slice(args.indexOf("-b:a"), args.indexOf("-b:a") + 2), ["-b:a", "128k"]);
    assert.deepEqual(args.slice(args.indexOf("-ar"), args.indexOf("-ar") + 2), ["-ar", "44100"]);
    assert.deepEqual((await fs.readdir(outputDir)).filter((name) => name.includes(".part-")), []);
  });
});

test("video compression maps only video and disables audio when keepAudio is false", async () => {
  await withTempDir(async (directory) => {
    spawnCalls.length = 0;
    const input = path.join(directory, "演示视频.mov");
    const outputDir = path.join(directory, "output");
    await fs.writeFile(input, Buffer.alloc(100, 1));
    const result = await compressVideos(
      { inputPaths: [input], outputDir, crf: 24, width: 1280, preset: "medium", keepAudio: false },
      createHistory()
    );

    assert.equal(result.status, "success");
    const args = spawnCalls.at(-1).args;
    assert.deepEqual(args.slice(args.indexOf("-map"), args.indexOf("-map") + 2), ["-map", "0:v:0"]);
    assert.ok(args.includes("-an"));
    assert.equal(args.includes("0:a?"), false);
    assert.equal(path.basename(result.files[0]), "演示视频-compressed.mp4");
    assert.deepEqual((await fs.readdir(outputDir)).filter((name) => name.includes(".part-")), []);
  });
});

test("video background pack leaves every previous artifact intact when generation fails", async () => {
  await withTempDir(async (directory) => {
    spawnCalls.length = 0;
    failingSpawnCalls.clear();
    failingSpawnCalls.add(2);
    failingSpawnCalls.add(3);
    const input = path.join(directory, "背景视频.mov");
    const outputDir = path.join(directory, "output");
    const previousMp4 = path.join(outputDir, "background.mp4");
    const previousWebm = path.join(outputDir, "background.webm");
    await fs.mkdir(outputDir, { recursive: true });
    await fs.writeFile(input, "mock input");
    await fs.writeFile(previousMp4, "previous mp4");
    await fs.writeFile(previousWebm, "previous webm");

    try {
      const result = await createVideoBackgroundPack(
        { inputPath: input, outputDir, mode: "background-pack", crf: 24, makePoster: false },
        createHistory()
      );

      assert.equal(result.status, "error");
      assert.deepEqual(result.files, []);
      assert.equal(await fs.readFile(previousMp4, "utf8"), "previous mp4");
      assert.equal(await fs.readFile(previousWebm, "utf8"), "previous webm");
      assert.deepEqual((await fs.readdir(outputDir)).filter((name) => name.startsWith(".video-background.")), []);
    } finally {
      failingSpawnCalls.clear();
    }
  });
});

test("shared-disk config never persists plaintext and decrypts only through safeStorage", async () => {
  await withTempDir(async (directory) => {
    userDataDir = directory;
    encryptionAvailable = true;
    const config = {
      url: "http://files.example.test:5000",
      username: " developer ",
      password: "top-secret-password",
      basePath: "team/assets",
      defaultDirectory: "",
      persistent: true
    };
    await saveSharedDiskConfig(config);
    const storedPath = path.join(directory, "data", "shared-disk.json");
    const storedText = await fs.readFile(storedPath, "utf8");
    assert.doesNotMatch(storedText, /top-secret-password/);
    const stored = JSON.parse(storedText);
    assert.equal(stored.encrypted, true);
    const loaded = await loadSharedDiskConfig();
    assert.equal(loaded.username, "developer");
    assert.equal(loaded.password, "top-secret-password");

    encryptionAvailable = false;
    await saveSharedDiskConfig({ ...config, password: "must-not-hit-disk" });
    const unavailable = JSON.parse(await fs.readFile(storedPath, "utf8"));
    assert.equal(unavailable.password, "");
    assert.equal(unavailable.encrypted, false);
    await assert.rejects(connectSharedDisk({ ...config, basePath: "" }), /基础路径至少需要包含共享名/);
  });
});

test("shared-disk status distinguishes an active mapping from a disconnected record", async () => {
  const config = {
    url: "http://files.example.test:5000",
    username: "developer",
    password: "secret",
    basePath: "team/assets",
    defaultDirectory: "",
    persistent: true
  };
  netUseOutput = "OK           \\\\files.example.test\\team     Microsoft Windows Network\r\n";
  const connected = await getSharedDiskStatus(config);
  assert.equal(connected.connected, true);
  assert.equal(connected.shareRoot, "\\\\files.example.test\\team");

  netUseOutput = "Disconnected \\\\files.example.test\\team     Microsoft Windows Network\r\n";
  const disconnected = await getSharedDiskStatus(config);
  assert.equal(disconnected.connected, false);
  assert.match(disconnected.message, /未连接|重新登录/);
});
