import { mkdir, rm, cp, copyFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const target = root + 'dist/haos/hemma';
await rm(target, { recursive: true, force: true });
await mkdir(target + '/app', { recursive: true });
for (const name of ['package.json', 'package-lock.json', 'build.mjs', 'server.mjs', 'src', 'integrations', 'index.html', 'styles.css']) {
  await cp(root + name, target + '/app/' + name, { recursive: true });
}
for (const name of ['config.yaml', 'Dockerfile', 'DOCS.md']) await copyFile(root + 'haos/' + name, target + '/' + name);
console.log('Local HAOS add-on prepared in dist/haos/hemma (no private data included).');
