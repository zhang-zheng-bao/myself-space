import "dotenv/config";
import crypto from "crypto";
import express, { NextFunction, Request, Response } from "express";
import fs from "fs";
import path from "path";
import multer from "multer";
import COS from "cos-nodejs-sdk-v5";
import mammoth from "mammoth";
import { createClient, SupabaseClient } from "@supabase/supabase-js";
import { WebSocket } from "ws";
import { createServer as createViteServer } from "vite";

type JsonRecord = Record<string, any>;

const PORT = Number(process.env.PORT || 3010);
const SESSION_COOKIE = "portfolio_admin";
const SESSION_TTL_SECONDS = 60 * 60 * 12;
const MAX_UPLOAD_SIZE_MB = Number(process.env.MAX_UPLOAD_SIZE_MB || 50);
let effectiveUploadSizeMb = MAX_UPLOAD_SIZE_MB;
const uploadTempDir = path.join(process.cwd(), "uploads", "tmp");
fs.mkdirSync(uploadTempDir, { recursive: true });
const mediaUpload = multer({
  storage: multer.diskStorage({
    destination: (_req, _file, callback) => callback(null, uploadTempDir),
    filename: (_req, file, callback) => {
      const safeOriginal = file.originalname.replace(/[^a-zA-Z0-9._-]/g, "_");
      callback(null, `${Date.now()}_${crypto.randomBytes(6).toString("hex")}_${safeOriginal}`);
    },
  }),
  limits: { fileSize: MAX_UPLOAD_SIZE_MB * 1024 * 1024 },
});

function readCookies(header?: string) {
  return Object.fromEntries(
    (header || "")
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((part) => {
        const index = part.indexOf("=");
        return [part.slice(0, index), decodeURIComponent(part.slice(index + 1))];
      }),
  );
}

function getSessionSecret() {
  return process.env.ADMIN_SESSION_SECRET || process.env.ADMIN_PASSWORD || "dev-only-change-me";
}

function sign(value: string) {
  return crypto.createHmac("sha256", getSessionSecret()).update(value).digest("base64url");
}

function createSession() {
  const payload = Buffer.from(
    JSON.stringify({ exp: Math.floor(Date.now() / 1000) + SESSION_TTL_SECONDS }),
  ).toString("base64url");
  return `${payload}.${sign(payload)}`;
}

function verifySession(token?: string) {
  if (!token) return false;
  const [payload, signature] = token.split(".");
  if (!payload || !signature || sign(payload) !== signature) return false;

  try {
    const decoded = JSON.parse(Buffer.from(payload, "base64url").toString("utf-8"));
    return decoded.exp > Math.floor(Date.now() / 1000);
  } catch {
    return false;
  }
}

function requireAdmin(req: Request, res: Response, next: NextFunction) {
  const token = readCookies(req.headers.cookie)[SESSION_COOKIE];
  if (!verifySession(token)) {
    return res.status(401).json({ error: "需要管理员登录" });
  }
  next();
}

function getSupabase(): SupabaseClient | null {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) return null;
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
    realtime: { transport: WebSocket as any },
  });
}

function getCosClient() {
  const { TENCENT_COS_SECRET_ID, TENCENT_COS_SECRET_KEY, TENCENT_COS_BUCKET, TENCENT_COS_REGION } = process.env;
  if (!TENCENT_COS_SECRET_ID || !TENCENT_COS_SECRET_KEY || !TENCENT_COS_BUCKET || !TENCENT_COS_REGION) return null;

  return new COS({
    SecretId: TENCENT_COS_SECRET_ID,
    SecretKey: TENCENT_COS_SECRET_KEY,
  });
}

function getTencentApiCredential() {
  const secretId = process.env.TENCENT_ASR_SECRET_ID || process.env.TENCENT_COS_SECRET_ID;
  const secretKey = process.env.TENCENT_ASR_SECRET_KEY || process.env.TENCENT_COS_SECRET_KEY;
  return secretId && secretKey ? { secretId, secretKey } : null;
}

function sha256Hex(value: string) {
  return crypto.createHash("sha256").update(value, "utf8").digest("hex");
}

function hmacSha256(key: crypto.BinaryLike, value: string) {
  return crypto.createHmac("sha256", key).update(value, "utf8").digest();
}

function hmacSha256Hex(key: crypto.BinaryLike, value: string) {
  return crypto.createHmac("sha256", key).update(value, "utf8").digest("hex");
}

/* ------------------------------------------------------------------ 站点检测 */

type UaInfo = {
  deviceType: string;
  browser: string;
  browserVersion: string;
  os: string;
  osVersion: string;
  engine: string;
};

/**
 * 极简 UA 解析。刻意不引第三方包：
 * 依赖越少，部署面越小；这里只需要把「设备类型 / 浏览器 / 系统 / 引擎」认出来。
 * 判定顺序很关键——Edg 必须先于 Chrome，否则 Edge 会被认成 Chrome。
 */
