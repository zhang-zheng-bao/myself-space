// Windows deployment provisioning. Binaries stay out of Git; versions and hashes are tracked.
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { createHash, randomUUID } from 'node:crypto';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { spawnSync } from 'node:child_process';

if (process.platform !== 'win32' || process.arch !== 'x64') {
  throw new Error('Automatic provisioning supports Windows x64. See docs/wanchuang-web.md for Linux.');
}
const project = path.resolve(fileURLToPath(new URL('..', import.meta.url)));
const root = path.join(project, '.private', 'wanchuang-runtime');
const versions = JSON.parse(fs.readFileSync(new URL('./wanchuang-dependencies.json', import.meta.url), 'utf8'));
const checkOnly = process.argv.includes('--check');
fs.mkdirSync(root, { recursive: true });

function run(command, args, env = process.env) {
  const result = spawnSync(command, args, { env, stdio: 'inherit', timeout: 15 * 60_000, windowsHide: true });
  if (result.error) throw result.error;
  if (result.status !== 0) throw new Error(`${path.basename(command)} failed (${result.status})`);
}
async function publish(source, target) {
  for (let attempt = 0; ; attempt++) {
    try { await fs.promises.rename(source, target); return; }
    catch (error) {
      if (!['EPERM', 'EACCES', 'EBUSY'].includes(error.code) || attempt >= 20) throw error;
      await new Promise(resolve => setTimeout(resolve, 250));
    }
  }
}
async function download(spec, target) {
  const cache = path.join(root, 'downloads', spec.sha256);
  if (fs.existsSync(cache)) {
    const cachedHash = createHash('sha256');
    for await (const chunk of fs.createReadStream(cache)) cachedHash.update(chunk);
    if (cachedHash.digest('hex') === spec.sha256) {
      fs.copyFileSync(cache, target, fs.constants.COPYFILE_EXCL);
      return;
    }
    fs.unlinkSync(cache);
  }
  console.log(`Downloading ${path.basename(target)} (${spec.version})`);
  let downloaded = false;
  let lastError;
  for (let attempt = 1; attempt <= 3 && !downloaded; attempt++) {
    try {
      const response = await fetch(spec.url, { signal: AbortSignal.timeout(10 * 60_000) });
      if (!response.ok || !response.body) throw new Error(`Download failed: HTTP ${response.status}`);
      await pipeline(Readable.fromWeb(response.body), fs.createWriteStream(target, { flags: 'wx' }));
      downloaded = true;
    } catch (error) {
      lastError = error;
      try { fs.rmSync(target, { force: true }); } catch {}
      if (attempt < 3) await new Promise(resolve => setTimeout(resolve, attempt * 2000));
    }
  }
  if (!downloaded) {
    // Some Windows hosts reset Node's TLS stream to GitHub; retry through the OS downloader.
    const result = spawnSync('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
      '$ErrorActionPreference="Stop"; Invoke-WebRequest -Uri $env:WC_URL -OutFile $env:WC_TARGET -TimeoutSec 600'],
      { env: { ...process.env, WC_URL: spec.url, WC_TARGET: target }, stdio: 'inherit', timeout: 11 * 60_000, windowsHide: true });
    if (result.error || result.status !== 0) throw lastError || result.error || new Error('Download failed');
    downloaded = true;
  }
  const verifiedHash = createHash('sha256');
  for await (const chunk of fs.createReadStream(target)) verifiedHash.update(chunk);
  if (verifiedHash.digest('hex') !== spec.sha256) throw new Error(`SHA256 mismatch: ${path.basename(target)}`);
  fs.mkdirSync(path.dirname(cache), { recursive: true });
  fs.copyFileSync(target, cache);
}
const ytDir = path.join(root, `yt-dlp-${versions.ytDlp.version}`);
const ffDir = path.join(root, `ffmpeg-${versions.ffmpeg.version}`);
const ytDlp = path.join(ytDir, 'yt-dlp.exe');
const ffmpeg = path.join(ffDir, 'bin', 'ffmpeg.exe');
if (!checkOnly && (!fs.existsSync(ytDlp) || !fs.existsSync(ffmpeg))) {
  const stage = fs.mkdtempSync(path.join(root, 'install-'));
  try {
    if (!fs.existsSync(ytDlp)) {
      const target = path.join(stage, 'yt-dlp.exe');
      await download(versions.ytDlp, target);
      run(target, ['--version']);
      fs.mkdirSync(ytDir, { recursive: true });
      await publish(target, ytDlp);
    }
    if (!fs.existsSync(ffmpeg)) {
      const archive = path.join(stage, 'ffmpeg.zip');
      const expanded = path.join(stage, 'expanded');
      await download(versions.ffmpeg, archive);
      run('powershell.exe', ['-NoProfile', '-NonInteractive', '-Command',
        '$ErrorActionPreference="Stop"; Expand-Archive -LiteralPath $env:WC_ARCHIVE -DestinationPath $env:WC_EXPANDED'],
        { ...process.env, WC_ARCHIVE: archive, WC_EXPANDED: expanded });
      const folders = fs.readdirSync(expanded, { withFileTypes: true }).filter(entry => entry.isDirectory());
      if (folders.length !== 1) throw new Error('Unexpected FFmpeg archive layout');
      const extracted = path.join(expanded, folders[0].name);
      run(path.join(extracted, 'bin', 'ffmpeg.exe'), ['-version']);
      await publish(extracted, ffDir);
    }
  } finally {
    // Only remove the temporary directory created by this invocation.
    // Windows antivirus/indexing can briefly hold handles on freshly extracted files.
    try { fs.rmSync(stage, { recursive: true, force: true, maxRetries: 10, retryDelay: 300 }); }
    catch (error) { console.warn(`Temporary download cleanup deferred: ${error.code}`); }
  }
}

// A shared absolute path works for both the deployment runner and the SYSTEM service.
process.env.PLAYWRIGHT_BROWSERS_PATH = path.join(root, 'browsers');
// Keep the previous revision available to tasks in the still-running service.
process.env.PLAYWRIGHT_SKIP_BROWSER_GC = '1';
if (!checkOnly) {
  run(process.execPath, [path.join(project, 'node_modules/playwright-core/cli.js'), 'install', 'chromium', '--no-shell']);
}
const { chromium } = await import('playwright-core');
const binaries = { ytDlp, ffmpeg, browser: chromium.executablePath() };
for (const [name, executable] of Object.entries(binaries)) {
  if (!fs.existsSync(executable)) throw new Error(`Missing ${name}: run npm run setup:wanchuang`);
}
run(ytDlp, ['--version']);
run(ffmpeg, ['-version']);
const browser = await chromium.launch({ executablePath: binaries.browser, headless: true, timeout: 30_000 });
try {
  const page = await browser.newPage();
  await page.setContent('<title>runtime-ready</title>');
  if (await page.title() !== 'runtime-ready') throw new Error('Browser verification failed');
} finally { await browser.close(); }

const manifest = path.join(root, 'manifest.json');
if (!checkOnly) {
  const temp = `${manifest}.${randomUUID()}.tmp`;
  fs.writeFileSync(temp, JSON.stringify({ schema: 1, binaries, versions, verifiedAt: new Date().toISOString() }, null, 2));
  await publish(temp, manifest);
} else {
  const saved = JSON.parse(fs.readFileSync(manifest, 'utf8'));
  if (saved.schema !== 1 || JSON.stringify(saved.binaries) !== JSON.stringify(binaries)) {
    throw new Error('Runtime manifest is stale: run npm run setup:wanchuang');
  }
}
console.log('WanChuang runtime verified: yt-dlp, FFmpeg, Chromium.');
