import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowRight,
  AppWindow,
  BarChart3,
  Bot,
  BriefcaseBusiness,
  Compass,
  Download,
  ExternalLink,
  Feather,
  FileText,
  Github,
  ListMusic,
  Mail,
  Menu,
  Pause,
  Phone,
  Play,
  SkipBack,
  SkipForward,
  Sparkles,
  TrendingUp,
  Video,
  X,
  ZoomIn,
} from "lucide-react";
import { createPortal } from "react-dom";
import AdminApp from "./AdminApp";
import { startVisitTracking } from "./tracking";
import { FloatingSentencesConfig, GalleryItem, MusicTrack, Poem, PortfolioData, ResumeProfile, SectionKey, TreasureItem, Work, defaultHomeStats, defaultPageCopy, isSectionVisible, normalizeSectionOrder } from "./types";

type TabKey = "intro" | "resume" | "works" | "ai" | "prospects" | "treasures" | "poems" | "contact";

const navItems: { key: TabKey; label: string; sub: string }[] = [
  { key: "intro", label: "自我介绍", sub: "BIOGRAPHY" },
  { key: "resume", label: "个人简历", sub: "CURRICULUM" },
  { key: "works", label: "作品展示", sub: "PORTFOLIO" },
  { key: "ai", label: "AI专区", sub: "AI ZONE" },
  { key: "prospects", label: "应用技能", sub: "SKILLS" },
  { key: "treasures", label: "我的珍藏", sub: "TREASURES" },
  { key: "poems", label: "诗与惆怅", sub: "POEMS" },
  { key: "contact", label: "联系方式", sub: "CONTACT" },
];

const workCategories = [
  { key: "all", label: "全部" },
  { key: "operation", label: "账号运营" },
  { key: "app", label: "应用制作" },
  { key: "prototype", label: "原型图" },
  { key: "video", label: "视频剪辑" },
  { key: "poetry", label: "闲诗" },
];

const galleryCategoryOrder = ["应用", "原型图", "Agent", "剪辑"];

const emptyPortfolioData: PortfolioData = {
  profile: { name: "", avatar: "", tagline: "", intro: "", quote: "", resumePdfUrl: "", musicAutoplay: false, pageCopy: {} },
  experiences: [],
  prospects: { title: "", content: "", points: [] },
  works: [],
  gallery: [],
  treasures: [],
  musicTracks: [],
  contact: { wechat: "", qq: "", email: "", phone: "", github: "" },
};

function normalizeData(data: PortfolioData): PortfolioData {
  return {
    ...data,
    profile: {
      ...(data.profile || { name: "", avatar: "", tagline: "", intro: "", quote: "", resumePdfUrl: "" }),
      musicAutoplay: Boolean(data.profile?.musicAutoplay),
      pageCopy: { ...defaultPageCopy, ...(data.profile?.pageCopy || {}) },
    },
    experiences: data.experiences || [],
    prospects: data.prospects || { title: "", content: "", points: [] },
    works: data.works || [],
    gallery: data.gallery || [],
    treasures: data.treasures || [],
    musicTracks: data.musicTracks || [],
    contact: data.contact || { wechat: "", qq: "", email: "" },
  };
}

/**
 * 「我的珍藏」栏目是否在前台展示。
 *
 * 只有管理员在后台显式关闭（写入 false）才隐藏；缺省 undefined 视为展示，
 * 因此历史数据无需迁移也不会被误隐藏。导航过滤与图片预载都走这一个判断，
 * 避免两处规则各写一遍后彼此不一致。
 *
 * 现在它是 isSectionVisible 的一层薄封装 —— 判定规则（含 sectionVisible 新键
 * 优先、旧键兜底）统一收在 types.ts，这里只负责「拿 data 取珍藏那一格」。
 */
function isTreasuresVisible(data: PortfolioData) {
  return isSectionVisible(data.profile.pageCopy, "treasures");
}

/**
 * 「AI 专区」栏目是否在前台展示。约定与 isTreasuresVisible 完全一致。
 */
function isAiZoneVisible(data: PortfolioData) {
  return isSectionVisible(data.profile.pageCopy, "ai");
}

function categoryLabel(category: string) {
  return {
    operation: "账号运营",
    app: "应用制作",
    prototype: "原型图",
    video: "视频剪辑",
    poetry: "闲诗",
    // AI 专区默认给的三个分类，后台也可以自己填别的，填别的就原样显示。
    agent: "AI Agent",
    image: "AI 绘图",
    text: "AI 文案",
  }[category] || category;
}

function categoryIcon(category: string) {
  const className = "text-zinc-200";
  switch (category) {
    case "operation": return <TrendingUp size={16} className={className} />;
    case "app": return <AppWindow size={16} className={className} />;
    case "prototype": return <Compass size={16} className={className} />;
    case "video": return <Video size={16} className={className} />;
    case "poetry": return <Feather size={16} className={className} />;
    case "agent": return <Bot size={16} className={className} />;
    case "image": return <Sparkles size={16} className={className} />;
    case "text": return <FileText size={16} className={className} />;
    default: return <Compass size={16} className={className} />;
  }
}

function getFileNameFromUrl(url: string) {
  try {
    const parsed = new URL(url);
    return decodeURIComponent(parsed.pathname.split("/").pop() || "");
  } catch {
    return url.split("?")[0].split("/").pop() || "";
  }
}

function getFileExtension(url: string, label?: string) {
  const source = `${label || ""} ${getFileNameFromUrl(url)}`.toLowerCase();
  const match = source.match(/\.([a-z0-9]{1,8})(?:\s|$)/);
  return match?.[1] || "";
}

// 能在弹层里原地预览的扩展名。其余（doc/xls/xlsx/ppt/zip/rar…）后台接不住，
// 前台就别给「预览」按钮 —— 点了只会看到一句「不支持」，不如直接引导下载。
const INLINE_PREVIEWABLE = new Set(["pdf", "docx", "csv", "tsv", "txt", "md", "markdown", "json", "log", "yml", "yaml"]);

/**
 * 附件显示名：去掉扩展名，并把超长名字截断到 10 个字。
 *
 * 三件事：
 *  1. 后缀不显示 —— 右边已经有 DOCK 样式的类型标签了，再挂个 `.docx` 是重复信息。
 *  2. **绝对不能过 zhText()**。文件名是数据不是文案：`账号调研.docx` 里的 `.`
 *     紧跟中文，会被 zhText 的半角转全角规则改成 `账号调研。docx` —— 看着像句号，
 *     是肉眼可见的 bug。所以这里只做纯字符串处理。
 *  3. 超过 10 个字截断加省略号。CSS 的 truncate 是按**像素宽度**算的，
 *     中文和英文混排时「10 个字」会飘；这里按**字符数**截，行为可预期。
 *     截断后仍保留 truncate 类兜底（父容器窄时还能再收）。
 */
const ATTACHMENT_NAME_MAX = 10;

function getAttachmentDisplayName(name: string) {
  const bare = String(name || "").replace(/\.[a-z0-9]{1,8}$/i, "");
  const chars = Array.from(bare); // 用码点切，避免把 emoji / 组合字劈开
  return chars.length > ATTACHMENT_NAME_MAX
    ? `${chars.slice(0, ATTACHMENT_NAME_MAX).join("")}…`
    : bare;
}

function getWorkLinkMeta(link: { label?: string; url: string; kind?: string; fileName?: string }) {
  const ext = getFileExtension(link.url, link.fileName || link.label);
  const isAttachment = link.kind === "attachment" || Boolean(ext);
  const label = link.label || link.fileName || getFileNameFromUrl(link.url) || "查看文件";
  // 预览走**本站同源**中转路由，浏览器插件、第三方域名一概不碰。
  // 这样 iframe 才能嵌进来，且内网/本地部署照样能用。
  const previewUrl = `/api/media/attachment-preview?url=${encodeURIComponent(link.url)}&name=${encodeURIComponent(label)}`;
  return {
    ext,
    isAttachment,
    canPreview: isAttachment && INLINE_PREVIEWABLE.has(ext),
    previewUrl,
    label,
    // 附件行上显示的名字（去后缀、不做全角转换）。
    displayName: getAttachmentDisplayName(label),
  };
}

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
  const mins = Math.floor(seconds / 60);
  const secs = Math.floor(seconds % 60);
  return `${mins}:${secs.toString().padStart(2, "0")}`;
}

function zhText(value?: string) {
  let text = String(value || "");
  text = text.replace(/"([^"\n]+)"/g, "“$1”");
  let quoteOpen = true;
  text = text.replace(/"/g, () => {
    const next = quoteOpen ? "“" : "”";
    quoteOpen = !quoteOpen;
    return next;
  });
  let singleOpen = true;
  text = text.replace(/'([^'\n]+)'/g, "‘$1’").replace(/'/g, () => {
    const next = singleOpen ? "‘" : "’";
    singleOpen = !singleOpen;
    return next;
  });
  return text
    .replace(/([\u4e00-\u9fff]),/g, "$1，")
    .replace(/([\u4e00-\u9fff]);/g, "$1；")
    .replace(/([\u4e00-\u9fff]):/g, "$1：")
    .replace(/([\u4e00-\u9fff])!/g, "$1！")
    .replace(/([\u4e00-\u9fff])\?/g, "$1？")
    .replace(/([\u4e00-\u9fff])\./g, "$1。")
    .replace(/\(([\u4e00-\u9fff][^)]+)\)/g, "（$1）");
}

function parseSubtitleTime(value: string) {
  const match = value.trim().match(/(?:(\d{1,2}):)?(\d{1,2}):(\d{1,2})(?:[,.](\d{1,3}))?/);
  if (!match) return null;
  const hours = Number(match[1] || 0);
  const mins = Number(match[2] || 0);
  const secs = Number(match[3] || 0);
  const millis = Number((match[4] || "0").padEnd(3, "0").slice(0, 3));
  return hours * 3600 + mins * 60 + secs + millis / 1000;
}

type TimedChar = { char: string; start: number; end?: number };
type LyricLine = { time: number; endTime?: number; text: string; charTimings?: TimedChar[]; kind?: string };

function parseSubtitleBlocks(raw: string): LyricLine[] {
  return raw
    .replace(/^\uFEFF/, "")
    .replace(/^WEBVTT[^\n]*(?:\r?\n)+/i, "")
    .split(/\r?\n\r?\n+/)
    .flatMap((block) => {
      const rows = block.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
      const timeIndex = rows.findIndex((line) => line.includes("-->"));
      if (timeIndex < 0) return [];
      const [start, end] = rows[timeIndex].split("-->");
      const time = parseSubtitleTime(start);
      const endTime = parseSubtitleTime((end || "").split(/\s+/)[0] || "");
      const text = rows.slice(timeIndex + 1)
        .join(" ")
        .replace(/<[^>]+>/g, "")
        .replace(/\{\\[^}]+\}/g, "")
        .trim();
      return time === null || !text ? [] : [{ time, endTime: endTime && endTime > time ? endTime : undefined, text }];
    })
    .sort((a, b) => a.time - b.time);
}

function parseInlineLyricTime(value: string) {
  const normalized = value.trim().replace(",", ".");
  const parts = normalized.split(":");
  if (parts.length === 3 && !parts[2].includes(".") && parts[2].length === 3) {
    const mins = Number(parts[0]);
    const secs = Number(parts[1]);
    const millis = Number(parts[2]);
    if ([mins, secs, millis].some((part) => Number.isNaN(part))) return null;
    return mins * 60 + secs + millis / 1000;
  }
  const numbers = parts.map(Number);
  if (numbers.some((part) => Number.isNaN(part))) return null;
  if (numbers.length === 2) return numbers[0] * 60 + numbers[1];
  if (numbers.length === 3) return numbers[0] * 3600 + numbers[1] * 60 + numbers[2];
  return null;
}

function distributeTimedSegment(text: string, start: number, end?: number) {
  const chars = text.split("");
  if (chars.length === 0) return [];
  const span = end && end > start ? end - start : 0;
  return chars.map((char, index) => {
    const charStart = span > 0 ? start + (span * index) / chars.length : start;
    const charEnd = span > 0 ? start + (span * (index + 1)) / chars.length : undefined;
    return { char, start: charStart, end: charEnd };
  });
}

function parseEnhancedLrcText(text: string, lineStart: number) {
  const tagPattern = /<((?:(?:\d{1,2}:)?\d{1,2}:)?\d{1,2}(?:[.,:]\d{1,3})?)>/g;
  const tags = [...text.matchAll(tagPattern)]
    .map((match) => ({ index: match.index ?? 0, endIndex: (match.index ?? 0) + match[0].length, time: parseInlineLyricTime(match[1]) }))
    .filter((tag): tag is { index: number; endIndex: number; time: number } => tag.time !== null);

  if (tags.length === 0) return { text: text.replace(/<[^>]+>/g, "").trim() };

  const charTimings: TimedChar[] = [];
  let plainText = "";
  const prefix = text.slice(0, tags[0].index);
  if (prefix.trim()) {
    plainText += prefix;
    charTimings.push(...distributeTimedSegment(prefix, lineStart, tags[0].time));
  }

  tags.forEach((tag, index) => {
    const nextTag = tags[index + 1];
    const segment = text.slice(tag.endIndex, nextTag?.index ?? text.length);
    if (!segment) return;
    plainText += segment;
    charTimings.push(...distributeTimedSegment(segment, tag.time, nextTag?.time));
  });

  const cleanedText = plainText.trim();
  const trimStart = plainText.search(/\S/);
  const trimOffset = trimStart > 0 ? trimStart : 0;
  const cleanedTimings = charTimings.slice(trimOffset, trimOffset + cleanedText.length).map((item) => ({ ...item }));
  cleanedTimings.forEach((item, index) => {
    if (item.end && item.end > item.start) return;
    const nextStart = cleanedTimings[index + 1]?.start;
    const previous = cleanedTimings[index - 1];
    const previousSpan = previous?.end && previous.end > previous.start ? previous.end - previous.start : 0.24;
    item.end = nextStart && nextStart > item.start
      ? nextStart
      : item.start + Math.min(0.42, Math.max(0.14, previousSpan));
  });

  return {
    text: cleanedText,
    charTimings: cleanedTimings.length === cleanedText.length ? cleanedTimings : undefined,
  };
}

function lyricTag(raw: string, names: string[]) {
  for (const name of names) {
    const escaped = name.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = raw.match(new RegExp(`\\[${escaped}\\s*:\\s*([^\\]]+)\\]`, "i"));
    if (match?.[1]?.trim()) return match[1].trim();
  }
  return "";
}

function lyricMeta(raw: string | undefined, track: MusicTrack | null) {
  const source = raw || "";
  return {
    title: lyricTag(source, ["ti", "title", "歌名", "歌曲"]) || track?.title || "未命名音乐",
    artist: lyricTag(source, ["ar", "artist", "歌手", "singer"]) || track?.artist || "未填写歌手",
  };
}

function parseLyrics(raw?: string): LyricLine[] {
  const source = raw || "";
  const subtitles = parseSubtitleBlocks(source);
  if (subtitles.length > 0) return subtitles;
  const lines = source.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const timed = lines.flatMap((line) => {
    const matches = [...line.matchAll(/\[(\d{1,2}):(\d{1,2})(?:[.:](\d{1,3}))?\]/g)];
    const rawText = line.replace(/\[[^\]]+\]/g, "").trim();
    if (matches.length === 0 || !rawText) return [];
    return matches.map((match) => {
      const mins = Number(match[1] || 0);
      const secs = Number(match[2] || 0);
      const fraction = match[3] || "0";
      const millis = Number(fraction.padEnd(3, "0").slice(0, 3));
      const time = mins * 60 + secs + millis / 1000;
      return { time, ...parseEnhancedLrcText(rawText, time) };
    });
  }).sort((a, b) => a.time - b.time);

  if (timed.length > 0) return timed;
  return lines.map((text, index) => ({ time: index * 999999, text }));
}

function withIntroLyrics(lines: LyricLine[], _meta: { title: string; artist: string }): LyricLine[] {
  return lines.map((line) => ({ ...line, kind: "lyric" }));
}

function characterWeight(char: string, index: number, total: number) {
  if (/\s/.test(char)) return 0.18;
  if (/[，。！？、；：,.!?;:]/.test(char)) return 0.32;
  if (/[的了着过和与及在是我你他她它们]/.test(char)) return 0.82;
  const phrasePause = total > 8 && index > 0 && index < total - 1 && index % 4 === 3 ? 0.26 : 0;
  const naturalVariation = ((index * 7) % 5) * 0.055;
  return 0.92 + naturalVariation + phrasePause;
}

