import { spawnSync } from 'node:child_process';
import { readdirSync, readFileSync, writeFileSync } from 'node:fs';
import { createHash } from 'node:crypto';
import path from 'node:path';
const root = path.resolve(import.meta.dirname, '..');
const output = process.argv[2] ?? '.runtime/hosted-release';
const result = spawnSync(process.execPath, ['scripts/build-hosted.mjs', output], { cwd: root, stdio: 'inherit' });
if (result.status !== 0) process.exit(result.status ?? 1);
const directory = path.resolve(root, output), files = {};
for (const entry of readdirSync(directory, { recursive: true, withFileTypes: true })) {
  if (!entry.isFile()) continue;
  const file = path.join(entry.parentPath, entry.name);
  files[path.relative(directory, file).replaceAll('\\', '/')] = createHash('sha256').update(readFileSync(file)).digest('hex');
}
writeFileSync(path.join(directory, 'manifest.json'), JSON.stringify({ algorithm: 'sha256', files }, null, 2) + '\n');
