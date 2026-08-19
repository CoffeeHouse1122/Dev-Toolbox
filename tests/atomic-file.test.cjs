const test = require("node:test");
const assert = require("node:assert/strict");
const fsp = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");

const { writeFileAtomic } = require("../dist/electron/main/services/atomic-file.js");

async function createTemporaryDirectory(t) {
  const directory = await fsp.mkdtemp(path.join(os.tmpdir(), "dev-toolbox-atomic-"));
  t.after(() => fsp.rm(directory, { recursive: true, force: true }));
  return directory;
}

test("serializes concurrent writes to the same file", async (t) => {
  const directory = await createTemporaryDirectory(t);
  const targetPath = path.join(directory, "navigation.json");
  const payloads = Array.from({ length: 32 }, (_, index) => `${JSON.stringify({ index })}\n`);

  await writeFileAtomic(targetPath, `${JSON.stringify({ index: -1 })}\n`);
  await Promise.all(payloads.map((payload) => writeFileAtomic(targetPath, payload)));

  const current = await fsp.readFile(targetPath, "utf8");
  const backup = await fsp.readFile(`${targetPath}.bak`, "utf8");
  assert.ok(payloads.includes(current));
  assert.ok(payloads.includes(backup));

  const temporaryFiles = (await fsp.readdir(directory)).filter((name) => name.startsWith(".navigation.json"));
  assert.deepEqual(temporaryFiles, []);
});

test("retries a transient Windows rename failure", async (t) => {
  const directory = await createTemporaryDirectory(t);
  const targetPath = path.join(directory, "navigation.json");
  const backupPath = `${targetPath}.bak`;
  await writeFileAtomic(targetPath, "before\n");

  const originalRename = fsp.rename;
  let injectedFailure = false;
  fsp.rename = async (sourcePath, destinationPath) => {
    if (!injectedFailure && destinationPath === backupPath) {
      injectedFailure = true;
      const error = new Error("simulated temporary Windows file lock");
      error.code = "EPERM";
      throw error;
    }
    return originalRename(sourcePath, destinationPath);
  };

  try {
    await writeFileAtomic(targetPath, "after\n");
  } finally {
    fsp.rename = originalRename;
  }

  assert.equal(injectedFailure, true);
  assert.equal(await fsp.readFile(targetPath, "utf8"), "after\n");
  assert.equal(await fsp.readFile(backupPath, "utf8"), "before\n");
});
