import { mkdir, rm, copyFile, cp } from 'node:fs/promises';
await rm('dist', { recursive: true, force: true });
await mkdir('dist/vendor', { recursive: true });
for (const file of ['index.html', 'style.css', 'app.js', 'zip.js', 'pdf.js', 'pdf-app.js']) await copyFile(file, `dist/${file}`);
for (const file of ['pdf.min.mjs', 'pdf.worker.min.mjs']) await copyFile(`node_modules/pdfjs-dist/build/${file}`, `dist/vendor/${file}`);
await copyFile('node_modules/pdf-lib/dist/pdf-lib.esm.min.js', 'dist/vendor/pdf-lib.esm.min.js');
for (const folder of ['cmaps', 'standard_fonts', 'wasm']) await cp(`node_modules/pdfjs-dist/${folder}`, `dist/vendor/${folder}`, { recursive: true });
await copyFile('node_modules/pdfjs-dist/LICENSE', 'dist/vendor/LICENSE-PDFJS');
await copyFile('node_modules/pdf-lib/LICENSE.md', 'dist/vendor/LICENSE-PDF-LIB.md');
