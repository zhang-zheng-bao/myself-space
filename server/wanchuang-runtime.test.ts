import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runtimeBinaries } from './wanchuang-runtime';

test('service finds deployment dependencies across user accounts and respects explicit overrides', () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'wanchuang-runtime-'));
  const manifest = path.join(root, 'manifest.json');
  const names = ['WANCHUANG_YTDLP', 'WANCHUANG_FFMPEG', 'WANCHUANG_BROWSER'];
  const old = names.map(name => process.env[name]);
  try {
    for (const name of names) delete process.env[name];
    fs.writeFileSync(manifest, JSON.stringify({ schema: 1, binaries: { ytDlp: process.execPath, ffmpeg: process.execPath, browser: process.execPath } }));
    assert.deepEqual(runtimeBinaries(manifest), { ytDlp: process.execPath, ffmpeg: process.execPath, browser: process.execPath });
    process.env.WANCHUANG_YTDLP = manifest;
    assert.equal(runtimeBinaries(manifest).ytDlp, manifest);
    delete process.env.WANCHUANG_YTDLP;
    fs.writeFileSync(manifest, JSON.stringify({ schema: 1, binaries: { ytDlp: path.join(root, 'missing.exe'), browser: 42 } }));
    assert.doesNotThrow(() => runtimeBinaries(manifest));
    assert.notEqual(runtimeBinaries(manifest).ytDlp, path.join(root, 'missing.exe'));
    fs.writeFileSync(manifest, 'incomplete');
    assert.doesNotThrow(() => runtimeBinaries(manifest));
  } finally {
    names.forEach((name, index) => {
      if (old[index] === undefined) delete process.env[name];
      else process.env[name] = old[index];
    });
    fs.rmSync(root, { recursive: true, force: true });
  }
});