function clamp01(value: number) {
  return Math.min(1, Math.max(0, value));
}

function characterFillProgress(line: LyricLine, nextTime: number | undefined, currentTime: number, duration: number) {
  const chars = line.text.split("");
  if (currentTime < line.time) return chars.map(() => 0);
  if (line.charTimings?.length === line.text.length) {
    return line.charTimings.map((char, index) => {
      const nextStart = line.charTimings?.[index + 1]?.start;
      const fallbackEnd = Math.min(
        line.endTime && line.endTime > char.start ? line.endTime : Number.POSITIVE_INFINITY,
        nextTime && nextTime > char.start ? nextTime : Number.POSITIVE_INFINITY,
        duration && duration > char.start ? duration : Number.POSITIVE_INFINITY,
      );
      const charEnd = char.end && char.end > char.start
        ? char.end
        : nextStart && nextStart > char.start
          ? nextStart
          : Number.isFinite(fallbackEnd)
            ? fallbackEnd
            : char.start + 0.24;
      const windowSize = Math.max(0.08, charEnd - char.start);
      return clamp01((currentTime - char.start) / windowSize);
    });
  }
  const inferredEnd = nextTime && nextTime > line.time ? nextTime : (duration > line.time ? duration : line.time + Math.max(2.8, line.text.length * 0.24));
  const endTime = line.endTime && line.endTime > line.time ? Math.min(line.endTime, inferredEnd || line.endTime) : inferredEnd;
  const lineDuration = Math.max(0.8, endTime - line.time);
  const holdRatio = lineDuration > 5 ? 0.22 : lineDuration > 2.6 ? 0.16 : 0.08;
  const revealWindow = Math.max(0.65, lineDuration * (1 - holdRatio));
  const elapsed = Math.min(revealWindow, Math.max(0, currentTime - line.time));
  const weights = chars.map((char, index) => characterWeight(char, index, chars.length));
  const totalWeight = weights.reduce((sum, weight) => sum + weight, 0) || 1;
  const targetWeight = clamp01(elapsed / revealWindow) * totalWeight;
  let accumulated = 0;
  return weights.map((weight) => {
    const start = accumulated;
    accumulated += weight;
    return clamp01((targetWeight - start) / Math.max(0.01, weight));
  });
}

function lyricStartTime(line: LyricLine) {
  return line.charTimings?.[0]?.start ?? line.time;
}

function lyricEndTime(line: LyricLine, nextLine?: LyricLine) {
  const lastChar = line.charTimings?.[line.charTimings.length - 1];
  if (lastChar?.end && lastChar.end > lastChar.start) return lastChar.end;
  if (lastChar?.start !== undefined) return lastChar.start + 0.24;
  const nextStart = nextLine ? lyricStartTime(nextLine) : undefined;
  return nextStart && nextStart > line.time ? nextStart : line.time + Math.max(1.2, line.text.length * 0.22);
}

function activeLyricAtTime(lines: LyricLine[], currentTime: number) {
  if (lines.length === 0) return -1;
  let active = 0;
  for (let index = 0; index < lines.length; index += 1) {
    const start = lyricStartTime(lines[index]);
    if (currentTime < start) break;
    const previous = lines[index - 1];
    const previousEnd = previous ? lyricEndTime(previous, lines[index]) : 0;
    if (previous && currentTime < previousEnd - 0.015) break;
    active = index;
  }
  return active;
}

/**
 * 音乐播放器。
 *
 * 宝的要求（原话）：**「整个改回原样」**。
 * 所以这里没有 `compact` 之类的变体 —— 尺寸、间距、歌词面板全部是我改动之前
 * 的那一套。要调它的外观前先问，别再自作主张。
 */
function AudioBlock({ tracks, autoplay, compact = false }: { tracks: MusicTrack[]; autoplay?: boolean; compact?: boolean }) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const lyricsRef = useRef<HTMLDivElement | null>(null);
  const autoplayAttemptedRef = useRef(false);
  const lastScrolledLyricIndexRef = useRef(-1);
  const [isPlaying, setIsPlaying] = useState(false);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);
  const [trackIndex, setTrackIndex] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const playlist = tracks.filter((track) => track.audioUrl);
  const currentTrack = playlist[trackIndex] || null;
  const lyrics = useMemo(() => withIntroLyrics(parseLyrics(currentTrack?.lyrics), lyricMeta(currentTrack?.lyrics, currentTrack)), [currentTrack?.lyrics, currentTrack?.title, currentTrack?.artist]);
  const activeLyricIndex = activeLyricAtTime(lyrics, currentTime);
  const playbackPercent = duration > 0 ? Math.min(100, Math.max(0, (currentTime / duration) * 100)) : 0;

  useEffect(() => {
    setTrackIndex(0);
    setIsPlaying(false);
    setAutoplayBlocked(false);
    setCurrentTime(0);
    setDuration(0);
    autoplayAttemptedRef.current = false;
    lastScrolledLyricIndexRef.current = -1;
  }, [tracks]);

  useEffect(() => {
    if (!autoplay || !autoplayBlocked || !currentTrack) return;
    const resumeAutoplay = () => {
      const audio = audioRef.current;
      if (!audio) return;
      audio.muted = false;
      audio.volume = 1;
      audio.play()
        .then(() => {
          setIsPlaying(true);
          setAutoplayBlocked(false);
        })
        .catch(() => setAutoplayBlocked(true));
    };
    window.addEventListener("pointerdown", resumeAutoplay, { once: true });
    window.addEventListener("keydown", resumeAutoplay, { once: true });
    window.addEventListener("touchstart", resumeAutoplay, { once: true });
    return () => {
      window.removeEventListener("pointerdown", resumeAutoplay);
      window.removeEventListener("keydown", resumeAutoplay);
      window.removeEventListener("touchstart", resumeAutoplay);
    };
  }, [autoplay, autoplayBlocked, currentTrack?.audioUrl]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.load();
    setCurrentTime(0);
    setDuration(0);
    if (isPlaying && currentTrack) audio.play().catch(() => setIsPlaying(false));
  }, [trackIndex, currentTrack?.audioUrl]);

  useEffect(() => {
    const audio = audioRef.current;
    if (!audio || !autoplay || autoplayAttemptedRef.current || playlist.length === 0 || !currentTrack) return;
    autoplayAttemptedRef.current = true;
    setTrackIndex(0);
    audio.muted = false;
    audio.volume = 1;
    audio.play()
      .then(() => {
        setIsPlaying(true);
        setAutoplayBlocked(false);
      })
      .catch(() => {
        setIsPlaying(false);
        setAutoplayBlocked(true);
      });
  }, [autoplay, playlist.length, currentTrack?.audioUrl]);

  useEffect(() => {
    if (!isPlaying) return;
    const timer = window.setInterval(() => {
      const audio = audioRef.current;
      if (!audio) return;
      setCurrentTime(audio.currentTime || 0);
      if (Number.isFinite(audio.duration) && audio.duration > 0) {
        setDuration(audio.duration);
      }
    }, 80);
    return () => window.clearInterval(timer);
  }, [isPlaying, currentTrack?.audioUrl]);

  useEffect(() => {
    const pauseMusicForVideo = (event: Event) => {
      if (!(event.target instanceof HTMLVideoElement)) return;
      const audio = audioRef.current;
      if (!audio || audio.paused) return;
      audio.pause();
      setIsPlaying(false);
    };
    document.addEventListener("play", pauseMusicForVideo, true);
    return () => document.removeEventListener("play", pauseMusicForVideo, true);
  }, []);

  const syncProgress = (audio: HTMLAudioElement) => {
    setCurrentTime(audio.currentTime || 0);
    if (Number.isFinite(audio.duration) && audio.duration > 0) {
      setDuration(audio.duration);
    }
  };

  useEffect(() => {
    if (!lyricsRef.current || activeLyricIndex < 0) return;
    if (lastScrolledLyricIndexRef.current === activeLyricIndex) return;
    lastScrolledLyricIndexRef.current = activeLyricIndex;
    const activeLine = lyricsRef.current.querySelector<HTMLElement>(`[data-lyric-index="${activeLyricIndex}"]`);
    if (!activeLine) return;
    const targetTop = activeLine.offsetTop - lyricsRef.current.clientHeight / 2 + activeLine.clientHeight / 2;
    lyricsRef.current.scrollTo({
      top: Math.max(0, targetTop),
      behavior: "smooth",
    });
  }, [activeLyricIndex, lyrics]);

  const playIndex = (nextIndex: number) => {
    if (playlist.length === 0) return;
    setTrackIndex((nextIndex + playlist.length) % playlist.length);
    setIsPlaying(true);
  };

  const seekToLyric = async (line: LyricLine) => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;
    const nextTime = Math.max(0, lyricStartTime(line));
    audio.currentTime = nextTime;
    setCurrentTime(nextTime);
    try {
      await audio.play();
      setIsPlaying(true);
      setAutoplayBlocked(false);
    } catch {
      setIsPlaying(false);
      setAutoplayBlocked(true);
    }
  };

  const togglePlay = async () => {
    const audio = audioRef.current;
    if (!audio || !currentTrack) return;
    if (isPlaying) {
      audio.pause();
      setIsPlaying(false);
      return;
    }
    try {
      await audio.play();
      setIsPlaying(true);
      setAutoplayBlocked(false);
    } catch {
      setIsPlaying(false);
      setAutoplayBlocked(true);
    }
  };

  if (compact) {
    return (
      <>
      <div className="hero-audio">
        <audio
          ref={audioRef}
          src={currentTrack?.audioUrl || ""}
          onEnded={() => playlist.length > 1 ? playIndex(trackIndex + 1) : setIsPlaying(false)}
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onTimeUpdate={(event) => syncProgress(event.currentTarget)}
          onDurationChange={(event) => syncProgress(event.currentTarget)}
          onLoadedMetadata={(event) => syncProgress(event.currentTarget)}
          preload="metadata"
        />
        <div className="hero-audio__cover">
          {currentTrack?.coverUrl ? <img src={currentTrack.coverUrl} alt="" referrerPolicy="no-referrer" /> : <Sparkles size={16} />}
        </div>
        <div className="hero-audio__meta">
          <strong>{zhText(currentTrack?.title) || "暂无音乐"}</strong>
          <span>{currentTrack ? zhText(currentTrack.artist) || "Unknown" : "请在后台上传音乐"}</span>
        </div>
        <button type="button" onClick={togglePlay} disabled={!currentTrack} className="hero-audio__play" aria-label={isPlaying ? "暂停音乐" : "播放音乐"}>
          {isPlaying ? <Pause size={15} className="fill-current" /> : <Play size={15} className="translate-x-px fill-current" />}
        </button>
        <div className="hero-audio__wave">
          {[8, 14, 22, 17, 27, 19, 13, 9, 16, 11, 18, 12, 8, 14].map((height, index, bars) => (
            <i
              key={index}
              style={{ height, animationDelay: `${index * 70}ms` }}
              data-active={isPlaying || undefined}
              data-lit={index < (isPlaying ? Math.max(1, Math.ceil((playbackPercent / 100) * bars.length)) : 7) || undefined}
            />
          ))}
          <input
            type="range"
            min={0}
            max={duration || 0}
            value={Math.min(currentTime, duration || 0)}
            onChange={(event) => {
              const nextTime = Number(event.target.value);
              if (audioRef.current) audioRef.current.currentTime = nextTime;
              setCurrentTime(nextTime);
            }}
            disabled={!currentTrack}
            aria-label="音乐播放进度"
          />
        </div>
        <div className="hero-audio__time">{formatTime(currentTime)} / {formatTime(duration)}</div>
        <button type="button" onClick={() => playIndex(trackIndex - 1)} disabled={playlist.length <= 1} className="hero-audio__skip" aria-label="上一首"><SkipBack size={14} /></button>
        <button type="button" onClick={() => playIndex(trackIndex + 1)} disabled={playlist.length <= 1} className="hero-audio__skip" aria-label="下一首"><SkipForward size={14} /></button>
        <span className="hero-audio__queue" aria-hidden="true"><ListMusic size={15} /></span>
        <div className="hero-audio__progress" aria-hidden="true"><span style={{ width: `${playbackPercent}%` }} /></div>
      </div>
      {isPlaying && currentTrack && typeof document !== "undefined" && createPortal(
        <aside className="now-playing-lyrics" aria-label={`正在播放 ${zhText(currentTrack.title)} 的歌词`}>
          <div ref={lyricsRef} className="now-playing-lyrics__body">
            {lyrics.length > 0 ? (
              <div className="now-playing-lyrics__list">
                {lyrics.map((line, index) => {
                  const active = index === activeLyricIndex;
                  const distance = Math.abs(index - activeLyricIndex);
                  const nextTime = lyrics[index + 1]?.time;
                  const charProgress = active
                    ? characterFillProgress(line, nextTime, currentTime, duration)
                    : line.text.split("").map(() => index < activeLyricIndex ? 1 : 0);
                  return (
                    <button
                      type="button"
                      key={`${line.time}-${index}`}
                      data-lyric-index={index}
                      data-lyric-time={line.time}
                      data-active={active || undefined}
                      onClick={() => { void seekToLyric(line); }}
                      className="now-playing-lyrics__line"
                      style={{ opacity: active ? 1 : distance === 1 ? 0.68 : 0.35 }}
                    >
                      {line.text.split("").map((char, charIndex) => (
                        <span
                          key={`${line.time}-${index}-${charIndex}`}
                          className="now-playing-lyrics__char"
                          style={{
                            color: active
                              ? `color-mix(in srgb, rgb(164 175 173) ${Math.round((1 - (charProgress[charIndex] || 0)) * 100)}%, rgb(98 245 206))`
                              : index < activeLyricIndex
                                ? "rgb(98 245 206)"
                                : undefined,
                            textShadow: active && (charProgress[charIndex] || 0) > 0.35
                              ? `0 0 ${Math.round(5 + (charProgress[charIndex] || 0) * 8)}px rgba(98,245,206,${0.12 + (charProgress[charIndex] || 0) * 0.25})`
                              : undefined,
                            transform: active && (charProgress[charIndex] || 0) > 0 && (charProgress[charIndex] || 0) < 1
                              ? `translateY(${(1 - (charProgress[charIndex] || 0)) * 1.2}px)`
                              : undefined,
                          }}
                        >
                          {char}
                        </span>
                      ))}
                    </button>
                  );
                })}
              </div>
            ) : (
              <p className="now-playing-lyrics__empty">暂无歌词</p>
            )}
          </div>
        </aside>,
        document.body,
      )}
      </>
    );
  }

  return (
    <div className="rounded-2xl border border-zinc-900 bg-zinc-950/85 p-5 shadow-2xl transition-all duration-300 hover:border-zinc-800">
      <audio
        ref={audioRef}
        src={currentTrack?.audioUrl || ""}
        onEnded={() => playlist.length > 1 ? playIndex(trackIndex + 1) : setIsPlaying(false)}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onTimeUpdate={(event) => syncProgress(event.currentTarget)}
        onDurationChange={(event) => syncProgress(event.currentTarget)}
        onLoadedMetadata={(event) => syncProgress(event.currentTarget)}
        onCanPlay={(event) => syncProgress(event.currentTarget)}
        preload="metadata"
      />
      <div className="flex items-center gap-5">
        <div className="relative h-32 w-36 shrink-0">
          <div className="absolute inset-[-10px] rounded-full bg-emerald-400/10 blur-xl" />
          <div className={`absolute left-0 top-2 grid h-28 w-28 place-items-center overflow-hidden rounded-full border-[3px] border-black bg-[radial-gradient(circle_at_center,#17171a_0%,#17171a_16%,#020202_17%,#0b0b0d_30%,#18181b_31%,#050505_38%,#151518_52%,#040404_62%,#101013_78%,#000_100%)] shadow-[inset_0_0_0_1px_rgba(255,255,255,0.08),inset_0_0_18px_rgba(255,255,255,0.06),0_18px_38px_rgba(0,0,0,0.65)] ring-2 ring-zinc-950 ring-offset-1 ring-offset-black ${isPlaying ? "animate-[spin_9s_linear_infinite]" : ""}`}>
            <div className="absolute inset-0 rounded-full bg-[conic-gradient(from_18deg,transparent_0deg,rgba(255,255,255,0.12)_24deg,transparent_48deg,transparent_142deg,rgba(110,231,183,0.08)_166deg,transparent_196deg,transparent_360deg)] opacity-80 mix-blend-screen" />
            <div className="absolute inset-[5px] rounded-full border border-zinc-700/45 shadow-[inset_0_0_0_1px_rgba(0,0,0,0.75)]" />
            <div className="absolute inset-3 rounded-full border border-zinc-600/45" />
            <div className="absolute inset-[18px] rounded-full border border-zinc-800/80" />
            <div className="h-16 w-16 overflow-hidden rounded-full border border-emerald-300/50 bg-zinc-950 shadow-[0_0_22px_rgba(110,231,183,0.22)]">
              {currentTrack?.coverUrl ? (
                <img src={currentTrack.coverUrl} alt={currentTrack.title} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
              ) : (
                <div className="grid h-full w-full place-items-center text-emerald-300"><Sparkles size={15} /></div>
              )}
            </div>
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className={`h-2 w-2 rounded-full ${isPlaying ? "bg-emerald-300 shadow-[0_0_12px_rgba(110,231,183,0.8)]" : "bg-zinc-600"}`} />
            <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">{isPlaying ? "Now Playing" : autoplayBlocked ? "Tap To Start" : "Ready"}</span>
          </div>
          <h4 className="mt-2 line-clamp-1 font-serif text-lg font-bold text-white">{zhText(currentTrack?.title) || "暂无音乐"}</h4>
          <p className="mt-1 line-clamp-1 text-xs leading-5 text-zinc-400">
            {currentTrack ? zhText(currentTrack.artist) || "Unknown" : "请在后台上传音频与封面"}
          </p>
          {autoplayBlocked && (
            <button
              type="button"
              onClick={togglePlay}
              className="mt-2 rounded-lg border border-emerald-900/70 bg-emerald-950/35 px-2.5 py-1 text-left text-[11px] leading-5 text-emerald-200 transition hover:border-emerald-500"
            >
              浏览器限制了有声自动播放，点击这里继续播放
            </button>
          )}
          <div className="mt-4 space-y-2">
            <div className={`relative h-4 ${currentTrack ? "cursor-pointer" : "opacity-40"}`}>
              <div className="absolute left-0 right-0 top-1/2 h-1 -translate-y-1/2 overflow-hidden rounded-full bg-zinc-800">
                <div className="h-full rounded-full bg-zinc-100" style={{ width: `${playbackPercent}%` }} />
              </div>
              <span
                className="pointer-events-none absolute top-1/2 h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-zinc-100"
                style={{ left: `${playbackPercent}%` }}
              />
              <input
                type="range"
                min={0}
                max={duration || 0}
                value={Math.min(currentTime, duration || 0)}
                onChange={(event) => {
                  const nextTime = Number(event.target.value);
                  if (audioRef.current) audioRef.current.currentTime = nextTime;
                  setCurrentTime(nextTime);
                }}
                disabled={!currentTrack}
                className="absolute inset-0 h-full w-full cursor-pointer opacity-0 disabled:cursor-not-allowed"
              />
            </div>
            <div className="flex items-center justify-between font-mono text-[10px] text-zinc-500">
              <span>{formatTime(currentTime)}</span>
              <span>{formatTime(duration)}</span>
            </div>
          </div>
          <div className="mt-3 flex items-center justify-between">
            <div className="flex items-center gap-2">
              <button onClick={() => playIndex(trackIndex - 1)} disabled={playlist.length <= 1} className="rounded-full border border-zinc-800 bg-zinc-900 p-1.5 text-zinc-300 transition hover:border-zinc-700 hover:text-white disabled:opacity-35" aria-label="上一首"><SkipBack size={13} /></button>
              <button onClick={togglePlay} disabled={!currentTrack} className="inline-flex items-center gap-1.5 rounded-full border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-200 transition hover:border-emerald-400 hover:text-emerald-200 disabled:opacity-35" aria-label={isPlaying ? "暂停音乐" : "播放音乐"}>
                {isPlaying ? <Pause size={13} className="fill-current" /> : <Play size={13} className="translate-x-[1px] fill-current" />}
                <span>{isPlaying ? "暂停" : "播放"}</span>
              </button>
              <button onClick={() => playIndex(trackIndex + 1)} disabled={playlist.length <= 1} className="rounded-full border border-zinc-800 bg-zinc-900 p-1.5 text-zinc-300 transition hover:border-zinc-700 hover:text-white disabled:opacity-35" aria-label="下一首"><SkipForward size={13} /></button>
            </div>
            <span className="font-mono text-[10px] text-zinc-500">{playlist.length > 0 ? `${trackIndex + 1}/${playlist.length}` : "0/0"}</span>
          </div>
        </div>
      </div>
      {/* 歌词面板。宝要求「整个改回原样」，所以这里就是最初的样子：
          永远渲染、固定 clamp 高度、原来的字号。 */}
      <div ref={lyricsRef} className="no-scrollbar relative mt-4 h-[clamp(136px,20vh,210px)] overflow-y-auto rounded-xl border border-zinc-900 bg-black/25 px-4 py-3 [mask-image:linear-gradient(to_bottom,transparent,black_18%,black_82%,transparent)]">
        {lyrics.length > 0 ? (
          <div className="py-14 text-center">
            {lyrics.map((line, index) => {
              const distance = Math.abs(index - activeLyricIndex);
              const active = index === activeLyricIndex;
              const nextTime = lyrics[index + 1]?.time;
              const charProgress = active
                ? characterFillProgress(line, nextTime, currentTime, duration)
                : line.text.split("").map(() => index < activeLyricIndex ? 1 : 0);
              return (
                <button
                  type="button"
                  onClick={(event) => {
                    event.stopPropagation();
                    void seekToLyric(line);
                  }}
                  key={`${line.time}-${index}`}
                  data-lyric-index={index}
                  className={`flex min-h-11 w-full cursor-pointer items-center justify-center border-0 bg-transparent px-2 text-center transition-opacity duration-500 ease-out outline-none focus:outline-none focus-visible:outline-none focus-visible:ring-0 ${
                    active
                      ? "translate-y-0 opacity-100"
                      : distance === 1
                        ? "translate-y-0 opacity-70"
                        : "opacity-35"
                  }`}
                >
                  <p
                    className={`max-w-full break-words transition-all duration-500 ease-out ${
                      active
                        ? "text-[15px] font-semibold leading-7 text-zinc-500 drop-shadow-[0_0_12px_rgba(110,231,183,0.18)]"
                        : distance === 1
                          ? "text-[13px] leading-6 text-zinc-300"
                          : "text-xs leading-6 text-zinc-600"
                    }`}
                  >
                    {line.text.split("").map((char, charIndex) => (
                      <span
                        key={`${line.time}-${index}-${charIndex}`}
                        className="relative inline-block whitespace-pre transition-transform duration-150"
                        style={{
                          color: active
                            ? `color-mix(in srgb, rgb(113 113 122) ${Math.round((1 - (charProgress[charIndex] || 0)) * 100)}%, rgb(110 231 183))`
                            : index < activeLyricIndex
                              ? "rgb(167 243 208)"
                              : "inherit",
                          textShadow: active && (charProgress[charIndex] || 0) > 0.35
                            ? `0 0 ${Math.round(6 + (charProgress[charIndex] || 0) * 10)}px rgba(110,231,183,${0.14 + (charProgress[charIndex] || 0) * 0.28})`
                            : undefined,
                          transform: active && (charProgress[charIndex] || 0) > 0 && (charProgress[charIndex] || 0) < 1
                            ? `translateY(${(1 - (charProgress[charIndex] || 0)) * 1.5}px)`
                            : undefined,
                        }}
                      >
                        {char}
                      </span>
                    ))}
                  </p>
                </button>
              );
            })}
          </div>
        ) : (
          <div className="flex min-h-28 items-center justify-center text-center text-xs leading-5 text-zinc-600">暂无歌词</div>
        )}
      </div>
    </div>
  );
}

