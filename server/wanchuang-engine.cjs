// Generated from WanChuangCore 0.1.33 (MIT). Regenerate with scripts/sync-wanchuang-engine.mjs.
module.exports = function createEngine({root, readConfig, binaries, chromium, fetch, spawn, acquire, validateRemote, onEvent}) {
const {spawnSync} = require('node:child_process');
const WebSocket = require('ws');
const app = {getPath:()=>root,isPackaged:false};
const safeStorage = {isEncryptionAvailable:()=>true};
const handlers = new Map();
const ipcMain = {handle:(name,handler)=>handlers.set(name,handler)};
const crypto = require('crypto');

const fs = require('fs');

const path = require('path');

const os = require('os');

const REQUIRED_DOUYIN_COOKIES = new Set([
  'ttwid', 'uid_tt', 'uid_tt_ss', 'UIFID', 'UIFID_TEMP', 'web_sign_token', 'x_tt_token',
  'sessionid', 'sessionid_ss', 'sid_guard', 'sid_tt', 'passport_csrf_token', 'passport_csrf_token_default',
  'odin_tt', 's_v_web_id',
]);

const REQUIRED_BILIBILI_COOKIES = new Set([
  'CURRENT_QUALITY', 'DedeUserID', 'DedeUserID__ckMd5', 'SESSDATA', 'bili_jct', 'sid', 'buvid3', 'buvid4',
]);

const REQUIRED_XIAOHONGSHU_COOKIES = new Set([
  'a1', 'webId', 'gid', 'web_session', 'id_token', 'xsecappid',
  'abRequestId', 'acw_tc', 'websectiga', 'sec_poison_id',
]);

const IAT_HOST = 'iat-api.xfyun.cn';

const IAT_PATH = '/v2/iat';

const SPEECH_SAMPLE_RATE = 16000;

const SPEECH_BYTES_PER_SECOND = SPEECH_SAMPLE_RATE * 2;

const ALL_REQUIRED_COOKIES = new Set([
  ...REQUIRED_DOUYIN_COOKIES,
  ...REQUIRED_BILIBILI_COOKIES,
  ...REQUIRED_XIAOHONGSHU_COOKIES,
]);

const COOKIE_PLATFORM_CONFIG = {
  douyin: {
    label: '抖音',
    encryptedKey: 'cookieEncrypted',
    metaKey: 'cookieMeta',
    domain: '.douyin.com',
    domainPattern: /(^|\.)douyin\.com$/i,
    loginNames: ['sessionid', 'sessionid_ss'],
    essentials: 'ttwid、sessionid、UIFID',
    loginUrl: 'https://www.douyin.com/',
  },
  bilibili: {
    label: 'B站',
    encryptedKey: 'bilibiliCookieEncrypted',
    metaKey: 'bilibiliCookieMeta',
    domain: '.bilibili.com',
    domainPattern: /(^|\.)bilibili\.com$/i,
    loginNames: ['SESSDATA'],
    essentials: 'SESSDATA、bili_jct、DedeUserID',
    loginUrl: 'https://www.bilibili.com/',
  },
  xiaohongshu: {
    label: '小红书',
    encryptedKey: 'xiaohongshuCookieEncrypted',
    metaKey: 'xiaohongshuCookieMeta',
    domain: '.xiaohongshu.com',
    domainPattern: /(^|\.)xiaohongshu\.com$/i,
    loginNames: ['web_session', 'id_token'],
    essentials: 'a1、web_session、webId',
    loginUrl: 'https://www.xiaohongshu.com/',
  },
};

function platformConfig(platform) {
  return COOKIE_PLATFORM_CONFIG[platform] || COOKIE_PLATFORM_CONFIG.douyin;
}

let mainWindow = {webContents:{send:(name,data)=>onEvent?.(name,data)}};

let settings;

let jobs = [];

let voiceHistory = [];

let active = 0;

let historyPersistTimer;

const running = new Map();

const cookieAuthWindows = new Map();

const cookieHealth = {
  douyin: { status: '未检查', checkedAt: null, message: '' },
  bilibili: { status: '未检查', checkedAt: null, message: '' },
  xiaohongshu: { status: '未检查', checkedAt: null, message: '' },
};

const cookieValidationVersions = { douyin: 0, bilibili: 0, xiaohongshu: 0 };

const speechHealth = { status: '未配置', checkedAt: null, message: '' };

const minimaxHealth = { status: '未配置', checkedAt: null, message: '' };

function cookieFields(platform, names = []) {
  const loginNames = platformConfig(platform).loginNames;
  const loginReady = loginNames.some((name) => names.includes(name));
  const downloadReady = names.length > 0;
  return {
    downloadReady,
    loginReady,
    loginRequirement: loginNames.join(' 或 '),
    summary: loginReady
      ? '公开作品下载字段已识别；账号登录字段已识别'
      : '公开作品下载字段已识别；未包含账号登录会话',
  };
}

function cookieProfile(platform) {
  const config = platformConfig(platform);
  const encrypted = settings[config.encryptedKey];
  const meta = settings[config.metaKey] || {};
  const names = meta.names || [];
  return { platform, ...meta, names, configured: Boolean(encrypted), fields: cookieFields(platform, names),
    ...(encrypted ? cookieHealth[platform] : { status: '未配置', message: '本机尚未保存此平台 Cookie', checkedAt: null }) };
}

function configPath() {
  return path.join(app.getPath('userData'), 'settings.json');
}

function historyPath() {
  return path.join(app.getPath('userData'), 'history.json');
}

function persistHistory() {
  if (!settings) return;
  clearTimeout(historyPersistTimer);
  historyPersistTimer = undefined;
  try {
    fs.mkdirSync(app.getPath('userData'), { recursive: true });
    const target = historyPath();
    const temporary = `${target}.${process.pid}.tmp`;
    fs.writeFileSync(temporary, JSON.stringify({ version: 1, jobs: jobs.slice(-500), voiceHistory: voiceHistory.slice(0, 500) }, null, 2), 'utf8');
    fs.copyFileSync(temporary, target);
    fs.rmSync(temporary, { force: true });
    for (const name of fs.readdirSync(app.getPath('userData')).filter((item) => /^history\.json(?:\.\d+)?\.tmp$/.test(item))) {
      fs.rmSync(path.join(app.getPath('userData'), name), { force: true });
    }
  } catch (error) {
    console.error('保存本地历史失败', error);
  }
}

function schedulePersistHistory() {
  clearTimeout(historyPersistTimer);
  historyPersistTimer = setTimeout(persistHistory, 250);
}

function loadHistory() {
  try {
    const target = historyPath();
    const directory = app.getPath('userData');
    const candidates = [target, ...(fs.existsSync(directory)
      ? fs.readdirSync(directory)
        .filter((name) => /^history\.json(?:\.\d+)?\.tmp$/.test(name))
        .map((name) => path.join(directory, name))
      : [])]
      .filter((item) => fs.existsSync(item))
      .sort((left, right) => fs.statSync(right).mtimeMs - fs.statSync(left).mtimeMs);
    if (!candidates.length) throw Object.assign(new Error('尚无历史记录'), { code: 'ENOENT' });
    const source = candidates[0];
    const stored = JSON.parse(fs.readFileSync(source, 'utf8'));
    jobs = Array.isArray(stored.jobs) ? stored.jobs.slice(-500) : [];
    voiceHistory = Array.isArray(stored.voiceHistory) ? stored.voiceHistory.slice(0, 500) : [];
    const unfinished = jobs.filter((job) => !['已完成', '失败', '已取消'].includes(job.status));
    for (const job of unfinished) Object.assign(job, { status: '失败', error: '应用上次退出时任务尚未完成，可点击重试', finishedAt: Date.now(), cancelRequested: false });
    for (const item of voiceHistory.filter((entry) => entry.status === '生成中')) Object.assign(item, { status: '失败', error: '应用上次退出时生成尚未完成' });
    if (unfinished.length || source !== target) persistHistory();
  } catch (error) {
    if (error.code !== 'ENOENT') console.error('读取本地历史失败', error);
    jobs = [];
    voiceHistory = [];
  }
}

function defaultOutput() { return path.join(root, 'outputs'); }

function loadSettings() {
  const defaults = {
    outputDir: defaultOutput(),
    concurrency: 2,
    cookieEncrypted: '',
    cookieMeta: null,
    bilibiliCookieEncrypted: '',
    bilibiliCookieMeta: null,
    xiaohongshuCookieEncrypted: '',
    xiaohongshuCookieMeta: null,
    iflytekCredentialsEncrypted: '',
    iflytekCredentialsMeta: null,
    minimaxCredentialsEncrypted: '',
    minimaxCredentialsMeta: null,
    minimaxVoiceModels: [],
    minimaxVoiceFavorites: [],
    minimaxHiddenVoices: [],
  };
  try {
    return { ...defaults, ...JSON.parse(fs.readFileSync(configPath(), 'utf8')) };
  } catch {
    return defaults;
  }
}

function persistSettings() { fs.mkdirSync(root,{recursive:true}); fs.writeFileSync(configPath(), JSON.stringify({minimaxVoiceModels:settings.minimaxVoiceModels,minimaxVoiceFavorites:settings.minimaxVoiceFavorites,minimaxHiddenVoices:settings.minimaxHiddenVoices})); }

function decryptCookieHeader(platform = 'douyin') { const raw = readConfig().secrets[platform + 'Cookie']; if(!raw)return ''; try{return normalizeCookieInput(raw, platform).header;}catch{throw new Error(platformConfig(platform).label+' Cookie 格式无法识别，请管理员在后台检查该平台配置');} }

function decryptSpeechCredentials() { const c = readConfig(); return c.iflytekAppId && c.secrets.iflytekApiKey && c.secrets.iflytekApiSecret ? { appId:c.iflytekAppId, apiKey:c.secrets.iflytekApiKey, apiSecret:c.secrets.iflytekApiSecret } : null; }

function speechProfile() {
  const meta = settings.iflytekCredentialsMeta || {};
  const configured = Boolean(settings.iflytekCredentialsEncrypted && decryptSpeechCredentials());
  return {
    configured,
    appId: meta.appId || '',
    status: configured ? (speechHealth.status || '已配置') : '未配置',
    checkedAt: configured ? speechHealth.checkedAt : null,
    message: configured ? speechHealth.message : '尚未保存讯飞语音识别凭证',
  };
}

function decryptMinimaxCredentials() { const apiKey = readConfig().secrets.minimaxApiKey; return apiKey ? {apiKey} : null; }

function minimaxProfile() {
  const configured = Boolean(settings.minimaxCredentialsEncrypted && decryptMinimaxCredentials());
  const models = Array.isArray(settings.minimaxVoiceModels) ? settings.minimaxVoiceModels : [];
  return {
    configured,
    cloneEnabled: readConfig().voiceCloneEnabled !== false,
    models,
    favorites: Array.isArray(settings.minimaxVoiceFavorites) ? settings.minimaxVoiceFavorites : [],
    hiddenVoices: Array.isArray(settings.minimaxHiddenVoices) ? settings.minimaxHiddenVoices : [],
    accountModelCount: models.filter((item) => item.type !== 'system').length,
    status: configured ? (minimaxHealth.checkedAt ? minimaxHealth.status : '已配置') : '未配置',
    checkedAt: configured ? minimaxHealth.checkedAt : null,
    message: configured ? minimaxHealth.message : '尚未保存 MiniMax API Key',
  };
}

async function minimaxRequest(credentials, pathname, options = {}) {
  const response = await fetch(`https://api.minimaxi.com/v1${pathname}`, {
    ...options,
    headers: {
      Authorization: `Bearer ${credentials.apiKey}`,
      ...(options.body instanceof FormData ? {} : { 'Content-Type': 'application/json' }),
      ...(options.headers || {}),
    },
    signal: AbortSignal.timeout(options.timeout || 180000),
  });
  const contentType = response.headers.get('content-type') || '';
  const payload = contentType.includes('json') ? await response.json() : await response.text();
  const apiError = payload?.base_resp && Number(payload.base_resp.status_code) !== 0;
  if (!response.ok || apiError) {
    const detail = typeof payload === 'object'
      ? payload.base_resp?.status_msg || payload.message || payload.code || JSON.stringify(payload)
      : payload;
    throw new Error(`MiniMax 请求失败（${response.status}）${detail ? `：${detail}` : ''}`);
  }
  return payload;
}

async function refreshMinimaxModels(credentials = decryptMinimaxCredentials()) {
  if (!credentials) throw new Error('请先配置 MiniMax API Key');
  const result = await minimaxRequest(credentials, '/get_voice', {
    method: 'POST', body: JSON.stringify({ voice_type: 'all' }), timeout: 30000,
  });
  const groups = [
    ['voice_cloning', 'clone'],
    ['voice_generation', 'generated'],
    ['system_voice', 'system'],
  ];
  settings.minimaxVoiceModels = groups.flatMap(([key, type]) => (result[key] || []).map((item) => ({
    id: String(item.voice_id || '').trim(),
    name: String(item.voice_name || '').trim(),
    type,
    createdAt: item.created_time || '',
  }))).filter((item) => item.id);
  const accountCount = settings.minimaxVoiceModels.filter((item) => item.type !== 'system').length;
  minimaxHealth.status = '有效';
  minimaxHealth.checkedAt = Date.now();
  minimaxHealth.message = `账号已连接 · ${accountCount} 个自定义音色`;
  persistSettings();
  return minimaxProfile();
}

async function generateWithMinimax(payload) {
  const credentials = decryptMinimaxCredentials();
  if (!credentials) throw new Error('请先在设置中连接 MiniMax');
  const text = String(payload?.text || '').trim();
  const voiceId = String(payload?.voiceId || '').trim();
  if (!text) throw new Error('请输入要生成的文本');
  if (text.length > 1000) throw new Error('文本不能超过 1000 个字符');
  if (!/^[A-Za-z0-9_-]{8,20}$/.test(voiceId)) throw new Error('音色 ID 需为 8–20 位英文、数字、下划线或短横线');
  if ((settings.minimaxHiddenVoices || []).includes(voiceId)) throw new Error('此音色已禁用，请在设置的音色管理中恢复后使用');
  const supportedEmotions = new Set(['happy', 'sad', 'angry', 'fearful', 'disgusted', 'surprised', 'calm', 'fluent', 'whisper']);
  const emotion = String(payload?.emotion || '').trim();
  if (emotion && !supportedEmotions.has(emotion)) throw new Error('不支持的情绪参数');
  const model = ['fluent', 'whisper'].includes(emotion) ? 'speech-2.6-hd' : 'speech-2.8-hd';

  const historyItem = {
    id: crypto.randomUUID(),
    text,
    voiceId,
    emotion,
    model,
    status: '生成中',
    createdAt: Date.now(),
    outputPath: '',
    durationMs: 0,
    error: '',
  };
  voiceHistory.unshift(historyItem);
  schedulePersistHistory();
  sendVoiceHistory();

  try {
    const result = await minimaxRequest(credentials, '/t2a_v2', {
    method: 'POST',
    body: JSON.stringify({
      model, text, stream: false,
      voice_setting: { voice_id: voiceId, speed: 1, vol: 1, pitch: 0, ...(emotion ? { emotion } : {}) },
      audio_setting: { sample_rate: 32000, bitrate: 128000, format: 'mp3', channel: 1 },
    }),
    timeout: 300000,
    });
    const audioHex = String(result?.data?.audio || '');
    if (!audioHex || !/^[0-9a-f]+$/i.test(audioHex)) throw new Error('MiniMax 返回结果中没有有效音频');
    const audioBuffer = Buffer.from(audioHex, 'hex');
    const base = crypto.randomUUID() + '-' + text.replace(/[<>:"/\\|?*\x00-\x1F]/g, '').trim().slice(0, 36) || '语音生成';
    fs.mkdirSync(settings.outputDir, { recursive: true });
    const outputPath = path.join(settings.outputDir, `${base}-${voiceId}-${Date.now()}.mp3`);
    fs.writeFileSync(outputPath, audioBuffer);
    Object.assign(historyItem, { status: '已完成', outputPath, durationMs: Number(result?.extra_info?.audio_length || 0), finishedAt: Date.now() });
    persistHistory();
    sendVoiceHistory();
    return {
      outputPath,
      audioBase64: audioBuffer.toString('base64'),
      durationMs: historyItem.durationMs,
      voiceId,
      model,
      history: voiceHistory,
      profile: minimaxProfile(),
    };
  } catch (error) {
    Object.assign(historyItem, { status: '失败', error: error.message, finishedAt: Date.now() });
    persistHistory();
    sendVoiceHistory();
    throw error;
  }
}

async function cloneWithMinimax(payload) {
  const credentials = decryptMinimaxCredentials();
  if (!credentials) throw new Error('请先连接 MiniMax 账号');
  const refPath = String(payload?.refPath || '').trim();
  const voiceId = String(payload?.voiceId || '').trim();
  if (!refPath || !fs.existsSync(refPath)) throw new Error('请选择有效的参考音频');
  if (!/^[A-Za-z0-9_-]{8,20}$/.test(voiceId)) throw new Error('音色 ID 需为 8–20 位英文、数字、下划线或短横线');
  const form = new FormData();
  form.append('file', new Blob([fs.readFileSync(refPath)]), path.basename(refPath));
  form.append('purpose', 'voice_clone');
  const uploaded = await minimaxRequest(credentials, '/files/upload', { method: 'POST', body: form, timeout: 120000 });
  const fileId = uploaded?.file?.file_id || uploaded?.file_id;
  if (!fileId) throw new Error('参考音频上传成功，但未返回 file_id');
  await minimaxRequest(credentials, '/voice_clone', {
    method: 'POST',
    body: JSON.stringify({ file_id: Number(fileId), voice_id: voiceId, need_noise_reduction: Boolean(payload?.noise), need_volume_normalization: true }),
    timeout: 180000,
  });
  const profile = await refreshMinimaxModels(credentials);
  return { voiceId, profile };
}

function splitTableLine(line) {
  if (!line.trim().startsWith('|')) return null;
  const cells = line.split('|').slice(1, -1).map((cell) => cell.trim());
  if (cells.length < 2 || /^[-: ]+$/.test(cells[0])) return null;
  return { name: cells[0], value: cells[1], domain: cells[2] || '' };
}

function normalizeCookieInput(raw, forcedPlatform = '') { return require('./platform-cookies.cjs').normalizeCookieInput(raw, forcedPlatform); }

function publicState() {
  return {
    settings: {
      outputDir: settings.outputDir,
      concurrency: settings.concurrency,
      cookieProfiles: ['douyin', 'bilibili', 'xiaohongshu'].map(cookieProfile),
      speech: speechProfile(),
      minimax: minimaxProfile(),
      encryptionAvailable: safeStorage.isEncryptionAvailable(),
    },
    jobs,
    voiceHistory,
    tools: {
      ytDlp: fs.existsSync(ytDlpPath()),
      browser: Boolean(browserPath()),
      ffmpeg: Boolean(ffmpegPath()),
    },
  };
}

function sendJobs() {
  mainWindow?.webContents.send('jobs:changed', jobs);
}

function sendVoiceHistory() {
  mainWindow?.webContents.send('voice-history:changed', voiceHistory);
}

function ytDlpPath() { return binaries.ytDlp; }

function ffmpegPath() { return binaries.ffmpeg; }

function browserPath() { return binaries.browser; }

function sendCookieStatus() {
  mainWindow?.webContents.send('cookies:status', publicState().settings.cookieProfiles);
}

function browserCookiesFromHeader(header, platform) {
  const domain = platformConfig(platform).domain;
  return String(header || '').split(';').map((part) => {
    const at = part.indexOf('=');
    if (at <= 0) return null;
    return {
      name: part.slice(0, at).trim(),
      value: part.slice(at + 1).trim(),
      domain,
      path: '/',
    };
  }).filter(Boolean);
}

function allowedCookieNames(platform) {
  if (platform === 'bilibili') return REQUIRED_BILIBILI_COOKIES;
  if (platform === 'xiaohongshu') return REQUIRED_XIAOHONGSHU_COOKIES;
  return REQUIRED_DOUYIN_COOKIES;
}

async function validateBilibiliCookie() {
  const header = decryptCookieHeader('bilibili');
  if (!header) return { status: '读取失败', checkedAt: Date.now(), message: '已保存的 Cookie 无法解密，请重新粘贴' };
  try {
    const response = await fetch('https://api.bilibili.com/x/web-interface/nav', {
      headers: { Cookie: header, Referer: 'https://www.bilibili.com/', 'User-Agent': 'Mozilla/5.0 Chrome/154.0.0.0' },
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) return { status: '验证受阻', checkedAt: Date.now(), message: `B站接口返回 HTTP ${response.status}，无法判断是否过期` };
    const body = await response.json();
    const valid = response.ok && body.code === 0 && body.data?.isLogin === true;
    if (valid) return { status: '下载可用', loginStatus: '已登录', checkedAt: Date.now(), message: `公开作品接口正常 · 账号 ${body.data?.uname || ''}`.trim() };
    if (body.code === -101 || body.data?.isLogin === false) return { status: '下载可用', loginStatus: '未登录', checkedAt: Date.now(), message: '公开作品接口正常 · 账号未登录，会员或私密内容需要更新 Cookie' };
    return { status: '验证受阻', checkedAt: Date.now(), message: `B站返回错误码 ${body.code ?? '未知'}，无法确认登录状态` };
  } catch (error) {
    return { status: '检查失败', checkedAt: Date.now(), message: error.message };
  }
}

function douyinCookieVerdict({ cookieAccepted, feedOk, login }) {
  if (login?.valid) {
    return { status: '下载可用', loginStatus: '已登录', message: `抖音已登录${login.nickname ? `：${login.nickname}` : ''} · 公开作品可下载` };
  }
  if (cookieAccepted || feedOk) {
    return { status: '下载可用', loginStatus: '未登录', message: '抖音已接受 Cookie · 公开作品可下载 · 账号未登录，私密或关注内容需重新复制登录后的 Cookie' };
  }
  return { status: '验证受阻', loginStatus: '未确认', message: '抖音未返回有效响应，可能遇到风控或验证码。请重新验证或更新 Cookie。' };
}

function douyinLoginFromProfile(profile) {
  if (profile?.httpOk && profile.statusCode === 0 && profile.userId) {
    return { valid: true, nickname: profile.nickname || '' };
  }
  if (profile?.statusCode === 8 || /未登录|not.?login|login.required/i.test(profile?.statusMessage || '')) {
    return { valid: false };
  }
  return null;
}

async function validateDouyinCookie() {
  const header = decryptCookieHeader('douyin');
  if (!header) return { status: '读取失败', checkedAt: Date.now(), message: '已保存的 Cookie 无法解密，请重新粘贴' };
  const executablePath = browserPath();
  if (!executablePath) return { status: '检查失败', checkedAt: Date.now(), message: '没有找到 Chrome 或 Edge' };
  let browser;
  try {
    browser = await chromium.launch({ headless: true, executablePath });
    const context = await browser.newContext({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/154.0.0.0 Safari/537.36' });
    await context.addCookies(browserCookiesFromHeader(header, 'douyin'));
    const page = await context.newPage();
    let login = null;
    let cookieAccepted = false;
    let feedOk = false;
    page.on('response', async (response) => {
      const url = response.url();
      if (!/douyin\.com/.test(url)) return;
      try {
        if (/\/ttwid\/check\//.test(url)) {
          const body = await response.json();
          if (body.status_code === 0) cookieAccepted = true;
        } else if (/\/aweme\/v1\/web\/user\/profile\/self\//.test(url)) {
          const body = await response.json();
          if (body.status_code === 0 && body.user?.uid) login = { valid: true, nickname: body.user.nickname || '' };
          else if (body.status_code === 8 || /未登录|not.?login|login.required/i.test(body.status_msg || '')) login = { valid: false };
        } else if (/\/aweme\/v1\/web\/query\/user\//.test(url)) {
          const body = await response.json();
          if (body.status_code === 0 && body.id) cookieAccepted = true;
        } else if (/\/aweme\/v[12]\/web\//.test(url)) {
          const body = await response.json();
          if (body.status_code === 0) feedOk = true;
        }
      } catch {}
    });
    await page.goto('https://www.douyin.com/', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(3000);
    const profile = await page.evaluate(async () => {
      try {
        const response = await fetch('/aweme/v1/web/user/profile/self/?device_platform=webapp&aid=6383', { credentials: 'include', signal: AbortSignal.timeout(10000) });
        const body = await response.json();
        return {
          httpOk: response.ok,
          statusCode: body.status_code,
          statusMessage: body.status_msg || '',
          userId: body.user?.uid || '',
          nickname: body.user?.nickname || '',
        };
      } catch (error) {
        return { error: error.message };
      }
    });
    login = douyinLoginFromProfile(profile);
    if (login?.valid) {
      cookieAccepted = true;
    }
    for (let i = 0; i < 20 && !cookieAccepted && !feedOk && login === null; i += 1) await page.waitForTimeout(500);
    return { ...douyinCookieVerdict({ cookieAccepted, feedOk, login }), checkedAt: Date.now() };
  } catch (error) {
    return { status: '检查失败', checkedAt: Date.now(), message: error.message };
  } finally {
    await browser?.close().catch(() => {});
  }
}

async function validateXiaohongshuCookie() {
  const header = decryptCookieHeader('xiaohongshu');
  if (!header) return { status: '读取失败', checkedAt: Date.now(), message: '已保存的 Cookie 无法解密，请重新粘贴' };
  const executablePath = browserPath();
  if (!executablePath) return { status: '检查失败', checkedAt: Date.now(), message: '没有找到 Chrome 或 Edge' };
  let browser;
  try {
    browser = await chromium.launch({ headless: true, executablePath });
    const context = await browser.newContext({ userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/154.0.0.0 Safari/537.36' });
    await context.addCookies(browserCookiesFromHeader(header, 'xiaohongshu'));
    const page = await context.newPage();
    let account = null;
    let cookieAccepted = false;
    page.on('response', async (response) => {
      const url = response.url();
      if (!/edith\.xiaohongshu\.com\/api\/sns\/web\//.test(url)) return;
      try {
        const body = await response.json();
        if (body?.success === true || body?.code === 0) cookieAccepted = true;
        if (/\/v2\/user\/me/.test(url) && body?.success === true && body?.data) {
          account = { valid: body.data.guest === false, nickname: body.data.nickname || '' };
        }
      } catch {}
    });
    await page.goto('https://www.xiaohongshu.com/explore', { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(5000);
    if (account?.valid) {
      return { status: '下载可用', loginStatus: '已登录', checkedAt: Date.now(), message: `小红书已登录${account.nickname ? `：${account.nickname}` : ''} · 作品解析可用` };
    }
    if (cookieAccepted) {
      return { status: '下载可用', loginStatus: '未登录', checkedAt: Date.now(), message: '小红书已接受 Cookie · 公开作品可解析 · 登录内容需要更新会话' };
    }
    return { status: '验证受阻', loginStatus: '未确认', checkedAt: Date.now(), message: '小红书未返回有效响应，可能遇到安全验证。请重新验证或更新 Cookie。' };
  } catch (error) {
    return { status: '检查失败', checkedAt: Date.now(), message: error.message };
  } finally {
    await browser?.close().catch(() => {});
  }
}

async function validateCookies(platform = '') {
  const platforms = platform ? [platform] : ['douyin', 'bilibili', 'xiaohongshu'];
  const versions = {};
  for (const name of platforms) {
    versions[name] = ++cookieValidationVersions[name];
    const configured = cookieProfile(name).configured;
    cookieHealth[name] = { status: configured ? '检查中' : '未配置', checkedAt: null, message: configured ? '正在验证登录状态...' : '本机尚未保存此平台 Cookie' };
  }
  sendCookieStatus();
  await Promise.all(platforms.map(async (name) => {
    if (!cookieProfile(name).configured) return;
    const result = name === 'douyin'
      ? await validateDouyinCookie()
      : name === 'bilibili'
        ? await validateBilibiliCookie()
        : await validateXiaohongshuCookie();
    if (versions[name] !== cookieValidationVersions[name]) return;
    cookieHealth[name] = result;
    sendCookieStatus();
  }));
  return publicState().settings.cookieProfiles;
}

function cleanFilename(value) {
  return String(value || 'media').replace(/[<>:"/\\|?*\x00-\x1f]/g, '_').replace(/[. ]+$/g, '').slice(0, 100);
}

function updateJob(job, patch) {
  if (job.cancelRequested && patch.status && patch.status !== '已取消') return;
  Object.assign(job, patch);
  sendJobs();
  schedulePersistHistory();
}

async function streamDownload(url, destination, job, headers = {}) {
    const controller = new AbortController();
    running.set(job.id, {cancel:()=>controller.abort()});
    const temp = destination + '.part';
    fs.mkdirSync(path.dirname(destination), {recursive:true});
    try {
      const response = await fetch(url, {headers, signal:AbortSignal.any([controller.signal,AbortSignal.timeout(300000)])});
      if(!response.ok || !response.body) throw new Error('下载失败：HTTP ' + response.status);
      const total = Number(response.headers.get('content-length') || 0);
      if(total > 300*1024*1024) throw new Error('单个文件超过 300MB');
      let received = 0;
      const {Readable,Transform} = require('node:stream');
      const meter = new Transform({transform(chunk,encoding,done) {
        received += chunk.length;
        if(received > 300*1024*1024) {done(new Error('单个文件超过 300MB'));return;}
        if(total) updateJob(job,{progress:Math.min(99,Math.round(received/total*100))});
        done(null,chunk);
      }});
      await require('node:stream/promises').pipeline(Readable.fromWeb(response.body),meter,fs.createWriteStream(temp),{signal:controller.signal});
      fs.renameSync(temp,destination);return destination;
    } catch(error) {controller.abort();fs.rmSync(temp,{force:true});throw error;}
  }

async function streamDownloadFallback(urls, destination, job, headers = {}) {
  const candidates = [...new Set((Array.isArray(urls) ? urls : [urls]).filter((url) => /^https?:\/\//i.test(url)))];
  if (!candidates.length) throw new Error('没有可用的下载地址');
  let lastError;
  for (const url of candidates) {
    try {
      return await streamDownload(url, destination, job, headers);
    } catch (error) {
      if (error.name === 'AbortError' || job.status === '已取消') throw error;
      lastError = error;
      fs.rmSync(`${destination}.part`, { force: true });
    }
  }
  throw lastError || new Error('下载地址均不可用');
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function iflytekWebSocketUrl(credentials) {
  const date = new Date().toUTCString();
  const signatureOrigin = `host: ${IAT_HOST}\ndate: ${date}\nGET ${IAT_PATH} HTTP/1.1`;
  const signature = crypto.createHmac('sha256', credentials.apiSecret).update(signatureOrigin).digest('base64');
  const authorizationOrigin = `api_key="${credentials.apiKey}", algorithm="hmac-sha256", headers="host date request-line", signature="${signature}"`;
  const authorization = Buffer.from(authorizationOrigin).toString('base64');
  return `wss://${IAT_HOST}${IAT_PATH}?authorization=${encodeURIComponent(authorization)}&date=${encodeURIComponent(date)}&host=${IAT_HOST}`;
}

function iflytekRealtimeWebSocketUrl(credentials) {
  const shanghaiNow = new Date(Date.now() + 8 * 60 * 60 * 1000);
  const utc = shanghaiNow.toISOString().replace(/\.\d{3}Z$/, '+0800');
  const request = {accessKeyId:credentials.apiKey,appId:credentials.appId,audio_encode:'pcm_s16le',lang:'autodialect',samplerate:'16000',utc,uuid:crypto.randomUUID()};
  const base = Object.keys(request).sort().map((key) => `${encodeURIComponent(key)}=${encodeURIComponent(request[key])}`).join('&');
  const signature = crypto.createHmac('sha1', credentials.apiSecret).update(base).digest('base64');
  return `wss://office-api-ast-dx.iflyaisol.com/ast/communicate/v1?${base}&signature=${encodeURIComponent(signature)}`;
}

function recognizeContinuousPcmWithIflytek(pcmStream, credentials, options = {}) {
  return new Promise((resolve, reject) => {
    const socket = new WebSocket(iflytekRealtimeWebSocketUrl(credentials));
    const segments = new Map();
    let settled = false;
    let started = false;
    let sessionId = '';
    let sentEnd = false;
    let startedResolve;
    let startedReject;
    const startedPromise = new Promise((resolveStarted, rejectStarted) => {
      startedResolve = resolveStarted;
      startedReject = rejectStarted;
    });
    const task = { cancel: () => socket.close() };
    const unregisterTask = options.registerTask?.(task);
    const cleanup = () => unregisterTask?.();
    const orderedSegments = () => [...segments.values()].sort((a, b) => a.segId - b.segId);
    const fail = (error) => {
      if (settled) return;
      settled = true;
      cleanup();
      startedReject(error);
      try { socket.close(); } catch {}
      reject(error);
    };
    const succeed = () => {
      if (settled) return;
      settled = true;
      cleanup();
      resolve(orderedSegments());
    };
    socket.onerror = () => fail(new Error('无法连接实时语音转写服务'));
    socket.onclose = () => {
      if (settled) return;
      if (options.isCancelled?.()) {
        const error = new Error('语音识别已取消');
        error.name = 'AbortError';
        fail(error);
      } else if (sentEnd) succeed();
      else fail(new Error('实时语音转写连接提前关闭'));
    };
    socket.onmessage = (event) => {
      let payload;
      try { payload = JSON.parse(String(event.data)); } catch { return; }
      const code = payload.code ?? payload.data?.code;
      if (payload.action === 'error' || (code !== undefined && String(code) !== '0')) {
        return fail(new Error(`实时语音转写失败：${payload.desc || payload.message || payload.data?.desc || code}`));
      }
      if (payload.action === 'started' || payload.msg_type === 'started' || payload.res_type === 'started') {
        started = true;
        sessionId = String(payload.sid || payload.sessionId || '');
        startedResolve();
        return;
      }
      if (payload.action !== 'result' && payload.msg_type !== 'result' && payload.res_type !== 'asr') return;
      if (!payload.data) return;
      try {
        const result = typeof payload.data === 'string' ? JSON.parse(payload.data) : payload.data;
        const st = result.cn?.st;
        if (!st?.rt || String(st.type) !== '0') return;
        const text = st.rt.flatMap((item) => item.ws || [])
          .map((item) => item.cw?.[0]?.w || '')
          .join('').trim();
        if (!text) return;
        const wordFrames = st.rt.flatMap((item) => item.ws || []).map((item) => Number(item.we) || 0);
        const start = Math.max(0, Number(st.bg || 0) / 1000);
        const explicitEnd = Number(st.ed || 0) / 1000;
        const wordEnd = start + Math.max(0, ...wordFrames) * 0.01;
        segments.set(Number(result.seg_id || 0), {
          segId: Number(result.seg_id || 0),
          start,
          end: Math.max(start + 0.5, explicitEnd, wordEnd),
          text,
        });
        options.onResult?.(orderedSegments());
      } catch {}
    };
    socket.onopen = async () => {
      try {
        await startedPromise;
        let carry = Buffer.alloc(0);
        let sent = 0;
        for await (const piece of pcmStream) {
          if (options.isCancelled?.()) {
            const error = new Error('语音识别已取消');
            error.name = 'AbortError';
            throw error;
          }
          carry = carry.length ? Buffer.concat([carry, piece]) : Buffer.from(piece);
          while (carry.length >= 1280) {
            const frame = carry.subarray(0, 1280);
            carry = carry.subarray(1280);
            socket.send(frame);
            sent += frame.length;
            options.onProgress?.(sent);
            await sleep(40);
          }
        }
        if (carry.length) {
          socket.send(carry);
          sent += carry.length;
          options.onProgress?.(sent);
          await sleep(40);
        }
        socket.send(JSON.stringify(sessionId ? { end: true, sessionId } : { end: true }));
        sentEnd = true;
        setTimeout(() => {
          if (!settled) succeed();
          try { socket.close(); } catch {}
        }, 15000);
      } catch (error) {
        fail(error);
      }
    };
    setTimeout(() => {
      if (!settled && !started) fail(new Error('实时语音转写连接超时'));
    }, 20000);
  });
}

function recognizePcmWithIflytek(pcm, credentials, options = {}) {
  return new Promise((resolve, reject) => {
    if (typeof WebSocket !== 'function') return reject(new Error('当前运行环境不支持 WebSocket'));
    const socket = new WebSocket(iflytekWebSocketUrl(credentials));
    let settled = false;
    let cancelled = false;
    let sent = 0;
    const text = [];
    const task = {
      cancel: () => {
        cancelled = true;
        socket.close();
      },
    };
    const unregisterTask = options.registerTask?.(task);
    if (options.jobId) running.set(options.jobId, task);
    const clearTask = () => {
      unregisterTask?.();
      if (options.jobId && running.get(options.jobId) === task) running.delete(options.jobId);
    };
    const timeout = setTimeout(() => {
      if (!settled) {
        settled = true;
        socket.close();
        clearTask();
        reject(new Error('讯飞语音识别超时，请检查网络后重试'));
      }
    }, Math.max(60000, Math.round(pcm.length / SPEECH_BYTES_PER_SECOND * 1000) + 30000));

    const fail = (error) => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      clearTask();
      reject(error);
    };
    const succeed = () => {
      if (settled) return;
      settled = true;
      clearTimeout(timeout);
      clearTask();
      socket.close();
      resolve(text.join('').trim());
    };

    socket.onerror = () => fail(new Error('无法连接讯飞语音识别服务'));
    socket.onclose = () => {
      if (settled) return;
      if (cancelled || options.isCancelled?.()) {
        const error = new Error('语音识别已取消');
        error.name = 'AbortError';
        fail(error);
      } else {
        fail(new Error('讯飞语音识别连接提前关闭'));
      }
    };
    socket.onmessage = (event) => {
      let payload;
      try {
        payload = JSON.parse(String(event.data));
      } catch {
        return fail(new Error('讯飞返回了无法解析的数据'));
      }
      if (payload.code !== 0) {
        return fail(new Error(`讯飞识别失败：${payload.message || payload.code}`));
      }
      const result = payload.data?.result;
      if (result?.ws) {
        text.push(result.ws.map((item) => item.cw?.[0]?.w || '').join(''));
      }
      if (payload.data?.status === 2) succeed();
    };
    socket.onopen = async () => {
      try {
        for (let offset = 0; offset < Math.max(pcm.length, 1); offset += 1280) {
          if (options.isCancelled?.()) {
            const error = new Error('语音识别已取消');
            error.name = 'AbortError';
            return fail(error);
          }
          const chunk = pcm.subarray(offset, Math.min(offset + 1280, pcm.length));
          socket.send(JSON.stringify({
            common: { app_id: credentials.appId },
            business: {
              language: 'zh_cn',
              domain: 'iat',
              accent: 'mandarin',
              vad_eos: 5000,
            },
            data: {
              status: offset === 0 ? 0 : 1,
              format: 'audio/L16;rate=16000',
              encoding: 'raw',
              audio: chunk.toString('base64'),
            },
          }));
          sent += chunk.length;
          options.onProgress?.(sent / Math.max(pcm.length, 1));
          await sleep(40);
        }
        socket.send(JSON.stringify({
          common: { app_id: credentials.appId },
          business: {
            language: 'zh_cn',
            domain: 'iat',
            accent: 'mandarin',
            vad_eos: 5000,
          },
          data: { status: 2, format: 'audio/L16;rate=16000', encoding: 'raw', audio: '' },
        }));
      } catch (error) {
        fail(error);
      }
    };
  });
}

async function validateIflytekCredentials(credentials) {
  await recognizePcmWithIflytek(Buffer.alloc(SPEECH_BYTES_PER_SECOND / 2), credentials);
}

function formatSrtTime(seconds) {
  const value = Math.max(0, Math.round(Number(seconds) * 1000));
  const hours = Math.floor(value / 3600000);
  const minutes = Math.floor(value % 3600000 / 60000);
  const secs = Math.floor(value % 60000 / 1000);
  const millis = value % 1000;
  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}:${String(secs).padStart(2, '0')},${String(millis).padStart(3, '0')}`;
}

async function runSpeechRecognition(job) {
  updateJob(job, { status: '准备音频', progress: 1, error: '' });
  const credentials = decryptSpeechCredentials();
  if (!credentials) throw new Error('请先在设置中配置讯飞 APPID、APIKey 和 APISecret');
  const ffmpeg = ffmpegPath();
  if (!ffmpeg) throw new Error('没有找到 ffmpeg，请安装后重试');
  const data = job.resolved || await probeMedia(job.url);
  if (data.kind === 'images' || !data.media?.some((item) => item.type === 'video')) {
    throw new Error('当前作品没有可识别的语音');
  }
  const videoUrl = data.platformKey === 'bilibili' ? '' : data.media.find((item) => item.type === 'video')?.url || '';
  const cookieFile = !videoUrl && /bilibili\.com/i.test(job.url)
    ? createBilibiliCookieFile(`speech-${crypto.randomUUID()}`)
    : '';
  let sourceProcess;
  let ffmpegProcess;
  const activeSpeechTasks = new Set();
  const cancelPipeline = () => {
    for (const task of activeSpeechTasks) task.cancel();
    terminateProcessTree(sourceProcess);
    terminateProcessTree(ffmpegProcess);
  };
  running.set(job.id, { cancel: cancelPipeline });
  try {
    updateJob(job, { status: '连接音频流', progress: 3 });
    const ffmpegArgs = ['-hide_banner', '-loglevel', 'error'];
    if (videoUrl) {
      await validateRemote(videoUrl);
      ffmpegArgs.push('-protocol_whitelist', 'https,http,tcp,tls,crypto');
      const referer = data.platformKey === 'douyin'
        ? 'https://www.douyin.com/'
        : data.platformKey === 'xiaohongshu'
          ? 'https://www.xiaohongshu.com/'
          : '';
      ffmpegArgs.push('-user_agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/154.0.0.0 Safari/537.36');
      if (referer) ffmpegArgs.push('-headers', `Referer: ${referer}\r\n`);
      ffmpegArgs.push('-i', videoUrl);
    } else {
      ffmpegArgs.push('-i', 'pipe:0');
    }
    ffmpegArgs.push(
      '-vn', '-ac', '1', '-ar', String(SPEECH_SAMPLE_RATE),
      '-c:a', 'pcm_s16le', '-f', 's16le', 'pipe:1',
    );
    ffmpegProcess = spawn(ffmpeg, ffmpegArgs, { windowsHide: true, stdio: ['pipe', 'pipe', 'pipe'] });
    let ffmpegError = '';
    let pipelineError;
    ffmpegProcess.stderr.on('data', (chunk) => { ffmpegError += chunk.toString(); });
    ffmpegProcess.stdin.on('error', (error) => {
      if (error.code !== 'EPIPE') pipelineError ||= error;
    });
    const ffmpegDone = new Promise((resolve, reject) => {
      ffmpegProcess.on('error', reject);
      ffmpegProcess.on('close', (code) => code === 0
        ? resolve()
        : reject(new Error(ffmpegError.trim().split(/\r?\n/).slice(-3).join(' ') || `FFmpeg 退出码 ${code}`)));
    }).catch((error) => { pipelineError ||= error; });
    let sourceDone = Promise.resolve();
    if (!videoUrl) {
      const sourceArgs = ['--quiet', '--no-warnings', '--no-playlist', '-f', 'bestaudio/b', '-o', '-'];
      if (cookieFile) sourceArgs.push('--cookies', cookieFile);
      sourceArgs.push(job.url);
      sourceProcess = spawn(ytDlpPath(), sourceArgs, { windowsHide: true, stdio: ['ignore', 'pipe', 'pipe'] });
      let sourceError = '';
      sourceProcess.stderr.on('data', (chunk) => { sourceError += chunk.toString(); });
      sourceProcess.stdout.pipe(ffmpegProcess.stdin);
      sourceDone = new Promise((resolve, reject) => {
        sourceProcess.on('error', reject);
        sourceProcess.on('close', (code) => code === 0
          ? resolve()
          : reject(new Error(sourceError.trim().split(/\r?\n/).slice(-3).join(' ') || `音频流退出码 ${code}`)));
      }).catch((error) => { pipelineError ||= error; });
    } else {
      ffmpegProcess.stdin.end();
    }

    const totalBytes = data.duration ? Number(data.duration) * SPEECH_BYTES_PER_SECOND : 0;
    let lastProgressPublished = 0;
    updateJob(job, { status: '语音识别中', progress: 5 });
    const segments = await recognizeContinuousPcmWithIflytek(ffmpegProcess.stdout, credentials, {
      isCancelled: () => job.cancelRequested,
      registerTask: (task) => {
        activeSpeechTasks.add(task);
        return () => activeSpeechTasks.delete(task);
      },
      onProgress: (sentBytes) => {
        const now = Date.now();
        if (now - lastProgressPublished < 250) return;
        lastProgressPublished = now;
        const progress = totalBytes
          ? Math.min(93, Math.round(5 + sentBytes / totalBytes * 88))
          : Math.min(90, 5 + Math.floor(sentBytes / SPEECH_BYTES_PER_SECOND / 10));
        updateJob(job, { status: '语音识别中', progress });
      },
      onResult: (liveSegments) => updateJob(job, {
        transcriptText: liveSegments.map((segment) => segment.text).join('\n'),
      }),
    });
    await Promise.all([ffmpegDone, sourceDone]);
    if (pipelineError) throw pipelineError;
    if (!segments.length) throw new Error('未识别到有效语音内容');

    updateJob(job, { status: '生成文稿', progress: 96 });
    const transcriptText = segments.map((segment) => segment.text).join('\n');
    const base = `${cleanFilename(data.title)} [${job.id.slice(0, 8)}]`;
    const transcriptPath = path.join(settings.outputDir, `${base}.txt`);
    const subtitlePath = path.join(settings.outputDir, `${base}.srt`);
    fs.mkdirSync(settings.outputDir, { recursive: true });
    fs.writeFileSync(transcriptPath, `\uFEFF${transcriptText}`, 'utf8');
    fs.writeFileSync(subtitlePath, `\uFEFF${segments.map((segment, index) => [
      String(index + 1),
      `${formatSrtTime(segment.start)} --> ${formatSrtTime(segment.end)}`,
      segment.text,
      '',
    ].join('\n')).join('\n')}`, 'utf8');
    updateJob(job, { progress: 99, outputs: [transcriptPath, subtitlePath], transcriptText });
    return [transcriptPath, subtitlePath];
  } finally {
    cancelPipeline();
    if (cookieFile) fs.rmSync(cookieFile, { force: true });
  }
}

async function resolveDouyin(url, job) {
  const cookieHeader = decryptCookieHeader('douyin');
  if (!cookieHeader) throw new Error('抖音需要有效 Cookie，请在设置中粘贴更新');
  const browserExe = browserPath();
  if (!browserExe) throw new Error('没有找到 Chrome 或 Edge');

  const browser = await chromium.launch({ headless: true, executablePath: browserExe });
  running.set(job.id, { cancel: () => browser.close() });
  try {
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36',
      viewport: { width: 1280, height: 720 },
    });
    const cookies = cookieHeader.split(';').map((part) => {
      const at = part.indexOf('=');
      return { name: part.slice(0, at).trim(), value: part.slice(at + 1).trim(), domain: '.douyin.com', path: '/', secure: true };
    });
    await context.addCookies(cookies);
    const page = await context.newPage();
    let detail;
    let mediaUrl;
    const douyinImageUrls = [];
    page.on('response', async (response) => {
      const requestUrl = response.url();
      if (response.request().resourceType() === 'image'
        && /[?&]biz_tag=aweme_images(?:&|$)/i.test(requestUrl)
        && !douyinImageUrls.includes(requestUrl)) {
        douyinImageUrls.push(requestUrl);
      }
      if (/douyinvod\.com/i.test(requestUrl)) {
        mediaUrl = requestUrl;
      } else if (!mediaUrl && response.request().resourceType() === 'media' && !/(?:douyinstatic|uuu_\d+\.mp4)/i.test(requestUrl)) {
        mediaUrl = requestUrl;
      }
      if (/\/aweme\/v1\/web\/aweme\/detail\//.test(requestUrl) && response.ok()) {
        try { detail = (await response.json()).aweme_detail; } catch {}
      }
    });
    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    await page.waitForTimeout(4000);
    await page.locator('video').first().click({ force: true }).catch(() => {});
    for (let i = 0; i < 20 && !detail; i += 1) await page.waitForTimeout(500);
    const dom = await page.evaluate(() => ({
      title: document.querySelector('h1')?.innerText || document.title,
      src: [...document.querySelectorAll('video')].map((v) => v.currentSrc || v.src).find(Boolean),
      poster: [...document.querySelectorAll('video')].map((v) => v.poster).find(Boolean),
    }));
    const title = detail?.desc || dom.title.replace(/\s*-\s*抖音$/, '') || '抖音视频';
    const bestRate = [...(detail?.video?.bit_rate || [])].sort((a, b) => (b.bit_rate || 0) - (a.bit_rate || 0))[0];
    const video = bestRate?.play_addr?.url_list?.[0] || detail?.video?.play_addr?.url_list?.[0] || mediaUrl || dom.src;
    const cover = detail?.video?.origin_cover?.url_list?.[0] || detail?.video?.cover?.url_list?.[0] || dom.poster;
    if (douyinImageUrls.length) {
      return {
        title,
        kind: 'images',
        cover: douyinImageUrls[0],
        media: douyinImageUrls.map((imageUrl, index) => ({
          type: 'image',
          url: imageUrl,
          urls: [imageUrl],
          preview: imageUrl,
          index: index + 1,
        })),
      };
    }
    if (!video && job.mode !== 'cover') throw new Error('未取得视频播放地址，请更新 Cookie 后重试');
    if (!cover && job.mode !== 'video') throw new Error('未取得封面地址');
    return {
      title,
      kind: 'video',
      video,
      cover,
      media: [
        {
          type: 'video',
          url: video,
          preview: cover,
          previewable: true,
        },
        ...(cover ? [{
          type: 'image',
          url: cover,
          preview: cover,
          cover: true,
        }] : []),
      ],
    };
  } finally {
    await browser.close().catch(() => {});
  }
}

async function runDouyin(job) {
  updateJob(job, { status: '解析中', progress: 5 });
  const data = job.resolved || await resolveDouyin(job.url, job);
  const base = `${cleanFilename(data.title)} [${job.id.slice(0, 8)}]`;
  const outputs = [];
  const headers = { 'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/154.0.0.0 Safari/537.36', Referer: 'https://www.douyin.com/' };
  if (data.kind === 'images') {
    const selected = new Set(Array.isArray(job.selectedMedia) ? job.selectedMedia.map(Number) : []);
    const images = data.media
      .map((item, index) => ({ ...item, index: index + 1 }))
      .filter((item) => !selected.size || selected.has(item.index));
    if (!images.length) throw new Error('没有选择需要下载的图片');
    for (const [position, item] of images.entries()) {
      updateJob(job, { status: `下载图片 ${position + 1}/${images.length}`, progress: Math.round(position / images.length * 100) });
      const extension = new URL(item.url).pathname.match(/\.(jpe?g|png|webp|avif)$/i)?.[0] || '.jpg';
      outputs.push(await streamDownloadFallback(item.urls || item.url, path.join(settings.outputDir, `${base}_${item.index}${extension}`), job, headers));
    }
    return outputs;
  }
  if (job.mode === 'video' || job.mode === 'both') {
    updateJob(job, { status: '下载视频', progress: 10 });
    const videoItem = Array.isArray(data.media) ? data.media.find((item) => item.type === 'video') : null;
    const videoUrls = videoItem?.urls || videoItem?.url || data.video;
    if (!videoUrls) throw new Error('解析结果中没有视频下载地址，请重新解析后重试');
    outputs.push(await streamDownloadFallback(videoUrls, path.join(settings.outputDir, `${base}.mp4`), job, headers));
  }
  if (job.mode === 'cover' || job.mode === 'both') {
    updateJob(job, { status: '下载封面', progress: job.mode === 'both' ? 85 : 10 });
    const coverItem = Array.isArray(data.media) ? data.media.find((item) => item.type === 'image' && item.cover) : null;
    const coverUrl = data.cover || coverItem?.url;
    if (!coverUrl) throw new Error('解析结果中没有封面下载地址，请重新解析后重试');
    const ext = new URL(coverUrl).pathname.match(/\.(jpe?g|png|webp)$/i)?.[0] || '.jpg';
    outputs.push(await streamDownloadFallback(coverItem?.urls || coverUrl, path.join(settings.outputDir, `${base}${ext}`), job, headers));
  }
  return outputs;
}

function firstMediaUrl(value) {
  if (typeof value === 'string' && /^https?:\/\//i.test(value)) return value;
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = firstMediaUrl(item);
      if (found) return found;
    }
  }
  if (value && typeof value === 'object') {
    for (const item of Object.values(value)) {
      const found = firstMediaUrl(item);
      if (found) return found;
    }
  }
  return '';
}

function mediaUrls(value) {
  if (typeof value === 'string' && /^https?:\/\//i.test(value)) return [value];
  if (Array.isArray(value)) return value.flatMap(mediaUrls);
  if (value && typeof value === 'object') return Object.values(value).flatMap(mediaUrls);
  return [];
}

function xhsSecureUrl(value) {
  try {
    const parsed = new URL(value);
    if (parsed.protocol === 'http:' && /(^|\.)(?:xhscdn|xiaohongshu)\.com$/i.test(parsed.hostname)) parsed.protocol = 'https:';
    return parsed.href;
  } catch {
    return value;
  }
}

function xhsImageUrl(image) {
  return xhsSecureUrl(mediaUrls([
    image?.urlDefault,
    image?.url_default,
    image?.url,
    image?.urlPre,
    image?.url_pre,
    image?.infoList,
    image?.info_list,
  ])[0] || '');
}

function xhsImageDownloadUrls(imageOrUrl) {
  const values = typeof imageOrUrl === 'string'
    ? [imageOrUrl]
    : [
        imageOrUrl?.urlDefault,
        imageOrUrl?.url_default,
        imageOrUrl?.url,
        imageOrUrl?.urlPre,
        imageOrUrl?.url_pre,
        imageOrUrl?.infoList,
        imageOrUrl?.info_list,
      ];
  const candidates = mediaUrls(values).map(xhsSecureUrl);
  for (const url of [...candidates]) {
    try {
      const parsed = new URL(url);
      const token = parsed.pathname.split('/').slice(2).join('/').split('!')[0];
      if (token) candidates.push(`https://ci.xiaohongshu.com/${token}?imageView2/format/jpeg`);
    } catch {}
  }
  return [...new Set(candidates)];
}

function xhsImageDownloadUrl(url) {
  return xhsImageDownloadUrls(url)[0] || url;
}

function xhsVideoFormats(note) {
  const stream = note?.video?.media?.stream || note?.video?.mediaV2?.stream || {};
  const formats = [];
  for (const [codec, list] of Object.entries(stream)) {
    for (const item of Array.isArray(list) ? list : []) {
      const url = xhsSecureUrl(firstMediaUrl(item?.backupUrls) || firstMediaUrl(item?.masterUrl));
      if (!url) continue;
      formats.push({ ...item, codec, url });
    }
  }
  formats.sort((left, right) => {
    const height = Number(right.height || 0) - Number(left.height || 0);
    if (height) return height;
    const bitrate = Number(right.videoBitrate || right.avgBitrate || 0) - Number(left.videoBitrate || left.avgBitrate || 0);
    if (bitrate) return bitrate;
    if (left.codec === 'h264' && right.codec !== 'h264') return -1;
    if (right.codec === 'h264' && left.codec !== 'h264') return 1;
    return 0;
  });
  return formats;
}

function normalizeXiaohongshuNote(note, url) {
  if (!note || typeof note !== 'object') throw new Error('小红书返回的作品数据为空');
  const id = String(note.noteId || note.note_id || new URL(url).pathname.match(/(?:explore|item)\/([0-9a-f]+)/i)?.[1] || '');
  const title = String(note.title || note.desc || '小红书作品').trim().split(/\r?\n/)[0].slice(0, 120) || '小红书作品';
  const images = (Array.isArray(note.imageList) ? note.imageList : Array.isArray(note.image_list) ? note.image_list : [])
    .map(xhsImageUrl)
    .filter(Boolean);
  const cover = images[0] || '';
  const videoFormats = xhsVideoFormats(note);
  const video = videoFormats[0];
  const kind = String(note.type || '').toLowerCase() === 'video' && video ? 'video' : 'images';
  const media = kind === 'video'
    ? [{
        type: 'video',
        url: video.url,
        preview: cover,
        width: Number(video.width || 0),
        height: Number(video.height || 0),
        previewable: true,
      }, ...(cover ? [{
        type: 'image',
        url: cover,
        preview: cover,
        cover: true,
      }] : [])]
    : images.map((image, index) => {
        const urls = xhsImageDownloadUrls(image);
        return {
          type: 'image',
          url: urls[0] || image,
          urls,
          preview: image,
          index: index + 1,
        };
      });
  if (!media.length) throw new Error('未取得小红书作品图片或视频地址，请更新 Cookie 后重试');
  const durationValue = Number(video?.duration || video?.videoDuration || 0);
  return {
    url,
    id,
    platform: '小红书',
    platformKey: 'xiaohongshu',
    kind,
    title,
    description: String(note.desc || ''),
    author: String(note.user?.nickname || note.user?.nickName || ''),
    cover,
    duration: durationValue > 1000 ? Math.round(durationValue / 1000) : Math.round(durationValue),
    media,
  };
}

async function resolveXiaohongshu(url, job) {
  const cookieHeader = decryptCookieHeader('xiaohongshu');
  if (!cookieHeader) throw new Error('小红书需要 Cookie，请在设置中粘贴更新');
  const browserExe = browserPath();
  if (!browserExe) throw new Error('没有找到 Chrome 或 Edge');

  const browser = await chromium.launch({ headless: true, executablePath: browserExe });
  running.set(job.id, { cancel: () => browser.close() });
  try {
    const context = await browser.newContext({
      userAgent: 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/154.0.0.0 Safari/537.36',
      viewport: { width: 1440, height: 900 },
    });
    await context.addCookies(browserCookiesFromHeader(cookieHeader, 'xiaohongshu'));
    const page = await context.newPage();
    let responseNote = null;
    page.on('response', async (response) => {
      const requestUrl = response.url();
      if (!/edith\.xiaohongshu\.com\/api\/sns\/web\/v1\/(?:feed|note\/feed)/.test(requestUrl) || !response.ok()) return;
      try {
        const body = await response.json();
        const first = Array.isArray(body?.data) ? body.data[0] : body?.data;
        responseNote = first?.note_card || first?.note || responseNote;
      } catch {}
    });

    await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 45000 });
    let stateNote = null;
    for (let index = 0; index < 24 && !stateNote; index += 1) {
      stateNote = await page.evaluate(() => {
        const state = window.__INITIAL_STATE__;
        const detailMap = state?.note?.noteDetailMap || {};
        const pcNote = Object.values(detailMap).map((item) => item?.note).find(Boolean);
        const mobileNote = state?.noteData?.data?.noteData;
        return pcNote || mobileNote || null;
      }).catch(() => null);
      if (!stateNote) await page.waitForTimeout(500);
    }
    const note = stateNote || responseNote;
    if (!note) {
      const pageTitle = await page.title();
      if (/安全限制|验证|不见|404/i.test(pageTitle)) throw new Error(`小红书页面未返回作品数据：${pageTitle}`);
      throw new Error('未取得小红书作品数据，请确认链接可访问并更新 Cookie');
    }
    return normalizeXiaohongshuNote(note, page.url() || url);
  } finally {
    await browser.close().catch(() => {});
  }
}

async function runXiaohongshu(job) {
  updateJob(job, { status: '解析中', progress: 5 });
  const data = job.resolved || await resolveXiaohongshu(job.url, job);
  const base = `${cleanFilename(data.title)} [${job.id.slice(0, 8)}]`;
  const outputs = [];
  const headers = {
    'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) Chrome/154.0.0.0 Safari/537.36',
    Referer: 'https://www.xiaohongshu.com/',
  };

  if (data.kind === 'images') {
    const selected = new Set(Array.isArray(job.selectedMedia) ? job.selectedMedia.map(Number) : []);
    const images = data.media.map((item, index) => ({ ...item, index: index + 1 }))
      .filter((item) => !selected.size || selected.has(item.index));
    if (!images.length) throw new Error('没有选择需要下载的图片');
    for (const [position, item] of images.entries()) {
      updateJob(job, { status: `下载图片 ${position + 1}/${images.length}`, progress: Math.round(position / images.length * 100) });
      const extension = new URL(item.url).pathname.match(/\.(jpe?g|png|webp|avif)$/i)?.[0] || '.jpg';
      outputs.push(await streamDownloadFallback(item.urls || item.url, path.join(settings.outputDir, `${base}_${item.index}${extension}`), job, headers));
    }
    return outputs;
  }

  const video = data.media.find((item) => item.type === 'video');
  if (!video?.url) throw new Error('未取得小红书视频播放地址');
  if (job.mode === 'video' || job.mode === 'both') {
    updateJob(job, { status: '下载视频', progress: 10 });
    outputs.push(await streamDownload(video.url, path.join(settings.outputDir, `${base}.mp4`), job, headers));
  }
  if ((job.mode === 'cover' || job.mode === 'both') && data.cover) {
    updateJob(job, { status: '下载封面', progress: job.mode === 'both' ? 85 : 10 });
    outputs.push(await streamDownloadFallback(xhsImageDownloadUrls(data.cover), path.join(settings.outputDir, `${base}_cover.jpg`), job, headers));
  }
  return outputs;
}

function createBilibiliCookieFile(id) {
  const header = decryptCookieHeader('bilibili');
  if (!header) return '';
  const cookieFile = path.join(root, `clipharbor-${id}.cookies.txt`);
  const lines = ['# Netscape HTTP Cookie File', ...header.split(';').map((part) => {
    const at = part.indexOf('=');
    return `.bilibili.com\tTRUE\t/\tTRUE\t0\t${part.slice(0, at).trim()}\t${part.slice(at + 1).trim()}`;
  })];
  fs.writeFileSync(cookieFile, lines.join(os.EOL), {mode:0o600});
  return cookieFile;
}

function platformForUrl(url) {
  let hostname = '';
  try { hostname = new URL(url).hostname; } catch {}
  if (/(^|\.)bilibili\.com$/i.test(hostname)) {
    return { label: 'B站', key: 'bilibili' };
  }
  if (/(^|\.)cctv\.com$/i.test(hostname)) {
    return { label: '央视', key: 'cctv' };
  }
  return { label: '其他平台', key: 'other' };
}

function extractCctvCover(html, pageUrl) {
  const source = String(html || '');
  const match = source.match(/<meta[^>]+(?:property|name)=["'](?:og:image|twitter:image)["'][^>]+content=["']([^"']+)/i)
    || source.match(/<meta[^>]+content=["']([^"']+)["'][^>]+(?:property|name)=["'](?:og:image|twitter:image)["']/i);
  if (!match?.[1]) return '';
  try {
    const parsed = new URL(match[1], pageUrl);
    if (parsed.protocol === 'http:') parsed.protocol = 'https:';
    return parsed.href;
  } catch {
    return '';
  }
}

async function fetchCctvCover(url) {
  try {
    const response = await fetch(url, {
      headers: {
        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/154.0.0.0 Safari/537.36',
        Referer: 'https://tv.cctv.com/',
      },
      redirect: 'follow',
      signal: AbortSignal.timeout(15000),
    });
    if (!response.ok) return '';
    return extractCctvCover(await response.text(), url);
  } catch {
    return '';
  }
}

function probeWithYtDlp(url) {
  return new Promise((resolve, reject) => {
    const id = `probe-${crypto.randomUUID()}`;
    const cookieFile = /bilibili\.com/i.test(url) ? createBilibiliCookieFile(id) : '';
    const args = ['--dump-single-json', '--skip-download', '--no-playlist', '--no-warnings'];
    if (cookieFile) args.push('--cookies', cookieFile);
    args.push(url);
    const child = spawn(ytDlpPath(), args, { windowsHide: true });
    let stdout = '';
    let stderr = '';
    child.stdout.on('data', (chunk) => { stdout += chunk.toString(); });
    child.stderr.on('data', (chunk) => { stderr += chunk.toString(); });
    child.on('error', error=>{if(cookieFile)fs.rmSync(cookieFile,{force:true});reject(error);});
    child.on('close', async (code) => {
      if (cookieFile) fs.rmSync(cookieFile, { force: true });
      if (code !== 0) return reject(new Error(stderr.trim().split(/\r?\n/).slice(-2).join(' ') || `解析失败，退出码 ${code}`));
      try {
        const info = JSON.parse(stdout);
        const formats = Array.isArray(info.formats) ? [...info.formats] : [];
        formats.sort((left, right) => {
          const height = Number(right.height || 0) - Number(left.height || 0);
          if (height) return height;
          return Number(right.tbr || right.vbr || 0) - Number(left.tbr || left.vbr || 0);
        });
        const best = formats[0];
        const platform = platformForUrl(url);
        const thumbnail = info.thumbnail
          || info.thumbnails?.find((item) => item?.url)?.url
          || (platform.key === 'cctv' ? await fetchCctvCover(url) : '');
        resolve({
          url,
          title: info.title || info.fulltitle || '未命名视频',
          platform: platform.label,
          platformKey: platform.key,
          kind: 'video',
          cover: thumbnail,
          duration: Math.round(Number(info.duration || 0)),
          author: info.uploader || info.channel || '',
          media: [
            {
              type: 'video',
              url: best?.url || '',
              preview: thumbnail,
              width: Number(best?.width || 0),
              height: Number(best?.height || 0),
              previewable: false,
            },
            ...(thumbnail ? [{
              type: 'image',
              url: thumbnail,
              preview: thumbnail,
              cover: true,
            }] : []),
          ],
        });
      } catch {
        reject(new Error('解析结果格式异常'));
      }
    });
  });
}

async function runCctv(job) {
  updateJob(job, { status: '解析中', progress: 5 });
  const data = job.resolved || await probeWithYtDlp(job.url);
  const base = `${cleanFilename(data.title)} [${job.id.slice(0, 8)}]`;
  const outputs = [];
  if (job.mode === 'video' || job.mode === 'both') {
    updateJob(job, { status: '下载视频', progress: 10 });
    outputs.push(...await runYtDlp(job, { mode: 'video' }));
  }
  if (job.mode === 'cover' || job.mode === 'both') {
    if (!data.cover) throw new Error('未取得央视封面地址');
    updateJob(job, { status: '下载封面', progress: job.mode === 'both' ? 85 : 10 });
    outputs.push(await streamDownloadFallback([data.cover], path.join(settings.outputDir, `${base}_cover.jpg`), job, {
      'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 Chrome/154.0.0.0 Safari/537.36',
      Referer: 'https://tv.cctv.com/',
    }));
  }
  return outputs;
}

async function probeMedia(url) {
  if (/(?:douyin\.com|iesdouyin\.com)/i.test(url)) {
    const job = { id: `probe-${crypto.randomUUID()}`, url, mode: 'video' };
    try {
      const info = await resolveDouyin(url, job);
      return {
        url,
        title: info.title,
        platform: '抖音',
        platformKey: 'douyin',
        kind: info.kind,
        video: info.video,
        cover: info.cover,
        media: info.media,
      };
    } finally {
      running.delete(job.id);
    }
  }
  if (/(?:xiaohongshu\.com|rednote\.com|xhslink\.com|xhslink\.cn)/i.test(url)) {
    const job = { id: `probe-${crypto.randomUUID()}`, url, mode: 'video' };
    try {
      return await resolveXiaohongshu(url, job);
    } finally {
      running.delete(job.id);
    }
  }
  return probeWithYtDlp(url);
}

function runYtDlp(job, options = {}) {
  return new Promise((resolve, reject) => {
    const effectiveMode = options.mode || job.mode;
    fs.mkdirSync(settings.outputDir, { recursive: true });
    const args = ['--print', 'after_move:filepath', '--ffmpeg-location', ffmpegPath(), '--newline', '--no-playlist', '--windows-filenames', '--no-overwrites', '-o', path.join(settings.outputDir, job.id + '-%(title).100s [%(id)s].%(ext)s')];
    let cookieFile = '';
    if (/bilibili\.com/i.test(job.url)) {
      cookieFile = createBilibiliCookieFile(job.id);
      if (cookieFile) args.push('--cookies', cookieFile);
      args.push('-f', 'bv*+ba/b', '--merge-output-format', 'mp4');
    }
    if (effectiveMode === 'cover') args.push('--skip-download', '--write-thumbnail');
    if (effectiveMode === 'both') args.push('--write-thumbnail');
    args.push(job.url);
    const child = spawn(ytDlpPath(), args, { windowsHide: true });
    running.set(job.id, { cancel: () => terminateProcessTree(child) });
    let output = '';
    child.stdout.on('data', (chunk) => {
      const text = chunk.toString();
      output += text;
      const match = text.match(/\[download\]\s+([\d.]+)%/);
      if (match && !job.cancelRequested) updateJob(job, { status: '下载中', progress: Math.round(Number(match[1])) });
    });
    child.stderr.on('data', (chunk) => { output += chunk.toString(); });
    child.on('error', error=>{if(cookieFile)fs.rmSync(cookieFile,{force:true});reject(error);});
    child.on('close', (code) => {
      if (cookieFile) fs.rmSync(cookieFile, { force: true });
      code === 0 ? resolve(fs.readdirSync(settings.outputDir).filter(name=>name.startsWith(job.id+'-') && !/\.(part|ytdl)$/.test(name)).map(name=>path.join(settings.outputDir,name))) : reject(new Error(output.trim().split(/\r?\n/).slice(-3).join(' ') || `yt-dlp 退出码 ${code}`));
    });
  });
}

function terminateProcessTree(child) {
  if (!child?.pid || child.killed) return;
  if (process.platform === 'win32') {
    const killer = spawn('taskkill', ['/pid', String(child.pid), '/t', '/f'], { windowsHide: true, stdio: 'ignore' });
    killer.on('error', () => child.kill());
    return;
  }
  child.kill('SIGTERM');
}

async function executeJob(job) {
  const release = await acquire();
  const deadline = setTimeout(() => { job.cancelRequested = true; running.get(job.id)?.cancel(); }, 15 * 60_000);
  try {
    if (job.cancelRequested) throw new Error('任务已取消');
    updateJob(job, { status: '准备中', progress: 1, error: '' });
    const isDouyin = /(?:douyin\.com|iesdouyin\.com)/i.test(job.url);
    const isXiaohongshu = /(?:xiaohongshu\.com|rednote\.com|xhslink\.com|xhslink\.cn)/i.test(job.url);
    const isCctv = platformForUrl(job.url).key === 'cctv';
    const outputs = job.type === 'speech'
      ? await runSpeechRecognition(job)
      : isDouyin
        ? await runDouyin(job)
        : isXiaohongshu
          ? await runXiaohongshu(job)
          : isCctv
            ? await runCctv(job)
            : await runYtDlp(job);
    if (job.cancelRequested) {
      updateJob(job, { status: '已取消', progress: job.progress || 0, error: '', finishedAt: Date.now() });
    } else {
      updateJob(job, { status: '已完成', progress: 100, outputs, finishedAt: Date.now() });
    }
  } catch (error) {
    const cancelled = job.cancelRequested || job.status === '已取消' || error.name === 'AbortError';
    updateJob(job, { status: cancelled ? '已取消' : '失败', error: cancelled ? '' : error.message, finishedAt: Date.now() });
  } finally {
    running.delete(job.id);
    clearTimeout(deadline); release(); active -= 1;
    pumpQueue();
  }
}

function pumpQueue() {
  while (active < settings.concurrency) {
    const job = jobs.find((item) => item.status === '等待中');
    if (!job) break;
    active += 1;
    executeJob(job);
  }
}

ipcMain.handle('state:get', () => publicState());

ipcMain.handle('minimax:refresh', () => refreshMinimaxModels());

ipcMain.handle('minimax:favorites', (_event, favorites) => {
  const validIds = new Set((settings.minimaxVoiceModels || []).map((item) => item.id));
  settings.minimaxVoiceFavorites = [...new Set((Array.isArray(favorites) ? favorites : []).map(String))]
    .filter((id) => validIds.has(id));
  persistSettings();
  return minimaxProfile();
});

ipcMain.handle('minimax:visibility', (_event, payload) => {
  const id = String(payload?.id || '').trim();
  if (!id || id.length > 200 || typeof payload?.hidden !== 'boolean') throw new Error('无效的音色设置');
  const hidden = new Set(settings.minimaxHiddenVoices || []);
  if (payload.hidden) hidden.add(id); else hidden.delete(id);
  settings.minimaxHiddenVoices = [...hidden];
  persistSettings();
  return minimaxProfile();
});

ipcMain.handle('minimax:generate', (_event, payload) => generateWithMinimax(payload));

ipcMain.handle('minimax:clone', (_event, payload) => cloneWithMinimax(payload));

ipcMain.handle('voice-history:audio', (_event, id) => {
  const item = voiceHistory.find((entry) => entry.id === id);
  if (!item?.outputPath || !fs.existsSync(item.outputPath)) throw new Error('音频文件已不存在');
  return { audioBase64: fs.readFileSync(item.outputPath).toString('base64'), outputPath: item.outputPath };
});

ipcMain.handle('media:parse', async (_event, input) => {
  const urls = [...new Set(String(input || '').match(/https?:\/\/[^\s，。！？、]+/gi) || [])]
    .map((url) => url.replace(/[)\]}>"']+$/g, ''));
  if (!urls.length) throw new Error('没有识别到有效链接');
  const settled = []; for (const url of urls) { try { settled.push({status:'fulfilled',value:await probeMedia(url)}); } catch(reason) { settled.push({status:'rejected',reason}); } }
  return settled.map((result, index) => result.status === 'fulfilled'
    ? { ok: true, ...result.value }
    : { ok: false, url: urls[index], error: result.reason?.message || '解析失败' });
});

ipcMain.handle('jobs:add', (_event, payload) => {
  const urls = String(payload.urls || '').split(/\r?\n/).map((item) => item.trim()).filter((item) => /^https?:\/\//i.test(item));
  const existing = new Set(jobs.filter((item) => ['等待中', '准备中', '解析中', '下载中', '下载视频', '下载封面', '准备音频', '提取音频'].includes(item.status) || item.status.startsWith('下载图片') || item.status.startsWith('识别中')).map((item) => item.url));
  const items = Array.isArray(payload.items)
    ? payload.items.filter((item) => item && /^https?:\/\//i.test(item.url))
    : [...new Set(urls)].map((url) => ({ url }));
  const seen = new Set();
  for (const item of items) {
    if (seen.has(item.url) || existing.has(item.url)) continue;
    seen.add(item.url);
    jobs.push({
      id: crypto.randomUUID(),
      url: item.url,
      type: payload.type || 'download',
      mode: payload.mode || 'video',
      selectedMedia: Array.isArray(item.selectedMedia) ? item.selectedMedia.map(Number) : [],
      resolved: item.resolved || null,
      status: '等待中',
      progress: 0,
      error: '',
      cancelRequested: false,
      createdAt: Date.now(),
    });
  }
  sendJobs();
  persistHistory();
  pumpQueue();
  return jobs;
});

ipcMain.handle('jobs:cancel', (_event, id) => {
  const job = jobs.find((item) => item.id === id);
  if (!job) return false;
  job.cancelRequested = true;
  updateJob(job, { status: '已取消' });
  running.get(id)?.cancel();
  return true;
});

ipcMain.handle('jobs:retry', (_event, id) => {
  const job = jobs.find((item) => item.id === id);
  if (!job || !['失败', '已取消'].includes(job.status)) return false;
  job.cancelRequested = false;
  updateJob(job, { status: '等待中', progress: 0, error: '' });
  pumpQueue();
  return true;
});

ipcMain.handle('jobs:clear-finished', () => {
  jobs = jobs.filter((item) => item.type === 'speech' || !['已完成', '失败', '已取消'].includes(item.status));
  sendJobs();
  persistHistory();
  return jobs;
});

function findHistoryRecord(kind, id) {
  return kind === 'voice'
    ? voiceHistory.find((item) => item.id === id)
    : jobs.find((item) => item.id === id && item.type === kind);
}

function recordFiles(record, kind) {
  const candidates = kind === 'voice' ? [record?.outputPath] : record?.outputs;
  return [...new Set((Array.isArray(candidates) ? candidates : []).filter((item) => typeof item === 'string' && path.isAbsolute(item)))];
}

ipcMain.handle('history:remove', (_event, payload) => {
  if (payload?.kind === 'voice') voiceHistory = voiceHistory.filter((item) => item.id !== payload.id);
  else jobs = jobs.filter((item) => item.id !== payload?.id || item.type !== payload?.kind);
  persistHistory();
  sendJobs();
  sendVoiceHistory();
  return { jobs, voiceHistory };
});
fs.mkdirSync(root,{recursive:true});
settings = loadSettings(); settings.outputDir = defaultOutput(); settings.concurrency = 1;
loadHistory();
function syncConfig() {
  const c = readConfig();
  for (const platform of ['douyin','bilibili','xiaohongshu']) {
    const config = platformConfig(platform), raw = c.secrets[platform+'Cookie'];
    settings[config.encryptedKey] = raw ? 'server-managed' : '';
    settings[config.metaKey] = null;
    if(raw) {
      try {
        settings[config.metaKey] = {names:normalizeCookieInput(raw,platform).names};
        if(cookieHealth[platform].status === '格式有误') cookieHealth[platform] = {status:'未检查',checkedAt:null,message:''};
      }
      catch { cookieHealth[platform] = {status:'格式有误',checkedAt:null,message:config.label+' Cookie 格式无法识别，请管理员检查'}; }
    }
  }
  const account = c.secrets.minimaxApiKey ? crypto.createHash('sha256').update(c.secrets.minimaxApiKey).digest('hex') : '';
  settings.minimaxVoiceModels = c.voiceModelsAccount === account ? (c.voiceModels || []) : [];
  settings.minimaxHiddenVoices = c.hiddenVoices || [];
  settings.iflytekCredentialsEncrypted = decryptSpeechCredentials() ? 'server-managed' : '';
  settings.minimaxCredentialsEncrypted = decryptMinimaxCredentials() ? 'server-managed' : '';
}
return {
  async call(name, payload) { syncConfig(); if(name==='minimax:clone' && readConfig().voiceCloneEnabled===false) throw new Error('管理员已关闭音色克隆'); if(!handlers.has(name)) throw new Error('不支持的操作'); return handlers.get(name)(null,payload); },
  snapshot() { syncConfig(); return publicState(); },
  clearHistory(kind) { if(kind==='voice') voiceHistory=voiceHistory.filter(x=>x.status==='生成中'); else jobs=jobs.filter(x=>(x.type||'download')!==kind || !['已完成','失败','已取消'].includes(x.status)); persistHistory(); return {jobs,voiceHistory}; },
  busy() { return active > 0 || voiceHistory.some(x=>x.status==='生成中'); }
};
};
