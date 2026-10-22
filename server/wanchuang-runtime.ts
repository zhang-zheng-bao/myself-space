import fs from 'node:fs';
import path from 'node:path';
import dns from 'node:dns/promises';
import net from 'node:net';
import { spawn as nativeSpawn } from 'node:child_process';
import { chromium as browserDriver } from 'playwright-core';
import createEngine from './wanchuang-engine.cjs';
import { readToolSettings } from './tool-settings';

const blocked = new net.BlockList();
for (const [ip, prefix] of [['0.0.0.0',8],['10.0.0.0',8],['100.64.0.0',10],['127.0.0.0',8],['169.254.0.0',16],['172.16.0.0',12],['192.168.0.0',16],['192.0.0.0',24],['198.18.0.0',15],['224.0.0.0',4],['240.0.0.0',4]] as const) blocked.addSubnet(ip,prefix);
for (const [ip,prefix] of [['::',128],['::1',128],['fc00::',7],['fe80::',10],['ff00::',8],['::ffff:0:0',96],['2001:db8::',32]] as const) blocked.addSubnet(ip,prefix,'ipv6');
export async function validateRemote(raw: string) {
  const u = new URL(raw);
  if (!['https:','http:'].includes(u.protocol) || u.username || u.password || (u.port && !['80','443'].includes(u.port))) throw new Error('不支持的网络地址');
  const host = u.hostname.replace(/^\[|\]$/g,'');
  const addresses = net.isIP(host) ? [{address:host,family:net.isIP(host)}] : await dns.lookup(host,{all:true});
  if (!addresses.length || addresses.some(a=>blocked.check(a.address,a.family===6?'ipv6':'ipv4'))) throw new Error('不允许访问内网地址');
  return u;
}
export function validateMediaUrl(raw: string) {
  const u = new URL(raw);
  const platforms = ['douyin.com','iesdouyin.com','bilibili.com','b23.tv','xiaohongshu.com','rednote.com','xhslink.com','xhslink.cn','cctv.com','cntv.cn'];
  if (!['https:','http:'].includes(u.protocol) || u.username || u.password || u.port || !platforms.some(h=>u.hostname===h || u.hostname.endsWith('.'+h))) throw new Error('请提供抖音、B站、小红书或央视的作品链接');
  return u.href;
}
async function publicFetch(input: string, options: RequestInit = {}): Promise<Response> {
  let url = input;
  for (let i=0;i<6;i++) {
    await validateRemote(url);
    const response = await fetch(url,{...options,redirect:'manual',signal:options.signal || AbortSignal.timeout(120000)});
    if (![301,302,303,307,308].includes(response.status)) return response;
    const location = response.headers.get('location');
    await response.body?.cancel();
    if (!location) throw new Error('重定向缺少地址');
    const next = new URL(location,url).href;
    // Never forward account credentials to a different origin on redirect.
    if (new URL(next).origin !== new URL(url).origin) {
      const headers = new Headers(options.headers); headers.delete('authorization'); headers.delete('cookie');
      options = {...options,headers};
    }
    url=next;
  }
  throw new Error('重定向次数过多');
}
function executable(env: string, command: string) {
  if (process.env[env] && fs.existsSync(process.env[env]!)) return path.resolve(process.env[env]!);
  for (const directory of (process.env.PATH || '').split(path.delimiter)) {
    const p = path.join(directory,command+(process.platform==='win32'?'.exe':''));
    if (fs.existsSync(p)) return p;
  }
  return '';
}
export function runtimeBinaries() {
  const browserCandidates = [process.env.WANCHUANG_BROWSER, browserDriver.executablePath(),
    path.join(process.env.ProgramFiles || '', 'Google/Chrome/Application/chrome.exe'),
    path.join(process.env['ProgramFiles(x86)'] || '', 'Microsoft/Edge/Application/msedge.exe'),
    '/usr/bin/chromium','/usr/bin/chromium-browser','/usr/bin/google-chrome'];
  return {ytDlp:executable('WANCHUANG_YTDLP','yt-dlp'),ffmpeg:executable('WANCHUANG_FFMPEG','ffmpeg'),browser:browserCandidates.find(p=>p && fs.existsSync(p)) || ''};
}
let active = 0;
const waiters: (()=>void)[] = [];
export async function acquire() {
  const limit = Math.max(1,Math.min(3,readToolSettings().concurrency || 2));
  if(active>=limit) await new Promise<void>(resolve=>waiters.push(resolve));
  else active++;
  let released=false;
  return ()=>{ if(released)return; released=true; const next=waiters.shift(); if(next)next(); else active--; };
}
export async function limited<T>(fn:()=>Promise<T>) { const release=await acquire(); try{return await fn();}finally{release();} }

export function makeRuntime(root: string) {
  const binaries=runtimeBinaries();
  const spawn = (command: string,args: string[],options: any) => {
    if(!command) throw new Error('服务器缺少运行依赖，请在后台查看服务状态');
    const extra = command===binaries.ytDlp ? ['--ignore-config','--no-cache-dir','--use-extractors','default,-generic','--socket-timeout','30','--retries','2','--max-filesize','300M'] : [];
    const child=nativeSpawn(command,[...extra,...args],{...options,timeout:15*60_000});
    return child;
  };
  const chromium={async launch(options: any) {
    const browser=await browserDriver.launch({...options,timeout:30000});
    const original=browser.newContext.bind(browser);
    browser.newContext=async (opts:any)=>{
      const context=await original({...opts,serviceWorkers:'block'});
      await context.route('**/*',async route=>{
        try { await validateRemote(route.request().url()); await route.continue(); }
        catch { await route.abort(); }
      });
      return context;
    };
    return browser;
  }};
  return createEngine({root,readConfig:readToolSettings,binaries,chromium,fetch:publicFetch,spawn,acquire,validateRemote});
}

export function safeFile(root: string, candidate: string) {
  const base=fs.realpathSync(root);
  const resolved=fs.realpathSync(candidate);
  if(!resolved.startsWith(base+path.sep) || !fs.statSync(resolved).isFile()) throw new Error('文件不可用');
  return resolved;
}
