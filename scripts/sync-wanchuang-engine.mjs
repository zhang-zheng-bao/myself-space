// Explicit source synchronization; never depends on a desktop checkout at runtime.
import fs from 'node:fs';
import path from 'node:path';
import ts from 'typescript';
const source = path.resolve(process.argv[2] || '../WanChuangCore/main.js');
const input = fs.readFileSync(source, 'utf8').replace(/\r\n/g,'\n');
const ast = ts.createSourceFile(source, input, ts.ScriptTarget.Latest, true, ts.ScriptKind.JS);
const replacements = {
  normalizeCookieInput: `function normalizeCookieInput(raw, forcedPlatform = '') { return require('./platform-cookies.cjs').normalizeCookieInput(raw, forcedPlatform); }`,
  defaultOutput: `function defaultOutput() { return path.join(root, 'outputs'); }`,
  decryptCookieHeader: `function decryptCookieHeader(platform = 'douyin') { const raw = readConfig().secrets[platform + 'Cookie']; if(!raw)return ''; try{return normalizeCookieInput(raw, platform).header;}catch{throw new Error(platformConfig(platform).label+' Cookie 格式无法识别，请管理员在后台检查该平台配置');} }`,
  decryptSpeechCredentials: `function decryptSpeechCredentials() { const c = readConfig(); return c.iflytekAppId && c.secrets.iflytekApiKey && c.secrets.iflytekApiSecret ? { appId:c.iflytekAppId, apiKey:c.secrets.iflytekApiKey, apiSecret:c.secrets.iflytekApiSecret } : null; }`,
  decryptMinimaxCredentials: `function decryptMinimaxCredentials() { const apiKey = readConfig().secrets.minimaxApiKey; return apiKey ? {apiKey} : null; }`,
  persistSettings: `function persistSettings() { fs.mkdirSync(root,{recursive:true}); fs.writeFileSync(configPath(), JSON.stringify({minimaxVoiceModels:settings.minimaxVoiceModels,minimaxVoiceFavorites:settings.minimaxVoiceFavorites,minimaxHiddenVoices:settings.minimaxHiddenVoices})); }`,
  ytDlpPath: `function ytDlpPath() { return binaries.ytDlp; }`,
  ffmpegPath: `function ffmpegPath() { return binaries.ffmpeg; }`,
  browserPath: `function browserPath() { return binaries.browser; }`,
  streamDownload: `async function streamDownload(url, destination, job, headers = {}) {
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
  }`,
};
const excluded = new Set(['createWindow','authorizeCookiesInBrowser','captureAuthorizedCookies']);
const channels = new Set(['state:get','minimax:refresh','minimax:favorites','minimax:visibility','minimax:generate','minimax:clone','voice-history:audio','media:parse','jobs:add','jobs:cancel','jobs:retry','jobs:clear-finished','history:remove']);
const parts = [];
for (const node of ast.statements) {
  const code = node.getText(ast);
  if (ts.isFunctionDeclaration(node)) {
    const name = node.name.text;
    if (!excluded.has(name)) parts.push(replacements[name] || code);
  } else if (ts.isVariableStatement(node)) {
    if (!code.includes("require('electron')") && !code.includes("require('playwright-core')") && !code.includes("require('child_process')")) parts.push(code);
  } else if (code.startsWith('ipcMain.handle(')) {
    const channel = node.expression.arguments[0].text;
    if (channels.has(channel)) parts.push(code);
  }
}
let body = parts.join('\n\n').replace('let mainWindow;', 'let mainWindow = {webContents:{send:(name,data)=>onEvent?.(name,data)}};');
body=body.replace('    configured,\n    models,','    configured,\n    cloneEnabled: readConfig().voiceCloneEnabled !== false,\n    models,');
// Keep the source's continuous recognition call.  The portable engine below
// replaces its endpoint/signature with the realtime-transcription LLM protocol.
body = body.replace('if (job.cancelRequested) cancelPipeline();','cancelPipeline();')
  .replaceAll("status: '连续流式识别'", "status: '语音识别中'");
