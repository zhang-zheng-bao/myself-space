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

/** 取真实客户端 IP：trust proxy 已开，X-Forwarded-For 的第一段就是访客。 */
function clientIp(req: Request) {
  const raw = String(req.headers["x-forwarded-for"] || req.ip || "").split(",")[0].trim();
  const ip = raw.replace(/^::ffff:/, "");
  return ip === "::1" ? "127.0.0.1" : ip;
}

function isPrivateIp(ip: string) {
  if (!ip) return true;
  if (/^(127\.|10\.|192\.168\.|169\.254\.|::1$|fc|fd|fe80)/i.test(ip)) return true;
  if (/^172\.(1[6-9]|2\d|3[01])\./.test(ip)) return true;
  return false;
}

type GeoInfo = { country: string; region: string; city: string; isp: string; raw: unknown };

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

      const { data, error } = await supabase
        .from("portfolio_visits")
        .insert({
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
        })
        .select("id")
        .single();

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
              last_country: country,
              last_region: region,
              last_city: city,
              last_isp: isp,
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
      res.json({ ok: true, visitId, visitorKey, mergedFrom });
    } catch (err: any) {
      // 检测接口永远不要让前台看到 5xx
      res.json({ ok: false, reason: err?.message || "track-failed" });
    }
  });

  app.post("/api/track/dwell", async (req, res) => {
    try {
      if (!supabase) return res.json({ ok: false });
      const body = req.body || {};
      const rawMs = Number(body.dwellMs);
      const dwellMs = Number.isFinite(rawMs) ? Math.max(0, Math.min(Math.round(rawMs), 6 * 60 * 60 * 1000)) : 0;
      const visitIdNum = Number(body.visitId);
      if (!Number.isFinite(visitIdNum)) return res.status(400).json({ error: "visitId required" });

      // 客户端送上来的是**增量**（见 src/tracking.ts: flushDwell 只发上次之后
      // 新增的可见时长），所以这里必须累加，不能覆盖 —— 覆盖的话，一次访问里
      // 只要发生了第二次 visibilitychange，这条访问的停留就只剩最后一段，
      // 而后台「停留 X」读的正是 visit.dwell_ms（AdminApp 那行），于是数字偏小。
      // 访客累计那一列本来就是加的，两列口径必须一致。
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

      const key = data?.visitor_key || String(body.visitorKey || "").slice(0, 80);
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

  app.get("/api/admin/visits", requireAdmin, async (req, res) => {
    try {
      if (!supabase) {
        return res.json({ visitors: [], visits: [], stats: { visitors: 0, visits: 0, today: 0 }, configured: false, reason: "supabase-missing" });
      }

      // 「表还没建」不等于「出错」：schema.sql 还没跑过时 PostgREST 会回一句
      // 「Could not find the table ... in the schema cache」，直接把这句话丢给用户
      // 是没法行动的。识别出来，改成 configured:false + reason，让后台给一句能照做的事。
      const missingTable = (m?: string) => /could not find the table|does not exist|schema cache|relation .* does not exist/i.test(m || "");
      const emptyPayload = (reason: string) => ({
        visitors: [],
        visits: [],
        stats: { visitors: 0, visits: 0, today: 0 },
        configured: false,
        reason,
      } as const);

      const limit = Math.min(Math.max(Number(req.query.limit) || 300, 1), 2000);
      const onlyKey = String(req.query.visitorKey || "").trim();

      let vq = supabase.from("portfolio_visits").select("*").order("created_at", { ascending: false }).limit(limit);
      if (onlyKey) vq = vq.eq("visitor_key", onlyKey);
      const { data: visits, error: vErr } = await vq;
      if (vErr) {
        if (missingTable(vErr.message)) return res.json(emptyPayload("tables-missing"));
        return res.status(500).json({ error: vErr.message });
      }

      let pq = supabase.from("portfolio_visitors").select("*").order("last_seen", { ascending: false }).limit(1000);
      if (onlyKey) pq = pq.eq("visitor_key", onlyKey);
      const { data: visitors, error: pErr } = await pq;
      if (pErr) {
        if (missingTable(pErr.message)) return res.json(emptyPayload("tables-missing"));
        return res.status(500).json({ error: pErr.message });
      }

      const sinceIso = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
      const { count: totalVisits } = await supabase
        .from("portfolio_visits")
        .select("id", { count: "exact", head: true });
      const { count: todayVisits } = await supabase
        .from("portfolio_visits")
        .select("id", { count: "exact", head: true })
        .gte("created_at", sinceIso);

      res.json({
        visitors: visitors || [],
        visits: visits || [],
        stats: {
          visitors: visitors?.length || 0,
          visits: totalVisits || 0,
          today: todayVisits || 0,
        },
        configured: true,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
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
      if (all) {
        // PostgREST 的 delete 必须带过滤条件，否则会被拒；这里用一个恒真条件。
        visitsQ = visitsQ.not("visitor_key", "is", null);
        visitorsQ = visitorsQ.not("visitor_key", "is", null);
      } else {
        visitsQ = visitsQ.in("visitor_key", keys);
        visitorsQ = visitorsQ.in("visitor_key", keys);
      }

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
