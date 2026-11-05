const encoder = new TextEncoder();
const CRC_TABLE = new Uint32Array(256);
for (let n = 0; n < 256; n++) {
  let c = n;
  for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
  CRC_TABLE[n] = c >>> 0;
}

export function crc32(bytes) {
  let crc = 0xffffffff;
  for (const byte of bytes) crc = CRC_TABLE[(crc ^ byte) & 255] ^ (crc >>> 8);
  return (crc ^ 0xffffffff) >>> 0;
}

function header(size) {
  const bytes = new Uint8Array(size);
  return { bytes, view: new DataView(bytes.buffer) };
}

function dosDateTime(timestamp) {
  const date = new Date(timestamp);
  if (!Number.isFinite(date.getTime()) || date.getFullYear() < 1980) return { date: 33, time: 0 };
  if (date.getFullYear() > 2107) return { date: 0xff9f, time: 0xbf7d };
  return {
    date: ((date.getFullYear() - 1980) << 9) | ((date.getMonth() + 1) << 5) | date.getDate(),
    time: (date.getHours() << 11) | (date.getMinutes() << 5) | (date.getSeconds() >> 1),
  };
}

function uniqueName(name, used) {
  const safe = name.replace(/[\\/\u0000-\u001f]/g, '_').replace(/^\.+$/, '_') || 'file';
  let result = safe;
  let index = 2;
  const dot = safe.lastIndexOf('.');
  const base = dot > 0 ? safe.slice(0, dot) : safe;
  const ext = dot > 0 ? safe.slice(dot) : '';
  while (used.has(result)) result = `${base} (${index++})${ext}`;
  used.add(result);
  return result;
}

async function deflateRaw(bytes) {
  // The standard "deflate" stream wraps raw DEFLATE in a zlib header and checksum.
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream('deflate'));
  const wrapped = new Uint8Array(await new Response(stream).arrayBuffer());
  return wrapped.subarray(2, wrapped.length - 4);
}

export async function createZip(files, onProgress = () => {}) {
  if (!files.length) throw new Error('لم يتم اختيار أي ملفات.');
  if (files.length > 65535) throw new Error('عدد الملفات يتجاوز الحد المسموح لأرشيف ZIP.');
  if (typeof CompressionStream === 'undefined') throw new Error('متصفحك لا يدعم ضغط الملفات. يرجى استخدام متصفح حديث.');

  const parts = [];
  const central = [];
  const names = new Set();
  let offset = 0;
  for (let index = 0; index < files.length; index++) {
    const file = files[index];
    const name = encoder.encode(uniqueName(file.name, names));
    if (name.length > 65535) throw new Error('اسم أحد الملفات طويل جداً.');
    const bytes = new Uint8Array(await file.arrayBuffer());
    const compressed = await deflateRaw(bytes);
    const useDeflate = compressed.length < bytes.length;
    const data = useDeflate ? compressed : bytes;
    const method = useDeflate ? 8 : 0;
    const crc = crc32(bytes);
    const dateTime = dosDateTime(file.lastModified);
    if (bytes.length > 0xffffffff || data.length > 0xffffffff || offset > 0xffffffff) {
      throw new Error('حجم الملفات يتجاوز الحد المسموح لأرشيف ZIP.');
    }

    const local = header(30);
    local.view.setUint32(0, 0x04034b50, true);
    local.view.setUint16(4, 20, true);
    local.view.setUint16(6, 0x800, true);
    local.view.setUint16(8, method, true);
    local.view.setUint16(10, dateTime.time, true);
    local.view.setUint16(12, dateTime.date, true);
    local.view.setUint32(14, crc, true);
    local.view.setUint32(18, data.length, true);
    local.view.setUint32(22, bytes.length, true);
    local.view.setUint16(26, name.length, true);
    parts.push(local.bytes, name, data);

    const entry = header(46);
    entry.view.setUint32(0, 0x02014b50, true);
    entry.view.setUint16(4, 20, true);
    entry.view.setUint16(6, 20, true);
    entry.view.setUint16(8, 0x800, true);
    entry.view.setUint16(10, method, true);
    entry.view.setUint16(12, dateTime.time, true);
    entry.view.setUint16(14, dateTime.date, true);
    entry.view.setUint32(16, crc, true);
    entry.view.setUint32(20, data.length, true);
    entry.view.setUint32(24, bytes.length, true);
    entry.view.setUint16(28, name.length, true);
    entry.view.setUint32(42, offset, true);
    central.push(entry.bytes, name);
    offset += local.bytes.length + name.length + data.length;
    onProgress(index + 1, files.length);
  }
  const centralSize = central.reduce((sum, part) => sum + part.length, 0);
  if (offset > 0xffffffff || centralSize > 0xffffffff) throw new Error('حجم الأرشيف يتجاوز الحد المسموح لأرشيف ZIP.');
  const end = header(22);
  end.view.setUint32(0, 0x06054b50, true);
  end.view.setUint16(8, files.length, true);
  end.view.setUint16(10, files.length, true);
  end.view.setUint32(12, centralSize, true);
  end.view.setUint32(16, offset, true);
  return new Blob([...parts, ...central, end.bytes], { type: 'application/zip' });
}