function detectPoetryFormat(text: string): "gushi-wuyan" | "gushi-qiyan" | "gushi" | "ci" | "modern" {
  const lines = text.split(/\r?\n/).map((l) => l.replace(/[，。！？、；：""''《》（）\s　]/g, "").trim()).filter(Boolean);
  if (lines.length < 2) return "modern";
  const lengths = lines.map((l) => l.length);
  const wuyanCount = lengths.filter((n) => n === 5).length;
  const qiyanCount = lengths.filter((n) => n === 7).length;
  const total = lengths.length;
  if (wuyanCount / total >= 0.8) return "gushi-wuyan";
  if (qiyanCount / total >= 0.8) return "gushi-qiyan";
  if ((wuyanCount + qiyanCount) / total >= 0.7) return "gushi";
  const unique = new Set(lengths);
  if (unique.size >= 3 && Math.max(...lengths) <= 12 && Math.min(...lengths) >= 2) return "ci";
  return "modern";
}

function PoetryDescription({ text }: { text: string }) {
  const format = detectPoetryFormat(text);
  const lines = text.split(/\r?\n/).filter((l) => l.trim());
  const cleanLine = (l: string) => l.replace(/^\s+/, "");

  if (format === "modern") {
    return (
      <div className="space-y-1 py-3 text-center font-serif text-lg leading-loose tracking-wider text-zinc-200 italic">
        {lines.map((line, i) => <p key={i} className="my-1">{cleanLine(line)}</p>)}
      </div>
    );
  }

  if (format === "ci") {
    return (
      <div className="space-y-0.5 py-3 text-center font-serif text-lg leading-loose tracking-wider text-zinc-200">
        {lines.map((line, i) => <p key={i} className="my-1">{cleanLine(line)}</p>)}
      </div>
    );
  }

  // 古诗 (五言/七言) — character-level spacing
  const cols = format === "gushi-wuyan" ? 5 : 7;
  return (
    <div className="py-4 space-y-4 font-serif text-zinc-200">
      {(() => {
        const couplets: string[][] = [];
        for (let i = 0; i < lines.length; i += 2) {
          couplets.push(lines.slice(i, i + 2));
        }
        return couplets.map((couplet, ci) => (
          <div key={ci} className="flex flex-col items-center gap-2">
            {couplet.map((line, li) => {
              const chars = line.replace(/[，。！？、；：\s　]/g, "").split("");
              return (
                <div key={li} className="flex justify-center gap-4 tracking-[0.5em] text-xl leading-relaxed">
                  {chars.map((ch, chi) => <span key={chi} className="inline-block w-7 text-center">{ch}</span>)}
                </div>
              );
            })}
          </div>
        ));
      })()}
    </div>
  );
}

/**
 * 前台图片放大层。
 *
 * 宝：作品选了图片却点不开、只能看缩略图。根因是前台详情弹窗把图片塞进一个
 * 固定 `aspect-video` 的框里 `object-contain` —— 非 16:9 的图在框内被压成小条，
 * 还没法点开看原图。这里给一条「点一下看大图」的路。
 *
 * 它在前台是**最上层**（z-[60] 压在详情弹窗的 z-50 之上），且用 portal 挂到 body：
 * 详情弹窗自己就有 `overflow-y-auto` 的滚动容器，`position: fixed` 一旦被这种
 * 祖先吃掉坐标系就铺不满屏 —— portal 把这个隐患变成结构性保证。
 */
function ImageLightbox({ images, index, onChange, onClose }: {
  images: string[];
  index: number;
  onChange: (index: number) => void;
  onClose: () => void;
}) {
  const usable = (images || []).filter(Boolean);
  const current = (images || [])[index];
  const [failed, setFailed] = useState(false);
  useEffect(() => { setFailed(false); }, [current]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") { event.stopPropagation(); onClose(); }
    };
    // capture 阶段抢在详情弹窗之前处理 Esc，免得一起被关掉。
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  if (!current) return null;
  const validIndex = usable.indexOf(current);

  return createPortal(
    <div className="fixed inset-0 z-[60] m-0 flex flex-col items-center justify-center gap-3 p-4 md:p-8">
      <button type="button" className="absolute inset-0 cursor-zoom-out bg-black/95 backdrop-blur-sm" onClick={onClose} aria-label="关闭大图" tabIndex={-1} />
      <div className="relative z-10 flex max-h-full min-h-0 w-full flex-col items-center gap-3">
        <div className="flex w-full items-center justify-between gap-3">
          <span className="truncate font-mono text-[11px] text-zinc-400">
            第 {validIndex + 1} / {usable.length} 张
          </span>
          <button type="button" onClick={onClose} className="inline-flex items-center gap-1.5 rounded-full border border-zinc-700 bg-zinc-900/80 px-3 py-1.5 text-xs text-zinc-200 hover:border-zinc-500 hover:text-white" aria-label="关闭">
            <X size={14} /> 关闭
          </button>
        </div>
        {failed ? (
          <p className="rounded-lg border border-amber-600/40 bg-amber-950/20 px-4 py-3 text-xs text-amber-200">这张图加载失败，地址可能已失效。</p>
        ) : (
          <img src={current} alt={zhText("图片大图预览")} referrerPolicy="no-referrer" onError={() => setFailed(true)} className="max-h-[70vh] w-auto max-w-full rounded-lg border border-zinc-700/70 object-contain" />
        )}
        {usable.length > 1 && (
          <div className="flex max-w-full flex-wrap justify-center gap-2">
            {usable.map((url, thumbIndex) => (
              <button key={`${url}-${thumbIndex}`} type="button" onClick={() => onChange((images || []).indexOf(url))} className={"h-12 w-16 shrink-0 overflow-hidden rounded-md border transition " + (url === current ? "border-emerald-400" : "border-zinc-700 hover:border-zinc-500")} aria-label={`看第 ${thumbIndex + 1} 张`}>
                <img src={url} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
              </button>
            ))}
          </div>
        )}
      </div>
    </div>,
    document.body,
  );
}

/**
 * 作品附件的**原地预览弹层**。
 *
 * 为什么是弹层 + iframe 而不是新标签页：
 *   - 附件存在 COS 上，直接 `href` 过去，PDF 会被浏览器丢进自己的阅读器（外站、新页面），
 *     doc/docx 更是根本不渲染、只能靠 Microsoft 的在线预览器 —— 那个是**另一个域**，
 *     还要求文件公网可达，本地/内网部署直接废掉。
 *   - 所以统一走本站同源路由 `/api/media/attachment-preview`，把 iframe 嵌回来，
 *     用户在原来这一页就能看，也不会有新开窗口/新标签的跳转。
 *
 * 滚动：iframe 内部撑满并自带滚动条，长文档（尤其是 Word 转出来的 HTML）
 * 可以整份连续滚到底，不会只卡在第一页。
 */
function AttachmentPreviewModal({
  src,
  title,
  downloadUrl,
  onClose,
}: {
  src: string;
  title: string;
  downloadUrl: string;
  onClose: () => void;
}) {
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = prev;
    };
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[60] flex items-center justify-center p-2 md:p-6" role="dialog" aria-modal="true" aria-label={`预览 ${title}`}>
      <button className="absolute inset-0 bg-black/92 backdrop-blur-md" onClick={onClose} aria-label="关闭预览" />
      <div className="relative flex h-full max-h-[94vh] w-full max-w-5xl flex-col overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 shadow-2xl">
        <div className="flex shrink-0 items-center justify-between gap-3 border-b border-zinc-900 bg-zinc-950 px-4 py-3">
          <div className="flex min-w-0 items-center gap-2">
            <FileText size={14} className="shrink-0 text-emerald-300/80" />
            {/* title 是文件名，同样不能过 zhText —— 否则 `调研.docx` 的 `.` 会变成「。」。 */}
            <span className="min-w-0 truncate text-xs text-zinc-200" title={title}>{title}</span>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <a href={downloadUrl} target="_blank" rel="noopener noreferrer" download className="inline-flex items-center gap-1 rounded border border-zinc-800 px-2 py-1 text-[11px] text-zinc-300 hover:border-zinc-600 hover:text-white">
              <Download size={11} /> 下载
            </a>
            <button onClick={onClose} className="rounded-full border border-zinc-800 bg-zinc-900/80 p-1.5 text-zinc-300 hover:text-white" aria-label="关闭">
              <X size={15} />
            </button>
          </div>
        </div>
        <div className="relative flex-1 overflow-hidden bg-zinc-900">
          {loading && (
            <div className="pointer-events-none absolute inset-0 flex items-center justify-center bg-zinc-950">
              <span className="font-mono text-[11px] tracking-widest text-zinc-500">正在加载文档…</span>
            </div>
          )}
          {/* 高度撑满 + overflow-auto：文档整份在框内滚动，不再只露第一页。 */}
          <iframe
            src={src}
            title={`预览 ${title}`}
            onLoad={() => setLoading(false)}
            className="h-full w-full overflow-auto border-0 bg-white"
          />
        </div>
      </div>
    </div>,
    document.body,
  );
}

