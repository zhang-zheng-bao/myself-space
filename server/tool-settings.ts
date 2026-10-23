import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import type { Express, RequestHandler } from 'express';
import { normalizeCookieInput } from './platform-cookies.cjs';

const fields = ['iflytekApiKey', 'iflytekApiSecret', 'minimaxApiKey', 'douyinCookie', 'bilibiliCookie', 'xiaohongshuCookie'];
export type VoiceModel = { id: string; name: string; type: string; createdAt?: string };
export type Settings = { concurrency: number; retentionHours: number; iflytekAppId: string; secrets: Record<string, string>; hiddenVoices?: string[]; voiceModels?: VoiceModel[]; voiceModelsAccount?: string };
export function readToolSettings(): Settings {
  const file = path.resolve(process.env.TOOL_SETTINGS_FILE || '.private/wanchuang-settings.enc');
  if (!fs.existsSync(file)) return { concurrency: 2, retentionHours: 6, iflytekAppId: '', secrets: {} };
  const secret = process.env.TOOL_SETTINGS_SECRET || process.env.ADMIN_SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error('应用配置加密密钥未配置');
  const data = JSON.parse(fs.readFileSync(file, 'utf8'));
  const decipher = crypto.createDecipheriv('aes-256-gcm', crypto.createHash('sha256').update(secret).digest(), Buffer.from(data.iv, 'base64'));
  decipher.setAuthTag(Buffer.from(data.tag, 'base64'));
  return JSON.parse(Buffer.concat([decipher.update(Buffer.from(data.value, 'base64')), decipher.final()]).toString());
}
export function writeToolSettings(settings: Settings) {
  const file = path.resolve(process.env.TOOL_SETTINGS_FILE || '.private/wanchuang-settings.enc');
  const secret = process.env.TOOL_SETTINGS_SECRET || process.env.ADMIN_SESSION_SECRET;
  if (!secret || secret.length < 32) throw new Error('Missing encryption key');
  const encryptionKey = crypto.createHash('sha256').update(secret).digest();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey, iv);
  const value = Buffer.concat([cipher.update(JSON.stringify(settings), 'utf8'), cipher.final()]);
  fs.mkdirSync(path.dirname(file), { recursive: true, mode: 0o700 });
  const temporary = `${file}.${crypto.randomUUID()}.tmp`;
  try {
    fs.writeFileSync(temporary, JSON.stringify({ iv: iv.toString('base64'), tag: cipher.getAuthTag().toString('base64'), value: value.toString('base64') }), { mode: 0o600 });
    fs.renameSync(temporary, file);
  } finally { fs.rmSync(temporary, { force: true }); }
}
export function registerToolSettings(app: Express, requireAdmin: RequestHandler) {
  function read(): Settings {
    return readToolSettings();
  }
  function masked(config: Settings) {
    return { concurrency: config.concurrency, retentionHours: config.retentionHours, iflytekAppId: config.iflytekAppId,
      configured: Object.fromEntries(fields.map(field => [field, Boolean(config.secrets[field])])) };
  }
  app.get('/api/admin/tools/wanchuang/settings', requireAdmin, (_req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    try { res.json(masked(read())); } catch { res.status(500).json({ error: '读取失败，请检查配置加密密钥。' }); }
  });
  app.put('/api/admin/tools/wanchuang/settings', requireAdmin, (req, res) => {
    res.setHeader('Cache-Control', 'no-store');
    if (req.headers['sec-fetch-site'] === 'cross-site') { res.status(403).json({ error: '不允许跨站保存' }); return; }
    const b = req.body;
    if (!b || !Number.isInteger(b.concurrency) || b.concurrency < 1 || b.concurrency > 3 || !Number.isInteger(b.retentionHours) || b.retentionHours < 1 || b.retentionHours > 24 || typeof b.iflytekAppId !== 'string' || !/^[a-zA-Z0-9_-]{0,100}$/.test(b.iflytekAppId) || !b.secrets || typeof b.secrets !== 'object' || Array.isArray(b.secrets) || fields.some(f => b.secrets[f] !== undefined && (typeof b.secrets[f] !== 'string' || b.secrets[f].length > (f.endsWith('Cookie') ? 1024 * 1024 : 16000))) || !Array.isArray(b.clearSecrets) || b.clearSecrets.some((f: string) => !fields.includes(f))) {
      res.status(400).json({ error: '配置格式有误：并发 1–3，文件保留时间 1–24 小时。' }); return;
    }
    // Validate the complete update before touching encrypted settings. Use the
    // same parser as execution, so saving cannot silently accept unusable input.
    for (const platform of ['douyin', 'bilibili', 'xiaohongshu']) {
      const field = `${platform}Cookie`;
      const value = b.secrets[field]?.trim();
      if (!value || b.clearSecrets.includes(field)) continue;
      try {
        const normalized = normalizeCookieInput(value, platform);
        b.secrets[field] = normalized.header;
      }
      catch {
        const label = { douyin: '抖音', bilibili: 'B站', xiaohongshu: '小红书' }[platform];
        res.status(400).json({ error: `${label} Cookie 格式无法识别，请粘贴 Cookie 请求头、JSON 数组或 cookies.txt 内容。此次修改未保存，原配置已保留。` });
        return;
      }
    }
    try {
      const next = read();
      next.concurrency = b.concurrency; next.retentionHours = b.retentionHours; next.iflytekAppId = b.iflytekAppId;
      for (const f of fields) { if (b.clearSecrets.includes(f)) delete next.secrets[f]; else if (b.secrets[f]?.trim()) next.secrets[f] = b.secrets[f].trim(); }
      writeToolSettings(next);
      res.json(masked(next));
    } catch { res.status(500).json({ error: '保存失败：请配置至少 32 位的 TOOL_SETTINGS_SECRET（或 ADMIN_SESSION_SECRET），并检查配置目录权限。' }); }
  });
}
