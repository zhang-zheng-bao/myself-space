import { randomUUID } from 'node:crypto';
import type { Express, RequestHandler } from 'express';
import type { SupabaseClient } from '@supabase/supabase-js';
import { WebSocket } from 'ws';
import { readToolSettings, writeToolSettings } from './tool-settings';

export type AvatarCallSettings = {
  enabled: boolean; model: 'vidu-s1' | 'vidu-s2'; persona: string; greeting: string;
  avatarId: string; imageUrl: string; voice: string; voiceProvider: 'qwen_omni' | 'doubao'; idleSeconds: number; maxSeconds: number;
  interruption: 'server' | 'semantic'; silenceMs: number; temperature: number;
  idleAction: boolean; personaEnhance: boolean; updatedAt?: string;
};
const defaults: AvatarCallSettings = {
  enabled: false, model: 'vidu-s2', persona: '', greeting: '', avatarId: '', imageUrl: '',
  voice: '', voiceProvider: 'qwen_omni', idleSeconds: 60, maxSeconds: 300, interruption: 'semantic', silenceMs: 400,
  temperature: 0.7, idleAction: false, personaEnhance: false,
};
const base = 'https://api.vidu.cn';
const adminPath = '/api/admin/assistant/call';
const callPath = '/api/assistant/call';
const keyFrom = (settings: ReturnType<typeof readToolSettings>) => settings.secrets.avatarCallApiKey || process.env.VIDU_API_KEY?.trim() || '';
const current = (settings: ReturnType<typeof readToolSettings>) => ({ ...defaults, ...settings.avatarCall });
const within = (v: unknown, lo: number, hi: number): v is number => typeof v === 'number' && Number.isFinite(v) && v >= lo && v <= hi;
const short = (v: unknown, n: number): v is string => typeof v === 'string' && v.length <= n;
const httpsUrl = (value: string) => { try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password; } catch { return false; } };
const safeOrigin: RequestHandler = (req, res, next) => {
  if (req.headers['sec-fetch-site'] === 'cross-site') return res.status(403).json({ error: '不允许跨站操作。' });
  next();
};

export function parseAvatarSettings(body: any): AvatarCallSettings | null {
  if (!body || !['vidu-s1', 'vidu-s2'].includes(body.model) || !['server', 'semantic'].includes(body.interruption)
    || !['qwen_omni', 'doubao'].includes(body.voiceProvider)
    || ['enabled', 'idleAction', 'personaEnhance'].some(key => typeof body[key] !== 'boolean')
    || !short(body.persona, 8000) || !short(body.greeting, 1000) || !short(body.avatarId, 160)
    || !short(body.imageUrl, 2048) || !short(body.voice, 128)
    || (body.imageUrl.trim() && !httpsUrl(body.imageUrl.trim()))
    || !within(body.idleSeconds, 10, 300) || !Number.isInteger(body.idleSeconds)
    || !within(body.maxSeconds, 30, 600) || !Number.isInteger(body.maxSeconds) || body.idleSeconds > body.maxSeconds
    || !within(body.silenceMs, 200, 1500) || !Number.isInteger(body.silenceMs)
    || !within(body.temperature, 0, 1.5)) return null;
  const { enabled, model, persona, greeting, avatarId, imageUrl, voice, voiceProvider, idleSeconds, maxSeconds, interruption, silenceMs, temperature, idleAction, personaEnhance } = body;
  return { enabled, model, persona: persona.trim(), greeting: greeting.trim(), avatarId: avatarId.trim(),
    imageUrl: imageUrl.trim(), voice: voice.trim(), voiceProvider, idleSeconds, maxSeconds, interruption, silenceMs,
    temperature, idleAction, personaEnhance };
}

export function avatarCreateBody(config: AvatarCallSettings) {
  return {
    call_mode: 'video', character_id: '1', model: config.model,
    avatar: {
      persona: config.persona, name: '小柴',
      ...(config.avatarId ? { id: config.avatarId } : { image_uri: config.imageUrl }),
      ...(config.voice ? { voice: config.voice } : {}),
      ...(config.greeting ? { greeting_instruction: config.greeting } : {}),
      idle_action: config.idleAction, persona_enhance: config.personaEnhance,
    },
    ...(config.model === 'vidu-s2' ? { voice_model: { provider: config.voiceProvider } } : {}),
    vad: { type: config.interruption, silence_duration_ms: config.silenceMs },
    llm: { temperature: config.temperature },
    idle_timeout_seconds: config.idleSeconds,
  };
}