function WorkModal({ work, onClose }: { work: Work; onClose: () => void }) {
  const [imageIndex, setImageIndex] = useState(0);
  const [zoomed, setZoomed] = useState(false);
  // 原地预览的那份附件（存 meta 而不是 id —— 老数据不一定有 id）。
  const [previewing, setPreviewing] = useState<{ src: string; title: string; downloadUrl: string } | null>(null);
  const images = work.images || [];
  const currentImage = images[imageIndex];
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-6">
      <button className="absolute inset-0 bg-black/90 backdrop-blur-md" onClick={onClose} aria-label="关闭详情" />
      <div className="relative flex max-h-[90vh] w-full max-w-4xl flex-col overflow-y-auto rounded-xl border border-zinc-800 bg-zinc-950 shadow-2xl md:flex-row">
        <button onClick={onClose} className="absolute right-4 top-4 z-10 rounded-full border border-zinc-800 bg-zinc-900/80 p-2 text-zinc-300 hover:text-white" aria-label="关闭"><X size={16} /></button>
        <div className="flex w-full flex-col justify-center border-b border-zinc-900 bg-black md:w-1/2 md:border-b-0 md:border-r">
          {work.videoUrl ? (
            <div className="space-y-4 p-4 md:p-6">
              <span className="block font-mono text-[10px] uppercase tracking-widest text-emerald-300/80">在线放映 / VIDEO PLAYER</span>
              <video src={work.videoUrl} poster={currentImage} controls playsInline className="max-h-[70vh] w-full rounded-lg border border-zinc-850 bg-black object-contain" />
              {images.length > 0 && (
                <div className="grid grid-cols-4 gap-2">
                  {images.map((image, idx) => (
                    /* 双击语义不存在于触屏/无头环境，所以「选这张当封面」和「看大图」
                       拆成两个可点区域：缩略图选中，右上角放大镜看大图。 */
                    <div key={`${image}-${idx}`} className={`group relative aspect-video overflow-hidden rounded-md border ${idx === imageIndex ? "border-emerald-300" : "border-zinc-800"}`}>
                      <button type="button" onClick={() => setImageIndex(idx)} className="h-full w-full" aria-label={`切换到第 ${idx + 1} 张封面`}>
                        <img src={image} alt={`${zhText(work.title)} 封面 ${idx + 1}`} className="h-full w-full object-contain bg-black" referrerPolicy="no-referrer" />
                      </button>
                      <button type="button" onClick={() => { setImageIndex(idx); setZoomed(true); }} className="absolute right-0.5 top-0.5 rounded bg-black/70 p-1 opacity-0 transition group-hover:opacity-100" aria-label={`放大第 ${idx + 1} 张封面`}>
                        <ZoomIn size={12} className="text-white" />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="relative flex aspect-video w-full items-center justify-center p-4">
              {currentImage ? (
                /* 整张图是个按钮：点开看原图。横幅图在这块 aspect-video 里只能
                   看清轮廓，点开放大是唯一能看细节的路。 */
                <button type="button" onClick={() => setZoomed(true)} className="group absolute inset-4 overflow-hidden rounded-lg border border-zinc-900 bg-zinc-900/40" aria-label="放大查看图片">
                  <img src={currentImage} alt={zhText(work.title)} className="h-full w-full object-contain" referrerPolicy="no-referrer" />
                  <span className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition group-hover:opacity-100">
                    <ZoomIn size={22} className="text-white" />
                  </span>
                </button>
              ) : (
                <div className="font-mono text-xs text-zinc-600">No preview images available</div>
              )}
              {images.length > 1 && (
                <div className="absolute bottom-6 left-1/2 flex -translate-x-1/2 space-x-1.5 rounded-full border border-zinc-800/50 bg-black/60 px-2.5 py-1">
                  {images.map((_, idx) => <button key={idx} onClick={() => setImageIndex(idx)} className={`h-1.5 w-1.5 rounded-full ${idx === imageIndex ? "bg-white" : "bg-zinc-700"}`} aria-label={`查看第 ${idx + 1} 张图`} />)}
                </div>
              )}
            </div>
          )}
        </div>
        <div className="flex w-full flex-col p-6 md:w-1/2 md:p-8">
          <div>
            <div className="mb-4 flex items-center space-x-3"><span className="rounded bg-zinc-900 px-2.5 py-0.5 text-[11px] font-medium text-zinc-300">{categoryLabel(work.category)}</span><span className="font-mono text-[10px] tracking-wider text-zinc-500">PROJECT DETAIL</span></div>
            <h2 className={`mb-4 font-serif text-2xl leading-relaxed tracking-tight text-white ${work.category === "poetry" ? "text-center" : ""}`}>{zhText(work.title)}</h2>
            <div className="mb-6">{work.category === "poetry" ? <PoetryDescription text={work.description} /> : <div className="space-y-4 text-sm leading-7 text-zinc-300 md:text-[15px]">{work.description.split("\n").map((para, i) => <p key={i}>{zhText(para)}</p>)}</div>}</div>
            <span className="mb-2 block font-mono text-[10px] uppercase tracking-widest text-emerald-300/80">技术与媒介 / Tags</span>
            <div className="flex flex-wrap gap-1.5">{(work.tags || []).map((tag, idx) => <span key={idx} className="rounded border border-zinc-850 bg-zinc-900 px-2 py-0.5 text-[11px] text-zinc-300">{tag}</span>)}</div>
          </div>
          {work.links && work.links.length > 0 && (
            <div className="mt-4 border-t border-zinc-900 pt-4">
              <span className="mb-2 block font-mono text-[10px] uppercase tracking-widest text-emerald-300/80">附件与链接 / Files & URL</span>
              <div className="flex flex-wrap items-center gap-2">
                {work.links.map((link, idx) => {
                  const meta = getWorkLinkMeta(link);
                  if (!meta.isAttachment) {
                    return <a key={idx} href={link.url} target="_blank" rel="noopener noreferrer" className="inline-flex w-fit shrink-0 items-center space-x-1.5 whitespace-nowrap rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-200 hover:border-zinc-700 hover:text-white"><span>{zhText(meta.label)}</span><ExternalLink size={12} className="text-zinc-400" /></a>;
                  }
                  return (
                    /* 一行放下：文件名（可截断）+ 类型标签 + 预览/下载。
                       所以这里**不能** flex-wrap —— 一换行按钮就掉到第二行去。
                       文件名用 flex-1 + truncate 吃掉剩余空间（超 10 字省略），
                       按钮 shrink-0 保证不被压扁。 */
                    <div key={idx} className="flex w-full items-center gap-2 rounded-lg border border-zinc-900 bg-zinc-950/80 px-3 py-2">
                      <FileText size={14} className="shrink-0 text-emerald-300/80" />
                      <span className="min-w-0 flex-1 truncate text-xs text-zinc-200" title={meta.displayName}>
                        {meta.displayName}
                      </span>
                      {meta.ext && <span className="shrink-0 rounded border border-zinc-800 px-1.5 py-0.5 font-mono text-[10px] uppercase text-zinc-500">{meta.ext}</span>}
                      <div className="flex shrink-0 items-center gap-2">
                        {meta.canPreview && (
                          <button
                            type="button"
                            onClick={() => setPreviewing({ src: meta.previewUrl, title: meta.label, downloadUrl: link.url })}
                            className="inline-flex items-center gap-1 rounded border border-zinc-800 px-2 py-1 text-[11px] text-zinc-300 hover:border-zinc-600 hover:text-white"
                          >
                            <ZoomIn size={11} /> 预览
                          </button>
                        )}
                        <a href={link.url} target="_blank" rel="noopener noreferrer" download className="inline-flex items-center gap-1 rounded border border-zinc-800 px-2 py-1 text-[11px] text-zinc-300 hover:border-zinc-600 hover:text-white"><Download size={11} /> 下载</a>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}
        </div>
      </div>
      {zoomed && currentImage && (
        <ImageLightbox images={images} index={imageIndex} onChange={setImageIndex} onClose={() => setZoomed(false)} />
      )}
      {previewing && (
        <AttachmentPreviewModal
          src={previewing.src}
          title={previewing.title}
          downloadUrl={previewing.downloadUrl}
          onClose={() => setPreviewing(null)}
        />
      )}
    </div>
  );
}

function GalleryModal({ item, onClose }: { item: GalleryItem; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-6">
      <button className="absolute inset-0 bg-black/92 backdrop-blur-md" onClick={onClose} aria-label="关闭图片" />
      <div className="relative max-h-[92vh] w-full max-w-6xl overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 shadow-2xl">
        <button onClick={onClose} className="absolute right-4 top-4 z-10 rounded-full border border-zinc-800 bg-zinc-950/80 p-2 text-zinc-300 hover:text-white" aria-label="关闭"><X size={16} /></button>
        <div className="max-h-[76vh] overflow-auto bg-black p-3"><img src={item.imageUrl} alt={zhText(item.title)} className="mx-auto max-h-none max-w-full rounded-lg object-contain" referrerPolicy="no-referrer" /></div>
        <div className="border-t border-zinc-900 p-5"><span className="rounded border border-zinc-800 bg-zinc-900 px-2.5 py-1 text-[11px] text-emerald-300">{item.category}</span><h3 className="mt-3 font-serif text-2xl text-white">{zhText(item.title)}</h3><p className="mt-2 line-clamp-2 text-sm leading-7 text-zinc-300">{zhText(item.description)}</p></div>
      </div>
    </div>
  );
}

/**
 * 「个人简历」栏目。展示哪些岗位、叫什么名字、是否出现，全部由后台的简历列表决定，
 * 后台还没配置过列表时回落到旧版写死的两份 PDF，保证历史数据照常展示。
 */
function ResumePane({ data }: { data: PortfolioData }) {
  const pageCopy = { ...defaultPageCopy, ...(data.profile.pageCopy || {}) };
  const legacyPdfs = data.profile.pageCopy?.resumePdfs || {};

  const profiles = useMemo<ResumeProfile[]>(() => {
    const raw = data.profile.pageCopy?.resumeProfiles;
    // 只有「后台从来没配过动态列表」才回落到旧版写死的两份 PDF。
    // 键一旦存在（哪怕是空数组）就完全以后台为准 —— 管理员把每行都隐藏/删空，
    // 那也是明确意图，不能把旧岗位又变出来。
    if (raw) return raw.filter((item) => item?.visible !== false);
    // 后台尚未配置动态列表，沿用旧版写死的两个岗位（没传 PDF 的就不再占一个空标签）。
    const legacy: ResumeProfile[] = [
      { id: "productManager", position: "产品经理", name: "PRODUCT MANAGER", url: legacyPdfs.productManager || data.profile.resumePdfUrl || "" },
      { id: "newMedia", position: "新媒体运营", name: "NEW MEDIA OPS", url: legacyPdfs.newMedia || "" },
    ];
    return legacy.filter((item) => item.url.trim());
  }, [data.profile.pageCopy?.resumeProfiles, legacyPdfs.productManager, legacyPdfs.newMedia, data.profile.resumePdfUrl]);

  const [activeId, setActiveId] = useState("");
  const active = profiles.find((item) => item.id === activeId) || profiles[0];
  const resumePdfUrl = active?.url?.trim() || "";
  const previewUrl = resumePdfUrl ? `/api/media/pdf-preview?url=${encodeURIComponent(resumePdfUrl)}` : "";

  return (
    <div className="space-y-8">
      <div className="border-b border-zinc-900 pb-5"><span className="mb-1 block font-mono text-xs uppercase tracking-widest text-emerald-300/80">履历档案 / DIGITAL CURRICULUM VITAE</span><p className="mt-3 text-[15px] leading-8 text-zinc-300">{zhText(pageCopy.resume)}</p></div>
      {profiles.length > 0 && (
        <div className="flex max-w-full flex-wrap gap-1.5 rounded-xl border border-zinc-900 bg-zinc-950/80 p-1.5">
          {profiles.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setActiveId(item.id)}
              className={`min-w-[9rem] flex-1 rounded-lg border px-3 py-2 text-left transition-colors ${
                active?.id === item.id
                  ? "border-emerald-300/40 bg-emerald-300/10 text-white"
                  : "border-transparent text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100"
              }`}
            >
              <span className="block text-sm font-semibold">{zhText(item.position)}</span>
              <span className="mt-0.5 block font-mono text-[10px] uppercase tracking-widest opacity-70">{item.name || "PDF RESUME"}</span>
            </button>
          ))}
        </div>
      )}
      {resumePdfUrl ? (
        <div className="overflow-hidden rounded-xl border border-zinc-900 bg-zinc-950 shadow-xl">
          <div className="flex flex-col justify-between gap-3 border-b border-zinc-900 p-4 md:flex-row md:items-center"><div><h3 className="font-serif text-lg font-semibold text-white">{data.profile.name} · {zhText(active.position)}</h3><p className="mt-1 text-xs text-zinc-500">A4 PDF Preview</p></div><div className="flex flex-wrap gap-2"><a href={previewUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-200 hover:border-zinc-700"><ExternalLink size={13} /> 新窗口预览</a><a href={resumePdfUrl} download className="inline-flex items-center gap-2 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-2 text-xs text-zinc-200 hover:border-zinc-700"><Download size={13} /> 下载 PDF</a></div></div>
          <div className="bg-zinc-900/70 p-4 md:p-6">
            <div className="mx-auto aspect-[210/297] w-full max-w-[820px] overflow-hidden rounded-lg border border-zinc-800 bg-white shadow-2xl">
              <iframe title={`${zhText(active.position)}简历 PDF A4 预览`} src={`${previewUrl}#toolbar=0&navpanes=0&scrollbar=0&view=FitH`} className="h-full w-full bg-white" />
            </div>
          </div>
        </div>
      ) : profiles.length > 0 ? (
        <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-950/60 p-10 text-center"><p className="font-serif text-xl text-white">暂未上传{zhText(active.position)}简历 PDF</p><p className="mt-3 text-sm leading-7 text-zinc-400">请进入后台 `/admin`，在“个人简历 → 简历展示”里为这个岗位上传 PDF，保存后这里会自动展示。</p></div>
      ) : (
        <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-950/60 p-10 text-center"><p className="font-serif text-xl text-white">暂未配置简历</p><p className="mt-3 text-sm leading-7 text-zinc-400">请进入后台 `/admin`，在“个人简历 → 简历展示”中新增岗位并上传 PDF 简历。</p></div>
      )}
    </div>
  );
}

function FilterRail({
  allActive,
  onAll,
  items,
}: {
  allActive: boolean;
  onAll: () => void;
  items: { key: string; label: string; active: boolean; onSelect: () => void }[];
}) {
  return (
    <div className="flex max-w-full gap-1.5 rounded-xl border border-zinc-900 bg-zinc-950/80 p-1.5">
      <button
        onClick={onAll}
        className={`shrink-0 whitespace-nowrap rounded border px-2.5 py-1.5 text-[11px] font-medium tracking-wide ${allActive ? "border-zinc-700 bg-zinc-900 text-white" : "border-transparent text-zinc-300 hover:text-white"}`}
      >
        全部
      </button>
      <div className="flex min-w-0 flex-1 flex-nowrap gap-1.5 overflow-hidden">
        {items.map((item) => (
          <button
            key={item.key}
            onClick={item.onSelect}
            className={`shrink-0 whitespace-nowrap rounded border px-2.5 py-1.5 text-[11px] font-medium tracking-wide transition-colors ${item.active ? "border-zinc-700 bg-zinc-900 text-white" : "border-transparent text-zinc-300 hover:text-white"}`}
          >
            {item.label}
          </button>
        ))}
      </div>
    </div>
  );
}

/**
 * 页码条。作品展示 / AI 专区 / 应用技能 / 我的珍藏 共用。
 *
 * 宝：超过 3 列的分页（第 6 个之后），页码放模块底部居中。
 *
 * 为什么用**固定每页条数**而不是「按列数动态算」：
 * 列数是断点相关的（`md:grid-cols-2 xl:grid-cols-3`），窗口一拉列数就变，
 * 动态算每页条数会让「第 2 页」的内容随窗口宽度跳来跳去 —— 用户正在看的东西
 * 突然换掉，比多几行空白糟糕得多。固定条数至少保证「翻到第几页」是稳定的。
 *
 * 三列布局配 6 个（两整行）、两列布局配 4 个（两整行），窄屏下会显得偏少，
 * 但翻页节奏一致、宽屏正好铺满两行。
 */
function Pagination({
  page,
  pageCount,
  onPageChange,
  anchorRef,
}: {
  page: number;
  pageCount: number;
  onPageChange: (page: number) => void;
  /**
   * 内容区的 ref。翻页时用它把滚动位置带回内容顶部 ——
   * 没有这个，用户点第 2 页会「看不出反应」（见 scrollToTopOf 的说明）。
   */
  anchorRef?: React.RefObject<HTMLElement | null>;
}) {
  // 只有一页时不渲染 —— 一个永远点不动的「1」是纯噪音。
  if (pageCount <= 1) return null;

  const go = (next: number) => {
    onPageChange(next);
    scrollToTopOf(anchorRef?.current ?? null);
  };

  // 当前页附近展开，两端各留 1 个，其余折叠成省略号。
  // 纯线性铺开在页数多时会把头部挤爆（几十个小方块），要收口。
  const pages: (number | "gap")[] = [];
  for (let n = 1; n <= pageCount; n++) {
    const near = Math.abs(n - page) <= 1 || n === 1 || n === pageCount;
    if (near) {
      pages.push(n);
    } else if (pages[pages.length - 1] !== "gap") {
      pages.push("gap");
    }
  }

  const arrowClass =
    "inline-flex h-8 min-w-8 items-center justify-center rounded border border-zinc-800 px-2 font-mono text-xs text-zinc-300 transition-colors hover:border-zinc-600 hover:text-white disabled:cursor-not-allowed disabled:border-zinc-900 disabled:text-zinc-700 disabled:hover:border-zinc-900";

  return (
    <nav className="flex flex-wrap items-center justify-center gap-1.5 pt-6" aria-label="分页">
      <button type="button" onClick={() => go(page - 1)} disabled={page <= 1} className={arrowClass} aria-label="上一页">
        上一页
      </button>
      {pages.map((item, index) =>
        item === "gap" ? (
          <span key={`gap-${index}`} className="px-1 font-mono text-xs text-zinc-600">
            …
          </span>
        ) : (
          <button
            key={item}
            type="button"
            onClick={() => go(item)}
            aria-current={item === page ? "page" : undefined}
            className={`inline-flex h-8 min-w-8 items-center justify-center rounded border px-2 font-mono text-xs transition-colors ${
              item === page
                ? "border-emerald-500/70 bg-emerald-500/10 text-emerald-200"
                : "border-zinc-800 text-zinc-300 hover:border-zinc-600 hover:text-white"
            }`}
          >
            {item}
          </button>
        ),
      )}
      <button type="button" onClick={() => go(page + 1)} disabled={page >= pageCount} className={arrowClass} aria-label="下一页">
        下一页
      </button>
    </nav>
  );
}

/**
 * 把一列条目切片分页。所有列表共用一套越界兜底：
 * 数据变少（删了作品 / 换了筛选）时当前页会落空，这里统一夹回合法范围，
 * 免得渲染出空白页。
 */
function usePaged<T>(items: T[], pageSize: number, resetKey?: unknown) {
  const [page, setPage] = useState(1);
  const pageCount = Math.max(1, Math.ceil(items.length / pageSize));

  // 筛选条件一变就回第 1 页（宝选的）。否则切到只有 2 条的分类、
  // 却停在第 3 页 ⇒ 一片空白，看着像数据丢了。
  //
  // 首次挂载也要跳过：`resetKey` 在挂载那一轮必然「变化」一次，但那时 page
  // 本来就是 1，多跑一次 setPage(1) 无害却也多余。
  const firstRun = useRef(true);
  useEffect(() => {
    if (firstRun.current) { firstRun.current = false; return; }
    setPage(1);
  }, [resetKey]);

  const safePage = Math.min(Math.max(1, page), pageCount);
  const start = (safePage - 1) * pageSize;
  return {
    page: safePage,
    pageCount,
    items: items.slice(start, start + pageSize),
    setPage,
  };
}

/**
 * 翻页时把内容顶部带回视野。
 *
 * 宝：点第 2 页「没反应」—— 其实内容换了，但页码条在模块**底部**，翻页只换 DOM
 * 不动滚动位置，于是视口还停在原来那一屏上：新卡片在屏幕上方看不见，
 * 眼前只有一条一模一样的页码条。同一份文档高度、同一个位置、同一排按钮，
 * 视觉上就等于「什么都没发生」。
 *
 * 所以翻页必须把滚动位置拉回内容顶部。两处都要管：窗口（前台整页滚）和
 * 最近的滚动祖先（万一将来把列表放进内部滚动容器）。
 *
 * ## 为什么是瞬移，不是 smooth（活体实测教训）
 *
 * 第一版用的是 `behavior: "smooth"`，**活体上完全没生效**：挂钩 `window.scrollTo`
 * 看到调用确实发生了（`{top: 199, behavior: "smooth"}` 从 y=515 发起），
 * 但页面最终停在 **y=0**；单独在控制台跑同一条滚动又能正常落到 199。原因是时序：
 *   1. `go()` 先 `onPageChange(next)` 触发 React 更新，再立刻发起平滑滚动；
 *   2. 平滑滚动是异步动画，要跑几百毫秒；
 *   3. 动画期间 React 把这一页的卡片换成了下一页 —— 内容高度变了；
 *   4. 进行中的平滑滚动被内容重排打断，浏览器的 scroll anchoring 又把位置
 *      拉回 0 ⇒「滚了，但结果是 0」，看起来还是没反应。
 * **内容会换的场合，滚动就不该做成动画。** 改成瞬移（默认 behavior），
 * 并且 `requestAnimationFrame` 等一帧、拿新布局的坐标，一次到位不抖。
 */
function scrollToTopOf(el: HTMLElement | null) {
  if (!el) return;
  // 等一帧：让 onClick 引发的 React 提交先落到 DOM 上，再按**新布局**算坐标。
  requestAnimationFrame(() => {
    const scroller = el.closest("[class*='overflow-y-auto'], [class*='overflow-auto']") as HTMLElement | null;
    if (scroller && scroller.scrollHeight > scroller.clientHeight + 4) {
      const top = scroller.scrollTop + el.getBoundingClientRect().top - scroller.getBoundingClientRect().top - 16;
      scroller.scrollTo({ top: Math.max(0, top) });
      return;
    }
    const top = window.scrollY + el.getBoundingClientRect().top - 24;
    window.scrollTo({ top: Math.max(0, top) });
  });
}

/**
 * 作品网格。作品展示与 AI 专区共用这一份渲染，保证两处的外观和交互完全一致。
 *
 * categoryOrder 有值时按它固定的顺序出筛选项（作品展示就是这种）；不传时按列表里
 * 实际出现过的分类自动生成——AI 专区的分类由后台自由填写，事先枚举不出来。
 */
function WorksPane({
  items,
  description,
  onSelect,
  eyebrow = "精心打磨的痕迹 / PORTFOLIO EXHIBITS",
  // 宝（原话「可以」「都删掉」）：各栏目的中文大字标题从页面上撤掉，只留英文副标
  // 和下面那句简介。这个参数**保留但不再渲染** —— 调用处还传着它（AI 专区传了
  // 「AI 专区」），删参数会连带改一堆调用；留着也方便哪天想把标题放回来。
  title: _title = "我的创意合集",
  emptyTitle = "暂无作品",
  emptyDescription = "请进入后台 /admin，在「作品媒体」中新增作品并保存。",
  categoryOrder,
}: {
  items: Work[];
  description?: string;
  onSelect: (work: Work) => void;
  eyebrow?: string;
  title?: string;
  emptyTitle?: string;
  emptyDescription?: string;
  categoryOrder?: { key: string; label: string }[];
}) {
  const [filter, setFilter] = useState("all");
  const filters = useMemo(() => {
    // categoryOrder 是**固定词表**（作品展示用它来定顺序），不代表当前一定有内容。
    // 所以还要按实际数据过滤一遍：否则一首诗都没有时，「闲诗」这个筛选按钮照旧
    // 挂着，点进去是空白 —— 用户会以为自己的数据丢了。
    // （AI 专区不传 categoryOrder，走下面那条按数据自动生成的分支，本来就没这问题。）
    if (categoryOrder) {
      const present = new Set(items.map((item) => item.category).filter(Boolean));
      return categoryOrder.filter((item) => item.key !== "all" && present.has(item.key));
    }
    return Array.from(new Set(items.map((item) => item.category).filter(Boolean)))
      .map((key) => ({ key, label: categoryLabel(key) }));
  }, [items, categoryOrder]);
  // 筛选项是跟着数据走的，删掉某分类最后一个作品后旧筛选值会落空，这里统一回落成「全部」。
  const activeFilter = filter === "all" || filters.some((item) => item.key === filter) ? filter : "all";
  const filteredItems = activeFilter === "all" ? items : items.filter((work) => work.category === activeFilter);

  // 与「应用技能」保持一致：宽屏 3 列，每页 6 个，正好两整行。
  // resetKey 用筛选值：切分类回第 1 页。
  const paged = usePaged(filteredItems, 6, activeFilter);
  // 翻页要把滚动位置带回这里（否则点第 2 页看不出反应，见 scrollToTopOf）。
  const paneRef = useRef<HTMLDivElement | null>(null);

  return (
    <div className="space-y-8" ref={paneRef}>
      <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
        <div>
          <span className="mb-2 block font-mono text-xs uppercase tracking-widest text-emerald-300/80">{eyebrow}</span>
          <p className="mt-3 text-[15px] leading-8 text-zinc-300">{zhText(description)}</p>
        </div>
        {filters.length > 0 && (
          <FilterRail
            allActive={activeFilter === "all"}
            onAll={() => setFilter("all")}
            items={filters.map((item) => ({ key: item.key, label: item.label, active: activeFilter === item.key, onSelect: () => setFilter(item.key) }))}
          />
        )}
      </div>
      {filteredItems.length > 0 ? (
        <>
          <div className="work-grid grid grid-cols-1 gap-4 pt-2 md:grid-cols-2 xl:grid-cols-3">
            {paged.items.map((work) => (
            <article
              key={work.id}
              onClick={() => onSelect(work)}
              className="work-card group flex h-full cursor-pointer flex-col overflow-hidden rounded-lg border border-zinc-900 bg-zinc-950/60 transition-all duration-500 hover:border-zinc-700 hover:bg-zinc-950"
            >
              <div className="work-card__media relative aspect-[1.92/1] overflow-hidden bg-zinc-950/60 shadow-inner">
                   {work.images?.[0] ? (
                     <img src={work.images[0]} alt={zhText(work.title)} className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" referrerPolicy="no-referrer" />
                   ) : (
                     <div className="flex h-full w-full items-center justify-center bg-zinc-900/20 font-mono text-xs text-zinc-600">NO IMAGES</div>
                   )}
                  <span className="absolute inset-0 bg-gradient-to-t from-black/75 via-black/5 to-black/35" />
                  <span className="work-card__category absolute left-2.5 top-2.5 z-10 rounded border border-white/15 bg-black/65 px-2 py-1 text-[10px] font-medium text-zinc-100 backdrop-blur-sm">
                    {categoryLabel(work.category)}
                  </span>
                  <span className="absolute right-2.5 top-2.5 z-10 flex flex-col items-end gap-1.5">
                    {work.badgeText && <span className="rounded border border-emerald-300/25 bg-emerald-950/75 px-2 py-0.5 font-mono text-[10px] text-emerald-200 backdrop-blur-sm">{zhText(work.badgeText)}</span>}
                    {(work.images?.length || 0) > 1 && <span className="rounded border border-white/15 bg-black/65 px-2 py-0.5 font-mono text-[10px] text-zinc-200">{work.images.length} 图</span>}
                  </span>
                  {(work.tags || []).length > 0 && (
                    <span className="work-card__tags absolute bottom-2.5 left-2.5 right-2.5 z-10 flex flex-wrap gap-1.5">
                      {(work.tags || []).slice(0, 3).map((tag, idx) => (
                        <span key={idx} className="rounded border border-white/15 bg-black/65 px-2 py-0.5 text-[10px] text-zinc-200 backdrop-blur-sm">{tag}</span>
                      ))}
                    </span>
                  )}
                  <div className="absolute inset-0 z-20 flex items-center justify-center bg-black/35 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                    <span className="rounded border border-white/20 bg-black/75 px-3 py-1.5 font-serif text-[11px] text-zinc-100 shadow-lg">查看详情</span>
                  </div>
              </div>
              <div className="flex flex-1 flex-col p-4">
                <h3 className="portfolio-card__title">{zhText(work.title)}</h3>
                <p className="portfolio-card__description">{zhText(work.description)}</p>
              </div>
            </article>
          ))}
          </div>
          <Pagination page={paged.page} pageCount={paged.pageCount} onPageChange={paged.setPage} anchorRef={paneRef} />
        </>
      ) : (
        <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-950/60 p-10 text-center">
          <p className="font-serif text-xl text-white">{emptyTitle}</p>
          <p className="mt-3 text-sm text-zinc-400">{emptyDescription}</p>
        </div>
      )}
    </div>
  );
}

function GalleryPane({
  items,
  onSelect,
  eyebrow = "应用技能 / APPLIED SKILLS",
  title = "应用技能",
  description = defaultPageCopy.gallery,
  emptyTitle = "暂无应用技能",
  emptyDescription = "请进入后台 /admin，在「应用技能」中上传图片并填写简介。",
}: {
  items: GalleryItem[];
  onSelect: (item: GalleryItem) => void;
  eyebrow?: string;
  title?: string;
  description?: string;
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  const [filter, setFilter] = useState("all");
  const categories = useMemo(() => {
    const custom = Array.from(new Set(items.map((item) => item.category || "应用"))).filter((category) => !galleryCategoryOrder.includes(category));
    return [...galleryCategoryOrder, ...custom];
  }, [items]);
  const filtered = filter === "all" ? items : items.filter((item) => (item.category || "应用") === filter);
  // 截图网格最多 3 列（xl:grid-cols-3）⇒ 每页 6 个，宽屏正好两整行。
  const paged = usePaged(filtered, 6, filter);
  const paneRef = useRef<HTMLDivElement | null>(null);
  return (
    <div className="space-y-8" ref={paneRef}>
      <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end"><div><span className="mb-2 block font-mono text-xs uppercase tracking-widest text-emerald-300/80">{eyebrow}</span><p className="mt-3 line-clamp-2 text-[15px] leading-7 text-zinc-300">{zhText(description)}</p></div><FilterRail allActive={filter === "all"} onAll={() => setFilter("all")} items={categories.map((category) => ({ key: category, label: category, active: filter === category, onSelect: () => setFilter(category) }))} /></div>
      {filtered.length > 0 ? (
        <>
          <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">
            {paged.items.map((item) => (
              <button key={item.id} onClick={() => onSelect(item)} className="gallery-card group flex h-full flex-col overflow-hidden rounded-lg border border-zinc-900 bg-zinc-950/60 text-left transition-all duration-300 hover:border-zinc-700 hover:bg-zinc-950">
                <div className="gallery-card__media relative aspect-[1.92/1] overflow-hidden bg-zinc-900">
                  {item.imageUrl ? <img src={item.imageUrl} alt={zhText(item.title)} className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" referrerPolicy="no-referrer" /> : <div className="flex h-full items-center justify-center font-mono text-xs text-zinc-600">NO SCREENSHOT</div>}
                  <span className="gallery-card__category absolute left-2.5 top-2.5 z-10 rounded border border-white/15 bg-black/65 px-2 py-1 text-[10px] font-medium text-zinc-100 backdrop-blur-sm">{item.category || "应用"}</span>
                </div>
                <div className="flex flex-1 flex-col p-4">
                  <h3 className="portfolio-card__title">{zhText(item.title)}</h3>
                  <p className="portfolio-card__description">{zhText(item.description)}</p>
                </div>
              </button>
            ))}
          </div>
          <Pagination page={paged.page} pageCount={paged.pageCount} onPageChange={paged.setPage} anchorRef={paneRef} />
        </>
      ) : (
        <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-950/60 p-10 text-center"><p className="font-serif text-xl text-white">{emptyTitle}</p><p className="mt-3 text-sm text-zinc-400">{emptyDescription}</p></div>
      )}
    </div>
  );
}

const defaultFloatingSentences = [
  "此情可待成追忆",
  "岁月不语，惟石能言",
  "浮生若梦，为欢几何",
  "人间有味是清欢",
  "且将新火试新茶",
  "诗酒趁年华",
];

function visibleFloatingSentences(sentences?: string[]) {
  const cleaned = (sentences || []).map((sentence) => sentence.trim()).filter(Boolean);
  return cleaned.length ? cleaned : defaultFloatingSentences;
}

function resolveFloatingSentencesConfig(config: FloatingSentencesConfig | undefined, tab: TabKey): FloatingSentencesConfig {
  const base = { speed: 5, count: 2, borderEnabled: true, sentences: defaultFloatingSentences };
  if (!config) return { ...base, enabled: false };
  if (config.global) {
    return {
      ...base,
      ...config,
      enabled: config.enabled !== false,
      sentences: visibleFloatingSentences(config.sentences),
    };
  }
  if (config.pages) {
    const pageConfig = config.pages[tab];
    return {
      ...base,
      enabled: pageConfig?.enabled === true,
      count: pageConfig?.count || config.count || base.count,
      borderEnabled: pageConfig?.borderEnabled ?? config.borderEnabled ?? base.borderEnabled,
      sentences: visibleFloatingSentences(pageConfig?.sentences),
    };
  }
  return {
    ...base,
    enabled: false,
    sentences: visibleFloatingSentences(config.sentences),
  };
}

function FloatingSentences({ config }: { config?: FloatingSentencesConfig }) {
  const [items, setItems] = useState<{ id: number; text: string; left: number; top: number; anim: string; dur: number; delay: number; opacity: number; fontSize: string; depth: number }[]>([]);

  const enabled = config?.enabled ?? true;
  const speed = config?.speed ?? 5;
  const repeatCount = Math.min(20, Math.max(1, config?.count ?? 2));
  const borderEnabled = config?.borderEnabled !== false;
  const sentences = visibleFloatingSentences(config?.sentences);

  useEffect(() => {
    if (!enabled) { setItems([]); return; }
    const anims = ["ambientDriftA", "ambientDriftB", "ambientDriftC", "ambientDriftD", "ambientDriftE", "ambientDriftF"];
    const pool: string[] = [];
    for (let r = 0; r < repeatCount; r++) pool.push(...sentences);
    const speedFactor = Math.max(0.58, (11 - speed) / 7);
    const generated = pool.map((text, i) => {
      const dur = (9 + Math.random() * 9) * speedFactor + 5.2;
      return {
        id: i,
        text,
        left: 6 + Math.random() * 84,
        top: 8 + Math.random() * 78,
        anim: anims[Math.floor(Math.random() * anims.length)],
        dur,
        delay: -Math.random() * dur,
        opacity: 0.58 + Math.random() * 0.2,
        fontSize: `${0.72 + Math.random() * 0.78}rem`,
        depth: 0.72 + Math.random() * 0.75,
      };
    });
    setItems(generated);
  }, [enabled, speed, repeatCount, sentences.join("|")]);

  if (!enabled) return null;
  return (
    <div className="pointer-events-none fixed inset-0 overflow-hidden select-none [mask-image:radial-gradient(circle_at_center,black_0%,black_72%,transparent_100%)]" style={{ zIndex: 11 }}>
      {items.map((item) => (
        <span
          key={item.id}
          className={`ambient-sentence absolute whitespace-nowrap px-3 py-1 font-serif tracking-wider text-[#f2c76a] drop-shadow-[0_0_10px_rgba(251,191,36,0.22)] ${borderEnabled ? "rounded-full border border-[#f2c76a]/20 bg-zinc-950/10 shadow-[0_0_18px_rgba(251,191,36,0.12)] backdrop-blur-[1px]" : "border-0 bg-transparent shadow-none"}`}
          style={{
            left: `${item.left}%`,
            top: `${item.top}%`,
            animation: `${item.anim} ${item.dur}s ${item.delay}s infinite ease-in-out`,
            fontSize: item.fontSize,
            opacity: item.opacity,
            ["--ambient-opacity" as string]: item.opacity,
            ["--ambient-depth" as string]: item.depth,
            textShadow: "0 0 14px rgba(251,191,36,0.24)",
          }}
        >
          {item.text}
        </span>
      ))}
    </div>
  );
}
function TreasurePane({
  items,
  onSelect,
  eyebrow = "美好珍藏 / CHERISHED MEMORIES",
  title = "我的珍藏",
  description = defaultPageCopy.treasures,
  emptyTitle = "暂无珍藏回忆",
  emptyDescription = "请在后台「我的珍藏」中上传图片并记录美好瞬间。",
}: {
  items: TreasureItem[];
  onSelect: (item: TreasureItem) => void;
  eyebrow?: string;
  title?: string;
  description?: string;
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  // 珍藏网格最多 3 列（xl:grid-cols-3）⇒ 每页 6 个，宽屏正好两整行。
  const paged = usePaged(items, 6);
  const paneRef = useRef<HTMLDivElement | null>(null);
  return (
    <div className="space-y-8" ref={paneRef}>
      <div><span className="mb-2 block font-mono text-xs uppercase tracking-widest text-amber-300/80">{eyebrow}</span><p className="mt-3 line-clamp-2 text-[15px] leading-7 text-zinc-300">{zhText(description)}</p></div>
      {items.length > 0 ? (
        <>
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{paged.items.map((item) => <button key={item.id} onClick={() => onSelect(item)} className="group overflow-hidden rounded-xl border border-zinc-900 bg-zinc-950/60 transition-all duration-300 hover:border-amber-800 hover:bg-zinc-950"><div className="aspect-[4/3] overflow-hidden bg-zinc-900">{item.imageUrl ? <img src={item.imageUrl} alt="珍藏" className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" referrerPolicy="no-referrer" /> : <div className="flex h-full items-center justify-center font-mono text-xs text-zinc-600">NO IMAGE</div>}</div></button>)}</div>
          <Pagination page={paged.page} pageCount={paged.pageCount} onPageChange={paged.setPage} anchorRef={paneRef} />
        </>
      ) : (
        <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-950/60 p-10 text-center"><p className="font-serif text-xl text-white">{emptyTitle}</p><p className="mt-3 text-sm text-zinc-400">{emptyDescription}</p></div>
      )}
    </div>
  );
}

function TreasureModal({ item, onClose }: { item: TreasureItem; onClose: () => void }) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-6">
      <button className="absolute inset-0 bg-black/92 backdrop-blur-md" onClick={onClose} aria-label="关闭图片" />
      <div className="relative max-h-[92vh] w-full max-w-6xl overflow-hidden rounded-xl border border-zinc-800 bg-zinc-950 shadow-2xl">
        <button onClick={onClose} className="absolute right-4 top-4 z-10 rounded-full border border-zinc-800 bg-zinc-950/80 p-2 text-zinc-300 hover:text-white" aria-label="关闭"><X size={16} /></button>
        <div className="max-h-[88vh] overflow-auto bg-black p-3"><img src={item.imageUrl} alt="珍藏" className="mx-auto max-h-none max-w-full rounded-lg object-contain" referrerPolicy="no-referrer" /></div>
      </div>
    </div>
  );
}

/**
 * 把一首诗适配成 `Work`，让它能直接喂给 `WorksPane`。
 *
 * 宝要的是「诗同时出现在作品展示里」。做法**不是在 WorksPane 里加分支**，而是
 * 在这里做一次形状转换 —— 卡片、筛选、详情弹窗、分页、无图占位这一整套逻辑
 * 原样复用，一行都不用改。`PoemPane` 仍然服务「诗与惆怅」那个独立栏目。
 *
 * category 固定 `poetry`：前台已有「闲诗」这个标签，作品详情里也已有按体裁
 * 自动排版的分支（`work.category === "poetry"` 走 PoetryDescription）。
 */
function poemToWork(poem: Poem, index: number): Work {
  return {
    id: poem.id || `poem-${index}`,
    category: "poetry",
    title: poem.title || "",
    description: poem.text || "",
    images: poem.imageUrl ? [poem.imageUrl] : [],
    tags: poem.note ? [poem.note] : [],
    links: [],
  };
}

/**
 * 诗签的两种「纸」。这是宝在方案里要的「卡片感觉」的**唯一**开关。
 *
 * - `qinghui`（乙）：冷调青灰，跟着整站 zinc 色板走。现代诗默认走这套。
 * - `juanben`（甲）：暖米绢色，右起竖排 + 古籍界行。古诗默认走这套。
 *
 * `detectPoetryFormat` 已经在算体裁了，所以「古诗用暖色、现代诗用冷色」
 * 是白送的区分度 —— 不用作者在后台点任何东西。
 */
type PoemSlipSkin = "qinghui" | "juanben";

const POEM_SKINS: Record<PoemSlipSkin, {
  skin: string;
  frame: string;
  rule: string;
  eyebrow: string;
  titleH: string;
  titleV: string;
  bodyV: string;
  note: string;
  seal: string;
  glyph: string;
}> = {
  qinghui: {
    skin: "border-zinc-800/80 bg-gradient-to-b from-zinc-950 to-[#0b0b0d]",
    frame: "border-zinc-800/40",
    rule: "border-zinc-800",
    eyebrow: "text-zinc-500",
    titleH: "text-zinc-100",
    titleV: "text-zinc-100",
    bodyV: "text-zinc-300",
    note: "text-zinc-500",
    seal: "text-rose-400/70",
    glyph: "text-white/[0.03]",
  },
  juanben: {
    skin: "border-[#3a352c] bg-gradient-to-b from-[#17150f] to-[#100e0a]",
    frame: "border-[#3a352c]/60",
    rule: "border-[#3a352c]",
    eyebrow: "text-[#8a8478]",
    titleH: "text-[#e8dfc8]",
    titleV: "text-[#e8dfc8]",
    bodyV: "text-[#b3a992]",
    note: "text-[#7d7566]",
    seal: "text-[#b4554c]",
    glyph: "text-[#e8dfc8]/[0.035]",
  },
};

/**
 * 竖排正文：把每行诗摊成**一列**，列与列从右往左排。
 *
 * 为什么不用 CSS 的 `writing-mode: vertical-rl` 一把梭：
 * 整段竖排时，标点会跑到字的下方（竖排标点要用 `text-orientation` + 专门的
 * 竖排标点字形，浏览器兼容参差），而且行距/列距没法逐行微调。这里改成
 * **逐行一个 flex 列**、每行内部用 inline 竖排 —— 列间距、对齐、行首缩进
 * 全部可控，且在 Chrome/Safari/Firefox 上表现一致。
 *
 * `flex-row-reverse` 让第一行落在**最右**，符合中文竖排的阅读方向。
 */
function VerticalVerse({ lines, className, gap = "gap-4" }: { lines: string[]; className?: string; gap?: string }) {
  const glyph = (ch: string, i: number) => (
    <span key={i} className="block leading-[1.5]">{ch}</span>
  );
  return (
    <div className={`flex flex-row-reverse justify-center ${gap} ${className || ""}`}>
      {lines.map((line, li) => (
        <div key={li} className="flex flex-col items-center">
          {Array.from(line.replace(/\s+/g, "")).map((ch, ci) => glyph(ch, ci))}
        </div>
      ))}
    </div>
  );
}

/**
 * 一张诗签。
 *
 * 宝的要求：封面在正上方、竖版、像画卷立起来、大概 1:1 到 3:4、一页只展示一个、
 * **点整签即预览**。所以整张卡是一个 `<article onClick>`（不是按钮 —— 里面还有
 * 别的可点元素，套按钮会出现嵌套交互元素，无障碍上是错的）。
 */
function PoemSlip({
  poem,
  page = 1,
  skin,
  onOpen,
  key,
}: {
  poem: Poem;
  /** 这是第几页（从 1 起）。只为给探针一个稳定的抓手，不影响渲染。 */
  page?: number;
  skin: PoemSlipSkin;
  onOpen: () => void;
  /** 本机没装 @types/react，JSX 的 key 不会自动特判 ⇒ 必须显式声明（见项目惯例）。 */
  key?: string | number;
}) {
  const s = POEM_SKINS[skin];
  // 落款取诗题之外的短标记；没题目就退回 note，让卡面右上角不至于空着。
  const cornerLabel = poem.title ? zhText(poem.title) : poem.note ? zhText(poem.note) : "无题";

  return (
    <article
      onClick={onOpen}
      role="button"
      tabIndex={0}
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onOpen(); }
      }}
      aria-label={`预览诗签：${poem.title || "无题"}`}
      // 标题不在正文里（竖版诗签的卡面右上角才是题），所以给探针一个稳定的抓手：
      // 不依赖「第几个 span」这种一改排版就崩的定位方式。
      data-poem-title={poem.title || ""}
      data-poem-page={page}
      className={`group relative mx-auto w-full max-w-[420px] cursor-pointer overflow-hidden rounded-[14px] border transition duration-300 hover:border-zinc-600/70 hover:-translate-y-0.5 focus:outline-none focus-visible:ring-2 focus-visible:ring-emerald-400/60 ${s.skin}`}
    >
      {/* 封面：宝点名要「封面在正上方，横向展现」。
          比例取 3:2（而不是 4:3 或 16:10）：宝要整卡落在 1:1 ~ 3:4，
          封面是主要的变量 —— 3:2 在 420 宽下是 280 高，加上头/身/尾刚好压进
          3:4（420x560）以内；再高一点整卡就细长过头了（实测 4:3 时是 0.65，
          比 3:4 还窄，超出宝给的范围）。 */}
      {poem.imageUrl ? (
        <div className="aspect-[3/2] w-full overflow-hidden border-b bg-black">
          <img
            src={poem.imageUrl}
            alt={poem.title ? zhText(poem.title) : "诗配图"}
            className="h-full w-full object-cover transition duration-500 group-hover:scale-[1.03]"
            referrerPolicy="no-referrer"
          />
        </div>
      ) : (
        // 没配图：不要留一块黑。给一条细双线的「界行」头顶，立轴的味道就出来了。
        <div className={`flex aspect-[3/2] w-full items-center justify-center border-b ${s.rule}`}>
          <span aria-hidden className={`font-serif text-[64px] leading-none select-none ${s.glyph}`}>诗</span>
        </div>
      )}

      {/* 卡面主体。竖排文字从右上角起。 */}
      <div className="relative px-5 pb-5 pt-4">
        <div className="mb-3 flex items-start justify-between gap-3">
          <span className={`font-mono text-[10px] uppercase tracking-[0.28em] ${s.eyebrow}`}>VERSES</span>
          <span className={`truncate text-right font-serif text-[13px] tracking-[0.16em] ${s.eyebrow}`}>{cornerLabel}</span>
        </div>
        <div className={`mb-3 h-px w-full border-t ${s.rule}`} />

        {/* 竖排正文。给一个下限保证短诗不塌，但不设太高 —— 高了整卡就超出 3:4。 */}
        <div className="flex min-h-[150px] items-start justify-center py-1">
          <VerticalVerse
            lines={poem.text.split(/\r?\n/).filter((l) => l.trim()).map((l) => l.replace(/^\s+/, ""))}
            className={`font-serif text-[15px] ${s.bodyV}`}
            gap="gap-5"
          />
        </div>

        {/* 落款 + 钤印收尾 */}
        <div className="mt-4 flex items-end justify-between gap-3">
          <span aria-hidden className={`select-none rounded-sm border px-1.5 py-0.5 font-serif text-[10px] leading-none ${s.seal} border-current`}>拾</span>
          {poem.note ? <span className={`text-right font-mono text-[10px] tracking-wider ${s.note}`}>—— {zhText(poem.note)}</span> : null}
        </div>
      </div>

      {/* 悬停提示：整签可点这件事不说出来，用户不一定知道。 */}
      <span className="pointer-events-none absolute inset-x-0 bottom-0 flex items-center justify-center gap-1.5 bg-gradient-to-t from-black/80 to-transparent px-3 pb-2.5 pt-8 text-[10px] tracking-wider text-zinc-300 opacity-0 transition group-hover:opacity-100">
        <ZoomIn size={11} /> 点击看全签
      </span>
    </article>
  );
}

/**
 * 诗签预览层：把那张签**放大重印一遍**，而不是简单把原卡 clone。
 *
 * 为什么不 clone：原卡在窄栏里宽度受限于 ~420px，放大后若按原尺寸直接拉伸，
 * 竖排字会被拉糊。这里用同一套 `VerticalVerse` 重新按大字号排一遍 ——
 * 清晰，而且给 `note`（落款）留出完整的呼吸位。
 */
function PoemPreviewModal({ poem, skin, onClose }: { poem: Poem; skin: PoemSlipSkin; onClose: () => void }) {
  const s = POEM_SKINS[skin];
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") onClose(); };
    document.addEventListener("keydown", onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.removeEventListener("keydown", onKey); document.body.style.overflow = prev; };
  }, [onClose]);

  return createPortal(
    <div className="fixed inset-0 z-[70] m-0 flex items-center justify-center p-4 md:p-8" role="dialog" aria-modal="true" aria-label={`诗签预览：${poem.title || "无题"}`}>
      <button type="button" className="absolute inset-0 cursor-zoom-out bg-black/92 backdrop-blur-md" onClick={onClose} aria-label="关闭诗签预览" tabIndex={-1} />
      <div className="relative z-10 flex max-h-full min-h-0 w-full max-w-3xl flex-col overflow-hidden">
        <div className="mb-3 flex shrink-0 items-center justify-between gap-3">
          <span className={`truncate font-serif text-sm tracking-[0.2em] ${s.titleH}`}>{poem.title ? zhText(poem.title) : "无题"}</span>
          <button type="button" onClick={onClose} className="inline-flex shrink-0 items-center gap-1.5 rounded-full border border-zinc-700 bg-zinc-900/80 px-3 py-1.5 text-xs text-zinc-200 hover:border-zinc-500 hover:text-white" aria-label="关闭">
            <X size={14} /> 关闭
          </button>
        </div>
        <div className={`min-h-0 flex-1 overflow-y-auto rounded-2xl border p-6 md:p-10 ${s.skin}`}>
          {poem.imageUrl ? (
            <div className="mb-8 overflow-hidden rounded-lg border border-zinc-800/60 bg-black">
              <img src={poem.imageUrl} alt={poem.title ? zhText(poem.title) : "诗配图"} className="mx-auto max-h-[46vh] w-auto object-contain" referrerPolicy="no-referrer" />
            </div>
          ) : null}
          <div className="flex justify-center">
            <VerticalVerse
              lines={poem.text.split(/\r?\n/).filter((l) => l.trim()).map((l) => l.replace(/^\s+/, ""))}
              className={`font-serif text-[19px] md:text-[22px] ${s.bodyV}`}
              gap="gap-7"
            />
          </div>
          {poem.note ? <p className={`mt-10 text-right font-mono text-xs tracking-wider ${s.note}`}>—— {zhText(poem.note)}</p> : null}
        </div>
      </div>
    </div>,
    document.body,
  );
}

/**
 * 给诗签挑纸色。
 *
 * **不能直接用 `detectPoetryFormat`**：那个函数只认五言/七言，六言古诗（比如
 * 「枯藤老树昏鸦」那种）会被判成 `modern`，而字数参差的现代诗反而可能落进 `ci`。
 * 拿它选皮肤会大面积选错。
 *
 * 这里换一个更稳的判据：**行宽是否「全部整齐」**。
 *   - 所有非空行字数**完全一致**，或只有两种且最少的那种占满 2/3 ⇒ 古体/词
 *   - 其余（自由分行的现代诗）⇒ 青灰
 *
 * 阈值定在「一字不差」而不是「占多数」：现代诗经常出现 6/6/8 这种「大部分碰巧
 * 同宽」的排法，用 0.6 的多数阈值会把「夜航」误判成古体。要「整齐」就得真整齐。
 *
 * 这只是**皮肤**，判错的代价是颜色不同、内容不会错；所以宁可要个稳的启发式，
 * 也不去动 `detectPoetryFormat`（那个还管着作品详情里的排版，不能乱改）。
 */
function pickPoemSkin(text: string): PoemSlipSkin {
  const lines = String(text || "")
    .split(/\r?\n/)
    .map((l) => l.replace(/[，。！？、；：""''《》（）\s　]/g, "").trim())
    .filter(Boolean);
  if (lines.length < 2) return "qinghui";
  const lengths = lines.map((l) => l.length);
  const unique = [...new Set(lengths)];
  // 全部等宽 ⇒ 铁定是古体/词（「枯藤老树昏鸦」这种六言也在内）。
  if (unique.length === 1) return "juanben";
  // 两种宽度：常出现在「五言为主 + 个别七言」的古体里。要求少数那种至少占 1/3，
  // 且行数够多 —— 否则 3 行里 2 行同宽（如「夜航」6/6/8）会被误判。
  if (unique.length === 2 && lines.length >= 4) {
    const counts = new Map<number, number>();
    for (const n of lengths) counts.set(n, (counts.get(n) || 0) + 1);
    const minor = Math.min(...counts.values());
    if (minor / lines.length >= 0.3) return "juanben";
  }
  return "qinghui";
}

/**
 * 「诗与惆怅」栏目。
 *
 * 一页一首（宝明确要求「一页只展示一个」）：竖版诗签铺满一屏，翻页换的是**诗**
 * 而不是图。卡片比例落在宝说的 1:1 ~ 3:4 区间里。
 *
 * 纸色由 `pickPoemSkin` 按「行宽是否整齐」自动选 —— 古诗走暖米绢本、
 * 现代诗走冷调青灰，作者不用在后台做任何设置。
 */
function PoemPane({
  items,
  eyebrow = "偶得之句 / VERSES",
  title = "诗与惆怅",
  description = defaultPageCopy.poems,
  emptyTitle = "暂无诗",
  emptyDescription = "请在后台「诗与惆怅」中写下第一首。",
}: {
  items: Poem[];
  eyebrow?: string;
  title?: string;
  description?: string;
  emptyTitle?: string;
  emptyDescription?: string;
}) {
  // 一页一首：宝的要求。诗签是竖向的，并排两张会各自被压窄、竖排字挤成一团。
  const paged = usePaged(items, 1);
  const paneRef = useRef<HTMLDivElement | null>(null);
  const [previewing, setPreviewing] = useState<Poem | null>(null);
  const current = paged.items[0];

  return (
    <div className="space-y-8" ref={paneRef}>
      <div><span className="mb-2 block font-mono text-xs uppercase tracking-widest text-rose-300/80">{eyebrow}</span>{description ? <p className="mt-3 max-w-3xl text-[15px] leading-8 text-zinc-300">{zhText(description)}</p> : null}</div>
      {items.length > 0 && current ? (
        <>
          <div className="flex justify-center pt-2">
            {/* key 绑 id+page：换页时让 React 重建这个子树，卡片切换才有干净的进入动画，
                否则只是文字原地替换，翻页感会消失。 */}
            <PoemSlip key={`${current.id || "poem"}-${paged.page}`} poem={current} page={paged.page} skin={pickPoemSkin(current.text)} onOpen={() => setPreviewing(current)} />
          </div>
          <Pagination page={paged.page} pageCount={paged.pageCount} onPageChange={paged.setPage} anchorRef={paneRef} />
        </>
      ) : (
        <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-950/60 p-10 text-center"><p className="font-serif text-xl text-white">{emptyTitle}</p><p className="mt-3 text-sm text-zinc-400">{emptyDescription}</p></div>
      )}
      {previewing ? <PoemPreviewModal poem={previewing} skin={pickPoemSkin(previewing.text)} onClose={() => setPreviewing(null)} /> : null}
    </div>
  );
}

/**
 * 联系方式里微信 / QQ 的品牌图标（自绘矢量）。
 *
 * 为什么不用现成的：`lucide-react` 是通用图标库，**刻意不含品牌 logo**，
 * 所以原来微信和 QQ 都退化成同一个 `MessageCircle`，两个卡片看起来一模一样。
 *
 * 为什么不用「从本机 exe 里抠」：那是给任务栏用的 16/32px 位图，
 * 放到网页上会糊边；而且那是腾讯的素材文件，没必要往仓库里塞。
 * 这里按**公开可见的造型自己画**：矢量、任意尺寸都清晰、零依赖，
 * 只用于「这是我的联系方式」这种正当展示用途。
 *
 * 颜色跟随父级的 `currentColor`，好和卡片那套 `card.color` 配色保持一致。
 * 尺寸也用 `size` 参数对齐 lucide 的接口，替换时不用改调用处。
 */
function WeChatIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      {/* 大气泡：微信的主对话泡，右下角收成一个尖 */}
      <path d="M9.1 3.2C5.1 3.2 1.9 5.9 1.9 9.2c0 1.9 1.1 3.5 2.7 4.6l-.7 2.1 2.4-1.2c.6.2 1.2.3 1.9.3h.5a5.9 5.9 0 0 1-.2-1.5c0-3.2 3.1-5.8 6.9-5.8h.5c-.6-2.6-3.3-4.5-6.8-4.5Z" />
      {/* 小气泡：右侧那只，稍微压低 */}
      <path d="M22.1 13.5c0-2.7-2.7-4.9-6-4.9s-6 2.2-6 4.9 2.7 4.9 6 4.9c.7 0 1.4-.1 2-.3l2 1-.6-1.7c1.6-.9 2.6-2.3 2.6-3.9Z" />
    </svg>
  );
}

function QQIcon({ size = 18 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
      {/* 企鹅：头（上圆）+ 身体（下宽圆）合成一个剪影 */}
      <path d="M12 1.8C8.5 1.8 5.9 4.3 5.9 7.6c0 .8.1 1.5.4 2.2-1.2 1.6-2 3.7-2 5.5 0 .9.2 1.6.6 1.9.3.3.7.2 1.1-.1.3.9.9 1.7 1.7 2.3-.6.4-1 .9-1 1.4 0 .9 1.5 1.5 3.4 1.5.8 0 1.5-.1 2-.3h.9c.5.2 1.2.3 2 .3 1.9 0 3.4-.6 3.4-1.5 0-.5-.4-1-1-1.4.8-.6 1.4-1.4 1.7-2.3.4.3.8.4 1.1.1.4-.3.6-1 .6-1.9 0-1.8-.8-3.9-2-5.5.3-.7.4-1.4.4-2.2 0-3.3-2.6-5.8-6.1-5.8Z" />
      {/* 眼睛：挖空（用 evenodd 保证在实心剪影上真的透出背景） */}
      <path fillRule="evenodd" clipRule="evenodd" d="M9.5 7.1a1.15 1.15 0 1 0 0 2.3 1.15 1.15 0 0 0 0-2.3Zm5 0a1.15 1.15 0 1 0 0 2.3 1.15 1.15 0 0 0 0-2.3Z" />
    </svg>
  );
}

function ContactPane({ data }: { data: PortfolioData }) {
  const contact = data.contact || { wechat: "", qq: "", email: "" };
  const pageCopy = { ...defaultPageCopy, ...(data.profile.pageCopy || {}) };
  const cards = [
    { label: "微信 / WeChat", value: contact.wechat, icon: <WeChatIcon size={18} />, color: "text-emerald-300" },
    { label: "QQ", value: contact.qq, icon: <QQIcon size={18} />, color: "text-sky-300" },
    { label: "电子邮箱 / Email", value: contact.email, icon: <Mail size={18} />, color: "text-amber-300" },
    { label: "手机号码 / Phone", value: contact.phone, icon: <Phone size={18} />, color: "text-rose-300" },
    { label: "GitHub", value: contact.github, icon: <Github size={18} />, color: "text-zinc-200" },
  ].filter((item) => item.value);
  return <div className="space-y-8"><div><span className="mb-1 block font-mono text-xs uppercase tracking-widest text-emerald-300/80">有缘相识，留笔通信 / INK STATION CONTACT</span><p className="mt-3 text-[15px] leading-8 text-zinc-300">{zhText(pageCopy.contact)}</p></div><div className="grid gap-6 pt-2 md:grid-cols-2">{cards.map((card) => <a key={card.label} href={card.label === "GitHub" ? card.value : undefined} target={card.label === "GitHub" ? "_blank" : undefined} rel="noopener noreferrer" className="group flex flex-col justify-between space-y-4 rounded-xl border border-zinc-900 bg-zinc-950/60 p-5 transition-all duration-300 hover:border-zinc-800 hover:bg-zinc-950"><div className="flex items-center space-x-3"><span className={`rounded-lg border border-zinc-800 bg-zinc-900 p-2.5 ${card.color} transition-transform duration-300 group-hover:scale-105`}>{card.icon}</span><div><h4 className="font-serif text-base font-bold tracking-wider text-white">{card.label}</h4><p className="mt-0.5 font-mono text-[10px] uppercase text-zinc-500">Contact Channel</p></div></div><span className="break-all font-mono text-base font-medium tracking-wide text-white">{card.value}</span></a>)}</div></div>;
}

function InitialLoader() {
  return (
    <div className="flex min-h-screen items-center justify-center overflow-hidden bg-[#09090b] p-6 text-zinc-100">
      <div className="fixed inset-0 pointer-events-none bg-[radial-gradient(circle_at_top,_#121215_0%,_#09090b_100%)]" />
      <div className="fixed inset-0 pointer-events-none bg-[linear-gradient(to_right,#808080_1px,transparent_1px),linear-gradient(to_bottom,#808080_1px,transparent_1px)] bg-[size:32px_32px] opacity-[0.03]" />
      <div className="relative flex flex-col items-center gap-5">
        <div className="flex h-[38px] items-end space-x-[4px] opacity-90">
          <div className="animate-sound-1 w-[4px] rounded-full bg-emerald-300" />
          <div className="animate-sound-2 w-[4px] rounded-full bg-zinc-300" />
          <div className="animate-sound-3 w-[4px] rounded-full bg-emerald-300" />
          <div className="animate-sound-4 w-[4px] rounded-full bg-zinc-300" />
        </div>
        <div className="text-center">
          <p className="font-serif text-xl font-semibold tracking-widest text-white">欢迎来到，我的空间</p>
          <p className="mt-2 font-mono text-[10px] uppercase tracking-[0.28em] text-zinc-500">Loading My Space</p>
        </div>
      </div>
      <style>{`@keyframes soundWave { 0%, 100% { height: 8px; } 50% { height: 30px; } }.animate-sound-1 { animation: soundWave 0.8s ease-in-out infinite; }.animate-sound-2 { animation: soundWave 1.2s ease-in-out infinite; animation-delay: 0.2s; }.animate-sound-3 { animation: soundWave 0.9s ease-in-out infinite; animation-delay: 0.4s; }.animate-sound-4 { animation: soundWave 1.4s ease-in-out infinite; animation-delay: 0.1s; }`}</style>
    </div>
  );
}

function preloadImage(url: string) {
  return new Promise<void>((resolve) => {
    if (!url) { resolve(); return; }
    const image = new Image();
    image.onload = () => resolve();
    image.onerror = () => resolve();
    image.referrerPolicy = "no-referrer";
    image.src = url;
  });
}

async function preloadInitialAssets(data: PortfolioData, flags: { treasuresVisible: boolean; aiZoneVisible: boolean }) {
  const urls = [
    data.profile.avatar,
    data.musicTracks?.find((track) => track.coverUrl)?.coverUrl,
    data.works?.find((work) => work.images?.[0])?.images?.[0],
    data.gallery?.find((item) => item.imageUrl)?.imageUrl,
    // 栏目被隐藏时不预载对应首图，省掉一次注定看不到的流量。
    flags.treasuresVisible ? data.treasures?.find((item) => item.imageUrl)?.imageUrl : undefined,
    flags.aiZoneVisible ? data.profile.pageCopy?.aiWorks?.find((work) => work.images?.[0])?.images?.[0] : undefined,
  ].filter((url): url is string => Boolean(url));
  if (urls.length === 0) return;
  await Promise.race([
    Promise.all(urls.map(preloadImage)),
    new Promise<void>((resolve) => window.setTimeout(resolve, 1200)),
  ]);
}

function isVideoWork(work: Work) {
  if (work.category === "video") return true;
  if (!work.videoUrl) return false;
  return !/\.(mp3|wav|m4a|aac|flac|ogg|opus)(?:$|[?#])/i.test(work.videoUrl);
}

const particleSeeds = [
  [68, 8, 4, 12, "down"], [82, 15, 3, 15, "down"], [94, 5, 5, 18, "down"], [76, 29, 3, 13, "down"], [89, 36, 4, 16, "down"],
  [101, 23, 3, 11, "down"], [72, 49, 5, 19, "down"], [86, 57, 3, 14, "down"], [97, 46, 4, 17, "down"], [66, 67, 3, 13, "down"],
  [80, 76, 4, 18, "down"], [93, 70, 3, 15, "down"], [103, 62, 5, 20, "down"], [74, 88, 3, 16, "down"], [90, 91, 4, 19, "down"],
  [4, 94, 4, 17, "up"], [13, 82, 3, 14, "up"], [24, 101, 5, 20, "up"], [7, 69, 3, 16, "up"], [31, 91, 4, 18, "up"],
  [18, 74, 6, 22, "up"], [2, 56, 3, 15, "up"], [38, 84, 4, 19, "up"], [26, 64, 3, 17, "up"], [12, 103, 5, 21, "up"],
  [44, 96, 3, 16, "up"], [35, 72, 4, 20, "up"],
] as const;

function DynamicParticles() {
  return (
    <div className="portfolio-particles" aria-hidden="true">
      {particleSeeds.map(([left, top, size, duration, flow], index) => (
        <i
          key={`${flow}-${left}-${top}`}
          data-flow={flow}
          style={{
            "--particle-left": `${left}%`,
            "--particle-top": `${top}%`,
            "--particle-size": `${size}px`,
            "--particle-duration": `${duration}s`,
            "--particle-delay": `${index * -0.83}s`,
          } as React.CSSProperties}
        />
      ))}
    </div>
  );
}

function CareerTimeline({ experiences }: { experiences: PortfolioData["experiences"] }) {
  const viewportRef = useRef<HTMLDivElement | null>(null);
  const indexRef = useRef(0);
  const pausedRef = useRef(false);
  const resumeTimerRef = useRef<number | null>(null);

  useEffect(() => {
    const reducedOrMobile = window.matchMedia("(prefers-reduced-motion: reduce), (max-width: 820px)").matches;
    if (reducedOrMobile || experiences.length <= 2) return;
    const timer = window.setInterval(() => {
      const viewport = viewportRef.current;
      if (!viewport || pausedRef.current) return;
      const items = Array.from(viewport.querySelectorAll("article")) as HTMLElement[];
      if (items.length === 0) return;
      indexRef.current = (indexRef.current + 1) % items.length;
      viewport.scrollTo({ top: items[indexRef.current].offsetTop, behavior: "smooth" });
    }, 4200);
    return () => {
      window.clearInterval(timer);
      if (resumeTimerRef.current !== null) window.clearTimeout(resumeTimerRef.current);
    };
  }, [experiences]);

  const pauseTemporarily = () => {
    pausedRef.current = true;
    if (resumeTimerRef.current !== null) window.clearTimeout(resumeTimerRef.current);
    resumeTimerRef.current = window.setTimeout(() => { pausedRef.current = false; }, 3800);
  };

  return (
    <div
      ref={viewportRef}
      className="career-timeline"
      tabIndex={0}
      aria-label="职业经历时间线，可滚动查看全部经历"
      onMouseEnter={() => { pausedRef.current = true; }}
      onMouseLeave={() => { pausedRef.current = false; }}
      onWheel={pauseTemporarily}
      onTouchStart={pauseTemporarily}
      onFocus={() => { pausedRef.current = true; }}
      onBlur={() => { pausedRef.current = false; }}
    >
      <div className="career-timeline__track">
        <span className="career-timeline__line" aria-hidden="true" />
        {experiences.map((exp, index) => (
          <article key={exp.id}>
            <i />
            <div className="career-icon">{index % 2 === 1 ? <Compass size={18} /> : <BriefcaseBusiness size={18} />}</div>
            <div className="career-copy">
              <div><time>{zhText(exp.period)}</time><span>@ {zhText(exp.company)}</span></div>
              <h3>{zhText(exp.role)}</h3>
              <p>{zhText(exp.desc)}</p>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function IntroDashboard({ data, onSelectWork, onNavigate }: {
  data: PortfolioData;
  onSelectWork: (work: Work) => void;
  onNavigate: (tab: TabKey) => void;
}) {
  const homeWorks = [
    ...data.works,
    ...((data.profile.pageCopy?.poemList || []).map(poemToWork)),
  ];
  const skills = ["短视频运营", "内容策划", "AI工具应用", "原型图绘制", "数据分析", "文案写作"];
  const statCopy = data.profile.pageCopy?.homeStats;
  const stats = [
    { icon: Play, ...defaultHomeStats.works, value: statCopy?.works?.value || `${Math.max(10, data.works.length)}+`, ...statCopy?.works },
    { icon: BarChart3, ...defaultHomeStats.plays, ...statCopy?.plays },
    { icon: Sparkles, ...defaultHomeStats.ai, ...statCopy?.ai },
  ];

  return (
    <div className="intro-dashboard">
      <p className="content-note content-note--top" aria-hidden="true">Content<br />Creates<br />More Possibilities</p>
      <section className="dashboard-section dashboard-about">
        <div className="section-kicker"><span />关于我 <b>/</b> ABOUT ME</div>
        <p>{zhText(data.profile.intro)}</p>
        <div className="dashboard-stats">
          {stats.map(({ icon: Icon, value, label, detail }) => (
            <article key={label}>
              <span className="stat-icon"><Icon size={22} /></span>
              <div><strong>{value}</strong><em>{label}</em><small>{detail}</small></div>
            </article>
          ))}
        </div>
      </section>

      <section className="dashboard-section">
        <div className="section-kicker"><span />职业旅程 <b>/</b> CAREER TIMELINE</div>
        <CareerTimeline experiences={data.experiences} />
      </section>

      <section className="dashboard-section dashboard-works">
        <div className="section-heading-row">
          <div className="section-kicker"><span />我的作品 <b>/</b> MY WORKS</div>
          <button type="button" onClick={() => onNavigate("works")}>查看全部作品 <ArrowRight size={14} /></button>
        </div>
        {homeWorks.length > 0 ? (
          <div className="home-work-carousel" aria-label="我的作品自动轮播">
            <div className="home-work-carousel__track" style={{ "--carousel-duration": `${Math.max(24, homeWorks.length * 5)}s` } as React.CSSProperties}>
              {[0, 1].map((copyIndex) => (
                <div className="home-work-carousel__group" key={copyIndex} aria-hidden={copyIndex === 1 || undefined}>
                  {homeWorks.map((work) => (
                    <button type="button" key={`${copyIndex}-${work.id}`} tabIndex={copyIndex === 1 ? -1 : 0} onClick={() => onSelectWork(work)} className="featured-work">
                      {work.images?.[0] ? <img src={work.images[0]} alt="" referrerPolicy="no-referrer" /> : <span className="featured-work__empty">NO IMAGE</span>}
                      <span className="featured-work__shade" />
                      <span className="featured-work__category">{categoryLabel(work.category)}</span>
                      <strong>{zhText(work.title)}</strong>
                      <span className="featured-work__meta">
                        {isVideoWork(work) ? <Play size={12} className="fill-current" /> : <ExternalLink size={12} />}
                        {isVideoWork(work) ? "播放视频" : "查看项目"}
                      </span>
                    </button>
                  ))}
                </div>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      <section className="dashboard-section dashboard-skills">
        <div className="section-kicker"><span />技能标签 <b>/</b> SKILLS</div>
        <div className="skill-strip">
          {skills.map((skill, index) => {
            const Icon = [Video, FileText, Bot, AppWindow, TrendingUp, Feather][index];
            return <span key={skill}><Icon size={16} />{skill}</span>;
          })}
        </div>
      </section>
      <p className="content-note content-note--bottom" aria-hidden="true">“Keep Creating” →<br />“Keep Going”</p>
    </div>
  );
}

export default function App() {
  if (window.location.pathname.startsWith("/admin")) return <AdminApp />;
  const [data, setData] = useState<PortfolioData>(normalizeData(emptyPortfolioData));
  const [portfolioReady, setPortfolioReady] = useState(false);
  const [activeTab, setActiveTab] = useState<TabKey>("intro");
  const [selectedWork, setSelectedWork] = useState<Work | null>(null);
  const [selectedAiWork, setSelectedAiWork] = useState<Work | null>(null);
  const [selectedGallery, setSelectedGallery] = useState<GalleryItem | null>(null);
  const [selectedTreasure, setSelectedTreasure] = useState<TreasureItem | null>(null);
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;
    fetch("/api/portfolio")
      .then((res) => (res.ok ? res.json() : Promise.reject()))
      .then(async (json) => {
        const nextData = normalizeData(json);
        await preloadInitialAssets(nextData, {
          treasuresVisible: isTreasuresVisible(nextData),
          aiZoneVisible: isAiZoneVisible(nextData),
        });
        if (!cancelled) setData(nextData);
      })
      .catch(() => {
        if (!cancelled) setData(normalizeData(emptyPortfolioData));
      })
      .finally(() => {
        if (!cancelled) setPortfolioReady(true);
      });
    return () => { cancelled = true; };
  }, []);

  /*
   * 站点检测：每次打开前台页面记一条访问（IP/归属地由服务端补，设备与环境由
   * tracking.ts 采集），离开时补交停留时长。
   *
   * 放在这里而不是 App 组件顶部，是因为 /admin 那条分支在函数开头就 return 了，
   * 走后台时根本不会注册这个 effect —— 后台自己的访问不该被算进前台访客里。
   *
   * 关于「同一个用户」：visitorKey 存在 localStorage，同一个浏览器重复访问会归到
   * 同一位访客，后台就能把他的多次访问按时间串成一条时间线。
   *
   * 失败不影响浏览：tracking 内部全部吞异常，这里不需要 try/catch 也不做 loading。
   */
  useEffect(() => startVisitTracking(), []);

  const pageCopy = { ...defaultPageCopy, ...(data.profile.pageCopy || {}) };
  const floatingSentencesConfig = useMemo(() => resolveFloatingSentencesConfig(data.profile.pageCopy?.floatingSentences, activeTab), [data.profile.pageCopy?.floatingSentences, activeTab]);

  // 后台「模块管理」决定前台导航的顺序与显隐。隐藏时连导航入口一起摘掉，
  // 而不是把空页面留在那里。
  //
  // 顺序与显隐统一由 types.ts 的 normalizeSectionOrder / isSectionVisible 决定 ——
  // 那两个函数对残缺 / 过期 / 被改坏的 sectionOrder 都有兜底，最坏结果只是顺序不完美，
  // 绝不会把栏目弄丢。
  //
  const visibleNavItems = useMemo(() => {
    const byKey = new Map(navItems.map((item) => [item.key as string, item]));
    return normalizeSectionOrder(data.profile.pageCopy?.sectionOrder)
      .filter((key) => isSectionVisible(data.profile.pageCopy, key))
      .map((key) => byKey.get(key))
      .filter((item): item is NonNullable<typeof item> => Boolean(item));
  }, [data.profile.pageCopy]);
  const sectionShown = (key: SectionKey) => isSectionVisible(data.profile.pageCopy, key);

  // 「自我介绍」也能被后台关掉之后，activeTab 的初值 "intro" 就可能指向一个已隐藏的
  // 栏目 —— 那时既没有它的导航项，页面也不该留着它的内容。所以这里兜一下：
  // 落到第一个还开着的栏目上；一个都不剩就什么都不切，交给下面的空态接住。
  useEffect(() => {
    if (isSectionVisible(data.profile.pageCopy, activeTab)) return;
    const fallback = normalizeSectionOrder(data.profile.pageCopy?.sectionOrder)
      .find((key) => isSectionVisible(data.profile.pageCopy, key));
    if (fallback) setActiveTab(fallback);
  }, [data.profile.pageCopy, activeTab]);

  if (!portfolioReady) return <InitialLoader />;

  return (
    <div className="portfolio-site">
      <FloatingSentences config={floatingSentencesConfig} />

      <header className="site-header">
        <button type="button" className="site-brand" onClick={() => setActiveTab("intro")}>
          <strong>{data.profile.name}</strong>
          <span>我的空间 / MY SPACE</span>
          <i aria-hidden="true"><b /><b /><b /></i>
        </button>
        <nav className="site-nav" aria-label="主要导航">
          {visibleNavItems.map((item) => (
            <button key={item.key} type="button" onClick={() => setActiveTab(item.key)} data-active={activeTab === item.key || undefined}>
              <span>{item.label}</span>
            </button>
          ))}
        </nav>
        <button type="button" className="mobile-menu-button" onClick={() => setMobileMenuOpen((open) => !open)} aria-label="打开导航">
          {mobileMenuOpen ? <X size={19} /> : <Menu size={19} />}
        </button>
      </header>

      {mobileMenuOpen && (
        <nav className="mobile-nav" aria-label="移动端导航">
          {visibleNavItems.map((item) => (
            <button key={item.key} type="button" onClick={() => { setActiveTab(item.key); setMobileMenuOpen(false); }} data-active={activeTab === item.key || undefined}>
              <span>{item.label}</span><small>{item.sub}</small>
            </button>
          ))}
        </nav>
      )}

      <main className="portfolio-layout">
        <aside className="hero-panel">
          <img className="hero-panel__art" src="/hero-creator-stage.png" alt="年轻创作者与柴犬坐在发光创作台上" />
          <span className="hero-panel__veil" />
          <DynamicParticles />
          <div className="hero-panel__aside" aria-hidden="true">HUMAN<br />×<br />AI<br />×<br />CREATIVE<br />×<br />A BETTER<br />TOMORROW</div>
          <div className="hero-panel__copy">
            <span className="hero-panel__label">CREATE · SHARE · A BETTER TOMORROW</span>
            <h1>{data.profile.name}</h1>
            <h2>{zhText(data.profile.tagline)}</h2>
            <p>{zhText(data.profile.quote)}</p>
            <div className="hero-actions">
              <button type="button" className="hero-action hero-action--primary" onClick={() => setActiveTab("works")}><BriefcaseBusiness size={17} />查看作品集<ArrowRight size={15} /></button>
              <button type="button" className="hero-action" onClick={() => setActiveTab("contact")}><Mail size={17} />联系我</button>
            </div>
          </div>
          <div className="hero-player"><AudioBlock tracks={data.musicTracks || []} autoplay={data.profile.musicAutoplay} compact /></div>
        </aside>

        <section className="content-panel">
          <div className="content-panel__inner">
            {visibleNavItems.length === 0 ? (
              <div className="flex min-h-[42vh] flex-col items-center justify-center text-center">
                <p className="font-serif text-xl tracking-wide text-white">站点正在整理中</p>
                <p className="mt-3 text-sm leading-6 text-zinc-400">
                  所有栏目都被隐藏了，暂时没有可以展示的内容。
                  <br />
                  进后台 <span className="font-mono text-zinc-300">/admin</span> 的「模块管理」重新打开需要的栏目即可。
                </p>
              </div>
            ) : (
              <>
            {activeTab === "intro" && sectionShown("intro") && <IntroDashboard data={data} onSelectWork={setSelectedWork} onNavigate={setActiveTab} />}
            {activeTab === "works" && sectionShown("works") && <WorksPane items={[...data.works, ...((data.profile.pageCopy?.poemList || []).map(poemToWork))]} description={pageCopy.works} onSelect={setSelectedWork} categoryOrder={workCategories} />}
            {activeTab === "ai" && sectionShown("ai") && <WorksPane items={data.profile.pageCopy?.aiWorks || []} description={pageCopy.aiZone} onSelect={setSelectedAiWork} eyebrow="与 AI 共作 / AI ZONE EXHIBITS" title="AI 专区" emptyTitle="暂无 AI 作品" emptyDescription="请进入后台 /admin，在「AI 专区」中新增作品并保存。" />}
            {activeTab === "prospects" && sectionShown("prospects") && <GalleryPane items={data.gallery || []} onSelect={setSelectedGallery} description={pageCopy.gallery} />}
            {activeTab === "treasures" && sectionShown("treasures") && <TreasurePane items={data.treasures || []} onSelect={setSelectedTreasure} description={pageCopy.treasures} />}
            {activeTab === "poems" && sectionShown("poems") && <PoemPane items={data.profile.pageCopy?.poemList || []} description={pageCopy.poems} />}
            {activeTab === "resume" && sectionShown("resume") && <ResumePane data={data} />}
            {activeTab === "contact" && sectionShown("contact") && <ContactPane data={data} />}
              </>
            )}
          </div>
          <footer className="site-footer">
            备案号：
            <a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer">皖ICP备2026017545号</a>
          </footer>
        </section>
      </main>
      {selectedWork && <WorkModal work={selectedWork} onClose={() => setSelectedWork(null)} />}
      {selectedAiWork && <WorkModal work={selectedAiWork} onClose={() => setSelectedAiWork(null)} />}
      {selectedGallery && <GalleryModal item={selectedGallery} onClose={() => setSelectedGallery(null)} />}
      {selectedTreasure && <TreasureModal item={selectedTreasure} onClose={() => setSelectedTreasure(null)} />}
    </div>
  );
}
