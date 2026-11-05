import { createZip } from './zip.js';

const $ = (selector) => document.querySelector(selector);
const input = $('#file-input');
const dropZone = $('#drop-zone');
const fileSection = $('#file-section');
const fileList = $('#file-list');
const message = $('#message');
const compress = $('#compress');
const archiveName = $('#archive-name');
const limit = 256 * 1024 * 1024;
let files = [];
let busy = false;

function formatSize(bytes) {
  if (bytes < 1024) return `${bytes} بايت`;
  if (bytes < 1024 ** 2) return `${(bytes / 1024).toFixed(1)} كيلوبايت`;
  return `${(bytes / 1024 ** 2).toFixed(1)} ميجابايت`;
}

function showMessage(text, success = false) {
  message.textContent = text;
  message.classList.toggle('success', success);
}

function render() {
  fileSection.hidden = files.length === 0;
  $('#file-count').textContent = files.length;
  $('#total-size').textContent = `الحجم الإجمالي: ${formatSize(files.reduce((sum, file) => sum + file.size, 0))}`;
  fileList.replaceChildren();
  files.forEach((file, index) => {
    const item = document.createElement('li');
    item.className = 'file-item';
    const icon = document.createElement('span');
    icon.className = 'file-icon';
    icon.textContent = '▤';
    icon.setAttribute('aria-hidden', 'true');
    const info = document.createElement('div');
    info.className = 'file-info';
    const name = document.createElement('span');
    name.className = 'file-name';
    name.textContent = file.name;
    const size = document.createElement('span');
    size.className = 'file-size';
    size.textContent = formatSize(file.size);
    info.append(name, size);
    const remove = document.createElement('button');
    remove.type = 'button';
    remove.className = 'remove-button';
    remove.textContent = '×';
    remove.setAttribute('aria-label', `حذف ${file.name}`);
    remove.disabled = busy;
    remove.addEventListener('click', () => {
      files.splice(index, 1);
      showMessage('');
      render();
    });
    item.append(icon, info, remove);
    fileList.append(item);
  });
}

function addFiles(incoming) {
  if (busy || !incoming.length) return;
  const selected = Array.from(incoming);
  if (files.length + selected.length > 65535) {
    showMessage('يمكن إضافة 65535 ملفاً كحد أقصى.');
    return;
  }
  if ([...files, ...selected].reduce((sum, file) => sum + file.size, 0) > limit) {
    showMessage('يتجاوز حجم الملفات الحد الأقصى البالغ 256 ميجابايت.');
    return;
  }
  files.push(...selected);
  showMessage('');
  render();
}

$('#select-files').addEventListener('click', () => input.click());
input.addEventListener('change', () => {
  addFiles(input.files);
  input.value = '';
});
for (const event of ['dragenter', 'dragover']) {
  dropZone.addEventListener(event, (e) => {
    e.preventDefault();
    if (!busy) dropZone.classList.add('dragging');
  });
}
for (const event of ['dragleave', 'drop']) {
  dropZone.addEventListener(event, (e) => {
    e.preventDefault();
    dropZone.classList.remove('dragging');
  });
}
dropZone.addEventListener('drop', (e) => {
  if (Array.from(e.dataTransfer.items).some((item) => item.webkitGetAsEntry?.()?.isDirectory)) {
    showMessage('يرجى اختيار الملفات فقط، لا المجلدات.');
    return;
  }
  addFiles(e.dataTransfer.files);
});
$('#clear-files').addEventListener('click', () => {
  files = [];
  showMessage('');
  render();
});
compress.addEventListener('click', async () => {
  const name = archiveName.value.trim().replace(/\.zip$/i, '').replace(/[\\/:*?"<>|\u0000-\u001f]/g, '_').replace(/^\.+$/, '');
  if (!name) {
    showMessage('يرجى إدخال اسم للملف المضغوط.');
    archiveName.focus();
    return;
  }
  busy = true;
  $('#select-files').disabled = true;
  $('#clear-files').disabled = true;
  archiveName.disabled = true;
  compress.disabled = true;
  render();
  showMessage('');
  try {
    const zip = await createZip(files, (done, total) => {
      $('#compress-label').textContent = `جارٍ الضغط... ${done} / ${total}`;
    });
    const url = URL.createObjectURL(zip);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${name}.zip`;
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    showMessage(`ملفك جاهز! حجم الملف المضغوط ${formatSize(zip.size)}.`, true);
  } catch (error) {
    console.error('ZIP creation failed:', error);
    showMessage(error instanceof Error ? `تعذر إنشاء الملف: ${error.message}` : 'تعذر إنشاء الملف. حاول مرة أخرى.');
  } finally {
    busy = false;
    $('#select-files').disabled = false;
    $('#clear-files').disabled = false;
    archiveName.disabled = false;
    compress.disabled = false;
    $('#compress-label').textContent = 'ضغط وتحميل الملفات';
    render();
  }
});
