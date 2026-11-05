import test from 'node:test';
import assert from 'node:assert/strict';
import { createCanvas, DOMMatrix, ImageData, Path2D } from '@napi-rs/canvas';
import { PDFDocument, degrees } from 'pdf-lib';
import { compressPdf, PDF_LIMIT } from './pdf.js';
import { mkdir, writeFile } from 'node:fs/promises';

Object.assign(globalThis, { DOMMatrix, ImageData, Path2D });
const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs');
const getLibraries = async () => ({ pdfjs, PDFDocument });
const canvasFactory = () => {
  const canvas = createCanvas(1, 1);
  canvas.toBlob = (callback, type, quality) => callback(new Blob([canvas.toBuffer('image/jpeg', Math.round(quality * 100))], { type }));
  return canvas;
};
let fixture;
async function scannedFixture() {
  if (fixture) return fixture;
  const canvas = createCanvas(1800, 2400);
  const ctx = canvas.getContext('2d');
  const pixels = ctx.createImageData(canvas.width, canvas.height);
  let seed = 12345;
  for (let i = 0; i < pixels.data.length; i += 4) {
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const value = 225 + (seed >>> 27);
    pixels.data[i] = value; pixels.data[i + 1] = value; pixels.data[i + 2] = value; pixels.data[i + 3] = 255;
  }
  ctx.putImageData(pixels, 0, 0);
  ctx.fillStyle = '#27233b';
  ctx.font = '52px sans-serif';
  for (let y = 180; y < 2300; y += 90) ctx.fillText('PDF compression: readable scanned document 0123456789', 90, y);
  const doc = await PDFDocument.create();
  const image = await doc.embedPng(canvas.toBuffer('image/png'));
  doc.addPage([595, 842]).drawImage(image, { width: 595, height: 842 });
  const rotated = doc.addPage([595, 842]);
  rotated.drawImage(image, { width: 595, height: 842 });
  rotated.setRotation(degrees(90));
  fixture = new File([await doc.save()], 'اختبار.pdf', { type: 'application/pdf' });
  return fixture;
}

test('real scanned PDF: all three levels reduce size and preserve page count and orientation', async () => {
  const input = await scannedFixture();
  await mkdir('.test-output', { recursive: true });
  await writeFile('.test-output/original.pdf', Buffer.from(await input.arrayBuffer()));
  const sizes = [];
  for (const level of ['light', 'balanced', 'strong']) {
    const progress = [];
    const result = await compressPdf(input, level, { getLibraries, createCanvas: canvasFactory, onProgress: (state) => progress.push(state) });
    assert.equal(result.smaller, true);
    assert.ok(result.blob.size < input.size * 0.5, `${level}: expected useful savings on a scanned fixture`);
    assert.equal(result.preview.type, 'image/jpeg');
    const output = await PDFDocument.load(await result.blob.arrayBuffer());
    assert.equal(output.getPageCount(), 2);
    assert.deepEqual(output.getPage(0).getSize(), { width: 595, height: 842 });
    assert.deepEqual(output.getPage(1).getSize(), { width: 842, height: 595 });
    assert.equal(progress.at(-1).phase, 'saving');
    sizes.push(result.blob.size);
    await writeFile(`.test-output/${level}.pdf`, Buffer.from(await result.blob.arrayBuffer()));
    console.log(`${level}: ${input.size} -> ${result.blob.size} bytes (${result.savings.toFixed(1)}% saved)`);
  }
  assert.ok(sizes[0] > sizes[1] && sizes[1] > sizes[2]);
});

test('retains the original when recompressing a tiny PDF would increase size', async () => {
  const doc = await PDFDocument.create(); doc.addPage([100, 100]);
  const input = new File([await doc.save()], 'tiny.pdf');
  const result = await compressPdf(input, 'balanced', { getLibraries, createCanvas: canvasFactory });
  assert.equal(result.smaller, false); assert.equal(result.blob, input);
});

test('rejects invalid or oversized input and supports cancellation', async () => {
  await assert.rejects(compressPdf(new File(['not a pdf'], 'fake.pdf')), /ليس ملف PDF/);
  await assert.rejects(compressPdf({ size: PDF_LIMIT + 1 }), /256/);
  const controller = new AbortController();
  const input = await scannedFixture();
  await assert.rejects(compressPdf(input, 'balanced', { getLibraries, createCanvas: canvasFactory, signal: controller.signal,
    onProgress(state) { if (state.phase === 'rendering' && state.done === 1) controller.abort(); },
  }), { name: 'AbortError' });
});