class ServiceError extends Error {}
async function provider(key: string, pathname: string, body?: unknown, signal?: AbortSignal) {
  const timeout = AbortSignal.timeout(body ? 35_000 : 12_000);
  const response = await fetch(base + pathname, {
    method: body ? 'POST' : 'GET',
    headers: { Authorization: `Token ${key}`, 'Content-Type': 'application/json' },
    redirect: 'error', signal: signal ? AbortSignal.any([timeout, signal]) : timeout,
    body: body ? JSON.stringify(body) : undefined,
  });
  const result = await response.json().catch(() => null);
  if (!response.ok || !result) {
    if (response.status === 401 || response.status === 403) throw new ServiceError('服务凭证无效或没有权限，请在后台检查。');
    if (response.status === 402 || result?.code === 'CreditInsufficient' || result?.reason === 'CreditInsufficient') throw new ServiceError('数字人服务积分不足。');
    if (response.status === 429) throw new ServiceError('数字人服务繁忙，请稍后再试。');
    throw new ServiceError(`数字人服务未接受请求（HTTP ${response.status}），请检查形象、音色或参考音频。`);
  }
  return result;
}

const dial = (url: string, key: string) => new WebSocket(url, { headers: { Authorization: `Token ${key}` }, handshakeTimeout: 10_000, maxPayload: 256 * 1024, followRedirects: false });

