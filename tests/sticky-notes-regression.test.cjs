const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const Module = require("node:module");
const os = require("node:os");
const path = require("node:path");
const JSZip = require("jszip");

const { flushRevisionBarrier } = require("../dist/shared/revision-flush.js");

let userDataDir = "";
const originalLoad = Module._load;
Module._load = function loadForStickyNotesTests(request, parent, isMain) {
  if (request === "electron") {
    return { app: { getPath: () => userDataDir } };
  }
  return originalLoad.call(this, request, parent, isMain);
};
const { importStickyNotes, loadStickyNotes } = require("../dist/electron/main/services/sticky-notes.service.js");
Module._load = originalLoad;

async function withTempDir(run) {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "dev-toolbox-sticky-regression-"));
  try {
    userDataDir = path.join(dir, "profile");
    return await run(dir);
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
}

function firstCentralHeader(buffer) {
  const offset = buffer.indexOf(Buffer.from([0x50, 0x4b, 0x01, 0x02]));
  assert.notEqual(offset, -1, "generated ZIP should contain a central-directory header");
  return offset;
}

test("revision flush barrier includes edits made while a save is in flight", async () => {
  let revision = 1;
  let releaseFirstSave;
  let markFirstSaveStarted;
  const firstSaveStarted = new Promise((resolve) => {
    markFirstSaveStarted = resolve;
  });
  const firstSaveGate = new Promise((resolve) => {
    releaseFirstSave = resolve;
  });
  const flushed = [];

  const barrier = flushRevisionBarrier(
    () => revision,
    async (snapshot) => {
      flushed.push(snapshot);
      if (snapshot === 1) {
        markFirstSaveStarted();
        await firstSaveGate;
      }
    }
  );

  await firstSaveStarted;
  revision = 2;
  releaseFirstSave();
  await barrier;

  assert.deepEqual(flushed, [1, 2]);
});

test("a malformed later file leaves no notes from an earlier valid file", async () => {
  await withTempDir(async (dir) => {
    const validPath = path.join(dir, "valid.txt");
    const malformedPath = path.join(dir, "malformed.json");
    await fs.writeFile(validPath, "这条便签不能被部分导入", "utf8");
    await fs.writeFile(malformedPath, '{"notes":[', "utf8");

    await assert.rejects(importStickyNotes([validPath, malformedPath]));

    const state = await loadStickyNotes();
    assert.equal(state.notes.length, 0);
    assert.equal(state.archivedNotes.length, 0);
    assert.equal(state.trashNotes.length, 0);
  });
});

test("ZIP entry-count limit is checked before any CRC-driven decompression", async () => {
  await withTempDir(async (dir) => {
    const zip = new JSZip();
    for (let index = 0; index < 2_501; index += 1) zip.file(`note-${index}.txt`, "x");
    const archive = await zip.generateAsync({ type: "nodebuffer", compression: "STORE" });
    const centralOffset = firstCentralHeader(archive);
    archive.writeUInt32LE((archive.readUInt32LE(centralOffset + 16) ^ 1) >>> 0, centralOffset + 16);
    const inputPath = path.join(dir, "too-many-corrupt.zip");
    await fs.writeFile(inputPath, archive);

    await assert.rejects(importStickyNotes([inputPath]), (error) => {
      assert.match(error.message, /2500/);
      assert.doesNotMatch(error.message, /CRC|校验/);
      return true;
    });
  });
});

test("ZIP declared-size limit is checked before an entry is decompressed", async () => {
  await withTempDir(async (dir) => {
    const zip = new JSZip();
    zip.file("oversized.txt", "small payload");
    const archive = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
    const centralOffset = firstCentralHeader(archive);
    archive.writeUInt32LE(129 * 1024 * 1024, centralOffset + 24);
    const inputPath = path.join(dir, "declared-oversized.zip");
    await fs.writeFile(inputPath, archive);

    await assert.rejects(importStickyNotes([inputPath]), /128 MiB/);
  });
});

test("ZIP entries are streamed with an actual expanded-size limit", async () => {
  await withTempDir(async (dir) => {
    const zip = new JSZip();
    zip.file("hidden-oversized.txt", Buffer.alloc(8 * 1024 * 1024 + 1, 0x61));
    const archive = await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" });
    const centralOffset = firstCentralHeader(archive);
    archive.writeUInt32LE(1, centralOffset + 24);
    const inputPath = path.join(dir, "actual-oversized.zip");
    await fs.writeFile(inputPath, archive);

    await assert.rejects(importStickyNotes([inputPath]), /ZIP 中的便签过大/);
  });
});

test("a valid ZIP entry still imports after per-entry CRC verification", async () => {
  await withTempDir(async (dir) => {
    const zip = new JSZip();
    zip.file("安全便签.txt", "保留这段内容");
    const inputPath = path.join(dir, "valid.zip");
    await fs.writeFile(inputPath, await zip.generateAsync({ type: "nodebuffer", compression: "DEFLATE" }));

    const result = await importStickyNotes([inputPath]);
    assert.equal(result.imported, 1);
    assert.equal(result.notes[0].content, "保留这段内容");
  });
});
