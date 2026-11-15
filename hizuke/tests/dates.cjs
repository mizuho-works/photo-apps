const {readFileSync} = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = readFileSync(require('node:path').join(__dirname, '../index.html'), 'utf8');
const script = html.match(/<script>\s*([\s\S]*?)<\/script>/)[1];
new vm.Script(script);
const extract = (start, end) => script.slice(script.indexOf(start), script.indexOf(end));
const context = {TextDecoder, Blob, Date, Uint8Array, DataView};
vm.createContext(context);
vm.runInContext("const pad = (n,w=2) => String(n).padStart(w,'0');\n" +
 extract('  const offStr', '  async function readMovieDate') +
 extract('  async function readPhotoDate', '  // ---------- JPEG + EXIF') +
 extract('  function exifSegment', '  const isJpeg') +
 '\nthis.readPhotoDate = readPhotoDate; this.exifSegment = exifSegment;', context);
(async () => {
 for (const tz of ['+09:00', '-04:30', '+00:00']) {
  const segment = context.exifSegment('2024:02:29 12:34:56', tz);
  const date = await context.readPhotoDate(new Blob([new Uint8Array([255,216]), segment, new Uint8Array([255,217])]));
  assert.equal(date.ms, Date.parse('2024-02-29T12:34:56' + tz));
 }
 assert.equal(await context.readPhotoDate(new Blob([new Uint8Array([255,216,255,217])])), null);
 const invalid = context.exifSegment('2024:02:30 12:34:56', '+09:00');
 assert.equal(await context.readPhotoDate(new Blob([new Uint8Array([255,216]), invalid])), null);
 console.log('PASS: script syntax, EXIF date roundtrip with three offsets, missing EXIF, invalid calendar date');
})().catch(e => {console.error(e); process.exitCode = 1;});
