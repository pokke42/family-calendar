import { build } from 'esbuild';
import { mkdir, copyFile } from 'node:fs/promises';
await mkdir('dist', { recursive: true });
await build({ entryPoints: ['src/app.js'], bundle: true, minify: true, target: ['safari15'], outfile: 'dist/app.js' });
await Promise.all(['index.html', 'styles.css'].map(file => copyFile(file, `dist/${file}`)));
await copyFile('node_modules/ical.js/LICENSE', 'dist/ical.js.LICENSE.txt');
console.log('Built dist/ for Safari 15 and later.');
