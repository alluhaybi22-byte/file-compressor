export const PDF_LIMIT = 256 * 1024 * 1024;
export const PDF_PRESETS = Object.freeze({
  light: { dpi: 170, quality: 0.86, maxPixels: 12000000 },
  balanced: { dpi: 120, quality: 0.7, maxPixels: 6000000 },
  strong: { dpi: 85, quality: 0.48, maxPixels: 3000000 },
});

let libraries;
export async function loadPdfLibraries() {
  if (!libraries) {
    libraries = Promise.all([import('./vendor/pdf.min.mjs'), import('./vendor/pdf-lib.esm.min.js')])
      .then(([pdfjs, writer]) => {
        pdfjs.GlobalWorkerOptions.workerSrc = new URL('./vendor/pdf.worker.min.mjs', import.meta.url).href;
        return { pdfjs, PDFDocument: writer.PDFDocument };
      }).catch((error) => { libraries = undefined; throw error; });
  }
  return libraries;
}

export function pageScale(width, height, preset) {
  if (!(width > 0 && height > 0 && Number.isFinite(width * height))) throw new Error('أبعاد صفحة PDF غير صالحة.');
  return Math.min(preset.dpi / 72, Math.sqrt(preset.maxPixels / (width * height)), 16000 / Math.max(width, height));
}

function checkCancelled(signal) {
  if (signal?.aborted) throw new DOMException('تم إلغاء الضغط.', 'AbortError');
}

function jpegBlob(canvas, quality) {
  return new Promise((resolve, reject) => canvas.toBlob((blob) => {
    if (blob?.type === 'image/jpeg') resolve(blob);
    else reject(new Error('تعذر تحويل إحدى الصفحات إلى صورة.'));
  }, 'image/jpeg', quality));
}

export async function compressPdf(file, level = 'balanced', options = {}) {
  const { signal, onProgress = () => {}, getLibraries = loadPdfLibraries,
    createCanvas = () => document.createElement('canvas') } = options;
  const preset = PDF_PRESETS[level];
  if (!preset) throw new Error('درجة الضغط غير صالحة.');
  if (!file?.size || file.size > PDF_LIMIT) throw new Error('اختر ملف PDF غير فارغ لا يتجاوز 256 ميجابايت.');
  checkCancelled(signal);
  const signature = new TextDecoder('latin1').decode(await file.slice(0, 1024).arrayBuffer());
  if (!signature.includes('%PDF-')) throw new Error('الملف المختار ليس ملف PDF صالحاً.');
  onProgress({ phase: 'loading', done: 0, total: 0 });
  const { pdfjs, PDFDocument } = await getLibraries();
  checkCancelled(signal);
  const data = new Uint8Array(await file.arrayBuffer());
  checkCancelled(signal);
  const task = pdfjs.getDocument({ data, isEvalSupported: false,
    cMapUrl: new URL('./vendor/cmaps/', import.meta.url).href, cMapPacked: true,
    standardFontDataUrl: new URL('./vendor/standard_fonts/', import.meta.url).href,
    wasmUrl: new URL('./vendor/wasm/', import.meta.url).href,
  });
  const cancel = () => { void task.destroy().catch(() => {}); };
  signal?.addEventListener('abort', cancel, { once: true });
  let source;
  let canvas;
  try {
    source = await task.promise;
    checkCancelled(signal);
    const output = await PDFDocument.create();
    output.setCreator('ضَغطة');
    let preview;
    for (let number = 1; number <= source.numPages; number++) {
      checkCancelled(signal);
      onProgress({ phase: 'rendering', done: number - 1, total: source.numPages });
      const page = await source.getPage(number);
      try {
        const points = page.getViewport({ scale: 1 });
        const viewport = page.getViewport({ scale: pageScale(points.width, points.height, preset) });
        canvas = createCanvas();
        canvas.width = Math.max(1, Math.floor(viewport.width));
        canvas.height = Math.max(1, Math.floor(viewport.height));
        const context = canvas.getContext('2d', { alpha: false });
        if (!context) throw new Error('تعذر تجهيز مساحة الرسم. جرّب درجة ضغط أقوى أو متصفحاً أحدث.');
        await page.render({ canvasContext: context, viewport, background: 'rgb(255,255,255)', intent: 'display' }).promise;
        checkCancelled(signal);
        const jpeg = await jpegBlob(canvas, preset.quality);
        if (number === 1) preview = jpeg;
        const image = await output.embedJpg(await jpeg.arrayBuffer());
        output.addPage([points.width, points.height]).drawImage(image, { x: 0, y: 0, width: points.width, height: points.height });
        // Flush each page so pdf-lib does not retain a second copy of every JPEG.
        await output.flush();
      } finally {
        if (canvas) { canvas.width = 0; canvas.height = 0; canvas = undefined; }
        page.cleanup();
      }
      onProgress({ phase: 'rendering', done: number, total: source.numPages });
      await new Promise((resolve) => setTimeout(resolve, 0));
    }
    checkCancelled(signal);
    onProgress({ phase: 'saving', done: source.numPages, total: source.numPages });
    const bytes = await output.save({ useObjectStreams: true });
    checkCancelled(signal);
    const blob = new Blob([bytes], { type: 'application/pdf' });
    if (blob.size >= file.size) return { blob: file, smaller: false, pages: source.numPages, savings: 0 };
    return { blob, preview, smaller: true, pages: source.numPages, savings: (1 - blob.size / file.size) * 100 };
  } catch (error) {
    checkCancelled(signal);
    if (error?.name === 'PasswordException') throw new Error('الملف محمي بكلمة مرور. افتح نسخة غير محمية ثم أعد المحاولة.');
    if (error?.name === 'InvalidPDFException') throw new Error('ملف PDF تالف أو غير مدعوم. جرّب فتحه وحفظ نسخة جديدة.');
    throw error;
  } finally {
    signal?.removeEventListener('abort', cancel);
    await task.destroy().catch(() => {});
  }
}