export function registerAvatarCall(app: Express, requireAdmin: RequestHandler, supabase: SupabaseClient | null,
  transport = { request: provider, dial },
  mediaUrls = { stripSignature: (url: string) => url, sign: (url: string) => url }) {
  let busy = false;
  let lastCall = 0;
  let lastClone = 0;
  const masked = (stored: ReturnType<typeof readToolSettings>) => ({ ...current(stored), configured: Boolean(keyFrom(stored)) });
  app.get(adminPath + '/settings', requireAdmin, (_req, res) => {
    res.set('Cache-Control', 'no-store');
    try { res.json(masked(readToolSettings())); }
    catch { res.status(500).json({ error: '读取失败，请检查应用配置加密密钥。' }); }
  });
  app.put(adminPath + '/settings', safeOrigin, requireAdmin, (req, res) => {
    const next = parseAvatarSettings(req.body);
    const key = req.body?.apiKey;
    if (!next || (key !== undefined && (!short(key, 300) || (key.trim() && !/^vda_[\w-]+$/.test(key.trim()))))) {
      return res.status(400).json({ error: '设置格式不正确，请检查密钥、形象链接和通话时长。' });
    }
    try {
      const stored = readToolSettings();
      if (key?.trim()) stored.secrets.avatarCallApiKey = key.trim();
      if (next.enabled && (!keyFrom(stored) || !next.persona || (!next.avatarId && !next.imageUrl))) {
        return res.status(400).json({ error: '启用前请填写 API Key、人设和形象。' });
      }
      stored.avatarCall = { ...next, imageUrl: mediaUrls.stripSignature(next.imageUrl), updatedAt: new Date().toISOString() };
      writeToolSettings(stored);
      res.set('Cache-Control', 'no-store').json(masked(stored));
    } catch { res.status(500).json({ error: '保存失败，请配置应用加密密钥并检查目录权限。' }); }
  });
  app.get(adminPath + '/voices', requireAdmin, async (_req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      const key = keyFrom(readToolSettings());
      if (!key) return res.status(400).json({ error: '请先保存服务密钥。' });
      const body = await transport.request(key, '/live/v1/voices');
      if (!Array.isArray(body?.voices)) throw new ServiceError('音色列表返回格式异常。');
      const sources = [
        { items: body.voices, shared: false },
        { items: Array.isArray(body.public_voices) ? body.public_voices : [], shared: true },
      ];
      const voices = new Map<string, { voice: string; provider: string; shared: boolean }>();
      for (const { items, shared } of sources) {
        for (const item of items) {
          const voice = item?.voice;
          if (typeof voice !== 'string' || !voice.trim() || !short(voice, 128) || voices.has(voice)) continue;
          voices.set(voice, {
            voice, shared,
            provider: typeof item.provider === 'string' && item.provider.length <= 32 ? item.provider : '',
          });
        }
      }
      res.json({ voices: [...voices.values()] });
    } catch (e) { res.status(502).json({ error: e instanceof ServiceError ? e.message : '暂时无法读取云端音色。' }); }
  });
  app.get(adminPath + '/avatars', requireAdmin, async (_req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      const key = keyFrom(readToolSettings());
      if (!key) return res.status(400).json({ error: '请先保存服务密钥。' });
      const avatars = [];
      for (let page = 0; page < 5; page++) {
        const body = await transport.request(key, `/live/v1/avatars?pager.page=${page}&pager.pagesz=100`);
        if (!Array.isArray(body?.items)) throw new ServiceError('形象列表返回格式异常。');
        for (const item of body.items) {
          if (item?.id === undefined || item?.id === null) continue;
          const id = String(item.id);
          if (!id || id.length > 160) continue;
          avatars.push({
            id,
            name: typeof item.name === 'string' ? item.name : '',
            imageUrl: typeof item.image_uri === 'string' && httpsUrl(item.image_uri) ? item.image_uri : '',
            status: typeof item.status === 'string' ? item.status : '',
            createdAt: typeof item.created_at === 'string' ? item.created_at : '',
          });
        }
        if (body.items.length < 100) break;
      }
      res.json({ avatars });
    } catch (e) { res.status(502).json({ error: e instanceof ServiceError ? e.message : '暂时无法读取云端形象。' }); }
  });
  app.post(adminPath + '/voices', safeOrigin, requireAdmin, async (req, res) => {
    const { audioUrl, name, transcript, voiceProvider } = req.body || {};
    if (!short(audioUrl, 2048) || !httpsUrl(audioUrl) || !short(name, 64) || !/^[a-zA-Z0-9_]{1,64}$/.test(name) || !short(transcript, 4096) || !['qwen_omni', 'doubao'].includes(voiceProvider)) {
      return res.status(400).json({ error: '请填写 HTTPS 参考音频地址，音色名只能使用字母、数字和下划线。' });
    }
    try {
      const key = keyFrom(readToolSettings());
      if (!key) return res.status(400).json({ error: '请先保存服务密钥。' });
      if (Date.now() - lastClone < 35_000) return res.status(429).json({ error: '请稍后再发起下一次克隆。' });
      lastClone = Date.now();
      const body = await transport.request(key, '/live/v1/voices/clone', {
        audio_url: mediaUrls.sign(audioUrl), voice: name, language: 'zh', provider: voiceProvider, ...(transcript.trim() ? { text: transcript.trim() } : {}),
      });
      if (!short(body.voice, 128) || !body.voice) throw new ServiceError('未收到新音色，请先刷新云端音色列表确认结果。');
      res.json({ voice: body.voice });
    } catch (e) { res.status(502).json({ error: e instanceof ServiceError ? e.message : '克隆未确认，请先刷新音色列表再重试。' }); }
  });

  // The initial rollout is available to signed-in administrators on the public site.
  // A browser never receives the long-lived key; only the short-lived media credentials.
  app.get(callPath + '/status', requireAdmin, (_req, res) => {
    res.set('Cache-Control', 'no-store');
    try {
      const stored = readToolSettings();
      res.json({ enabled: Boolean(current(stored).enabled && keyFrom(stored)) });
    } catch { res.json({ enabled: false }); }
  });
  app.post(callPath, safeOrigin, requireAdmin, async (_req, res) => {
    let stored;
    try { stored = readToolSettings(); }
    catch { return res.status(503).json({ error: '暂时无法读取通话配置。' }); }
    const config = current(stored);
    const key = keyFrom(stored);
    if (!config.enabled || !key) return res.status(503).json({ error: '数字人通话尚未启用。' });
    if (busy || Date.now() - lastCall < 3000) return res.status(429).json({ error: '已有通话正在进行，请稍后重试。' });
    busy = true;
    lastCall = Date.now();
    const id = randomUUID();
    const conn = randomUUID();
    const created = new Date();
    const abort = new AbortController();
    let liveId = '';
    let sequence = 0;
    let upstream: WebSocket | undefined;
    let readyAt: number | undefined;
    let retry: ReturnType<typeof setTimeout> | undefined;
    let heartbeat: ReturnType<typeof setInterval> | undefined;
    let limit: ReturnType<typeof setTimeout> | undefined;
    let done = false;
    let pongs = true;
    let rtc: { token: string; userId: string } | undefined;
    function event(type: string, data: unknown = null) {
      if (!res.destroyed && !res.writableEnded) res.write(`data: ${JSON.stringify({ type, data })}\n\n`);
    }
    function signal(type: number, payload: unknown) {
      upstream?.send(JSON.stringify({ type, live_id: liveId, conn_id: conn, seq_id: ++sequence, payload }), () => {});
    }
    function finish(reason: string, error?: string) {
      if (done) return;
      done = true;
      abort.abort();
      clearTimeout(retry); clearTimeout(limit); clearInterval(heartbeat);
      if (upstream?.readyState === WebSocket.OPEN) {
        signal(5, { hangup: { hangup_reason: 'user_end' } });
        upstream.close();
        const kill = setTimeout(() => upstream?.terminate(), 1500);
        kill.unref();
      } else upstream?.terminate();
      busy = false;
      if (!res.destroyed && !res.writableEnded) { event(error ? 'error' : 'end', error || reason); res.end(); }
      if (supabase) void Promise.resolve(supabase.from('portfolio_avatar_calls').insert({
        id, started_at: created.toISOString(), ended_at: new Date().toISOString(), outcome: reason,
        setup_ms: readyAt ? readyAt - created.getTime() : null, settings_version: config.updatedAt || null,
      })).then(({ error }) => { if (error) console.warn('[avatar-call] session record unavailable', error.code); })
        .catch(() => console.warn('[avatar-call] session record unavailable'));
    }
    res.on('close', () => finish('client_closed'));
    res.set({ 'Content-Type': 'text/event-stream; charset=utf-8', 'Cache-Control': 'no-store, no-transform', 'X-Accel-Buffering': 'no' });
    res.flushHeaders();
    event('connecting');
    limit = setTimeout(() => finish('setup_timeout', '连接超时，请稍后重试。'), 60_000);
    heartbeat = setInterval(() => {
      if (res.destroyed) return finish('client_closed');
      if (upstream?.readyState === WebSocket.OPEN) {
        if (!pongs) return finish('connection_lost', '通话服务连接中断。');
        pongs = false;
        upstream.ping(undefined, undefined, () => {});
      }
      res.write(': keepalive\n\n');
    }, 10_000);
    try {
      const session = await transport.request(key, '/live/s_avatar/realtime', avatarCreateBody({
        ...config, imageUrl: config.avatarId ? config.imageUrl : mediaUrls.sign(config.imageUrl),
      }), abort.signal);
      if (done) return;
      // The documented ID is a string. Refuse lossy numeric identifiers.
      if (typeof session.live?.id !== 'string' || !session.live.id || typeof session.rtc?.token !== 'string' || !session.rtc.token || typeof session.rtc?.user_id !== 'string' || !session.rtc.user_id) {
        return finish('invalid_session', '通话服务未返回完整的入会凭证。');
      }
      liveId = session.live.id;
      rtc = { token: session.rtc.token, userId: session.rtc.user_id };
      const query = new URLSearchParams({ live_id: liveId, conn_id: conn });
      upstream = transport.dial(`wss://api.vidu.cn/live/ws/live/connect?${query}`, key);
      const init = () => { if (upstream?.readyState === WebSocket.OPEN && !done) signal(1, { conn_init: { version: 1 } }); };
      upstream.on('open', init);
      upstream.on('pong', () => { pongs = true; });
      upstream.on('message', raw => {
        if (done) return;
        let message: any;
        try { message = JSON.parse(raw.toString()); } catch { return; }
        const ack = message?.payload?.conn_init_ack;
        if (message?.type === 2 && ack && !readyAt) {
          clearTimeout(retry);
          if (ack.success === true) {
            readyAt = Date.now();
            clearTimeout(limit);
            limit = setTimeout(() => finish('time_limit'), config.maxSeconds * 1000);
            event('ready', rtc);
          } else if (ack.error_code === 'NOT_READY') retry = setTimeout(init, 2000);
          else finish('handshake_rejected', '数字人未能就绪，请检查后台配置。');
        } else if (message?.type === 6) finish('remote_ended');
      });
      upstream.on('close', () => finish('connection_lost', '通话连接已断开。'));
      upstream.on('error', () => finish('connection_error', '暂时无法连接通话服务。'));
    } catch (e) {
      finish('create_failed', e instanceof ServiceError ? e.message : '创建通话失败，请稍后重试。');
    }
  });
}
