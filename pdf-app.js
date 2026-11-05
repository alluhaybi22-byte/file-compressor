import { compressPdf, PDF_LIMIT } from './pdf.js';

const $ = (selector) => document.querySelector(selector);
const input = $('#pdf-input');
let file;
let controller;
let resultUrl;
let previewUrl;
const size = (bytes) => bytes < 1024 ** 2 ? `${(bytes / 1024).toFixed(1)} كيلوبايت` : `${(bytes / 1024 ** 2).toFixed(2)} ميجابايت`;

function message(text, success = false) {
  $('#pdf-message').textContent = text;
  $('#pdf-message').classList.toggle('success', success);
}
function clearResult() {
  if (resultUrl) URL.revokeObjectURL(resultUrl);
  if (previewUrl) URL.revokeObjectURL(previewUrl);
  resultUrl = previewUrl = undefined;
  $('#pdf-download').removeAttribute('href');
  $('#pdf-preview').removeAttribute('src');
  $('#pdf-result').hidden = true;
}
function setFile(incoming) {
  if (controller || !incoming?.length) return;
  if (incoming.length !== 1) return message('اختر ملف PDF واحداً في كل مرة.');
  const next = incoming[0];
  if (!/\.pdf$/i.test(next.name) && next.type !== 'application/pdf') return message('يرجى اختيار ملف PDF.');
  if (!next.size || next.size > PDF_LIMIT) return message('اختر ملفاً غير فارغ لا يتجاوز 256 ميجابايت.');
  file = next;
  clearResult();
  message('');
  $('#pdf-name').textContent = file.name;
  $('#pdf-size').textContent = size(file.size);
  $('#pdf-controls').hidden = false;
}
function setBusy(busy) {
  for (const element of document.querySelectorAll('#pdf-controls button, #pdf-controls input, #pdf-select, .tool-tabs button')) element.disabled = busy;
  $('#pdf-progress-section').hidden = !busy;
  $('#pdf-compress').textContent = busy ? 'جارٍ ضغط PDF…' : 'ضغط PDF';
}
for (const mode of ['pdf', 'zip']) {
  $(`#${mode}-tab`).addEventListener('click', () => {
    for (const name of ['pdf', 'zip']) {
      $(`#${name}-tab`).setAttribute('aria-pressed', String(name === mode));
      $(`#${name}-panel`).hidden = name !== mode;
    }
  });
}
$('#pdf-select').addEventListener('click', () => input.click());
input.addEventListener('change', () => { setFile(input.files); input.value = ''; });
$('#pdf-remove').addEventListener('click', () => {
  file = undefined; clearResult(); message(''); $('#pdf-controls').hidden = true;
});
for (const element of document.querySelectorAll('input[name="pdf-quality"]')) element.addEventListener('change', () => { clearResult(); message(''); });
for (const name of ['dragenter', 'dragover']) $('#pdf-drop').addEventListener(name, (event) => {
  event.preventDefault(); if (!controller) $('#pdf-drop').classList.add('dragging');
});
for (const name of ['dragleave', 'drop']) $('#pdf-drop').addEventListener(name, (event) => {
  event.preventDefault(); $('#pdf-drop').classList.remove('dragging');
});
$('#pdf-drop').addEventListener('drop', (event) => setFile(event.dataTransfer.files));
$('#pdf-cancel').addEventListener('click', () => {
  controller?.abort(); $('#pdf-cancel').disabled = true;
});
$('#pdf-compress').addEventListener('click', async () => {
  if (!file || controller) return;
  clearResult(); message('');
  controller = new AbortController();
  $('#pdf-cancel').disabled = false;
  $('#pdf-progress').value = 0;
  setBusy(true);
  try {
    const level = $('input[name="pdf-quality"]:checked').value;
    const result = await compressPdf(file, level, {
      signal: controller.signal,
      onProgress({ phase, done, total }) {
        $('#pdf-progress').value = total ? Math.min(95, (done / total) * 95) : 0;
        $('#pdf-progress-label').textContent = phase === 'loading' ? 'جارٍ فتح الملف…' : phase === 'saving' ? 'جارٍ تجهيز PDF…' : `جارٍ ضغط الصفحة ${Math.min(done + 1, total)} من ${total}`;
      },
    });
    if (!result.smaller) {
      message('لم تنتج هذه الدرجة ملفاً أصغر. احتفظ بالأصل وجرّب درجة ضغط أقوى؛ بعض الملفات مضغوطة مسبقاً.');
      return;
    }
    resultUrl = URL.createObjectURL(result.blob);
    previewUrl = URL.createObjectURL(result.preview);
    $('#pdf-before').textContent = size(file.size);
    $('#pdf-after').textContent = size(result.blob.size);
    $('#pdf-savings').textContent = `${result.savings.toFixed(1)}٪`;
    $('#pdf-preview').src = previewUrl;
    $('#pdf-download').href = resultUrl;
    $('#pdf-download').download = `${file.name.replace(/\.pdf$/i, '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_')}-مضغوط.pdf`;
    $('#pdf-result').hidden = false;
    message(`اكتمل ضغط ${result.pages} صفحة. يمكنك معاينة الصفحة الأولى وتنزيل الملف.`, true);
  } catch (error) {
    if (error?.name === 'AbortError') message('تم إلغاء الضغط. ملفك الأصلي لم يتغير.');
    else message(error?.message || 'تعذر ضغط PDF. جرّب ملفاً أصغر أو متصفحاً أحدث.');
  } finally {
    controller = undefined;
    setBusy(false);
  }
});
