// Copia os arquivos do app web para a pasta www/, que é a usada pelo app Android.
// Os arquivos originais continuam na raiz, então o app web (Netlify/PWA) segue funcionando igual.
const fs = require('fs');
const path = require('path');

const root = path.join(__dirname, '..');
const out = path.join(root, 'www');
const files = ['index.html', 'app.js', 'scheduler.js', 'data.js', 'styles.css',
  'manifest.webmanifest', 'sw.js', 'icon-192.png', 'icon-512.png', 'icon-maskable-512.png'];

fs.rmSync(out, { recursive: true, force: true });
fs.mkdirSync(out);
for (const f of files) fs.copyFileSync(path.join(root, f), path.join(out, f));
console.log('www/ pronto com ' + files.length + ' arquivos.');
