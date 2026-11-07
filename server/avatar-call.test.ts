import assert from 'node:assert/strict';
import { once } from 'node:events';
import { mkdtempSync, rmSync } from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import test from 'node:test';
import express from 'express';
import { WebSocket, WebSocketServer } from 'ws';
import { registerAvatarCall } from './avatar-call';
import { readToolSettings, writeToolSettings } from './tool-settings';

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
      if (url === '/live/v1/voices') return {
        voices: [{ voice: 'original_voice', provider: 'qwen_omni' }],
        public_voices: [{ voice: 'vidu-xiaoya', provider: 'qwen_omni', language: 'zh' }],
      };
      if (url.startsWith('/live/v1/avatars?pager.page=')) {
        const page = Number(new URL('https://api.vidu.cn' + url).searchParams.get('pager.page'));
        if (page === 0) return { items: Array.from({ length: 100 }, (_, index) => ({
          id: `a${index}`, name: `Avatar ${index}`, image_uri: index === 1 ? 'http://insecure' : 'https://example.com/avatar.png',
          status: 'success', created_at: '2026-10-16T15:45:15Z',
        })) };
        if (page === 1) return { items: Array.from({ length: 3 }, (_, index) => ({ id: `b${index}`, status: 'success' })) };
        return { items: [] };
      }
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
    assert.deepEqual(await (await fetch(url + '/api/admin/assistant/call/voices', { headers: admin })).json(), { voices: [
      { voice: 'original_voice', provider: 'qwen_omni', shared: false },
      { voice: 'vidu-xiaoya', provider: 'qwen_omni', shared: true },
    ] });
    assert.equal((await fetch(url + '/api/admin/assistant/call/avatars')).status, 401);
    const avatarResponse = await fetch(url + '/api/admin/assistant/call/avatars', { headers: admin });
    const avatarData = await avatarResponse.json();
    assert.equal(avatarData.avatars.length, 103);
    assert.equal(avatarData.avatars[1].imageUrl, '');
    assert.deepEqual(avatarData.avatars[0], {
      id: 'a0', name: 'Avatar 0', imageUrl: 'https://example.com/avatar.png',
      status: 'success', createdAt: '2026-10-16T15:45:15Z',
    });
    assert.deepEqual(calls.filter(call => call.url.startsWith('/live/v1/avatars?')).map(call => call.url), [
      '/live/v1/avatars?pager.page=0&pager.pagesz=100',
      '/live/v1/avatars?pager.page=1&pager.pagesz=100',
    ]);
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

for (const ownCos of [true, false]) {
  test(`media URLs: ${ownCos ? 'own COS signatures are refreshed' : 'third-party query strings are preserved'}`, async () => {
    const folder = mkdtempSync(path.join(os.tmpdir(), 'myspace-avatar-media-'));
    const previousFile = process.env.TOOL_SETTINGS_FILE;
    const previousSecret = process.env.TOOL_SETTINGS_SECRET;
    process.env.TOOL_SETTINGS_FILE = path.join(folder, 'test-settings.enc');
    process.env.TOOL_SETTINGS_SECRET = 'test-only-encryption-secret-32-characters';
    const ownOrigin = 'https://test-bucket.cos.example.com';
    const origin = ownCos ? ownOrigin : 'https://third-party.example.com';
    const imageUrl = `${origin}/avatar.png?q-signature=expired&custom=keep%2Bme`;
    const audioUrl = `${origin}/reference.wav?q-signature=expired&custom=keep%2Bme`;
    const stripSignature = (url: string) => url.startsWith(ownOrigin + '/') ? url.split('?')[0] : url;
    const sign = (url: string) => url.startsWith(ownOrigin + '/') ? `${stripSignature(url)}?q-signature=fresh` : url;
    const signedInputs: string[] = [];
    const calls: { url: string; body: any }[] = [];
    const app = express();
    app.use(express.json());
    registerAvatarCall(app, (_req, _res, next) => next(), null, {
      request: async (_key, url, body) => {
        calls.push({ url, body });
        if (url === '/live/v1/voices/clone') return { voice: 'test_voice' };
        // Stop before WebSocket setup; this test checks the outbound payload only.
        return {};
      },
      dial: () => { throw new Error('Unexpected WebSocket connection'); },
    }, { stripSignature, sign: url => { signedInputs.push(url); return sign(url); } });
    const server = app.listen(0, '127.0.0.1');
    await once(server, 'listening');
    const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
    const headers = { 'Content-Type': 'application/json' };
    try {
      const settings = '/api/admin/assistant/call/settings';
      const initial = await (await fetch(base + settings)).json();
      const response = await fetch(base + settings, { method: 'PUT', headers, body: JSON.stringify({
        ...initial, apiKey: 'vda_test_only', enabled: true, persona: 'test', imageUrl,
      }) });
      assert.equal(response.status, 200);
      assert.equal((await response.json()).imageUrl, stripSignature(imageUrl));
      assert.equal(readToolSettings().avatarCall?.imageUrl, stripSignature(imageUrl));
      // Also cover legacy settings that already contain an expired signature.
      const stored = readToolSettings();
      stored.avatarCall!.imageUrl = imageUrl;
      writeToolSettings(stored);
      const clone = await fetch(base + '/api/admin/assistant/call/voices', { method: 'POST', headers,
        body: JSON.stringify({ audioUrl, name: 'test_voice', transcript: '', voiceProvider: 'qwen_omni' }),
      });
      assert.equal(clone.status, 200);
      assert.equal(calls.find(call => call.url === '/live/v1/voices/clone')?.body.audio_url, sign(audioUrl));
      const call = await fetch(base + '/api/assistant/call', { method: 'POST' });
      await call.text();
      assert.equal(calls.find(call => call.url === '/live/s_avatar/realtime')?.body.avatar.image_uri, sign(imageUrl));
      assert.deepEqual(signedInputs, [audioUrl, imageUrl]);
      assert.equal(readToolSettings().avatarCall?.imageUrl, imageUrl, 'Signing at call time must not rewrite stored settings');
    } finally {
      server.closeAllConnections();
      await new Promise<void>(resolve => server.close(() => resolve()));
      rmSync(folder, { recursive: true, force: true });
      if (previousFile === undefined) delete process.env.TOOL_SETTINGS_FILE; else process.env.TOOL_SETTINGS_FILE = previousFile;
      if (previousSecret === undefined) delete process.env.TOOL_SETTINGS_SECRET; else process.env.TOOL_SETTINGS_SECRET = previousSecret;
    }
  });
}
