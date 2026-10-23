import test from 'node:test';
import assert from 'node:assert/strict';
import express from 'express';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { registerToolSettings, readToolSettings } from './tool-settings';

test('admin settings: permissions, encrypted persistence, masking and clearing', async () => {
  const directory = fs.mkdtempSync(path.join(os.tmpdir(), 'wanchuang-settings-test-'));
  const previousFile = process.env.TOOL_SETTINGS_FILE;
  const previousSecret = process.env.TOOL_SETTINGS_SECRET;
  process.env.TOOL_SETTINGS_FILE = path.join(directory, 'config.enc');
  process.env.TOOL_SETTINGS_SECRET = 'test-only-secret-with-at-least-32-characters';
  const app = express(); app.use(express.json());
  registerToolSettings(app, (req, res, next) => { if (req.headers.authorization !== 'test-admin') { res.sendStatus(401); return; } next(); });
  const server = app.listen(0, '127.0.0.1');
  await new Promise<void>(resolve => server.once('listening', resolve));
  const address = server.address() as { port: number };
  const endpoint = `http://127.0.0.1:${address.port}/api/admin/tools/wanchuang/settings`;
  const headers = { Authorization: 'test-admin', 'Content-Type': 'application/json' };
  const body = { concurrency: 2, retentionHours: 6, iflytekAppId: 'app1', secrets: { minimaxApiKey: 'sensitive-test-value' }, clearSecrets: [] };
  const save = (value: unknown, extra = {}) => fetch(endpoint, { method: 'PUT', headers: { ...headers, ...extra }, body: JSON.stringify(value) });
  try {
    assert.equal((await fetch(endpoint)).status, 401);
    assert.equal((await fetch(endpoint, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) })).status, 401);
    assert.equal((await save(body, { 'Sec-Fetch-Site': 'cross-site' })).status, 403);
    assert.equal((await save({ ...body, concurrency: 50 })).status, 400);
    const saved = await save(body); assert.equal(saved.status, 200);
    assert.equal((await saved.json()).configured.minimaxApiKey, true);
    assert.ok(!fs.readFileSync(process.env.TOOL_SETTINGS_FILE!, 'utf8').includes('sensitive-test-value'));
    const retrieved = await fetch(endpoint, { headers });
    assert.equal(retrieved.headers.get('cache-control'), 'no-store');
    assert.ok(!(await retrieved.text()).includes('sensitive-test-value'));
    assert.equal((await (await save({ ...body, secrets: { minimaxApiKey: '' } })).json()).configured.minimaxApiKey, true);
    assert.equal((await (await save({ ...body, secrets: {}, clearSecrets: ['minimaxApiKey'] })).json()).configured.minimaxApiKey, false);
    const validCookie = 'ttwid=test-public; sessionid=test-session';
    assert.equal((await save({ ...body, secrets: { douyinCookie: validCookie } })).status, 200);
    for (const field of ['douyinCookie', 'bilibiliCookie', 'xiaohongshuCookie']) {
      const before = fs.readFileSync(process.env.TOOL_SETTINGS_FILE!, 'utf8');
      const invalid = await save({ ...body, concurrency: 3, secrets: { [field]: 'not-a-cookie' } });
      assert.equal(invalid.status, 400, `${field} must reject unrecognised content before saving`);
      assert.match((await invalid.json()).error, /Cookie/);
      assert.equal(fs.readFileSync(process.env.TOOL_SETTINGS_FILE!, 'utf8'), before, 'Rejected changes must not overwrite any saved settings');
      assert.equal(readToolSettings().secrets.douyinCookie, validCookie);
    }
    for (const value of [
      'Cookie: ttwid=test-public; sessionid=test-session',
      JSON.stringify([{ name: 'sessionid', value: 'test-session', domain: '.douyin.com' }]),
      JSON.stringify({ cookies: [{ name: 'sessionid', value: 'test-session', domain: '.douyin.com' }] }),
      '# Netscape HTTP Cookie File\n.douyin.com\tTRUE\t/\tTRUE\t0\tsessionid\ttest-session',
    ]) {
      const response = await save({ ...body, secrets: { douyinCookie: value } });
      assert.equal(response.status, 200, 'Existing supported formats must remain accepted');
      assert.equal((await response.json()).configured.douyinCookie, true);
    }
  } finally {
    server.closeAllConnections(); await new Promise<void>(resolve => server.close(() => resolve()));
    fs.unlinkSync(path.join(directory, 'config.enc')); fs.rmdirSync(directory);
    if (previousFile === undefined) delete process.env.TOOL_SETTINGS_FILE; else process.env.TOOL_SETTINGS_FILE = previousFile;
    if (previousSecret === undefined) delete process.env.TOOL_SETTINGS_SECRET; else process.env.TOOL_SETTINGS_SECRET = previousSecret;
  }
});
