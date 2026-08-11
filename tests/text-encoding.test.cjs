const test = require("node:test");
const assert = require("node:assert/strict");

const { decodeTextBuffer, encodeTextBuffer } = require("../dist/electron/main/services/text-encoding.js");

test("UTF-8 BOM is removed without changing text", () => {
  const decoded = decodeTextBuffer(Buffer.concat([Buffer.from([0xef, 0xbb, 0xbf]), Buffer.from("中文源码\n", "utf8")]));
  assert.equal(decoded.text, "中文源码\n");
  assert.equal(decoded.encoding, "utf8");
  assert.equal(decoded.hadBom, true);
});

test("UTF-16 BOM files are detected", () => {
  const encoded = encodeTextBuffer("hello 中文", "utf16le", true);
  const decoded = decodeTextBuffer(encoded);
  assert.equal(decoded.text, "hello 中文");
  assert.equal(decoded.encoding, "utf16le");
  assert.equal(decoded.hadBom, true);
});

test("legacy encodings require an explicit choice and round-trip losslessly", () => {
  const encoded = encodeTextBuffer("前端工具箱", "gb18030");
  assert.throws(() => decodeTextBuffer(encoded), /编码工具|UTF-8\/UTF-16/);
  const decoded = decodeTextBuffer(encoded, "gb18030");
  assert.equal(decoded.text, "前端工具箱");
  assert.equal(decoded.encoding, "gb18030");
});
