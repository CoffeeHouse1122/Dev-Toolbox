const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

const {
  assertAuthorizedPath,
  assertSharedDiskTarget,
  authorizeDroppedPaths,
  authorizeExistingPath,
  authorizeUserSelectedPaths,
  getSharedDiskBaseRoot,
  getSharedDiskShareRoot,
  initializePathAuthorization,
  isAllowedRendererPermission,
  isAuthorizedPath,
  parseBooleanPayload,
  parseTitleBarThemePayload,
  parseUuidPayload,
  parseWindowActionReadyPayload,
  validateExternalUrl
} = require("../dist/electron/main/utils/ipc-security.js");

test("path authorization allows userData and explicit grants but rejects neighboring paths", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dev-toolbox-security-"));
  try {
    const userData = path.join(root, "user-data");
    const selectedDirectory = path.join(root, "selected");
    const selectedFile = path.join(root, "single.txt");
    const neighboringFile = path.join(root, "single-copy.txt");
    fs.mkdirSync(userData, { recursive: true });
    fs.mkdirSync(selectedDirectory, { recursive: true });
    fs.writeFileSync(selectedFile, "selected");
    fs.writeFileSync(neighboringFile, "not selected");

    initializePathAuthorization(userData);
    assert.equal(isAuthorizedPath(path.join(userData, "data", "future.json")), true);
    assert.equal(isAuthorizedPath(selectedFile), false);

    authorizeUserSelectedPaths([selectedFile]);
    assert.equal(isAuthorizedPath(selectedFile), true);
    assert.equal(isAuthorizedPath(neighboringFile), false);

    authorizeUserSelectedPaths([selectedDirectory], true);
    assert.equal(isAuthorizedPath(path.join(selectedDirectory, "nested", "output.png")), true);
    assert.equal(isAuthorizedPath(`${selectedDirectory}-other${path.sep}output.png`), false);
    assert.throws(() => assertAuthorizedPath(neighboringFile), /not user-authorized/i);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("directory grants resolve symlinks and do not permit escaping the selected tree", (t) => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dev-toolbox-symlink-"));
  try {
    const userData = path.join(root, "user-data");
    const selectedDirectory = path.join(root, "selected");
    const outsideDirectory = path.join(root, "outside");
    const linkPath = path.join(selectedDirectory, "escape");
    fs.mkdirSync(userData);
    fs.mkdirSync(selectedDirectory);
    fs.mkdirSync(outsideDirectory);
    fs.writeFileSync(path.join(outsideDirectory, "secret.txt"), "secret");
    try {
      fs.symlinkSync(outsideDirectory, linkPath, process.platform === "win32" ? "junction" : "dir");
    } catch (error) {
      t.skip(`symlinks are unavailable: ${error instanceof Error ? error.message : String(error)}`);
      return;
    }

    initializePathAuthorization(userData);
    authorizeUserSelectedPaths([selectedDirectory], true);
    assert.equal(isAuthorizedPath(path.join(linkPath, "secret.txt")), false);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("dropped files become exact grants only after the native path exists", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dev-toolbox-drop-"));
  try {
    const userData = path.join(root, "user-data");
    const droppedFile = path.join(root, "dropped.png");
    fs.mkdirSync(userData);
    fs.writeFileSync(droppedFile, "png");
    initializePathAuthorization(userData);

    authorizeDroppedPaths([droppedFile]);
    assert.equal(isAuthorizedPath(droppedFile), true);
    assert.throws(() => authorizeDroppedPaths([path.join(root, "missing.png")]), /ENOENT/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("existing history outputs receive exact file grants and never recursive directory grants", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "dev-toolbox-history-grant-"));
  try {
    const userData = path.join(root, "user-data");
    const outputDirectory = path.join(root, "old-output");
    const outputFile = path.join(outputDirectory, "result.png");
    const siblingFile = path.join(outputDirectory, "unrelated.png");
    const unrelatedDirectory = path.join(root, "unrelated");
    fs.mkdirSync(userData);
    fs.mkdirSync(outputDirectory);
    fs.mkdirSync(unrelatedDirectory);
    fs.writeFileSync(outputFile, "result");
    fs.writeFileSync(siblingFile, "unrelated");
    initializePathAuthorization(userData);

    authorizeExistingPath(outputFile);
    assert.equal(isAuthorizedPath(outputFile), true);
    assert.equal(isAuthorizedPath(siblingFile), false);
    assert.equal(isAuthorizedPath(path.join(unrelatedDirectory, "result.png")), false);
    assert.throws(() => authorizeExistingPath(outputDirectory), /only existing files/i);
    assert.throws(() => authorizeExistingPath(path.join(root, "missing-output")), /ENOENT/);
  } finally {
    fs.rmSync(root, { recursive: true, force: true });
  }
});

test("shared-disk open targets stay inside the configured full base path", () => {
  const config = {
    url: "http://files.internal:5000",
    basePath: "team/assets/frontend"
  };

  assert.equal(getSharedDiskShareRoot(config), "\\\\files.internal\\team\\");
  assert.equal(getSharedDiskBaseRoot(config), "\\\\files.internal\\team\\assets\\frontend");
  assert.doesNotThrow(() => assertSharedDiskTarget(config, "\\\\files.internal\\team\\assets\\frontend"));
  assert.doesNotThrow(() => assertSharedDiskTarget(config, "\\\\files.internal\\team\\assets\\frontend\\icons\\logo.svg"));
  assert.throws(() => assertSharedDiskTarget(config, "\\\\files.internal\\team\\other"), /outside the configured base path/i);
  assert.throws(() => assertSharedDiskTarget(config, "\\\\files.internal\\team\\assets\\frontend\\..\\secret"), /outside the configured base path/i);
  assert.throws(() => assertSharedDiskTarget(config, "\\\\other.internal\\team\\assets\\frontend"), /outside the configured base path/i);
});

test("external URL validation enforces protocols, hostnames, and credential rejection", () => {
  assert.equal(validateExternalUrl("https://example.com/docs"), "https://example.com/docs");
  assert.equal(validateExternalUrl("http://127.0.0.1:5173/"), "http://127.0.0.1:5173/");
  assert.equal(validateExternalUrl("mailto:dev@example.com"), "mailto:dev@example.com");
  assert.throws(() => validateExternalUrl("https://user:secret@example.com"), /credentials/i);
  assert.throws(() => validateExternalUrl("https://bad_host.example/"), /hostname/i);
  assert.throws(() => validateExternalUrl("mailto:local-only"), /valid domain/i);
  assert.throws(() => validateExternalUrl("file:///C:/Windows/System32/drivers/etc/hosts"), /Only HTTP/i);
  assert.throws(() => validateExternalUrl("javascript:alert(1)"), /Only HTTP/i);
});

test("main-process payload validators reject coercion and malformed renderer messages", () => {
  const requestId = `${Date.now()}-abc123`;
  assert.equal(parseWindowActionReadyPayload({ requestId, ok: true }).success, true);
  assert.equal(parseWindowActionReadyPayload({ requestId, ok: "true" }).success, false);
  assert.equal(parseWindowActionReadyPayload({ requestId, ok: true, unexpected: true }).success, false);

  const validTheme = { accentColor: "#0969da", surfaceColor: "#161b22", textColor: "#e5eefb" };
  assert.equal(parseTitleBarThemePayload(validTheme).success, true);
  assert.equal(parseTitleBarThemePayload({ ...validTheme, surfaceColor: "red" }).success, false);
  assert.equal(parseBooleanPayload(false), false);
  assert.throws(() => parseBooleanPayload("false"));
  assert.equal(parseUuidPayload("2b7d1d5d-44a0-4ac4-a7c4-5198a5f84aa4"), "2b7d1d5d-44a0-4ac4-a7c4-5198a5f84aa4");
  assert.throws(() => parseUuidPayload("clipboard-entry"));
  assert.equal(isAllowedRendererPermission("clipboard-read"), true);
  assert.equal(isAllowedRendererPermission("clipboard-sanitized-write"), true);
  assert.equal(isAllowedRendererPermission("media"), false);
});

test("every BrowserWindow enables webSecurity and the default session restricts permissions", () => {
  const mainSource = fs.readFileSync(path.join(__dirname, "..", "src", "electron", "main", "index.ts"), "utf8");
  const ipcSource = fs.readFileSync(path.join(__dirname, "..", "src", "electron", "main", "ipc.ts"), "utf8");
  const utilitySource = fs.readFileSync(path.join(__dirname, "..", "src", "electron", "main", "services", "utility.service.ts"), "utf8");

  assert.match(mainSource, /webSecurity:\s*true/);
  assert.match(utilitySource, /webSecurity:\s*true/);
  assert.match(mainSource, /setPermissionCheckHandler\([\s\S]*isAllowedRendererPermission/);
  assert.match(mainSource, /setPermissionRequestHandler\([\s\S]*isAllowedRendererPermission/);
  assert.match(mainSource, /setDevicePermissionHandler\(\(\)\s*=>\s*false\)/);
  assert.match(mainSource, /assertAuthorizedPath\(resolvedFilePath\)/);
});