// The desktop source targets the legacy standard realtime service. The web
// runtime uses the realtime-transcription LLM endpoint so its existing three
// credentials work once that product is enabled in the console.
body = body.replace(/function iflytekRealtimeWebSocketUrl\(credentials\) \{[\s\S]*?\n\}/, `function iflytekRealtimeWebSocketUrl(credentials) {
  const shanghaiNow = new Date(Date.now() + 8 * 60 * 60 * 1000);
  const utc = shanghaiNow.toISOString().replace(/\\.\\d{3}Z$/, '+0800');
  const request = {accessKeyId:credentials.apiKey,appId:credentials.appId,audio_encode:'pcm_s16le',lang:'autodialect',samplerate:'16000',utc,uuid:crypto.randomUUID()};
  const base = Object.keys(request).sort().map((key) => \`\${encodeURIComponent(key)}=\${encodeURIComponent(request[key])}\`).join('&');
  const signature = crypto.createHmac('sha1', credentials.apiSecret).update(base).digest('base64');
  return \`wss://office-api-ast-dx.iflyaisol.com/ast/communicate/v1?\${base}&signature=\${encodeURIComponent(signature)}\`;
}`);
body = body
  .replace('let started = false;\n    let sentEnd = false;', "let started = false;\n    let sessionId = '';\n    let sentEnd = false;")
  .replace("new Error('无法连接讯飞实时语音转写服务')", "new Error('无法连接实时语音转写服务')")
  .replace("new Error('讯飞实时语音转写连接提前关闭')", "new Error('实时语音转写连接提前关闭')")
  .replace("if (payload.action === 'error' || String(payload.code) !== '0') {\n        const suffix = String(payload.code) === '10110'\n          ? '；请在讯飞控制台开通“实时语音转写”并确认授权路数'\n          : '';\n        return fail(new Error(`讯飞实时转写失败：${payload.desc || payload.code}${suffix}`));\n      }", "const code = payload.code ?? payload.data?.code;\n      if (payload.action === 'error' || (code !== undefined && String(code) !== '0')) {\n        return fail(new Error(`实时语音转写失败：${payload.desc || payload.message || payload.data?.desc || code}`));\n      }")
  .replace("if (payload.action === 'started') {\n        started = true;", "if (payload.action === 'started' || payload.msg_type === 'started' || payload.res_type === 'started') {\n        started = true;\n        sessionId = String(payload.sid || payload.sessionId || '');")
  .replace("if (payload.action !== 'result' || !payload.data) return;", "if (payload.action !== 'result' && payload.msg_type !== 'result' && payload.res_type !== 'asr') return;\n      if (!payload.data) return;")
  .replace("const result = JSON.parse(payload.data);", "const result = typeof payload.data === 'string' ? JSON.parse(payload.data) : payload.data;")
  .replace("socket.send(Buffer.from('{\"end\": true}'));", "socket.send(JSON.stringify(sessionId ? { end: true, sessionId } : { end: true }));")
  .replace("new Error('讯飞实时语音转写连接超时')", "new Error('实时语音转写连接超时')");
body = body.replace("path.join(os.tmpdir(), `clipharbor-${id}.cookies.txt`)", "path.join(root, `clipharbor-${id}.cookies.txt`)")
  .replace("fs.writeFileSync(cookieFile, lines.join(os.EOL));", "fs.writeFileSync(cookieFile, lines.join(os.EOL), {mode:0o600});")
  .replace("const settled = await Promise.allSettled(urls.map(probeMedia));", "const settled = []; for (const url of urls) { try { settled.push({status:'fulfilled',value:await probeMedia(url)}); } catch(reason) { settled.push({status:'rejected',reason}); } }")
  .replace("async function executeJob(job) {\n  try {", "async function executeJob(job) {\n  const release = await acquire();\n  const deadline = setTimeout(() => { job.cancelRequested = true; running.get(job.id)?.cancel(); }, 15 * 60_000);\n  try {\n    if (job.cancelRequested) throw new Error('任务已取消');")
  .replace("active -= 1;", "clearTimeout(deadline); release(); active -= 1;")
  .replace("settings.concurrency = Math.max(1, Math.min(5, Number(next.concurrency) || 2));", "settings.concurrency = 1;")
  .replace("const args = ['--newline',", "const args = ['--print', 'after_move:filepath', '--ffmpeg-location', ffmpegPath(), '--newline',")
  .replace("resolve([settings.outputDir])", "resolve(fs.readdirSync(settings.outputDir).filter(name=>name.startsWith(job.id+'-') && !/\\.(part|ytdl)$/.test(name)).map(name=>path.join(settings.outputDir,name)))")
  .replaceAll("child.on('error', reject);", "child.on('error', error=>{if(cookieFile)fs.rmSync(cookieFile,{force:true});reject(error);});")
  .replace("const videoUrl = data.media.find", "const videoUrl = data.platformKey === 'bilibili' ? '' : data.media.find")
  .replace("'-o', path.join(settings.outputDir, '%(title).100s [%(id)s].%(ext)s')", "'-o', path.join(settings.outputDir, job.id + '-%(title).100s [%(id)s].%(ext)s')")
  .replace("const base = text.replace", "const base = crypto.randomUUID() + '-' + text.replace")
  .replace("const controller = new AbortController();\n  running.set", "const controller = new AbortController();\n  running.set")
  .replace("output.write(chunk);\n    received += chunk.length;", "received += chunk.length;\n    if (received > 300 * 1024 * 1024) { controller.abort(); output.destroy(); throw new Error('单个文件超过 300MB'); }\n    if (!output.write(chunk)) await require('node:events').once(output, 'drain');")
  .replace("if (videoUrl) {\n      const referer", "if (videoUrl) {\n      await validateRemote(videoUrl);\n      ffmpegArgs.push('-protocol_whitelist', 'https,http,tcp,tls,crypto');\n      const referer");
const header = `// Generated from WanChuangCore 0.1.33 (MIT). Regenerate with scripts/sync-wanchuang-engine.mjs.\nmodule.exports = function createEngine({root, readConfig, binaries, chromium, fetch, spawn, acquire, validateRemote}) {\nconst {spawnSync} = require('node:child_process');\nconst WebSocket = require('ws');\nconst app = {getPath:()=>root,isPackaged:false};\nconst safeStorage = {isEncryptionAvailable:()=>true};\nconst handlers = new Map();\nconst ipcMain = {handle:(name,handler)=>handlers.set(name,handler)};\n`;
const footer = `
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
`;
fs.writeFileSync('server/wanchuang-engine.cjs', header.replace('acquire, validateRemote})','acquire, validateRemote, onEvent})') + body + footer);
console.log('Synced portable server engine (no Electron dependency).');
