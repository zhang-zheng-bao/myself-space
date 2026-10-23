import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { runtimeBinaries, validateRemote } from './wanchuang-runtime';

test('public IPv4 and mapped public addresses pass while private destinations remain blocked', async () => {
  await validateRemote('https://220.181.165.170/');
  await validateRemote('https://[::ffff:dcb5:a5aa]/');
  for(const url of ['http://127.0.0.1/','http://10.1.2.3/','http://192.168.1.2/','http://[::1]/','http://[::ffff:127.0.0.1]/']) {
    await assert.rejects(validateRemote(url),/内网/);
  }
});

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
