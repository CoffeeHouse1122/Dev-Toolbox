const test = require("node:test");
const assert = require("node:assert/strict");
const { sanitizeStickyNoteHtml } = require("../dist/electron/main/services/sticky-notes.service.js");

test("sticky note sanitizer removes executable markup and preserves safe formatting", () => {
  const sanitized = sanitizeStickyNoteHtml(`
    <script>alert(1)</script>
    <img src="x" onerror="alert(2)">
    <a href="jav&#x61;script:alert(3)" onclick="alert(4)">unsafe</a>
    <a href="https://example.com/docs?a=1&amp;b=2">safe link</a>
    <span data-note-styled="true" style="color: red; background-image: url(javascript:alert(5))">formatted</span>
  `);

  assert.doesNotMatch(sanitized, /<script|onerror|onclick|javascript:|background-image/i);
  assert.match(sanitized, /href="https:\/\/example\.com\/docs\?a=1&amp;b=2"/);
  assert.match(sanitized, /style="color: red"/);
  assert.match(sanitized, /data-note-styled="true"/);
});