function parseUserAgent(uaRaw: string): UaInfo {
  const ua = uaRaw || "";
  const pick = (re: RegExp) => {
    const r = ua.match(re);
    return r ? r[1] || "" : "";
  };

  // 真爬虫（带名字的 search bot / 抓取库）走这条捷径。
  // **注意 `headlesschrome` 曾经也在这个列表里** —— 那是个错误：无头 Chrome 就是
  // 一个正常浏览器内核，把它当爬虫会让所有 Playwright / 自动化访问直接 return，
  // 于是 browser / OS / 引擎 全是空的，后台整列显示「爬虫」。
  // 现在只把它标注成「无头」标记，后面照常解析 UA。
  const isHeadless = /headlesschrome|HeadlessChrome/i.test(ua);
  const isScripted = /python-requests|curl\/|Go-http-client|okhttp|axios\/|node-fetch|wget\//i.test(ua);

  if (/bot|crawler|spider|slurp|bingpreview|facebookexternalhit/i.test(ua)) {
    const name =
      pick(/(Googlebot|Bingbot|Baiduspider|YandexBot|DuckDuckBot|Applebot|SemrushBot|AhrefsBot|PetalBot|Sogou web spider|360Spider|Bytespider|GPTBot|ClaudeBot|CCBot|PerplexityBot|facebookexternalhit)/i) ||
      "Bot";
    return { deviceType: "爬虫", browser: name, browserVersion: "", os: "-", osVersion: "", engine: "" };
  }

  // 脚本直连（没有浏览器内核）：也算「爬虫」，但标出是脚本而不是搜索引擎。
  if (isScripted) {
    const name = /curl\//i.test(ua) ? "curl" : /wget\//i.test(ua) ? "wget" : isHeadless ? "Headless Chrome" : "脚本请求";
    return { deviceType: "爬虫", browser: name, browserVersion: "", os: "-", osVersion: "", engine: "" };
  }

  let engine = "";
  if (/Trident\//.test(ua)) engine = "Trident";
  else if (/AppleWebKit\//.test(ua)) engine = /Chrome\/|Chromium\/|Edg\//.test(ua) ? "Blink" : "WebKit";
  else if (/Gecko\/|Firefox\//.test(ua)) engine = "Gecko";

  let browser = "未知";
  let browserVersion = "";
  const browsers: [RegExp, string][] = [
    [/Edg(?:e|A|iOS)?\/([\d.]+)/, "Edge"],
    [/OPR\/([\d.]+)/, "Opera"],
    [/MicroMessenger\/([\d.]+)/, "微信内置浏览器"],
    [/QQBrowser\/([\d.]+)/, "QQ 浏览器"],
    [/UCBrowser\/([\d.]+)/, "UC 浏览器"],
    [/Quark\/([\d.]+)/, "夸克"],
    [/(?:CriOS)\/([\d.]+)/, "Chrome (iOS)"],
    [/(?:FxiOS)\/([\d.]+)/, "Firefox (iOS)"],
    [/Firefox\/([\d.]+)/, "Firefox"],
    [/Chrome\/([\d.]+)/, "Chrome"],
    [/Version\/([\d.]+).*Safari/, "Safari"],
    [/MSIE\s([\d.]+)/, "IE"],
    [/rv:([\d.]+).*Trident/, "IE"],
  ];
  for (const [re, name] of browsers) {
    const v = pick(re);
    if (v) {
      browser = name;
      browserVersion = v;
      break;
    }
  }

  let os = "未知";
  let osVersion = "";
  if (/Windows NT 10\.0/.test(ua)) os = "Windows 10/11";
  else if (/Windows NT 6\.3/.test(ua)) os = "Windows 8.1";
  else if (/Windows NT 6\.1/.test(ua)) os = "Windows 7";
  else if (/Windows/.test(ua)) os = "Windows";
  else if (/Android[ /]([\d.]+)/.test(ua)) {
    os = "Android";
    osVersion = pick(/Android[ /]([\d.]+)/);
  } else if (/(?:iPhone|iPad|iPod).*?OS ([\d_]+)/.test(ua)) {
    os = "iOS";
    osVersion = pick(/(?:iPhone|iPad|iPod).*?OS ([\d_]+)/).replace(/_/g, ".");
  } else if (/Mac OS X ([\d_.]+)/.test(ua)) {
    os = "macOS";
    osVersion = pick(/Mac OS X ([\d_.]+)/).replace(/_/g, ".");
  } else if (/CrOS/.test(ua)) os = "ChromeOS";
  else if (/HarmonyOS/.test(ua)) os = "HarmonyOS";
  else if (/Linux/.test(ua)) os = "Linux";

  const isTablet = /iPad|Tablet|PlayBook|Silk/i.test(ua) || (/Android/i.test(ua) && !/Mobile/i.test(ua));
  const isPhone = /Mobi|iPhone|iPod|Windows Phone|Android.*Mobile/i.test(ua);
  const baseType = isTablet ? "平板" : isPhone ? "手机" : "桌面";
  // 无头浏览器是「自动化访问」，不是真人。但它的 browser / OS 仍然可信，
  // 所以只加一个后缀标记，不把它整个降级成「爬虫」（那会丢掉全部有用信息）。
  const deviceType = isHeadless ? `${baseType}（无头）` : baseType;

  return { deviceType, browser, browserVersion, os, osVersion, engine };
}

/**
 * 取真实客户端 IP。trust proxy = 1 时 req.ip 是「上一跳代理追加的那一段」；
 * 直接读 X-Forwarded-For 的第一段会被访客自己伪造的请求头带偏。
 */
function clientIp(req: Request) {
  const ip = String(req.ip || req.socket.remoteAddress || "").replace(/^::ffff:/, "");
  return ip === "::1" ? "127.0.0.1" : ip;
}

function isPrivateIp(ip: string) {
  if (!ip) return true;
  if (/^(127\.|10\.|192\.168\.|169\.254\.|::1$|fc|fd|fe80)/i.test(ip)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return true;
  return false;
}

export type TrafficType = "human" | "bot" | "local";

/**
 * 流量分类，规则与 supabase/schema.sql 里的 portfolio_classify_traffic 一致（改一边要同步另一边）。
 * - local：本机 / 内网（开发、AI 预览浏览器、同机反代没带 XFF）
 * - bot：不是 Mozilla 开头、没有浏览器内核标识，或带爬虫 / 扫描器 / 自动化关键字
 */
export function classifyTraffic(userAgent: string, ip: string): TrafficType {
  if (isPrivateIp(ip)) return "local";
  return isBotUserAgent(userAgent) ? "bot" : "human";
}

export function isBotUserAgent(userAgent: string) {
  const ua = userAgent || "";
  if (!/^mozilla\//i.test(ua) || !/(applewebkit|gecko)\//i.test(ua)) return true;
  return /bot|crawl|spider|slurp|scan|inspect|headless|phantom|playwright|puppeteer|selenium|lighthouse|curl|wget|python|go-http|java\/|okhttp|axios|node-fetch|httpclient|libwww|rootevidence|measurement|palo alto|censys|webindexer|facebookexternalhit|preview|monitor|uptime/i.test(ua);
}

type GeoInfo = { country: string; region: string; city: string; isp: string; raw: unknown };

/*
 * 归属地统一成中文。首选的 ip-api 用 lang=zh-CN 直接返回中文；它限流或超时时才会落到
 * ipapi.co / ipwho.is，这两家只有英文，不转换的话后台会同时出现「中国」和「China」两条。
 * 国家用 ISO 代码交给 Intl.DisplayNames；国内省份和常见城市查表，写法对齐 ip-api 的输出。
 * 海外城市 ip-api 自己也常给英文，查不到的保留原文。
 */
const zhRegionNames = new Intl.DisplayNames(["zh-CN"], { type: "region" });

const CN_PROVINCES: Record<string, string> = {
  beijing: "北京市", tianjin: "天津市", shanghai: "上海市", chongqing: "重庆市",
  hebei: "河北", shanxi: "山西", liaoning: "辽宁", jilin: "吉林", heilongjiang: "黑龙江",
  jiangsu: "江苏", zhejiang: "浙江", anhui: "安徽", fujian: "福建", jiangxi: "江西",
  shandong: "山东", henan: "河南", hubei: "湖北", hunan: "湖南", guangdong: "广东",
  hainan: "海南", sichuan: "四川", guizhou: "贵州", yunnan: "云南", shaanxi: "陕西",
  gansu: "甘肃", qinghai: "青海", taiwan: "台湾", "inner mongolia": "内蒙古", neimenggu: "内蒙古",
  guangxi: "广西", tibet: "西藏", xizang: "西藏", ningxia: "宁夏", xinjiang: "新疆",
  "hong kong": "香港", macau: "澳门", macao: "澳门",
};

const CN_CITIES: Record<string, string> = {
  beijing: "北京", shanghai: "上海", tianjin: "天津", chongqing: "重庆", guangzhou: "广州市",
  shenzhen: "深圳", hangzhou: "杭州", nanjing: "南京", suzhou: "苏州", wuxi: "无锡", hefei: "合肥",
  wuhan: "武汉", chengdu: "成都", "xi'an": "西安", xian: "西安", changsha: "长沙", zhengzhou: "郑州",
  jinan: "济南", qingdao: "青岛", xiamen: "厦门", fuzhou: "福州", ningbo: "宁波", dongguan: "东莞",
  foshan: "佛山", shenyang: "沈阳", dalian: "大连", harbin: "哈尔滨", changchun: "长春",
  kunming: "昆明", guiyang: "贵阳", nanning: "南宁", nanchang: "南昌", taiyuan: "太原",
  shijiazhuang: "石家庄", lanzhou: "兰州", urumqi: "乌鲁木齐", haikou: "海口", wuhu: "芜湖",
  "hong kong": "香港", macau: "澳门", taipei: "台北",
};

const hasCjk = (s: string) => /[㐀-鿿]/.test(s);
const geoKey = (s: string) =>
  s.toLowerCase().replace(/\s+(sheng|shi|province|municipality|city|(zhuangzu |huizu |weiwu'?er )?autonomous region|zizhiqu|sar)$/i, "").trim();

export function toZhGeo(country: string, region: string, city: string, countryCode?: string) {
  let zhCountry = country;
  const code = (countryCode || "").toUpperCase();
  if (!hasCjk(country)) {
    try {
      if (/^[A-Z]{2}$/.test(code)) zhCountry = zhRegionNames.of(code) || country;
    } catch {
      // 非法代码时保留原文
    }
    if (zhCountry === country && /^china$/i.test(country)) zhCountry = "中国";
  }
  const inChina = zhCountry === "中国" || ["CN", "HK", "MO", "TW"].includes(code);
  const zhRegion = inChina && !hasCjk(region) ? CN_PROVINCES[geoKey(region)] || region : region;
  const zhCity = inChina && !hasCjk(city) ? CN_CITIES[geoKey(city)] || city : city;
  return { country: zhCountry, region: zhRegion, city: zhCity };
}

const geoCache = new Map<string, { at: number; value: GeoInfo | null }>();
const GEO_TTL_MS = 6 * 60 * 60 * 1000;

async function fetchJson(url: string, ms = 4000): Promise<any> {
  const ctl = new AbortController();
  const timer = setTimeout(() => ctl.abort(), ms);
  try {
    const r = await fetch(url, { signal: ctl.signal, headers: { Accept: "application/json" } });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * IP 归属地。走多家免费接口串行兜底，并做 6 小时内存缓存（含「查不到」的负缓存，
 * 免得对内网/保留地址反复发请求）。整个函数永不抛异常，查不到就返回 null。
 */
export async function lookupIpGeo(ip: string): Promise<GeoInfo | null> {
  if (!ip || isPrivateIp(ip)) return null;

  const hit = geoCache.get(ip);
  if (hit && Date.now() - hit.at < GEO_TTL_MS) return hit.value;

  let info: GeoInfo | null = null;

  const a = await fetchJson(
    `http://ip-api.com/json/${encodeURIComponent(ip)}?lang=zh-CN&fields=status,country,regionName,city,isp,query`,
  );
  if (a && a.status === "success") {
    info = { country: a.country || "", region: a.regionName || "", city: a.city || "", isp: a.isp || "", raw: a };
  }

  if (!info) {
    const b = await fetchJson(`https://ipapi.co/${encodeURIComponent(ip)}/json/`);
    if (b && b.country_name) {
      info = { country: b.country_name || "", region: b.region || "", city: b.city || "", isp: b.org || "", raw: b };
    }
  }

  if (!info) {
    const c = await fetchJson(`https://ipwho.is/${encodeURIComponent(ip)}`);
    if (c && c.success !== false && c.country) {
      info = {
        country: c.country || "",
        region: c.region || "",
        city: c.city || "",
        isp: (c.connection && c.connection.isp) || "",
        raw: c,
      };
    }
  }

  if (info) {
    const raw = info.raw as { country_code?: string; countryCode?: string };
    Object.assign(info, toZhGeo(info.country, info.region, info.city, raw?.country_code || raw?.countryCode));
  }

  geoCache.set(ip, { at: Date.now(), value: info });
  return info;
}

async function callTencentAsr(action: string, payload: JsonRecord) {
  const credential = getTencentApiCredential();
  if (!credential) {
    throw new Error("请先配置 TENCENT_ASR_SECRET_ID/TENCENT_ASR_SECRET_KEY，或复用 TENCENT_COS_SECRET_ID/TENCENT_COS_SECRET_KEY。");
  }

  const endpoint = process.env.TENCENT_ASR_ENDPOINT || "asr.tencentcloudapi.com";
  const region = process.env.TENCENT_ASR_REGION || process.env.TENCENT_COS_REGION || "ap-guangzhou";
  const service = "asr";
  const version = "2019-06-14";
  const timestamp = Math.floor(Date.now() / 1000);
  const date = new Date(timestamp * 1000).toISOString().slice(0, 10);
  const body = JSON.stringify(payload);
  const canonicalHeaders = `content-type:application/json; charset=utf-8\nhost:${endpoint}\n`;
  const signedHeaders = "content-type;host";
  const canonicalRequest = [
    "POST",
    "/",
    "",
    canonicalHeaders,
    signedHeaders,
    sha256Hex(body),
  ].join("\n");
  const credentialScope = `${date}/${service}/tc3_request`;
  const stringToSign = [
    "TC3-HMAC-SHA256",
    timestamp,
    credentialScope,
    sha256Hex(canonicalRequest),
  ].join("\n");
  const secretDate = hmacSha256(`TC3${credential.secretKey}`, date);
  const secretService = hmacSha256(secretDate, service);
  const secretSigning = hmacSha256(secretService, "tc3_request");
  const signature = hmacSha256Hex(secretSigning, stringToSign);
  const authorization = `TC3-HMAC-SHA256 Credential=${credential.secretId}/${credentialScope}, SignedHeaders=${signedHeaders}, Signature=${signature}`;

  const response = await fetch(`https://${endpoint}`, {
    method: "POST",
    headers: {
      "Authorization": authorization,
      "Content-Type": "application/json; charset=utf-8",
      "Host": endpoint,
      "X-TC-Action": action,
      "X-TC-Region": region,
      "X-TC-Timestamp": String(timestamp),
      "X-TC-Version": version,
    },
    body,
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || json.Response?.Error) {
    const error = json.Response?.Error;
    const message = String(error?.Message || "");
    if (message.includes("User is unopened") || message.includes("ASR_OffLine")) {
      throw new Error("腾讯云 ASR 离线识别服务尚未开通，请先在腾讯云控制台开通语音识别/录音文件识别服务，然后再生成歌词。");
    }
    throw new Error(message || `腾讯云 ASR 请求失败：${response.status}`);
  }
  return json.Response;
}

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function formatLrcTimestamp(ms: number) {
  const total = Math.max(0, ms);
  const mins = Math.floor(total / 60000);
  const secs = Math.floor((total % 60000) / 1000);
  const centis = Math.floor((total % 1000) / 10);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${String(centis).padStart(2, "0")}`;
}

function cleanAsrLyricText(value: string) {
  return value
    .replace(/[，。！？、；：,.!?;:]/g, "")
    .replace(/\s+/g, "")
    .replace(/[<>\[\]]/g, "")
    .trim();
}

type AsrTimedChar = { char: string; start: number; end: number };

function parseReferenceLyricLines(value?: string) {
  return String(value || "")
    .replace(/^\uFEFF/, "")
    .replace(/^WEBVTT[^\n]*(?:\r?\n)+/i, "")
    .split(/\r?\n/)
    .map((line) => line
      .replace(/\{\\[^}]+\}/g, "")
      .replace(/<[^>]+>/g, "")
      .replace(/\[[^\]]+\]/g, "")
      .replace(/\d{1,2}:\d{2}:\d{2}[,.]\d{1,3}\s*-->\s*\d{1,2}:\d{2}:\d{2}[,.]\d{1,3}.*/g, "")
      .replace(/\d{1,2}:\d{2}[,.]\d{1,3}\s*-->\s*\d{1,2}:\d{2}[,.]\d{1,3}.*/g, "")
      .trim())
    .filter((line) => !/^\d+$/.test(line))
    .filter((line) => !/^NOTE\b/i.test(line))
    .map((line) => cleanAsrLyricText(line))
    .filter(Boolean);
}

function sentenceTimedChars(sentence: JsonRecord): AsrTimedChar[] {
  const sentenceStart = Number(sentence.StartMs || 0);
  const sentenceEnd = Number(sentence.EndMs || sentenceStart);
  const words: JsonRecord[] = Array.isArray(sentence.Words) ? sentence.Words : [];
  return words.flatMap((word) => {
    const text = cleanAsrLyricText(String(word.Word || ""));
    if (!text) return [];
    const start = sentenceStart + Number(word.OffsetStartMs || 0);
    const end = sentenceStart + Number(word.OffsetEndMs || word.OffsetStartMs || 0);
    const chars = text.split("");
    const span = end > start ? end - start : Math.max(140, Math.floor((sentenceEnd - sentenceStart) / Math.max(words.length, 1)));
    return chars.map((char, charIndex) => ({
      char,
      start: start + Math.floor((span * charIndex) / Math.max(chars.length, 1)),
      end: start + Math.floor((span * (charIndex + 1)) / Math.max(chars.length, 1)),
    }));
  });
}

function timedLineFromChars(text: string, timings: AsrTimedChar[], fallbackStart: number) {
  const chars = cleanAsrLyricText(text).split("");
  if (chars.length === 0) return "";
  const lineStart = timings[0]?.start ?? fallbackStart;
  const fallbackSpan = Math.max(160, Math.floor(2600 / chars.length));
  const body = chars.map((char, index) => {
    const source = timings[index];
    const last = timings[timings.length - 1];
    const previous = timings[index - 1];
    const start = source?.start ?? (last ? last.end + fallbackSpan * (index - timings.length) : lineStart + fallbackSpan * index);
    const next = timings[index + 1];
    if (source && (!source.end || source.end <= source.start)) {
      source.end = next?.start || previous?.end || source.start + fallbackSpan;
    }
    return `<${formatLrcTimestamp(start)}>${char}`;
  }).join("");
  return `[${formatLrcTimestamp(lineStart)}]${body}`;
}

function normalizeLineTimingGroups(groups: AsrTimedChar[][]) {
  let previousEnd = 0;
  return groups.map((group) => {
    const normalized = group.map((item) => ({ ...item }));
    const fallbackSpan = Math.max(120, Math.min(320, Math.floor(2200 / Math.max(normalized.length, 1))));
    for (let index = 0; index < normalized.length; index += 1) {
      const previous = normalized[index - 1];
      const minStart = previous ? previous.end : previousEnd;
      if (!Number.isFinite(normalized[index].start) || normalized[index].start < minStart) {
        normalized[index].start = minStart;
      }
      if (previous && normalized[index].start - previous.start > 900) {
        normalized[index].start = previous.end + fallbackSpan;
      }
      const nextStart = normalized[index + 1]?.start;
      const naturalEnd = normalized[index].end > normalized[index].start ? normalized[index].end : normalized[index].start + 220;
      const cappedEnd = nextStart && nextStart > normalized[index].start
        ? Math.min(naturalEnd, nextStart)
        : naturalEnd;
      normalized[index].end = Math.max(normalized[index].start + 80, cappedEnd);
    }
    const last = normalized[normalized.length - 1];
    previousEnd = last ? last.end + 40 : previousEnd;
    return normalized;
  });
}

function lcsCharMatches(reference: string[], recognized: AsrTimedChar[]) {
  const maxCells = Number(process.env.TENCENT_ASR_ALIGN_MAX_CELLS || 1200000);
  if (reference.length * recognized.length > maxCells) {
    const matches: { refIndex: number; asrIndex: number }[] = [];
    let asrCursor = 0;
    reference.forEach((char, refIndex) => {
      const found = recognized.findIndex((item, index) => index >= asrCursor && item.char === char);
      if (found >= 0) {
        matches.push({ refIndex, asrIndex: found });
        asrCursor = found + 1;
      }
    });
    return matches;
  }

  const width = recognized.length + 1;
  const dp = new Uint16Array((reference.length + 1) * width);
  for (let i = reference.length - 1; i >= 0; i -= 1) {
    for (let j = recognized.length - 1; j >= 0; j -= 1) {
      const offset = i * width + j;
      dp[offset] = reference[i] === recognized[j].char
        ? dp[(i + 1) * width + j + 1] + 1
        : Math.max(dp[(i + 1) * width + j], dp[i * width + j + 1]);
    }
  }

  const matches: { refIndex: number; asrIndex: number }[] = [];
  let i = 0;
  let j = 0;
  while (i < reference.length && j < recognized.length) {
    if (reference[i] === recognized[j].char) {
      matches.push({ refIndex: i, asrIndex: j });
      i += 1;
      j += 1;
    } else if (dp[(i + 1) * width + j] >= dp[i * width + j + 1]) {
      i += 1;
    } else {
      j += 1;
    }
  }
  return matches;
}

function sequenceCharMatches(reference: string[], recognized: AsrTimedChar[]) {
  const maxCells = Number(process.env.TENCENT_ASR_ALIGN_MAX_CELLS || 1200000);
  if (reference.length * recognized.length > maxCells) {
    const first = recognized[0]?.start || 0;
    const last = recognized[recognized.length - 1]?.end || first + reference.length * 240;
    const span = Math.max(160, Math.floor((last - first) / Math.max(reference.length, 1)));
    return reference.map((_, refIndex) => ({
      refIndex,
      asrIndex: Math.min(recognized.length - 1, Math.max(0, Math.round((refIndex / Math.max(reference.length - 1, 1)) * (recognized.length - 1)))),
      fallbackStart: first + span * refIndex,
    }));
  }

  const width = recognized.length + 1;
  const cost = new Float32Array((reference.length + 1) * width);
  const matchCost = (refIndex: number, asrIndex: number) => {
    const expected = (refIndex / Math.max(reference.length - 1, 1)) * Math.max(recognized.length - 1, 1);
    const distance = Math.abs(asrIndex - expected) / Math.max(recognized.length, 1);
    const positionPenalty = Math.min(0.55, distance * 1.15);
    return (reference[refIndex] === recognized[asrIndex].char ? 0 : 0.92) + positionPenalty;
  };

  for (let i = reference.length; i >= 0; i -= 1) {
    for (let j = recognized.length; j >= 0; j -= 1) {
      const offset = i * width + j;
      if (i === reference.length && j === recognized.length) {
        cost[offset] = 0;
      } else if (i === reference.length) {
        cost[offset] = cost[i * width + j + 1] + 0.72;
      } else if (j === recognized.length) {
        cost[offset] = cost[(i + 1) * width + j] + 1.15;
      } else {
        const diagonal = cost[(i + 1) * width + j + 1] + matchCost(i, j);
        const skipReference = cost[(i + 1) * width + j] + 1.15;
        const skipRecognized = cost[i * width + j + 1] + 0.72;
        cost[offset] = Math.min(diagonal, skipReference, skipRecognized);
      }
    }
  }

  const matches: { refIndex: number; asrIndex: number }[] = [];
  let i = 0;
  let j = 0;
  while (i < reference.length && j < recognized.length) {
    const diagonal = cost[(i + 1) * width + j + 1] + matchCost(i, j);
    const skipReference = cost[(i + 1) * width + j] + 1.15;
    const skipRecognized = cost[i * width + j + 1] + 0.72;
    const best = Math.min(diagonal, skipReference, skipRecognized);
    if (Math.abs(diagonal - best) < 0.0001) {
      matches.push({ refIndex: i, asrIndex: j });
      i += 1;
      j += 1;
    } else if (Math.abs(skipRecognized - best) < 0.0001) {
      j += 1;
    } else {
      i += 1;
    }
  }
  return matches;
}

function alignReferenceCharsToAsr(referenceChars: string[], recognized: AsrTimedChar[]) {
  if (referenceChars.length === 0) return [];
  if (recognized.length === 0) {
    return referenceChars.map((char, index) => ({
      char,
      start: index * 260,
      end: index * 260 + 220,
    }));
  }

  const matches = sequenceCharMatches(referenceChars, recognized);
  if (matches.length === 0) {
    const first = recognized[0]?.start || 0;
    const last = recognized[recognized.length - 1]?.end || first + referenceChars.length * 240;
    const span = Math.max(160, Math.floor((last - first) / Math.max(referenceChars.length, 1)));
    return referenceChars.map((char, index) => ({
      char,
      start: first + span * index,
      end: first + span * (index + 1),
    }));
  }

  const aligned: AsrTimedChar[] = new Array(referenceChars.length);
  matches.forEach(({ refIndex, asrIndex }) => {
    const source = recognized[asrIndex];
    aligned[refIndex] = { char: referenceChars[refIndex], start: source.start, end: source.end };
  });

  const fillRange = (fromRef: number, toRef: number, startMs: number, endMs: number) => {
    const count = toRef - fromRef + 1;
    if (count <= 0) return;
    const span = Math.max(140, Math.floor((endMs - startMs) / Math.max(count, 1)));
    for (let index = 0; index < count; index += 1) {
      const start = startMs + span * index;
      aligned[fromRef + index] = {
        char: referenceChars[fromRef + index],
        start,
        end: Math.min(endMs, start + span),
      };
    }
  };

  const firstMatch = matches[0];
  if (firstMatch.refIndex > 0) {
    const firstStart = aligned[firstMatch.refIndex].start;
    const startMs = Math.max(0, firstStart - firstMatch.refIndex * 240);
    fillRange(0, firstMatch.refIndex - 1, startMs, firstStart);
  }

  for (let index = 0; index < matches.length - 1; index += 1) {
    const current = matches[index];
    const next = matches[index + 1];
    if (next.refIndex - current.refIndex <= 1) continue;
    fillRange(
      current.refIndex + 1,
      next.refIndex - 1,
      aligned[current.refIndex].end,
      aligned[next.refIndex].start,
    );
  }

  const lastMatch = matches[matches.length - 1];
  if (lastMatch.refIndex < referenceChars.length - 1) {
    const lastEnd = aligned[lastMatch.refIndex].end;
    fillRange(lastMatch.refIndex + 1, referenceChars.length - 1, lastEnd, lastEnd + (referenceChars.length - lastMatch.refIndex - 1) * 240);
  }

  return aligned;
}

function referenceLinesToLrc(referenceLines: string[], details: JsonRecord[]) {
  const flattened = details.map(sentenceTimedChars).flat();
  const referenceChars = referenceLines.join("").split("");
  const alignedChars = alignReferenceCharsToAsr(referenceChars, flattened);
  let cursor = 0;
  const groups = referenceLines.map((line) => {
    const length = line.length;
    const exact = alignedChars.slice(cursor, cursor + length);
    cursor += length;
    return exact;
  });
  const normalizedGroups = normalizeLineTimingGroups(groups);
  return referenceLines.map((line, index) => {
    const exact = normalizedGroups[index] || [];
    if (exact.length > 0) return timedLineFromChars(line, exact, exact[0].start);
    return timedLineFromChars(line, [], index * 3000);
  });
}

function enhancedLrcFromAsr(taskStatus: JsonRecord, meta: { title?: string; artist?: string; referenceLyrics?: string }) {
  const header = [
    `[ti:${meta.title || "未命名音乐"}]`,
    `[ar:${meta.artist || "未填写"}]`,
  ];
  const details: JsonRecord[] = Array.isArray(taskStatus.ResultDetail) ? taskStatus.ResultDetail : [];
  const referenceLines = parseReferenceLyricLines(meta.referenceLyrics);
  if (referenceLines.length > 0 && details.length > 0) {
    return [...header, ...referenceLinesToLrc(referenceLines, details)].join("\n");
  }

  const lines = details.flatMap((sentence) => {
    const sentenceStart = Number(sentence.StartMs || 0);
    const sentenceEnd = Number(sentence.EndMs || sentenceStart);
    const words: JsonRecord[] = Array.isArray(sentence.Words) ? sentence.Words : [];
    if (words.length === 0) {
      const text = cleanAsrLyricText(String(sentence.FinalSentence || ""));
      return text ? [`[${formatLrcTimestamp(sentenceStart)}]${text}`] : [];
    }

    const lineStart = Math.max(0, sentenceStart + Number(words[0].OffsetStartMs || 0));
    const body = words.map((word) => {
      const text = cleanAsrLyricText(String(word.Word || ""));
      if (!text) return "";
      const start = sentenceStart + Number(word.OffsetStartMs || 0);
      const end = sentenceStart + Number(word.OffsetEndMs || word.OffsetStartMs || 0);
      const chars = text.split("");
      const span = end > start ? end - start : Math.max(140, Math.floor((sentenceEnd - sentenceStart) / Math.max(words.length, 1)));
      return chars.map((char, charIndex) => {
        const charStart = start + Math.floor((span * charIndex) / Math.max(chars.length, 1));
        return `<${formatLrcTimestamp(charStart)}>${char}`;
      }).join("");
    }).join("");

    return body ? [`[${formatLrcTimestamp(lineStart)}]${body}`] : [];
  });

  if (lines.length === 0 && taskStatus.Result) {
    String(taskStatus.Result)
      .split(/\r?\n/)
      .map((line) => cleanAsrLyricText(line))
      .filter(Boolean)
      .forEach((line, index) => lines.push(`[${formatLrcTimestamp(index * 3000)}]${line}`));
  }

  return [...header, ...lines].join("\n");
}

async function recognizeAudioToLrc(audioUrl: string, meta: { title?: string; artist?: string; referenceLyrics?: string }) {
  const created = await callTencentAsr("CreateRecTask", {
    Url: audioUrl,
    ChannelNum: 1,
    EngineModelType: process.env.TENCENT_ASR_ENGINE || "16k_zh",
    ResTextFormat: Number(process.env.TENCENT_ASR_TEXT_FORMAT || 3),
    SourceType: 0,
    ConvertNumMode: 1,
    FilterDirty: 0,
    FilterPunc: 0,
    FilterModal: 0,
    SentenceMaxLength: Number(process.env.TENCENT_ASR_SENTENCE_MAX_LENGTH || 18),
  });
  const taskId = created.Data?.TaskId;
  if (!taskId) throw new Error("腾讯云 ASR 未返回 TaskId。");

  const attempts = Number(process.env.TENCENT_ASR_POLL_ATTEMPTS || 30);
  const intervalMs = Number(process.env.TENCENT_ASR_POLL_INTERVAL_MS || 3000);
  for (let attempt = 0; attempt < attempts; attempt += 1) {
    if (attempt > 0) await sleep(intervalMs);
    const queried = await callTencentAsr("DescribeTaskStatus", { TaskId: taskId });
    const status = queried.Data || queried;
    if (status.Status === 2 || status.StatusStr === "success") {
      return {
        taskId,
        lyrics: enhancedLrcFromAsr(status, meta),
        rawText: status.Result || "",
        audioDuration: status.AudioDuration || 0,
      };
    }
    if (status.Status === 3 || status.StatusStr === "failed") {
      throw new Error(status.ErrorMsg || "腾讯云 ASR 识别失败。");
    }
  }

  throw new Error("腾讯云 ASR 仍在识别中，请稍后再试。");
}

function getCosPublicUrl(key: string) {
  const baseUrl = process.env.TENCENT_COS_PUBLIC_BASE_URL?.replace(/\/$/, "");
  if (baseUrl) return `${baseUrl}/${key}`;
  return `https://${process.env.TENCENT_COS_BUCKET}.cos.${process.env.TENCENT_COS_REGION}.myqcloud.com/${key}`;
}

function createCosObjectPath(originalName: string) {
  const safeFileName = `${Date.now()}_${originalName.replace(/[^a-zA-Z0-9._-]/g, "_")}`;
  return `portfolio/${safeFileName}`;
}

async function ensureCosCors(cos: COS | null) {
  if (!cos || !process.env.TENCENT_COS_BUCKET || !process.env.TENCENT_COS_REGION) return;
  try {
    await cos.putBucketCors({
      Bucket: process.env.TENCENT_COS_BUCKET,
      Region: process.env.TENCENT_COS_REGION,
      CORSRules: [
        {
          ID: "portfolio-admin-direct-upload",
          AllowedOrigin: ["*"],
          AllowedMethod: ["GET", "PUT", "POST", "HEAD", "OPTIONS"],
          AllowedHeader: ["*"],
          ExposeHeader: ["ETag", "Location"],
          MaxAgeSeconds: "3600",
        },
      ],
    } as any);
  } catch (error: any) {
    console.warn(`Unable to update COS CORS: ${error.message || error}`);
  }
}

function getCosObjectKey(url?: string) {
  if (!url || !process.env.TENCENT_COS_BUCKET || !process.env.TENCENT_COS_REGION) return "";
  try {
    const parsed = new URL(url);
    const publicBase = process.env.TENCENT_COS_PUBLIC_BASE_URL
      ? new URL(process.env.TENCENT_COS_PUBLIC_BASE_URL).hostname
      : "";
    const defaultHost = `${process.env.TENCENT_COS_BUCKET}.cos.${process.env.TENCENT_COS_REGION}.myqcloud.com`;
    if (parsed.hostname !== publicBase && parsed.hostname !== defaultHost) return "";
    return decodeURIComponent(parsed.pathname.replace(/^\/+/, ""));
  } catch {
    return "";
  }
}

function stripCosSignature(url?: string) {
  const key = getCosObjectKey(url);
  return key ? getCosPublicUrl(key) : (url || "");
}

function signCosUrl(url?: string) {
  const key = getCosObjectKey(url);
  if (!key || !process.env.TENCENT_COS_SECRET_ID || !process.env.TENCENT_COS_SECRET_KEY) return url || "";
  const authorization = COS.getAuthorization({
    SecretId: process.env.TENCENT_COS_SECRET_ID,
    SecretKey: process.env.TENCENT_COS_SECRET_KEY,
    Bucket: process.env.TENCENT_COS_BUCKET,
    Region: process.env.TENCENT_COS_REGION,
    Method: "GET",
    Key: key,
    Expires: Number(process.env.TENCENT_COS_SIGNED_URL_EXPIRES || 7200),
  });
  return `${getCosPublicUrl(key)}?${authorization}`;
}

/**
 * 统一处理 pageCopy 里带媒体地址的字段：读的时候签名、写的时候去掉签名。
 *
 * pageCopy 是 portfolio_profile 上的一整块 JSON 列，除了它以外所有列表（作品、截图、
 * 珍藏、音乐）都有各自的表，并且都在读写两侧做了签名转换。如果不管这个函数，写进
 * pageCopy 的 COS 签名 URL 会被原样落库、签名过期后图片就 403，所以新增的 AI 专区
 * 作品与简历岗位列表都必须在这里过一道。
 *
 * 顶层用展开保留全部键，因此不影响 floatingSentences / treasuresVisible 等既有字段。
 */
function normalizePageCopy(pageCopy: JsonRecord | undefined, transform: (url?: string) => string) {
  const copy = { ...(pageCopy || {}) };
  const musicLeadSeconds = Number(copy.musicLeadSeconds ?? 3);
  copy.musicLeadSeconds = Number.isFinite(musicLeadSeconds) ? Math.min(15, Math.max(0, musicLeadSeconds)) : 3;

  // 旧版两份固定简历。
  const resumePdfs = copy.resumePdfs && typeof copy.resumePdfs === "object" ? copy.resumePdfs as JsonRecord : {};
  copy.resumePdfs = {
    ...resumePdfs,
    productManager: transform(String(resumePdfs.productManager || "")),
    newMedia: transform(String(resumePdfs.newMedia || "")),
  };

  // 新版动态简历岗位列表。
  if (Array.isArray(copy.resumeProfiles)) {
    copy.resumeProfiles = copy.resumeProfiles.map((item) => (
      item && typeof item === "object"
        ? { ...(item as JsonRecord), url: transform(String((item as JsonRecord).url || "")) }
        : item
    ));
  }

  // 诗与惆怅的封面。**必须在这里一起归一化**：poemList 是 pageCopy 里除
  // resumePdfs / resumeProfiles / aiWorks 之外的第四个媒体载体，漏掉它的后果和
  // 漏掉 aiWorks 一样 —— 读取时签名 URL 原样发给前端（到期就 403 裂图），
  // 写入时把带签名的临时地址持久化进 JSON，之后永久失效。
  // 所有 pageCopy 媒体都只能走这条「读时签名、写时脱签名」的通道。
  if (Array.isArray(copy.poemList)) {
    copy.poemList = copy.poemList.map((item) => (
      item && typeof item === "object"
        ? { ...(item as JsonRecord), imageUrl: transform(String((item as JsonRecord).imageUrl || "")) }
        : item
    ));
  }

  // 图文与演示文稿：同属 pageCopy 内的媒体载体，规则与 poemList / aiWorks 相同。
  if (Array.isArray(copy.postList)) {
    copy.postList = copy.postList.map((item) => {
      if (!item || typeof item !== "object") return item;
      const post = item as JsonRecord;
      return {
        ...post,
        images: Array.isArray(post.images) ? post.images.map((url) => transform(String(url || ""))).filter(Boolean) : [],
      };
    });
  }
  if (Array.isArray(copy.slideList)) {
    copy.slideList = copy.slideList.map((item) => (
      item && typeof item === "object"
        ? {
            ...(item as JsonRecord),
            fileUrl: transform(String((item as JsonRecord).fileUrl || "")),
            pdfUrl: transform(String((item as JsonRecord).pdfUrl || "")),
            cover: transform(String((item as JsonRecord).cover || "")),
          }
        : item
    ));
  }

  // AI 专区作品，字段结构与作品一致，媒体地址的转换方式也照抄作品那条路径。
  if (Array.isArray(copy.aiWorks)) {
    copy.aiWorks = copy.aiWorks.map((item) => {
      if (!item || typeof item !== "object") return item;
      const work = item as JsonRecord;
      return {
        ...work,
        images: Array.isArray(work.images) ? work.images.map((url) => transform(String(url || ""))) : [],
        videoUrl: transform(String(work.videoUrl || "")),
        links: Array.isArray(work.links)
          ? work.links.map((link) => (
              link && typeof link === "object"
                ? { ...(link as JsonRecord), url: transform(String((link as JsonRecord).url || "")) }
                : link
            ))
          : [],
      };
    });
  }

  return copy;
}

async function uploadToCos(cos: COS, file: Express.Multer.File, key: string) {
  await new Promise<void>((resolve, reject) => {
    cos.sliceUploadFile(
      {
        Bucket: process.env.TENCENT_COS_BUCKET!,
        Region: process.env.TENCENT_COS_REGION!,
        Key: key,
        FilePath: file.path,
        ContentType: file.mimetype || "application/octet-stream",
        SliceSize: 8 * 1024 * 1024,
      },
      (err) => {
        if (err) reject(err);
        else resolve();
      },
    );
  });
  return getCosPublicUrl(key);
}

async function deleteCosObject(cos: COS, key: string) {
  await new Promise<void>((resolve, reject) => {
    cos.deleteObject(
      {
        Bucket: process.env.TENCENT_COS_BUCKET!,
        Region: process.env.TENCENT_COS_REGION!,
        Key: key,
      },
      (err) => {
        if (err) reject(err);
        else resolve();
      },
    );
  });
}

async function getCosObjectBuffer(cos: COS, key: string) {
  return new Promise<Buffer>((resolve, reject) => {
    cos.getObject(
      {
        Bucket: process.env.TENCENT_COS_BUCKET!,
        Region: process.env.TENCENT_COS_REGION!,
        Key: key,
      },
      (err, data) => {
        if (err) reject(err);
        else resolve(data.Body);
      },
    );
  });
}

/**
 * 附件预览页的外壳。**自包含、零外部请求** —— 弹层里的 iframe 不该再去拉 CDN，
 * 也不该被 COS 的防盗链/CSP 影响。
 *
 * `sandbox` 由前台 iframe 指定；这里不写脚本，纯静态 HTML + 内联样式。
 */
function escapeHtml(value: string) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/**
 * 预览页统一用深色，和站点一致；`<body>` 只负责排版，滚动由外层弹层控制，
 * 所以这里**不设固定高度**，让内容自然撑开（前台弹层再给它 overflow-auto）。
 */
function previewShell(title: string, inner: string) {
  return `<!doctype html>
<html lang="zh-CN">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>${escapeHtml(title)}</title>
<style>
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; padding: 28px 30px 60px;
    background: #09090b; color: #e4e4e7;
    font: 400 15px/1.85 -apple-system, BlinkMacSystemFont, "Segoe UI", "Microsoft YaHei", "PingFang SC", sans-serif;
    -webkit-text-size-adjust: 100%;
  }
  .doc { max-width: 860px; margin: 0 auto; }
  .doc h1 { font-size: 25px; line-height: 1.5; margin: 0 0 20px; color: #fafafa; font-weight: 600; }
  .doc h2 { font-size: 20px; line-height: 1.5; margin: 30px 0 12px; color: #fafafa; font-weight: 600; }
  .doc h3 { font-size: 17px; line-height: 1.5; margin: 24px 0 10px; color: #fafafa; font-weight: 600; }
  .doc h4, .doc h5, .doc h6 { font-size: 15px; margin: 20px 0 8px; color: #fafafa; font-weight: 600; }
  .doc p { margin: 0 0 14px; }
  .doc a { color: #6ee7b7; }
  .doc ul, .doc ol { margin: 0 0 16px; padding-left: 26px; }
  .doc li { margin: 4px 0; }
  .doc img { max-width: 100%; height: auto; border-radius: 8px; margin: 10px 0; background: #000; }
  .doc table { border-collapse: collapse; width: 100%; margin: 16px 0; font-size: 14px; }
  .doc table td, .doc table th { border: 1px solid #27272a; padding: 8px 11px; text-align: left; vertical-align: top; }
  .doc table th { background: #18181b; font-weight: 600; color: #fafafa; }
  .doc blockquote { margin: 14px 0; padding: 2px 0 2px 16px; border-left: 3px solid #3f3f46; color: #a1a1aa; }
  .doc hr { border: 0; border-top: 1px solid #27272a; margin: 26px 0; }
  .doc pre, .preview-pre {
    margin: 0; padding: 18px; background: #131316; border: 1px solid #27272a; border-radius: 8px;
    font: 400 13px/1.75 ui-monospace, SFMono-Regular, Consolas, "Courier New", monospace;
    color: #d4d4d8; white-space: pre-wrap; word-break: break-word; overflow-wrap: anywhere;
  }
  .doc code { background: #18181b; border: 1px solid #27272a; border-radius: 4px; padding: 1px 5px;
    font: 400 13px ui-monospace, SFMono-Regular, Consolas, monospace; }
  .doc pre code { background: none; border: 0; padding: 0; }
  .empty-note { color: #71717a; font-size: 14px; }
</style>
</head>
<body><div class="doc">${inner}</div></body>
</html>`;
}

/** 有内容可读时的预览页；空文档给一句提示，别让用户对着空白页发愣。 */
function previewHtmlPage(name: string, inner: string) {
  const body = inner && inner.trim()
    ? inner
    : `<p class="empty-note">这份文档没有可显示的正文内容。</p>`;
  return previewShell(name || "附件预览", body);
}

/** 不能用预览时的人话提示（老格式 / 找不到 / 转换失败）。 */
function previewMessagePage(message: string) {
  return previewShell(
    "无法预览",
    `<p style="margin:0 0 10px;font-size:16px;color:#fafafa;font-weight:600">暂时看不了这份文件</p>
     <p class="empty-note" style="margin:0">${escapeHtml(message)}</p>`,
  );
}

/**
 * csv / tsv → 一个朴素表格。
 *
 * 只处理**纯文本**的两种。xlsx 不能走这里：它本身是 zip 二进制，
 * 按 UTF-8 解出来是乱码。要么上专门的解析库，要么老实引导下载 ——
 * 现在选后者，别给用户一张乱码表。
 *
 * 也不做完整 CSV 规范（引号转义、跨行字段），够用即可：附件预览是「看一眼」的场景。
 */
function previewTableFromDelimited(text: string, delimiter: string) {
  const rows = text.split(/\r?\n/).filter((line) => line.length > 0).slice(0, 2000);
  if (!rows.length) return "";
  const cells = rows.map((line) => line.split(delimiter));
  const head = cells[0];
  const bodyRows = cells.slice(1);
  const thead = `<thead><tr>${head.map((c) => `<th>${escapeHtml(c.trim())}</th>`).join("")}</tr></thead>`;
  const tbody = `<tbody>${bodyRows
    .map((row) => `<tr>${head.map((_, i) => `<td>${escapeHtml((row[i] || "").trim())}</td>`).join("")}</tr>`)
    .join("")}</tbody>`;
  return `<table>${thead}${tbody}</table>`;
}


async function ensureStorageBucket(supabase: SupabaseClient) {
  const bucket = process.env.SUPABASE_STORAGE_BUCKET || "portfolio-media";
  const fileSizeLimit = MAX_UPLOAD_SIZE_MB * 1024 * 1024;
  const updated = await supabase.storage.updateBucket(bucket, {
    public: true,
    fileSizeLimit,
  });

  if (!updated.error) return;
  effectiveUploadSizeMb = Math.min(MAX_UPLOAD_SIZE_MB, 50);

  const created = await supabase.storage.createBucket(bucket, {
    public: true,
    fileSizeLimit: effectiveUploadSizeMb * 1024 * 1024,
  });
  if (created.error) {
    console.warn(`Unable to prepare Supabase storage bucket "${bucket}": ${created.error.message}`);
  }
}

function emptyPortfolioData() {
  return {
    profile: {
      name: "",
      avatar: "",
      tagline: "",
      intro: "",
      quote: "",
      resumePdfUrl: "",
      musicAutoplay: false,
      pageCopy: {},
    },
    experiences: [],
    prospects: { title: "", content: "", points: [] },
    works: [],
    gallery: [],
    treasures: [],
    musicTracks: [],
    contact: { wechat: "", qq: "", email: "", phone: "", github: "" },
  };
}

function sortedRows(rows: JsonRecord[] | null) {
  return [...(rows || [])].sort((a, b) => (a.sort_order ?? 0) - (b.sort_order ?? 0));
}

async function fetchPortfolioData(supabase: SupabaseClient | null) {
  if (!supabase) return emptyPortfolioData();

  const [
    profile,
    experiences,
    prospects,
    works,
    gallery,
    musicTracks,
    contact,
  ] = await Promise.all([
    supabase.from("portfolio_profile").select("*").eq("id", "main").maybeSingle(),
    supabase.from("portfolio_experiences").select("*").order("sort_order"),
    supabase.from("portfolio_prospects").select("*").eq("id", "main").maybeSingle(),
    supabase.from("portfolio_works").select("*").order("sort_order"),
    supabase.from("portfolio_gallery").select("*").order("sort_order"),
    supabase.from("portfolio_music_tracks").select("*").order("sort_order"),
    supabase.from("portfolio_contact").select("*").eq("id", "main").maybeSingle(),
  ]);

  let treasuresResult: { data: JsonRecord[] | null; error: any } = { data: [], error: null };
  try {
    const { data: td, error: te } = await supabase.from("portfolio_treasures").select("*").order("sort_order");
    if (te) throw te;
    treasuresResult = { data: td, error: null };
  } catch {
    treasuresResult = { data: [], error: null };
  }

  const error = [profile, experiences, prospects, works, gallery, musicTracks, contact].find((r) => r.error)?.error;
  if (error) throw error;

  const profileData = profile.data
    ? {
        ...profile.data,
        avatar: signCosUrl(profile.data.avatar || ""),
        resumePdfUrl: signCosUrl(profile.data.resume_pdf_url || ""),
        musicAutoplay: Boolean(profile.data.music_autoplay),
        pageCopy: normalizePageCopy(profile.data.page_copy || {}, signCosUrl),
      }
    : emptyPortfolioData().profile;

  return {
    profile: profileData,
    experiences: sortedRows(experiences.data).map(({ sort_order, ...row }) => row),
    prospects: prospects.data || emptyPortfolioData().prospects,
    works: sortedRows(works.data).map(({ sort_order, video_url, badge_text, ...row }) => ({
      ...row,
      badgeText: badge_text || "",
      videoUrl: signCosUrl(video_url || ""),
      images: (row.images || []).map((url: string) => signCosUrl(url)),
      links: (row.links || []).map((link: JsonRecord) => ({ ...link, url: signCosUrl(link.url) })),
      tags: row.tags || [],
    })),
    gallery: sortedRows(gallery.data).map(({ sort_order, image_url, ...row }) => ({
      ...row,
      imageUrl: signCosUrl(image_url || ""),
    })),
    treasures: sortedRows(treasuresResult.data).map(({ sort_order, image_url, ...row }) => ({
      ...row,
      imageUrl: signCosUrl(image_url || ""),
    })),
    musicTracks: sortedRows(musicTracks.data).map(({ sort_order, audio_url, cover_url, ...row }) => ({
      ...row,
      audioUrl: signCosUrl(audio_url || ""),
      coverUrl: signCosUrl(cover_url || ""),
      lyrics: row.lyrics || "",
    })),
    contact: contact.data || emptyPortfolioData().contact,
  };
}

async function replaceList(
  supabase: SupabaseClient,
  table: string,
  incomingIds: string[],
  rows: JsonRecord[],
) {
  const existing = await supabase.from(table).select("id");
  if (existing.error) throw existing.error;

  const idsToDelete = (existing.data || [])
    .map((row) => row.id)
    .filter((id) => !incomingIds.includes(id));

  if (idsToDelete.length > 0) {
    const deleted = await supabase.from(table).delete().in("id", idsToDelete);
    if (deleted.error) throw deleted.error;
  }

  if (rows.length > 0) {
    const saved = await supabase.from(table).upsert(rows, { onConflict: "id" });
    if (saved.error) {
      const missingBadgeText = table === "portfolio_works"
        && (saved.error.code === "42703" || String(saved.error.message || "").includes("badge_text"));
      if (missingBadgeText) {
        const retryRows = rows.map(({ badge_text, ...row }) => row);
        const retry = await supabase.from(table).upsert(retryRows, { onConflict: "id" });
        if (retry.error) throw retry.error;
        return;
      }
      throw saved.error;
    }
  }
}

async function savePortfolioData(supabase: SupabaseClient | null, data: JsonRecord) {
  if (!supabase) {
    throw new Error("Supabase 未配置，已取消本地 JSON 兜底保存。");
  }

  const { resumePdfUrl, resume_pdf_url, pageCopy, page_copy, musicAutoplay, music_autoplay, ...profileFields } = data.profile || {};
  const cleanPageCopy = normalizePageCopy(pageCopy || page_copy || {}, stripCosSignature);
  const profile = await supabase.from("portfolio_profile").upsert({
    id: "main",
    ...profileFields,
    avatar: stripCosSignature(profileFields.avatar || ""),
    resume_pdf_url: stripCosSignature(resumePdfUrl || resume_pdf_url || ""),
    music_autoplay: Boolean(musicAutoplay ?? music_autoplay),
    page_copy: cleanPageCopy,
  });
  if (profile.error) throw profile.error;

  const prospects = await supabase.from("portfolio_prospects").upsert({ id: "main", ...data.prospects });
  if (prospects.error) throw prospects.error;

  const contact = await supabase.from("portfolio_contact").upsert({ id: "main", ...(data.contact || {}) });
  if (contact.error) throw contact.error;

  const experiences = (data.experiences || []).map((row: JsonRecord, index: number) => ({
    ...row,
    id: row.id || crypto.randomUUID(),
    sort_order: index,
  }));

  const works = (data.works || []).map((row: JsonRecord, index: number) => ({
    id: row.id || crypto.randomUUID(),
    category: row.category || "app",
    title: row.title || "",
    description: row.description || "",
    icon: row.icon || null,
    badge_text: row.badgeText || row.badge_text || "",
    images: (row.images || []).map((url: string) => stripCosSignature(url)),
    video_url: stripCosSignature(row.videoUrl || row.video_url || ""),
    links: (row.links || []).map((link: JsonRecord) => ({ ...link, url: stripCosSignature(link.url) })),
    tags: row.tags || [],
    sort_order: index,
  }));

  const gallery = (data.gallery || []).map((row: JsonRecord, index: number) => ({
    id: row.id || crypto.randomUUID(),
    category: row.category || "应用",
    title: row.title || "",
    description: row.description || "",
    image_url: stripCosSignature(row.imageUrl || row.image_url || ""),
    sort_order: index,
  }));

  const treasures = (data.treasures || []).map((row: JsonRecord, index: number) => ({
    id: row.id || crypto.randomUUID(),
    image_url: stripCosSignature(row.imageUrl || row.image_url || ""),
    sort_order: index,
  }));

  const musicTracks = (data.musicTracks || []).map((row: JsonRecord, index: number) => ({
    id: row.id || crypto.randomUUID(),
    title: row.title || "",
    artist: row.artist || "",
    audio_url: stripCosSignature(row.audioUrl || row.audio_url || ""),
    cover_url: stripCosSignature(row.coverUrl || row.cover_url || ""),
    lyrics: row.lyrics || "",
    sort_order: index,
  }));

  await replaceList(supabase, "portfolio_experiences", experiences.map((row) => row.id), experiences);
  await replaceList(supabase, "portfolio_works", works.map((row) => row.id), works);
  await replaceList(supabase, "portfolio_gallery", gallery.map((row) => row.id), gallery);
  await replaceList(supabase, "portfolio_treasures", treasures.map((row) => row.id), treasures);
  await replaceList(supabase, "portfolio_music_tracks", musicTracks.map((row) => row.id), musicTracks);

  return fetchPortfolioData(supabase);
}

async function startServer() {
  const app = express();
  const supabase = getSupabase();
  const cos = getCosClient();
  await ensureCosCors(cos);
  if (supabase && !cos) await ensureStorageBucket(supabase);

  // Trust proxy (luzhougo on :443 forwards with X-Forwarded-Proto)
  app.set("trust proxy", 1);

  app.use(express.json({ limit: "60mb" }));
  app.use(express.urlencoded({ limit: "60mb", extended: true }));
  app.use((_req, res, next) => {
    res.charset = "utf-8";
    next();
  });
  app.use("/api", (_req, res, next) => {
    res.setHeader("Content-Type", "application/json; charset=utf-8");
    next();
  });

  app.get("/health", (_req, res) => {
    res.json({ status: "ok", app: "zhengbao.work", uptime: process.uptime() });
  });

  app.get("/api/portfolio", async (_req, res) => {
    try {
      res.setHeader("Cache-Control", "no-store, no-cache, must-revalidate, proxy-revalidate");
      res.json(await fetchPortfolioData(supabase));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  /**
   * 作品附件预览 —— 同源输出，供前台在弹层里原地 iframe 展示。
   *
   * 为什么必须由服务端中转：附件存在 COS 上，直接给浏览器的后果是
   *   1. PDF → 浏览器在自己的阅读器里打开（外站、新页面）；
   *   2. doc/docx/xls/... → 浏览器根本不会渲染，只能跳 Microsoft 的
   *      view.officeapps.live.com 在线预览器 —— 那是**另一个域**，
   *      新标签页 + 必须公网可达，本地/内网部署直接失效。
   * 所以这里把文件取回来自己转，统一从本站域下发出，弹层里 iframe 就能原地显示。
   *
   * 支持：
   *   - pdf    → 原样流（Content-Type: application/pdf，inline），浏览器内嵌阅读器可翻页滚动
   *   - docx   → mammoth 转 HTML（正文/标题/列表/表格/内嵌图片）
   *   - csv/tsv → 转成一个朴素表格
   *   - txt/md 等文本 → 直读
   *   - 其余（doc/xls/xlsx/ppt/zip/rar…）→ 明确回「不支持在线预览」，前台引导下载
   */
  app.get("/api/media/attachment-preview", async (req, res) => {
    const fail = (code: number, message: string) => {
      res.status(code);
      res.setHeader("Content-Type", "text/html; charset=utf-8");
      res.send(previewMessagePage(message));
    };

    try {
      const key = getCosObjectKey(String(req.query.url || ""));
      if (!cos || !key.startsWith("portfolio/")) return fail(404, "找不到这个附件。");

      const name = String(req.query.name || key.split("/").pop() || "");
      const ext = (name.match(/\.([a-z0-9]{1,8})$/i)?.[1] || key.match(/\.([a-z0-9]{1,8})$/i)?.[1] || "").toLowerCase();
      if (!ext) return fail(415, "无法识别这个附件的类型。");

      // PDF 走原路：直接把字节流出去，交给浏览器内嵌阅读器（可滚动翻页）。
      if (ext === "pdf") {
        const pdf = await getCosObjectBuffer(cos, key);
        res.setHeader("Content-Type", "application/pdf");
        res.setHeader("Content-Disposition", "inline");
        res.setHeader("Cache-Control", "private, max-age=300");
        return res.send(pdf);
      }

      if (ext === "docx") {
        const buffer = await getCosObjectBuffer(cos, key);
        const result = await mammoth.convertToHtml(
          { buffer },
          {
            // 内嵌图片转 data URI —— 否则 mammoth 会吐 <img src="data:..."> 之外的空引用，
            // 弹层里就是一堆碎图。附件本身就在 COS 上，内联进来最省事也最稳。
            convertImage: mammoth.images.imgElement((image) =>
              image.read("base64").then((data) => ({ src: `data:${image.contentType};base64,${data}` })),
            ),
          },
        );
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.setHeader("Cache-Control", "private, max-age=300");
        return res.send(previewHtmlPage(name, result.value));
      }

      // 注意：xlsx 故意不在这里。它本身是 zip 二进制，按 UTF-8 解出来是乱码，
      // 宁可不预览也不能给用户看一张烂表 —— 让它落到下面的 415 分支引导下载。
      if (["csv", "tsv"].includes(ext)) {
        const text = (await getCosObjectBuffer(cos, key)).toString("utf8");
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.setHeader("Cache-Control", "private, max-age=300");
        return res.send(previewHtmlPage(name, previewTableFromDelimited(text, ext === "tsv" ? "\t" : ",")));
      }

      if (["txt", "md", "markdown", "json", "log", "yml", "yaml"].includes(ext)) {
        const text = (await getCosObjectBuffer(cos, key)).toString("utf8").slice(0, 400_000);
        res.setHeader("Content-Type", "text/html; charset=utf-8");
        res.setHeader("Cache-Control", "private, max-age=300");
        return res.send(previewHtmlPage(name, `<pre class="preview-pre">${escapeHtml(text)}</pre>`));
      }

      // 老格式与压缩包：浏览器和我们都转不了，给一句人话 + 引导去下载。
      return fail(415, `「${name}」是 .${ext} 格式，浏览器无法在线预览。请用下方「下载」打开。`);
    } catch (err: any) {
      return fail(500, `附件预览失败：${err?.message || "未知错误"}`);
    }
  });

  app.get("/api/media/pdf-preview", async (req, res) => {
    try {
      const key = getCosObjectKey(String(req.query.url || ""));
      if (!cos || !key.startsWith("portfolio/") || !key.toLowerCase().endsWith(".pdf")) {
        return res.status(404).send("PDF not found");
      }

      const pdf = await getCosObjectBuffer(cos, key);
      res.setHeader("Content-Type", "application/pdf");
      res.setHeader("Content-Disposition", "inline");
      res.setHeader("Cache-Control", "private, max-age=300");
      res.send(pdf);
    } catch (err: any) {
      res.status(500).send(err.message || "PDF preview failed");
    }
  });

  /**
   * 演示文稿原始字节的同源代理。前端 pdf.js / pptx 解析库需要 ArrayBuffer，
   * 直接 fetch COS 签名地址会撞跨域；走这里就是同源请求。
   * 只放行 portfolio/ 前缀下的 .pdf / .pptx，避免变成任意对象下载口。
   */
  app.get("/api/media/slides", async (req, res) => {
    try {
      const key = getCosObjectKey(String(req.query.url || ""));
      const ext = key.toLowerCase().match(/\.(pdf|pptx)$/)?.[1];
      if (!cos || !key.startsWith("portfolio/") || !ext) {
        return res.status(404).send("Slides not found");
      }
      const buffer = await getCosObjectBuffer(cos, key);
      res.setHeader("Content-Type", ext === "pdf" ? "application/pdf" : "application/vnd.openxmlformats-officedocument.presentationml.presentation");
      res.setHeader("Cache-Control", "private, max-age=300");
      res.send(buffer);
    } catch (err: any) {
      res.status(500).send(err.message || "Slides fetch failed");
    }
  });

  app.post("/api/admin/login", (req, res) => {
    const configuredPhone = process.env.ADMIN_PHONE;
    const configuredPassword = process.env.ADMIN_PASSWORD;
    if (!configuredPhone || !configuredPassword) {
      return res.status(500).json({ error: "请先在环境变量中设置 ADMIN_PASSWORD" });
    }
    if (req.body?.phone !== configuredPhone || req.body?.password !== configuredPassword) {
      return res.status(401).json({ error: "管理员密码不正确" });
    }

    res.cookie(SESSION_COOKIE, createSession(), {
      httpOnly: true,
      sameSite: "lax",
      secure: req.secure || req.get("x-forwarded-proto") === "https",
      maxAge: SESSION_TTL_SECONDS * 1000,
      path: "/",
    });
    res.json({ success: true });
  });

  app.post("/api/admin/logout", (_req, res) => {
    res.clearCookie(SESSION_COOKIE, { path: "/" });
    res.json({ success: true });
  });

  app.get("/api/admin/session", (req, res) => {
    const token = readCookies(req.headers.cookie)[SESSION_COOKIE];
    res.json({
      authenticated: verifySession(token),
      supabaseConfigured: Boolean(supabase),
      storageProvider: cos ? "tencent-cos" : "supabase",
      maxUploadSizeMb: effectiveUploadSizeMb,
    });
  });

  app.put("/api/admin/portfolio", requireAdmin, async (req, res) => {
    try {
      res.json({ success: true, data: await savePortfolioData(supabase, req.body) });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.post("/api/admin/upload-token", requireAdmin, (req, res) => {
    try {
      if (!cos || !process.env.TENCENT_COS_SECRET_ID || !process.env.TENCENT_COS_SECRET_KEY) {
        return res.status(400).json({ error: "腾讯云 COS 未配置，无法直传。" });
      }
      const fileName = String(req.body?.fileName || "media.bin");
      const contentType = String(req.body?.contentType || "application/octet-stream");
      const size = Number(req.body?.size || 0);
      if (size > effectiveUploadSizeMb * 1024 * 1024) {
        return res.status(413).json({ error: `文件超过 ${effectiveUploadSizeMb}MB 上传上限` });
      }
      const key = createCosObjectPath(fileName);
      const headers = { host: new URL(getCosPublicUrl(key)).hostname, "content-type": contentType };
      const authorization = COS.getAuthorization({
        SecretId: process.env.TENCENT_COS_SECRET_ID,
        SecretKey: process.env.TENCENT_COS_SECRET_KEY,
        Bucket: process.env.TENCENT_COS_BUCKET,
        Region: process.env.TENCENT_COS_REGION,
        Method: "PUT",
        Key: key,
        Headers: headers,
        Expires: 60 * 60,
      });
      const publicUrl = getCosPublicUrl(key);
      res.json({
        success: true,
        key,
        url: publicUrl,
        signedUrl: signCosUrl(publicUrl),
        uploadUrl: `${publicUrl}?${authorization}`,
        contentType,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "创建上传签名失败" });
    }
  });

  app.post("/api/admin/upload", requireAdmin, mediaUpload.single("file"), async (req: Request & { file?: Express.Multer.File }, res) => {
    try {
      if (!cos && !supabase) {
        return res.status(500).json({ error: "Supabase 未配置，无法上传到 Storage" });
      }

      if (!req.file) {
        return res.status(400).json({ error: "缺少文件名或文件内容" });
      }

      if (req.file.size > effectiveUploadSizeMb * 1024 * 1024) {
        return res.status(413).json({ error: `文件超过 ${effectiveUploadSizeMb}MB 上传上限` });
      }

      const objectPath = createCosObjectPath(req.file.originalname);

      if (cos) {
        const url = await uploadToCos(cos, req.file, objectPath);
        return res.json({ success: true, url: signCosUrl(url), path: objectPath, provider: "tencent-cos" });
      }

      const uploaded = await supabase!.storage
        .from(process.env.SUPABASE_STORAGE_BUCKET || "portfolio-media")
        .upload(objectPath, await fs.promises.readFile(req.file.path), {
          contentType: req.file.mimetype || "application/octet-stream",
          upsert: false,
        });
      if (uploaded.error) throw uploaded.error;

      const publicUrl = supabase!.storage
        .from(process.env.SUPABASE_STORAGE_BUCKET || "portfolio-media")
        .getPublicUrl(objectPath).data.publicUrl;

      res.json({ success: true, url: publicUrl, path: objectPath });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    } finally {
      if (req.file?.path) {
        fs.promises.unlink(req.file.path).catch(() => undefined);
      }
    }
  });

  app.post("/api/admin/asr/lyrics", requireAdmin, async (req, res) => {
    try {
      const audioUrl = String(req.body?.audioUrl || "").trim();
      if (!audioUrl) {
        return res.status(400).json({ error: "请先上传或填写音频 URL。" });
      }

      const result = await recognizeAudioToLrc(audioUrl, {
        title: String(req.body?.title || "").trim(),
        artist: String(req.body?.artist || "").trim(),
        referenceLyrics: String(req.body?.referenceLyrics || ""),
      });
      res.json({ success: true, ...result });
    } catch (err: any) {
      res.status(500).json({ error: err.message || "腾讯云 ASR 识别失败" });
    }
  });

  app.post("/api/admin/delete-media", requireAdmin, async (req, res) => {
    try {
      const urls: string[] = Array.isArray(req.body?.urls) ? req.body.urls.filter((url: unknown): url is string => typeof url === "string") : [];
      if (!cos) {
        return res.json({ success: true, deleted: [], skipped: urls, failed: [] });
      }

      const keys: string[] = [...new Set<string>(
        urls
          .map((url: string) => getCosObjectKey(stripCosSignature(url)))
          .filter((key: string) => key.startsWith("portfolio/")),
      )];
      const deleted: string[] = [];
      const failed: { key: string; error: string }[] = [];

      for (const key of keys) {
        try {
          await deleteCosObject(cos, key);
          deleted.push(key);
        } catch (error: any) {
          failed.push({ key, error: error.message || "删除失败" });
        }
      }

      res.json({ success: failed.length === 0, deleted, skipped: urls.length - keys.length, failed });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  /* ======================================================================
   * 柴犬小助手（Dify 聊天助手 / Chatflow）
   * ----------------------------------------------------------------------
   * 前台只跟这里说话，DIFY_API_KEY 永远不出服务端。当前对话由 Dify 按
   * conversation_id 保存；跨会话记忆按匿名 visitor_key 存入 Supabase。
   * 公开接口、每次调用都花钱：按 IP 限频 + 每日上限 + 单条长度上限。
   * ==================================================================== */

  const difyBase = () => (process.env.DIFY_API_BASE || "https://api.dify.ai/v1").replace(/\/$/, "");
  const difyKey = () => process.env.DIFY_API_KEY || "";
  const ASSISTANT_MAX_QUERY = 800;
  const assistantMinuteHits = new Map<string, number[]>();
  const assistantDayHits = new Map<string, { day: string; count: number }>();
  let assistantConfigCache: { at: number; value: JsonRecord } | null = null;

  function assistantAllowed(ip: string) {
    const now = Date.now();
    const perMinute = Number(process.env.DIFY_RATE_PER_MINUTE || 8);
    const perDay = Number(process.env.DIFY_RATE_PER_DAY || 80);
    const recent = (assistantMinuteHits.get(ip) || []).filter((t) => now - t < 60_000);
    const day = new Date().toISOString().slice(0, 10);
    const daily = assistantDayHits.get(ip);
    const dayCount = daily?.day === day ? daily.count : 0;
    if (recent.length >= perMinute) return "说得太快啦，歇一分钟再问吧。";
    if (dayCount >= perDay) return "今天聊得够多啦，明天再来找我吧。";
    recent.push(now);
    assistantMinuteHits.set(ip, recent);
    assistantDayHits.set(ip, { day, count: dayCount + 1 });
    if (assistantMinuteHits.size > 5000) {
      for (const [k, v] of assistantMinuteHits) if (!v.some((t) => now - t < 60_000)) assistantMinuteHits.delete(k);
      for (const [k, v] of assistantDayHits) if (v.day !== day) assistantDayHits.delete(k);
    }
    return "";
  }

  const assistantVisitorKey = (value: unknown) =>
    typeof value === "string" && /^[a-f0-9-]{8,64}$/i.test(value) ? value : "";

  /** Dify 用 user 区分访客；沿用统计的匿名访客 key，没有就按 IP 哈希一个。 */
  function assistantUser(req: Request, visitorKey: unknown) {
    const key = assistantVisitorKey(visitorKey);
    if (key) return `visitor-${key}`;
    return `ip-${crypto.createHash("sha256").update(clientIp(req)).digest("hex").slice(0, 24)}`;
  }

  type AssistantMemoryRow = {
    id: number;
    visitor_key: string;
    conversation_id: string;
    user_message: string;
    assistant_message: string;
    created_at: string;
  };

  /**
   * 长期记忆不把全部聊天重新塞给模型：固定保留最近几次，再用轻量词项重合
   * 找回与本次问题最相关的旧对话。这样不额外调用 Embedding，也能控制 token。
   */
  function assistantMemoryTerms(value: string) {
    const normalized = value.toLowerCase().replace(/\s+/g, " ");
    const terms = new Set(normalized.match(/[a-z0-9][a-z0-9_-]{1,}/g) || []);
    const chinese = normalized.replace(/[^\u3400-\u9fff]/g, "");
    for (let i = 0; i < chinese.length - 1; i += 1) terms.add(chinese.slice(i, i + 2));
    return terms;
  }

  function assistantMemoryScore(row: AssistantMemoryRow, queryTerms: Set<string>) {
    if (!queryTerms.size) return 0;
    const rowTerms = assistantMemoryTerms(`${row.user_message} ${row.assistant_message}`);
    let overlap = 0;
    for (const term of queryTerms) if (rowTerms.has(term)) overlap += term.length > 1 ? 2 : 1;
    return overlap;
  }

  const assistantMemoryRetentionDays = () => {
    const configured = Number(process.env.DIFY_MEMORY_RETENTION_DAYS ?? 180);
    return Number.isFinite(configured) ? Math.max(0, Math.min(3650, Math.floor(configured))) : 180;
  };

  const visibleAssistantText = (value: unknown) =>
    String(value || "").replace(/<think>[\s\S]*?(<\/think>|$)/gi, "").trim();

  async function readAssistantMemory(visitorKey: string, query: string) {
    const retentionDays = assistantMemoryRetentionDays();
    if (!supabase || !visitorKey || retentionDays === 0) return "";
    try {
      const cutoff = new Date(Date.now() - retentionDays * 86_400_000).toISOString();
      const { data, error } = await supabase
        .from("portfolio_assistant_memories")
        .select("id,visitor_key,conversation_id,user_message,assistant_message,created_at")
        .eq("visitor_key", visitorKey)
        .gte("created_at", cutoff)
        .order("created_at", { ascending: false })
        .limit(120);
      if (error) throw error;
      const rows = (data || []) as AssistantMemoryRow[];
      if (!rows.length) return "";

      const selected = new Map<number, AssistantMemoryRow>();
      rows.slice(0, 4).forEach((row) => selected.set(row.id, row));
      const queryTerms = assistantMemoryTerms(query);
      rows
        .slice(4)
        .map((row) => ({ row, score: assistantMemoryScore(row, queryTerms) }))
        .filter((item) => item.score > 0)
        .sort((a, b) => b.score - a.score)
        .slice(0, 4)
        .forEach(({ row }) => selected.set(row.id, row));

      const blocks = [...selected.values()]
        .sort((a, b) => Date.parse(a.created_at) - Date.parse(b.created_at))
        .map((row) => `访客：${row.user_message}\n小柴：${row.assistant_message}`);
      let result = "";
      for (const block of blocks) {
        const next = result ? `${result}\n\n${block}` : block;
        if (next.length > 5500) break;
        result = next;
      }
      return result;
    } catch (error: any) {
      // 首次部署但尚未执行 schema 时降级为 Dify 原有短期记忆，不影响聊天。
      console.warn("[assistant] memory read failed", error?.message || error);
      return "";
    }
  }

  async function saveAssistantMemory(visitorKey: string, conversationId: string, query: string, answer: string) {
    const retentionDays = assistantMemoryRetentionDays();
    const visibleAnswer = visibleAssistantText(answer);
    if (!supabase || !visitorKey || !visibleAnswer || retentionDays === 0) return;
    try {
      const { error } = await supabase.from("portfolio_assistant_memories").insert({
        visitor_key: visitorKey,
        conversation_id: conversationId,
        user_message: query.slice(0, ASSISTANT_MAX_QUERY),
        assistant_message: visibleAnswer.slice(0, 4000),
      });
      if (error) throw error;
      const cutoff = new Date(Date.now() - retentionDays * 86_400_000).toISOString();
      void supabase.from("portfolio_assistant_memories").delete().eq("visitor_key", visitorKey).lt("created_at", cutoff);
    } catch (error: any) {
      console.warn("[assistant] memory save failed", error?.message || error);
    }
  }

  const cleanConversationId = (value: unknown) =>
    typeof value === "string" && /^[a-f0-9-]{36}$/i.test(value) ? value : "";

  app.get("/api/assistant/config", async (_req, res) => {
    if (!difyKey()) return res.json({ enabled: false });
    if (assistantConfigCache && Date.now() - assistantConfigCache.at < 5 * 60_000) return res.json(assistantConfigCache.value);
    try {
      const response = await fetch(`${difyBase()}/parameters`, { headers: { Authorization: `Bearer ${difyKey()}` } });
      const data: JsonRecord = response.ok ? await response.json() : {};
      const value = {
        enabled: true,
        opening: typeof data.opening_statement === "string" ? data.opening_statement : "",
        suggestions: Array.isArray(data.suggested_questions) ? data.suggested_questions.filter((q: unknown) => typeof q === "string").slice(0, 4) : [],
      };
      if (response.ok) assistantConfigCache = { at: Date.now(), value };
      res.json(value);
    } catch {
      res.json({ enabled: true, opening: "", suggestions: [] });
    }
  });

  app.get("/api/assistant/messages", async (req, res) => {
    const conversationId = cleanConversationId(req.query.conversationId);
    if (!difyKey() || !conversationId) return res.json({ messages: [] });
    try {
      const params = new URLSearchParams({ conversation_id: conversationId, user: assistantUser(req, req.query.visitorKey), limit: "40" });
      const response = await fetch(`${difyBase()}/messages?${params}`, { headers: { Authorization: `Bearer ${difyKey()}` } });
      if (!response.ok) return res.json({ messages: [], expired: response.status === 404 });
      const data: JsonRecord = await response.json();
      const messages = (Array.isArray(data.data) ? data.data : []).flatMap((m: JsonRecord) => [
        { role: "user", content: String(m.query || "") },
        { role: "assistant", content: String(m.answer || "") },
      ]);
      res.json({ messages });
    } catch {
      res.json({ messages: [] });
    }
  });

  app.delete("/api/assistant/memory", async (req, res) => {
    const visitorKey = assistantVisitorKey(req.body?.visitorKey);
    if (!visitorKey) return res.status(400).json({ error: "访客标识无效。" });
    if (!supabase) return res.status(503).json({ error: "长期记忆暂不可用。" });
    try {
      const { error } = await supabase.from("portfolio_assistant_memories").delete().eq("visitor_key", visitorKey);
      if (error) throw error;
      res.json({ success: true });
    } catch (error: any) {
      console.warn("[assistant] memory clear failed", error?.message || error);
      res.status(500).json({ error: "长期记忆清除失败，请稍后重试。" });
    }
  });

  app.post("/api/assistant/chat", async (req, res) => {
    if (!difyKey()) return res.status(503).json({ error: "小助手还没上线。" });
    const query = typeof req.body?.query === "string" ? req.body.query.trim() : "";
    if (!query) return res.status(400).json({ error: "请输入问题。" });
    if (query.length > ASSISTANT_MAX_QUERY) return res.status(400).json({ error: `问题太长啦，控制在 ${ASSISTANT_MAX_QUERY} 字以内。` });
    const limited = assistantAllowed(clientIp(req));
    if (limited) return res.status(429).json({ error: limited });

    const visitorKey = assistantVisitorKey(req.body?.visitorKey);
    const visitorMemory = await readAssistantMemory(visitorKey, query);

    const upstream = new AbortController();
    // 访客关掉悬窗或刷新页面时，同时掐掉上游，别让 Dify 白跑完。
    res.on("close", () => upstream.abort());
    try {
      const response = await fetch(`${difyBase()}/chat-messages`, {
        method: "POST",
        signal: upstream.signal,
        headers: { Authorization: `Bearer ${difyKey()}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          query,
          inputs: { visitor_memory: visitorMemory },
          user: assistantUser(req, req.body?.visitorKey),
          conversation_id: cleanConversationId(req.body?.conversationId),
          response_mode: "streaming",
        }),
      });
      if (!response.ok || !response.body) {
        const detail: JsonRecord = await response.json().catch(() => ({}));
        console.warn("[assistant] dify error", response.status, detail.code || "", detail.message || "");
        // 会话过期/被删时让前台丢掉旧 ID 重开。
        const expired = response.status === 404 || detail.code === "conversation_not_exists";
        return res.status(expired ? 409 : 502).json({ error: expired ? "对话已过期，已为你开启新对话。" : "小助手暂时开小差了，稍后再试。", expired });
      }
      res.status(200);
      res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
      res.setHeader("Cache-Control", "no-cache, no-transform");
      res.setHeader("X-Accel-Buffering", "no");
      res.flushHeaders();
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let captureBuffer = "";
      let capturedAnswer = "";
      let capturedConversationId = cleanConversationId(req.body?.conversationId);
      const captureEvent = (block: string) => {
        const line = block.split(/\r?\n/).find((item) => item.startsWith("data:"));
        if (!line) return;
        try {
          const event: JsonRecord = JSON.parse(line.slice(5).trim());
          const eventConversationId = cleanConversationId(event.conversation_id);
          if (eventConversationId) capturedConversationId = eventConversationId;
          if ((event.event === "message" || event.event === "agent_message") && typeof event.answer === "string") {
            capturedAnswer += event.answer;
          } else if (event.event === "message_replace" && typeof event.answer === "string") {
            capturedAnswer = event.answer;
          }
        } catch { /* 上游的非 JSON 心跳无需记录 */ }
      };
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        res.write(Buffer.from(value));
        captureBuffer += decoder.decode(value, { stream: true });
        const blocks = captureBuffer.split(/\r?\n\r?\n/);
        captureBuffer = blocks.pop() || "";
        blocks.forEach(captureEvent);
      }
      captureBuffer += decoder.decode();
      if (captureBuffer.trim()) captureEvent(captureBuffer);
      res.end();
      void saveAssistantMemory(visitorKey, capturedConversationId, query, capturedAnswer);
    } catch (err: any) {
      if (upstream.signal.aborted) return;
      console.warn("[assistant] proxy failed", err?.message);
      if (!res.headersSent) res.status(502).json({ error: "小助手暂时开小差了，稍后再试。" });
      else res.end();
    }
  });

  /* ======================================================================
   * 站点检测（访问记录）
   * ----------------------------------------------------------------------
   * 写入端 /api/track 是公开接口：前台每次加载页面时上报一次，服务端补上
   * 真实 IP（trust proxy + X-Forwarded-For）、UA 解析结果与归属地。
   * 读取/管理端全部挂在 requireAdmin 后面。
   * 设计原则：记录失败绝不能影响访客浏览——所有分支都以「吞掉异常」收尾。
   * ==================================================================== */

  const TRACK_WINDOW_MS = 60_000;
  const TRACK_MAX_PER_WINDOW = 40;
  const trackHits = new Map<string, number[]>();

  function trackAllowed(ip: string) {
    const now = Date.now();
    const hits = (trackHits.get(ip) || []).filter((t) => now - t < TRACK_WINDOW_MS);
    if (hits.length >= TRACK_MAX_PER_WINDOW) {
      trackHits.set(ip, hits);
      return false;
    }
    hits.push(now);
    trackHits.set(ip, hits);
    if (trackHits.size > 5000) {
      for (const [k, v] of trackHits) {
        if (!v.some((t) => now - t < TRACK_WINDOW_MS)) trackHits.delete(k);
      }
    }
    return true;
  }

  /** 爬虫和扫描器直接不落库；本机 / 内网照常记录但打 local 标，后台默认隐藏。 */
  const isAutomatedUserAgent = isBotUserAgent;

  const missingSchema = (m?: string) => /could not find the (table|function)|does not exist|schema cache|column .* of relation/i.test(m || "");

  function trackingToken(visitId: number, visitorKey: string, sessionId: string) {
    return crypto
      .createHmac("sha256", getSessionSecret())
      .update(`${visitId}:${visitorKey}:${sessionId}`)
      .digest("base64url");
  }

  function validTrackingToken(token: unknown, visitId: number, visitorKey: string, sessionId: string) {
    const supplied = String(token || "");
    const expected = trackingToken(visitId, visitorKey, sessionId);
    if (supplied.length !== expected.length) return false;
    try {
      return crypto.timingSafeEqual(Buffer.from(supplied), Buffer.from(expected));
    } catch {
      return false;
    }
  }

  app.post("/api/track", async (req, res) => {
    try {
      if (!supabase) return res.json({ ok: false, reason: "supabase-not-configured" });

      const ip = clientIp(req);
      if (!trackAllowed(ip)) return res.status(429).json({ ok: false, reason: "too-many-requests" });

      const body = req.body || {};
      const clientKey = String(body.visitorKey || "").trim().slice(0, 80);
      if (!clientKey) return res.status(400).json({ error: "visitorKey required" });

      const c = body.client || {};
      const ua = String(req.headers["user-agent"] || "").slice(0, 500);
      if (isAutomatedUserAgent(ua)) return res.json({ ok: true, ignored: true, reason: "automated-client" });
      const info = parseUserAgent(ua);
      const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
      const str = (v: unknown, max: number) => String(v ?? "").slice(0, max);
      const fps = str(body.fingerprint, 64);

      /**
       * 访客身份归一化 —— 这是「同一台设备被记成几十个访客」的修复点。
       *
       * 原来的身份 = 前台 localStorage 里的随机 key。问题是**无痕窗口 / 清过站点数据 /
       * 每次新开的自动化浏览器每次都会生成全新的 key**，于是同一台电脑在后台看起来
       * 是几十个不同的人（实测：5 个真实指纹挂出 76 个 visitor_key）。
       *
       * 指纹（屏幕 / 显卡 / 时区 / CPU 核数 / UA …）在无痕下**依然是稳定的**，
       * 所以这里做一次归并：只要指纹能对上一位老访客，就沿用那位老访客的 key，
       * 把这次访问记到他名下，而不是新建一个「陌生人」。
       *
       * 保守处：指纹为空（拿不到 WebGL 等）时**完全按老逻辑走**，绝不让空指纹
       * 把所有人合并成同一个访客 —— 那比重复记录更糟。
       */
      let visitorKey = clientKey;
      let mergedFrom: string | null = null;
      if (fps) {
        try {
          const { data: twin } = await supabase
            .from("portfolio_visits")
            .select("visitor_key")
            .eq("fingerprint", fps)
            .order("created_at", { ascending: false })
            .limit(1)
            .maybeSingle();
          if (twin?.visitor_key && twin.visitor_key !== clientKey) {
            visitorKey = twin.visitor_key;
            mergedFrom = clientKey;
          }
        } catch {
          /* 归并查询失败就退回原始 key，不能因为统计把记录写丢 */
        }
      }

      const trafficType = classifyTraffic(ua, ip);
      const visitRow = {
          visitor_key: visitorKey,
          session_id: str(body.sessionId, 80),
          ip,
          device_type: info.deviceType,
          browser: info.browser,
          browser_version: info.browserVersion,
          os: info.os,
          os_version: info.osVersion,
          engine: info.engine,
          user_agent: ua,
          path: str(c.path, 300),
          referrer: str(c.referrer, 500),
          screen: str(c.screen, 40),
          viewport: str(c.viewport, 40),
          pixel_ratio: num(c.pixelRatio),
          color_depth: num(c.colorDepth),
          timezone: str(c.timezone, 80),
          timezone_offset: num(c.timezoneOffset),
          language: str(c.language, 40),
          languages: str(c.languages, 200),
          platform: str(c.platform, 80),
          cpu_cores: num(c.cpuCores),
          device_memory: num(c.deviceMemory),
          touch_points: num(c.touchPoints),
          gpu: str(c.gpu, 200),
          cookie_enabled: typeof c.cookieEnabled === "boolean" ? c.cookieEnabled : null,
          dnt: str(c.dnt, 20),
          fingerprint: fps,
      };

      let { data, error } = await supabase
        .from("portfolio_visits")
        .insert({ ...visitRow, traffic_type: trafficType })
        .select("id")
        .single();
      // 数据库还没跑新版 schema.sql（没有 traffic_type 列）时退回旧字段，不能把记录写丢。
      if (error && missingSchema(error.message)) {
        ({ data, error } = await supabase.from("portfolio_visits").insert(visitRow).select("id").single());
      }

      if (error) return res.status(500).json({ error: error.message });
      const visitId: number | null = data?.id ?? null;

      // 归属地 + 访客聚合放到响应之后，不让访客多等一毫秒。
      void (async () => {
        let country = "";
        let region = "";
        let city = "";
        let isp = "";

        try {
          const geo = await lookupIpGeo(ip);
          if (geo) {
            country = geo.country;
            region = geo.region;
            city = geo.city;
            isp = geo.isp;
            if (visitId != null) {
              await supabase
                .from("portfolio_visits")
                .update({ ip_geo: geo.raw as never, country, region, city, isp })
                .eq("id", visitId);
            }
          }
        } catch {
          /* 归属地查不到就留空，记录本身不受影响 */
        }

        try {
          // 新版 schema：一条 upsert 原子自增，归属地查不到时保留旧值。
          const { error: rpcError } = await supabase.rpc("record_portfolio_visitor", {
            p_visitor_key: visitorKey,
            p_traffic_type: trafficType,
            p_ip: ip,
            p_country: country,
            p_region: region,
            p_city: city,
            p_isp: isp,
            p_device: info.deviceType,
            p_browser: info.browser,
            p_os: info.os,
          });
          if (!rpcError) return;

          // 兼容尚未重跑 schema.sql 的旧部署。
          const nowIso = new Date().toISOString();
          // 先保证访客行存在（并发下 PK 冲突直接忽略），再自增计数。
          await supabase
            .from("portfolio_visitors")
            .upsert({ visitor_key: visitorKey }, { onConflict: "visitor_key", ignoreDuplicates: true });

          const { data: row } = await supabase
            .from("portfolio_visitors")
            .select("visit_count,page_views")
            .eq("visitor_key", visitorKey)
            .maybeSingle();

          await supabase
            .from("portfolio_visitors")
            .update({
              last_seen: nowIso,
              visit_count: Number(row?.visit_count || 0) + 1,
              page_views: Number(row?.page_views || 0) + 1,
              last_ip: ip,
              ...(country ? { last_country: country, last_region: region, last_city: city, last_isp: isp } : {}),
              last_device: info.deviceType,
              last_browser: info.browser,
              last_os: info.os,
            })
            .eq("visitor_key", visitorKey);
        } catch {
          /* 聚合失败不影响单次记录 */
        }
      })();

      // 把归一化之后的 key 回给前台：无痕窗口里前台本来每次都会生成新 key，
      // 收到这个值后它会**改用自己的 localStorage 存成这个规范 key**，
      // 于是连同一个无痕窗口内的后续上报都不会再飘。
      res.json({
        ok: true,
        visitId,
        visitorKey,
        mergedFrom,
        trackingToken: visitId == null ? "" : trackingToken(visitId, visitorKey, str(body.sessionId, 80)),
      });
    } catch (err: any) {
      // 检测接口永远不要让前台看到 5xx
      res.json({ ok: false, reason: err?.message || "track-failed" });
    }
  });

  app.post("/api/track/events", async (req, res) => {
    try {
      if (!supabase) return res.json({ ok: false, reason: "supabase-not-configured" });
      const ip = clientIp(req);
      if (!trackAllowed(ip)) return res.status(429).json({ ok: false, reason: "too-many-requests" });
      const ua = String(req.headers["user-agent"] || "").slice(0, 500);
      if (isAutomatedUserAgent(ua)) return res.json({ ok: true, ignored: true });

      const body = req.body || {};
      const visitorKey = String(body.visitorKey || "").trim().slice(0, 80);
      const sessionId = String(body.sessionId || "").slice(0, 80);
      const visitId = body.visitId == null ? null : Number(body.visitId);
      const rawEvents = Array.isArray(body.events) ? body.events.slice(0, 50) : [];
      if (!visitorKey || visitId == null || !Number.isFinite(visitId) || visitId <= 0 || rawEvents.length === 0) {
        return res.status(400).json({ error: "visit context and events required" });
      }
      if (!validTrackingToken(body.trackingToken, visitId, visitorKey, sessionId)) {
        return res.status(403).json({ error: "invalid tracking context" });
      }

      const allowedNames = new Set(["ui_click"]);
      const rows = rawEvents.flatMap((event: any) => {
        const eventName = String(event?.eventName || "").slice(0, 40);
        const elementKey = String(event?.elementKey || "").trim().slice(0, 100);
        if (!allowedNames.has(eventName) || !elementKey) return [];
        const parsedTime = Date.parse(String(event?.occurredAt || ""));
        return [{
          event_id: String(event?.eventId || crypto.randomUUID()).slice(0, 80),
          visit_id: visitId != null && Number.isFinite(visitId) && visitId > 0 ? visitId : null,
          visitor_key: visitorKey,
          session_id: sessionId,
          event_name: eventName,
          element_key: elementKey,
          element_label: String(event?.elementLabel || "").slice(0, 80),
          element_type: String(event?.elementType || "").slice(0, 20),
          path: String(event?.path || "/").split(/[?#]/, 1)[0].slice(0, 300),
          occurred_at: Number.isFinite(parsedTime) ? new Date(parsedTime).toISOString() : new Date().toISOString(),
        }];
      });
      if (rows.length === 0) return res.status(400).json({ error: "no valid events" });

      const { error } = await supabase
        .from("portfolio_events")
        .upsert(rows, { onConflict: "event_id", ignoreDuplicates: true });
      if (error) {
        if (/could not find the table|does not exist|schema cache/i.test(error.message)) {
          return res.json({ ok: false, reason: "events-not-configured" });
        }
        return res.status(500).json({ error: error.message });
      }
      res.json({ ok: true, accepted: rows.length });
    } catch (err: any) {
      res.json({ ok: false, reason: err?.message || "events-failed" });
    }
  });

  app.post("/api/track/dwell", async (req, res) => {
    try {
      if (!supabase) return res.json({ ok: false });
      if (!trackAllowed(clientIp(req))) return res.status(429).json({ ok: false, reason: "too-many-requests" });
      if (isAutomatedUserAgent(String(req.headers["user-agent"] || ""))) return res.json({ ok: true, ignored: true });
      const body = req.body || {};
      const rawMs = Number(body.dwellMs);
      const dwellMs = Number.isFinite(rawMs) ? Math.max(0, Math.min(Math.round(rawMs), 6 * 60 * 60 * 1000)) : 0;
      const visitIdNum = Number(body.visitId);
      if (!Number.isFinite(visitIdNum)) return res.status(400).json({ error: "visitId required" });
      const visitorKey = String(body.visitorKey || "").slice(0, 80);
      const sessionId = String(body.sessionId || "").slice(0, 80);
      if (!validTrackingToken(body.trackingToken, visitIdNum, visitorKey, sessionId)) {
        return res.status(403).json({ error: "invalid tracking context" });
      }

      // 新版 schema 用数据库函数在一个事务里原子累加，避免心跳与离开上报并发覆盖。
      const { error: rpcError } = await supabase.rpc("increment_portfolio_dwell", {
        p_visit_id: visitIdNum,
        p_visitor_key: visitorKey,
        p_dwell_ms: dwellMs,
      });
      if (!rpcError) return res.json({ ok: true });

      // 兼容尚未重跑 schema.sql 的旧部署；升级数据库后不会再走这段读后写逻辑。
      const { data: existing } = await supabase
        .from("portfolio_visits")
        .select("dwell_ms")
        .eq("id", visitIdNum)
        .maybeSingle();

      const { data } = await supabase
        .from("portfolio_visits")
        .update({ dwell_ms: Number(existing?.dwell_ms || 0) + dwellMs })
        .eq("id", visitIdNum)
        .select("visitor_key")
        .maybeSingle();

      const key = data?.visitor_key || visitorKey;
      if (key) {
        const { data: row } = await supabase
          .from("portfolio_visitors")
          .select("total_dwell_ms")
          .eq("visitor_key", key)
          .maybeSingle();
        await supabase
          .from("portfolio_visitors")
          .update({ total_dwell_ms: Number(row?.total_dwell_ms || 0) + dwellMs })
          .eq("visitor_key", key);
      }

      res.json({ ok: true });
    } catch (err: any) {
      res.json({ ok: false, reason: err?.message || "dwell-failed" });
    }
  });

  /* ---------------- 后台读取：概览 / 访客分页 / 单个访客明细 ----------------
   * 新版 schema 下统计全部在 SQL 函数里算；数据库还没跑新 schema.sql 时，
   * 退回到「拉最近一批原始行、在 Node 里按同一套规则分类再聚合」，结果口径一致，
   * 只是数据量大了会慢 —— 所以后台会提示去跑一次 schema.sql。 */

  const ANALYTICS_RANGES = new Set(["today", "7d", "30d", "all"]);
  const SHANGHAI_OFFSET_MS = 8 * 60 * 60 * 1000;

  function analyticsQuery(req: Request) {
    const range = ANALYTICS_RANGES.has(String(req.query.range)) ? String(req.query.range) : "7d";
    const humanOnly = req.query.humanOnly !== "0";
    let since: string | null = null;
    if (range === "today") {
      // 「今天」按北京时间零点切，不是滚动 24 小时。
      const local = new Date(Date.now() + SHANGHAI_OFFSET_MS);
      local.setUTCHours(0, 0, 0, 0);
      since = new Date(local.getTime() - SHANGHAI_OFFSET_MS).toISOString();
    } else if (range !== "all") {
      since = new Date(Date.now() - (range === "7d" ? 7 : 30) * 24 * 60 * 60 * 1000).toISOString();
    }
    return { range, humanOnly, since, bucket: range === "today" ? "hour" : "day" };
  }

  /** 旧 schema 兜底：按访问行推出每位访客的类型（human > local > bot，与 SQL 回填规则一致）。 */
  async function legacyVisitRows(since: string | null) {
    let q = supabase!
      .from("portfolio_visits")
      .select("visitor_key,ip,user_agent,referrer,country,region,city,device_type,os,browser,dwell_ms,created_at")
      .order("created_at", { ascending: false })
      .limit(10000);
    if (since) q = q.gte("created_at", since);
    const { data, error } = await q;
    if (error) throw error;
    return (data || []).map((row: any) => ({ ...row, traffic_type: classifyTraffic(row.user_agent, row.ip) as TrafficType }));
  }

  function mergeVisitorTypes(rows: Array<{ visitor_key: string; traffic_type: TrafficType }>) {
    const types = new Map<string, TrafficType>();
    for (const row of rows) {
      const prev = types.get(row.visitor_key);
      if (prev === "human" || (prev === "local" && row.traffic_type === "bot")) continue;
      types.set(row.visitor_key, row.traffic_type);
    }
    return types;
  }

  function topCounts(values: string[], limit = 6) {
    const counts = new Map<string, number>();
    for (const value of values) counts.set(value, (counts.get(value) || 0) + 1);
    return [...counts].sort((a, b) => b[1] - a[1]).slice(0, limit).map(([label, n]) => ({ label, n }));
  }

  const CHAT_KEYWORD_STOP_WORDS = new Set([
    "一个", "一些", "这个", "那个", "什么", "怎么", "怎样", "为什么", "可以", "能不能", "有没有", "是否", "还是", "就是", "不是", "如果", "然后", "现在", "目前", "已经", "需要", "希望", "想要", "知道", "介绍", "关于", "比较", "一下", "一下子", "东西", "内容", "问题", "网站", "网页", "小主人", "小柴", "你们", "我们", "你是", "我是", "他的", "我的", "你的", "吗", "呢", "啊", "呀", "吧", "了", "的", "和", "与", "或", "也", "都", "很", "更", "最", "在", "有", "是", "我", "你", "他", "她", "它", "这", "那",
  ]);

  function assistantKeywordCounts(messages: string[]) {
    const counts = new Map<string, number>();
    const segmenter = new Intl.Segmenter("zh-CN", { granularity: "word" });
    for (const message of messages) {
      for (const part of segmenter.segment(message.toLowerCase())) {
        const word = part.segment.trim().replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
        if (!part.isWordLike || word.length < 2 || word.length > 20 || CHAT_KEYWORD_STOP_WORDS.has(word) || /^\d+$/.test(word)) continue;
        counts.set(word, (counts.get(word) || 0) + 1);
      }
    }
    return [...counts]
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], "zh-CN"))
      .slice(0, 30)
      .map(([label, n]) => ({ label, n }));
  }

  function legacySummary(rows: any[], humanOnly: boolean, bucket: string) {
    const v = humanOnly ? rows.filter((r) => r.traffic_type === "human") : rows;
    const dwell = v.map((r) => Number(r.dwell_ms) || 0).filter((ms) => ms > 0);
    const series = new Map<string, { visits: number; visitors: Set<string> }>();
    for (const row of v) {
      const local = new Date(Date.parse(row.created_at) + SHANGHAI_OFFSET_MS).toISOString();
      const key = bucket === "hour" ? `${local.slice(0, 13)}:00` : `${local.slice(0, 10)}T00:00`;
      const slot = series.get(key) || { visits: 0, visitors: new Set<string>() };
      slot.visits += 1;
      slot.visitors.add(row.visitor_key);
      series.set(key, slot);
    }
    const join = (sep: string, ...parts: string[]) => parts.filter(Boolean).join(sep) || "未知";
    return {
      visits: v.length,
      visitors: new Set(v.map((r) => r.visitor_key)).size,
      avgDwellMs: dwell.length ? Math.round(dwell.reduce((a, b) => a + b, 0) / dwell.length) : 0,
      bounceRate: v.length ? Number((v.filter((r) => (Number(r.dwell_ms) || 0) < 10_000).length / v.length).toFixed(3)) : 0,
      clicks: 0,
      hiddenBots: rows.filter((r) => r.traffic_type === "bot").length,
      hiddenLocal: rows.filter((r) => r.traffic_type === "local").length,
      series: [...series].sort((a, b) => a[0].localeCompare(b[0])).map(([key, slot]) => ({ bucket: key, visits: slot.visits, visitors: slot.visitors.size })),
      countries: topCounts(v.map((r) => r.country || "未知")),
      cities: topCounts(v.map((r) => join(" · ", r.region, r.city))),
      devices: topCounts(v.map((r) => r.device_type || "未知")),
      browsers: topCounts(v.map((r) => join(" / ", r.os, r.browser))),
      referrers: topCounts(v.map((r) => String(r.referrer || "").match(/^[a-z]+:\/\/([^/:?#]+)/i)?.[1] || "直接访问")),
    };
  }

  async function loadClickStats(since: string | null, humanOnly: boolean, humanKeys: Set<string> | null) {
    const { data, error } = await supabase!.rpc("portfolio_click_stats", { p_limit: 100, p_since: since, p_human_only: humanOnly });
    if (!error) return { clickStats: data || [], clicks: null as number | null };

    let q = supabase!
      .from("portfolio_events")
      .select("element_key,element_label,element_type,path,visitor_key,occurred_at")
      .eq("event_name", "ui_click")
      .order("occurred_at", { ascending: false })
      .limit(5000);
    if (since) q = q.gte("occurred_at", since);
    const { data: rows, error: rowsError } = await q;
    if (rowsError) throw rowsError;
    const kept = (rows || []).filter((row: any) => !humanOnly || !humanKeys || humanKeys.has(row.visitor_key));
    const clickMap = new Map<string, any>();
    for (const row of kept) {
      const mapKey = `${row.path}\u0000${row.element_key}`;
      const current = clickMap.get(mapKey) || { ...row, clicks: 0, visitors: new Set<string>(), last_clicked_at: row.occurred_at };
      current.clicks += 1;
      current.visitors.add(row.visitor_key);
      clickMap.set(mapKey, current);
    }
    const clickStats = Array.from(clickMap.values())
      .map(({ visitors: unique, visitor_key: _visitorKey, occurred_at: _occurredAt, ...row }) => ({ ...row, unique_visitors: unique.size }))
      .sort((a, b) => b.clicks - a.clicks)
      .slice(0, 100);
    return { clickStats, clicks: kept.length };
  }

  app.get("/api/admin/analytics/summary", requireAdmin, async (req, res) => {
    try {
      if (!supabase) return res.json({ configured: false, reason: "supabase-missing" });
      const { range, humanOnly, since, bucket } = analyticsQuery(req);

      const { error: tableError } = await supabase.from("portfolio_visits").select("id", { head: true, count: "exact" }).limit(1);
      if (tableError) {
        if (missingSchema(tableError.message)) return res.json({ configured: false, reason: "tables-missing" });
        return res.status(500).json({ error: tableError.message });
      }
      const { error: eventsError } = await supabase.from("portfolio_events").select("id", { head: true, count: "exact" }).limit(1);
      const eventsConfigured = !eventsError;

      const { data: summary, error: summaryError } = await supabase.rpc("portfolio_visit_summary", {
        p_since: since,
        p_human_only: humanOnly,
        p_bucket: bucket,
      });

      if (!summaryError) {
        const clicks = eventsConfigured ? await loadClickStats(since, humanOnly, null) : { clickStats: [] };
        return res.json({ configured: true, schemaReady: true, eventsConfigured, range, humanOnly, bucket, summary, clickStats: clicks.clickStats });
      }
      if (!missingSchema(summaryError.message)) return res.status(500).json({ error: summaryError.message });

      const rows = await legacyVisitRows(since);
      const legacy = legacySummary(rows, humanOnly, bucket);
      const types = mergeVisitorTypes(rows);
      const humanKeys = new Set([...types].filter(([, t]) => t === "human").map(([k]) => k));
      const clicks = eventsConfigured ? await loadClickStats(since, humanOnly, humanKeys) : { clickStats: [], clicks: 0 };
      legacy.clicks = clicks.clicks ?? 0;
      res.json({ configured: true, schemaReady: false, eventsConfigured, range, humanOnly, bucket, summary: legacy, clickStats: clicks.clickStats });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "summary-failed" });
    }
  });

  // 访客分页列表：范围按 last_seen 过滤（「这段时间内来过的人」），支持备注 / IP / 城市 / key 搜索。
  app.get("/api/admin/analytics/visitors", requireAdmin, async (req, res) => {
    try {
      if (!supabase) return res.json({ visitors: [], total: 0 });
      const { humanOnly, since } = analyticsQuery(req);
      const pageSize = Math.min(Math.max(Number(req.query.pageSize) || 20, 5), 100);
      const page = Math.max(Number(req.query.page) || 1, 1);
      // 去掉 PostgREST or() 语法里有特殊含义的字符，避免拼出畸形过滤条件。
      const search = String(req.query.q || "").replace(/[,()*%\\:"']/g, " ").trim().slice(0, 60);

      const build = (withType: boolean) => {
        let q = supabase!.from("portfolio_visitors").select("*", { count: "exact" }).order("last_seen", { ascending: false });
        if (since) q = q.gte("last_seen", since);
        if (withType && humanOnly) q = q.eq("traffic_type", "human");
        if (search) {
          q = q.or(["label", "last_ip", "last_city", "last_region", "last_country", "visitor_key"].map((col) => `${col}.ilike.*${search}*`).join(","));
        }
        return q;
      };

      const from = (page - 1) * pageSize;
      const { data, count, error } = await build(true).range(from, from + pageSize - 1);
      if (!error) return res.json({ visitors: data || [], total: count || 0, page, pageSize });
      if (!missingSchema(error.message)) return res.status(500).json({ error: error.message });

      // 旧 schema：访客表没有 traffic_type，用访问行推断后在内存里分页。
      const { data: all, error: allError } = await build(false).limit(2000);
      if (allError) return res.status(500).json({ error: allError.message });
      const types = mergeVisitorTypes(await legacyVisitRows(null));
      const typed = (all || []).map((v: any) => ({ ...v, traffic_type: types.get(v.visitor_key) || "human" }));
      const kept = humanOnly ? typed.filter((v) => v.traffic_type === "human") : typed;
      res.json({ visitors: kept.slice(from, from + pageSize), total: kept.length, page, pageSize });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "visitors-failed" });
    }
  });

  // 单个访客的访问明细，点开时才拉。
  app.get("/api/admin/analytics/visitors/:visitorKey/visits", requireAdmin, async (req, res) => {
    try {
      if (!supabase) return res.json({ visits: [] });
      const visitorKey = String(req.params.visitorKey || "").slice(0, 80);
      const { data, error } = await supabase
        .from("portfolio_visits")
        .select("*")
        .eq("visitor_key", visitorKey)
        .order("created_at", { ascending: false })
        .limit(100);
      if (error) return res.status(500).json({ error: error.message });
      res.json({
        visits: (data || []).map((row: any) => ({ ...row, traffic_type: row.traffic_type || classifyTraffic(row.user_agent, row.ip) })),
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "visits-failed" });
    }
  });

  // 聊天页词云只返回聚合词频，不把其他访客的原始消息批量交给浏览器。
  app.get("/api/admin/analytics/assistant-keywords", requireAdmin, async (req, res) => {
    try {
      if (!supabase) return res.json({ configured: false, keywords: [], messageCount: 0, visitorCount: 0 });
      const { since, humanOnly } = analyticsQuery(req);
      let query = supabase
        .from("portfolio_assistant_memories")
        .select("visitor_key,user_message,created_at")
        .order("created_at", { ascending: false })
        .limit(5000);
      if (since) query = query.gte("created_at", since);
      const { data, error } = await query;
      if (error) {
        if (missingSchema(error.message)) return res.json({ configured: false, keywords: [], messageCount: 0, visitorCount: 0 });
        return res.status(500).json({ error: error.message });
      }

      let rows = data || [];
      if (humanOnly && rows.length) {
        const { data: humans, error: humanError } = await supabase
          .from("portfolio_visitors")
          .select("visitor_key")
          .eq("traffic_type", "human")
          .limit(10000);
        if (!humanError) {
          const humanKeys = new Set((humans || []).map((row: JsonRecord) => String(row.visitor_key)));
          rows = rows.filter((row: JsonRecord) => humanKeys.has(String(row.visitor_key)));
        }
      }

      res.json({
        configured: true,
        keywords: assistantKeywordCounts(rows.map((row: JsonRecord) => String(row.user_message || ""))),
        messageCount: rows.length,
        visitorCount: new Set(rows.map((row: JsonRecord) => String(row.visitor_key))).size,
      });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "assistant-keywords-failed" });
    }
  });

  // 单个访客的聊天会话。优先读取 Dify 的完整会话目录，本地长期记忆作为降级备份。
  app.get("/api/admin/analytics/visitors/:visitorKey/conversations", requireAdmin, async (req, res) => {
    try {
      const visitorKey = assistantVisitorKey(req.params.visitorKey);
      if (!visitorKey) return res.status(400).json({ error: "访客标识无效" });

      const localGroups = new Map<string, { id: string; createdAt: string; updatedAt: string; exchangeCount: number }>();
      if (supabase) {
        const { data, error } = await supabase
          .from("portfolio_assistant_memories")
          .select("id,conversation_id,created_at")
          .eq("visitor_key", visitorKey)
          .order("created_at", { ascending: false })
          .limit(1000);
        if (error && !missingSchema(error.message)) return res.status(500).json({ error: error.message });
        for (const row of data || []) {
          const id = cleanConversationId(row.conversation_id);
          if (!id) continue;
          const current = localGroups.get(id);
          if (!current) {
            localGroups.set(id, { id, createdAt: row.created_at, updatedAt: row.created_at, exchangeCount: 1 });
          } else {
            current.createdAt = row.created_at < current.createdAt ? row.created_at : current.createdAt;
            current.updatedAt = row.created_at > current.updatedAt ? row.created_at : current.updatedAt;
            current.exchangeCount += 1;
          }
        }
      }

      const merged = new Map<string, JsonRecord>();
      for (const group of localGroups.values()) {
        merged.set(group.id, {
          id: group.id,
          name: "历史会话",
          createdAt: group.createdAt,
          updatedAt: group.updatedAt,
          exchangeCount: group.exchangeCount,
          source: "local",
        });
      }

      if (difyKey()) {
        try {
          const params = new URLSearchParams({ user: `visitor-${visitorKey}`, limit: "100", sort_by: "-updated_at" });
          const response = await fetch(`${difyBase()}/conversations?${params}`, {
            headers: { Authorization: `Bearer ${difyKey()}` },
            signal: AbortSignal.timeout(8000),
          });
          if (response.ok) {
            const payload: JsonRecord = await response.json();
            for (const item of Array.isArray(payload.data) ? payload.data : []) {
              const id = cleanConversationId(item.id);
              if (!id) continue;
              const local = localGroups.get(id);
              const createdAt = Number(item.created_at) ? new Date(Number(item.created_at) * 1000).toISOString() : local?.createdAt || "";
              const updatedAt = Number(item.updated_at) ? new Date(Number(item.updated_at) * 1000).toISOString() : local?.updatedAt || createdAt;
              merged.set(id, {
                id,
                name: String(item.name || "未命名会话").slice(0, 120),
                createdAt,
                updatedAt,
                exchangeCount: local?.exchangeCount ?? null,
                source: local ? "dify+local" : "dify",
              });
            }
          }
        } catch (error: any) {
          console.warn("[assistant] admin conversation list fallback", error?.message || error);
        }
      }

      const conversations = [...merged.values()].sort((a, b) => Date.parse(b.updatedAt || "") - Date.parse(a.updatedAt || ""));
      res.json({ conversations });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "conversations-failed" });
    }
  });

  // 会话消息按需加载，避免打开访客详情时一次性拉取全部聊天正文。
  app.get("/api/admin/analytics/visitors/:visitorKey/conversations/:conversationId/messages", requireAdmin, async (req, res) => {
    try {
      const visitorKey = assistantVisitorKey(req.params.visitorKey);
      const conversationId = cleanConversationId(req.params.conversationId);
      if (!visitorKey || !conversationId) return res.status(400).json({ error: "会话标识无效" });

      if (difyKey()) {
        try {
          const params = new URLSearchParams({ conversation_id: conversationId, user: `visitor-${visitorKey}`, limit: "100" });
          const response = await fetch(`${difyBase()}/messages?${params}`, {
            headers: { Authorization: `Bearer ${difyKey()}` },
            signal: AbortSignal.timeout(8000),
          });
          if (response.ok) {
            const payload: JsonRecord = await response.json();
            const messages = (Array.isArray(payload.data) ? payload.data : []).flatMap((item: JsonRecord) => {
              const createdAt = Number(item.created_at) ? new Date(Number(item.created_at) * 1000).toISOString() : "";
              return [
                { id: `${item.id || crypto.randomUUID()}-user`, role: "user", content: String(item.query || ""), createdAt },
                { id: `${item.id || crypto.randomUUID()}-assistant`, role: "assistant", content: visibleAssistantText(item.answer), createdAt },
              ];
            }).filter((item: JsonRecord) => item.content);
            messages.sort((a: JsonRecord, b: JsonRecord) => Date.parse(a.createdAt || "") - Date.parse(b.createdAt || ""));
            if (messages.length) return res.json({ messages, source: "dify" });
          }
        } catch (error: any) {
          console.warn("[assistant] admin conversation messages fallback", error?.message || error);
        }
      }

      if (!supabase) return res.json({ messages: [], source: "none" });
      const { data, error } = await supabase
        .from("portfolio_assistant_memories")
        .select("id,user_message,assistant_message,created_at")
        .eq("visitor_key", visitorKey)
        .eq("conversation_id", conversationId)
        .order("created_at", { ascending: true })
        .limit(500);
      if (error) {
        if (missingSchema(error.message)) return res.json({ messages: [], source: "none" });
        return res.status(500).json({ error: error.message });
      }
      const messages = (data || []).flatMap((row: JsonRecord) => [
        { id: `${row.id}-user`, role: "user", content: String(row.user_message || ""), createdAt: row.created_at },
        { id: `${row.id}-assistant`, role: "assistant", content: String(row.assistant_message || ""), createdAt: row.created_at },
      ]).filter((item: JsonRecord) => item.content);
      res.json({ messages, source: "local" });
    } catch (err: any) {
      res.status(500).json({ error: err?.message || "conversation-messages-failed" });
    }
  });

  app.patch("/api/admin/visits", requireAdmin, async (req, res) => {
    try {
      if (!supabase) return res.status(400).json({ error: "Supabase 未配置" });
      const body = req.body || {};
      const visitorKey = String(body.visitorKey || "").trim().slice(0, 80);
      if (!visitorKey) return res.status(400).json({ error: "visitorKey required" });

      const patch: Record<string, unknown> = {};
      if (typeof body.label === "string") patch.label = body.label.slice(0, 60);
      if (typeof body.blocked === "boolean") patch.blocked = body.blocked;
      if (Object.keys(patch).length === 0) return res.status(400).json({ error: "nothing to update" });

      const { error } = await supabase.from("portfolio_visitors").update(patch).eq("visitor_key", visitorKey);
      if (error) {
        if (/could not find the table|does not exist|schema cache/i.test(error.message)) {
          return res.status(400).json({ error: "检测数据表还没建：请先在 Supabase 里执行 supabase/schema.sql" });
        }
        return res.status(500).json({ error: error.message });
      }
      res.json({ ok: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // 清理：给了一堆 visitorKey 就删这批，否则 all=true 清空全部。
  app.post("/api/admin/visits/clear", requireAdmin, async (req, res) => {
    try {
      if (!supabase) return res.status(400).json({ error: "Supabase 未配置" });
      const body = req.body || {};
      const keys: string[] = Array.isArray(body.visitorKeys)
        ? body.visitorKeys.map((k: unknown) => String(k).slice(0, 80)).filter(Boolean).slice(0, 500)
        : [];
      const all = body.all === true;
      if (!all && keys.length === 0) return res.status(400).json({ error: "visitorKeys or all required" });

      let visitsQ = supabase.from("portfolio_visits").delete();
      let visitorsQ = supabase.from("portfolio_visitors").delete();
      let eventsQ = supabase.from("portfolio_events").delete();
      let memoriesQ = supabase.from("portfolio_assistant_memories").delete();
      if (all) {
        // PostgREST 的 delete 必须带过滤条件，否则会被拒；这里用一个恒真条件。
        visitsQ = visitsQ.not("visitor_key", "is", null);
        visitorsQ = visitorsQ.not("visitor_key", "is", null);
        eventsQ = eventsQ.not("visitor_key", "is", null);
        memoriesQ = memoriesQ.not("visitor_key", "is", null);
      } else {
        visitsQ = visitsQ.in("visitor_key", keys);
        visitorsQ = visitorsQ.in("visitor_key", keys);
        eventsQ = eventsQ.in("visitor_key", keys);
        memoriesQ = memoriesQ.in("visitor_key", keys);
      }

      // 先删事件和聊天记忆，避免删掉访客后留下无法从后台定位的孤立内容。
      const { error: eErr } = await eventsQ;
      if (eErr && !/could not find the table|does not exist|schema cache/i.test(eErr.message)) {
        return res.status(500).json({ error: eErr.message });
      }
      const { error: mErr } = await memoriesQ;
      if (mErr && !missingSchema(mErr.message)) return res.status(500).json({ error: mErr.message });
      const { error: vErr } = await visitsQ;
      if (vErr) return res.status(500).json({ error: vErr.message });
      const { error: pErr } = await visitorsQ;
      if (pErr) return res.status(500).json({ error: pErr.message });

      res.json({ ok: true, cleared: all ? "all" : keys.length });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.use((err: any, _req: Request, res: Response, next: NextFunction) => {
    if (err instanceof multer.MulterError && err.code === "LIMIT_FILE_SIZE") {
      return res.status(413).json({ error: `文件超过 ${MAX_UPLOAD_SIZE_MB}MB 上传上限` });
    }
    next(err);
  });

  if (process.env.NODE_ENV !== "production") {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), "dist");
    app.use(express.static(distPath));
    app.get("*", (_req, res) => {
      res.sendFile(path.join(distPath, "index.html"));
    });
  }

  const server = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Server running on http://0.0.0.0:${PORT}`);
    console.log(supabase ? "Supabase backend enabled." : "Supabase env missing; using local JSON fallback for reads/saves.");
  });
  server.requestTimeout = 15 * 60 * 1000;
  server.headersTimeout = 16 * 60 * 1000;
}

startServer().catch((err) => {
  console.error("Failed to start server", err);
});
