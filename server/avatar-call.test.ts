import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import express from 'express';
import { WebSocket, WebSocketServer } from 'ws';
import { registerAvatarCall } from './avatar-call';

test('admin can migrate the prompt and cloned voice; video session waits for cloud readiness and hangs up on disconnect', { timeout: 8000 }, async () => {
  const folder = mkdtempSync(path.join(os.tmpdir(), 'myspace-avatar-'));
  process.env.TOOL_SETTINGS_FILE = path.join(folder, 'test-settings.enc');
  process.env.TOOL_SETTINGS_SECRET = 'test-only-encryption-secret-32-characters';
  const rtc = new WebSocketServer({ host: '127.0.0.1', port: 0 });
  await once(rtc, 'listening');
  const address = rtc.address() as { port: number };
  const hangup = Promise.withResolvers<any>();
  rtc.on('connection', socket => socket.on('message', raw => {
    const signal = JSON.parse(raw.toString());
    if (signal.type === 1) socket.send(JSON.stringify({ type: 2, payload: { conn_init_ack: { success: true } } }));
    if (signal.type === 5) hangup.resolve(signal);
  }));
  const calls: { url: string; body: any }[] = [];
  const app = express();
  app.use(express.json());
  registerAvatarCall(app, (req, res, next) => {
    if (req.headers['x-test-admin'] === '1') next();
    else res.sendStatus(401);
  }, null, {
    request: async (_key, url, body) => {
      calls.push({ url, body });
      if (url === '/live/v1/voices') return { voices: [{ voice: 'original_voice' }] };
      if (url === '/live/v1/voices/clone') return { voice: 'new_voice' };
      return { live: { id: '900719925474099312' }, rtc: { token: 'short-lived-rtc', user_id: 'visitor' } };
    },
    dial: url => {
      assert.equal(new URL(url).searchParams.get('authorization'), 'vda_test_only');
      return new WebSocket(`ws://127.0.0.1:${address.port}`);
    },
  });
  const server = app.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const url = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  const admin = { 'x-test-admin': '1', 'Content-Type': 'application/json' };
  const settings = '/api/admin/assistant/call/settings';
  const controller = new AbortController();
  try {
    assert.equal((await fetch(url + '/api/assistant/call', { method: 'POST' })).status, 401);
    const initial = await (await fetch(url + settings, { headers: admin })).json();
    const update = await fetch(url + settings, { method: 'PUT', headers: admin, body: JSON.stringify({
      ...initial, apiKey: 'vda_test_only', enabled: true, persona: '测试角色提示词', avatarId: 'existing-avatar', voice: 'original_voice',
    }) });
    assert.equal(update.status, 200);
    const saved = await update.json();
    assert.equal(saved.persona, '测试角色提示词');
    assert.equal(saved.configured, true);
    assert.doesNotMatch(JSON.stringify(saved), /vda_test_only/);
    assert.deepEqual(await (await fetch(url + '/api/admin/assistant/call/voices', { headers: admin })).json(), { voices: ['original_voice'] });
    const clone = await fetch(url + '/api/admin/assistant/call/voices', { method: 'POST', headers: admin, body: JSON.stringify({
      audioUrl: 'https://example.com/voice.wav', name: 'new_voice', transcript: '', voiceProvider: 'qwen_omni',
    }) });
    assert.deepEqual(await clone.json(), { voice: 'new_voice' });
    const response = await fetch(url + '/api/assistant/call', { method: 'POST', headers: admin, signal: controller.signal });
    const reader = response.body!.pipeThrough(new TextDecoderStream()).getReader();
    let events = '';
    while (!events.includes('short-lived-rtc')) {
      const next = await reader.read();
      assert.equal(next.done, false);
      events += next.value;
    }
    assert.match(events, /"type":"ready"/);
    assert.doesNotMatch(events, /vda_test_only|测试角色提示词/);
    assert.equal(calls.at(-1)?.body.avatar.persona, '测试角色提示词');
    assert.equal(calls.at(-1)?.body.avatar.voice, 'original_voice');
    assert.equal(calls.at(-1)?.body.avatar.id, 'existing-avatar');
    assert.equal((await fetch(url + '/api/assistant/call', { method: 'POST', headers: admin })).status, 429);
    await reader.cancel();
    const message = await Promise.race([hangup.promise, new Promise((_, reject) => {
      setTimeout(() => reject(new Error('missing upstream hangup')), 2000).unref();
    })]);
    assert.equal(message.live_id, '900719925474099312');
    assert.equal(message.payload.hangup.hangup_reason, 'user_end');
  } finally {
    controller.abort();
    server.closeAllConnections();
    server.close();
    for (const socket of rtc.clients) socket.terminate();
    rtc.close();
    rmSync(folder, { recursive: true, force: true });
    delete process.env.TOOL_SETTINGS_FILE;
    delete process.env.TOOL_SETTINGS_SECRET;
  }
});
