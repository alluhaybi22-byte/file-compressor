import test from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { createZip, crc32 } from './zip.js';

test('CRC-32 uses the ZIP polynomial', () => {
  assert.equal(crc32(new TextEncoder().encode('123456789')), 0xcbf43926);
});

test('creates an interoperable ZIP with compression, UTF-8 names and duplicates', async () => {
  const files = [
    new File(['hello '.repeat(2000)], 'ملف.txt', { lastModified: 0 }),
    new File(['second'], 'ملف.txt'),
    new File([''], 'empty'),
    new File(['abc'], 'other.bin'),
  ];
  const progress = [];
  const zip = await createZip(files, (done, total) => progress.push([done, total]));
  assert.deepEqual(progress, [[1, 4], [2, 4], [3, 4], [4, 4]]);
  const python = `import io, sys, zipfile
with zipfile.ZipFile(io.BytesIO(sys.stdin.buffer.read())) as z:
    assert z.namelist() == ['ملف.txt', 'ملف (2).txt', 'empty', 'other.bin']
    assert z.read('ملف.txt') == b'hello ' * 2000
    assert z.read('ملف (2).txt') == b'second'
    assert z.read('empty') == b''
    assert z.read('other.bin') == b'abc'
    assert z.getinfo('ملف.txt').compress_type == zipfile.ZIP_DEFLATED
    assert z.getinfo('empty').compress_type == zipfile.ZIP_STORED
    assert z.testzip() is None
`;
  execFileSync('python3', ['-c', python], { input: Buffer.from(await zip.arrayBuffer()) });
});

test('rejects empty archives', async () => {
  await assert.rejects(createZip([]), /لم يتم اختيار/);
});
