import "dotenv/config";
import crypto from "crypto";
import express, { NextFunction, Request, Response } from "express";
import fs from "fs";
import path from "path";
import multer from "multer";
import COS from "cos-nodejs-sdk-v5";
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

function normalizeResumePdfsInPageCopy(pageCopy: JsonRecord | undefined, transform: (url?: string) => string) {
  const copy = { ...(pageCopy || {}) };
  const resumePdfs = copy.resumePdfs && typeof copy.resumePdfs === "object" ? copy.resumePdfs as JsonRecord : {};
  copy.resumePdfs = {
    ...resumePdfs,
    productManager: transform(String(resumePdfs.productManager || "")),
    newMedia: transform(String(resumePdfs.newMedia || "")),
  };
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
        pageCopy: normalizeResumePdfsInPageCopy(profile.data.page_copy || {}, signCosUrl),
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
  const cleanPageCopy = normalizeResumePdfsInPageCopy(pageCopy || page_copy || {}, stripCosSignature);
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
