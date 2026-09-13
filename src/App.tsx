import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AppWindow,
  Bot,
  Compass,
  Download,
  ExternalLink,
  Feather,
  FileText,
  Github,
  Mail,
  Menu,
  MessageCircle,
  Pause,
  Phone,
  Play,
  SkipBack,
  SkipForward,
  Sparkles,
  TrendingUp,
  Video,
  X,
} from "lucide-react";
import AdminApp from "./AdminApp";
import { FloatingSentencesConfig, GalleryItem, MusicTrack, PortfolioData, ResumeProfile, TreasureItem, Work, defaultPageCopy } from "./types";

type TabKey = "intro" | "resume" | "works" | "ai" | "prospects" | "treasures" | "contact";

const navItems: { key: TabKey; label: string; sub: string }[] = [
  { key: "intro", label: "自我介绍", sub: "BIOGRAPHY" },
  { key: "resume", label: "个人简历", sub: "CURRICULUM" },
  { key: "works", label: "作品展示", sub: "PORTFOLIO" },
  { key: "ai", label: "AI专区", sub: "AI ZONE" },
  { key: "prospects", label: "工程截图", sub: "GALLERY" },
  { key: "treasures", label: "我的珍藏", sub: "TREASURES" },
  { key: "contact", label: "联系方式", sub: "CONTACT" },
];

const workCategories = [
  { key: "all", label: "全部" },
  { key: "operation", label: "账号运营" },
  { key: "app", label: "应用制作" },
  { key: "prototype", label: "原型图" },
  { key: "video", label: "视频剪辑" },
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
 */
function isTreasuresVisible(data: PortfolioData) {
  return data.profile.pageCopy?.treasuresVisible !== false;
}

/**
 * 「AI 专区」栏目是否在前台展示。约定与 isTreasuresVisible 完全一致：
 * 只有管理员在后台显式关闭（写入 false）才隐藏，缺省 undefined 一律视为展示。
 */
function isAiZoneVisible(data: PortfolioData) {
  return data.profile.pageCopy?.aiZoneVisible !== false;
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

function getWorkLinkMeta(link: { label?: string; url: string; kind?: string; fileName?: string }) {
  const ext = getFileExtension(link.url, link.fileName || link.label);
  const office = ["doc", "docx", "xls", "xlsx", "ppt", "pptx"];
  const isAttachment = link.kind === "attachment" || Boolean(ext);
  const previewUrl = office.includes(ext)
    ? `https://view.officeapps.live.com/op/view.aspx?src=${encodeURIComponent(link.url)}`
    : link.url;
  return {
    ext,
    isAttachment,
    canPreview: isAttachment,
    previewUrl,
    label: link.label || link.fileName || getFileNameFromUrl(link.url) || "查看文件",
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

function AudioBlock({ tracks, autoplay }: { tracks: MusicTrack[]; autoplay?: boolean }) {
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

function WorkModal({ work, onClose }: { work: Work; onClose: () => void }) {
  const [imageIndex, setImageIndex] = useState(0);
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
                    <button key={`${image}-${idx}`} type="button" onClick={() => setImageIndex(idx)} className={`aspect-video overflow-hidden rounded-md border ${idx === imageIndex ? "border-emerald-300" : "border-zinc-800"}`} aria-label={`切换到第 ${idx + 1} 张封面`}>
                      <img src={image} alt={`${zhText(work.title)} 封面 ${idx + 1}`} className="h-full w-full object-contain bg-black" referrerPolicy="no-referrer" />
                    </button>
                  ))}
                </div>
              )}
            </div>
          ) : (
            <div className="relative flex aspect-video w-full items-center justify-center p-4">
              {currentImage ? (
                <div className="absolute inset-4 overflow-hidden rounded-lg border border-zinc-900 bg-zinc-900/40"><img src={currentImage} alt={zhText(work.title)} className="h-full w-full object-contain" referrerPolicy="no-referrer" /></div>
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
              <div className="grid gap-2">
                {work.links.map((link, idx) => {
                  const meta = getWorkLinkMeta(link);
                  if (!meta.isAttachment) {
                    return <a key={idx} href={link.url} target="_blank" rel="noopener noreferrer" className="inline-flex w-fit items-center space-x-1.5 rounded-lg border border-zinc-800 bg-zinc-900 px-3 py-1.5 text-xs text-zinc-200 hover:border-zinc-700 hover:text-white"><span>{zhText(meta.label)}</span><ExternalLink size={12} className="text-zinc-400" /></a>;
                  }
                  return (
                    <div key={idx} className="flex flex-wrap items-center justify-between gap-2 rounded-lg border border-zinc-900 bg-zinc-950/80 px-3 py-2">
                      <div className="flex min-w-0 items-center gap-2">
                        <FileText size={14} className="shrink-0 text-emerald-300/80" />
                        <span className="min-w-0 truncate text-xs text-zinc-200">{zhText(meta.label)}</span>
                        {meta.ext && <span className="rounded border border-zinc-800 px-1.5 py-0.5 text-[10px] uppercase text-zinc-500">{meta.ext}</span>}
                      </div>
                      <div className="flex shrink-0 gap-2">
                        {meta.canPreview && <a href={meta.previewUrl} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded border border-zinc-800 px-2 py-1 text-[11px] text-zinc-300 hover:border-zinc-600 hover:text-white"><ExternalLink size={11} /> 预览</a>}
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
      <div className="border-b border-zinc-900 pb-5"><span className="mb-1 block font-mono text-xs uppercase tracking-widest text-emerald-300/80">履历档案 / DIGITAL CURRICULUM VITAE</span><h2 className="font-serif text-3xl tracking-tight text-white md:text-4xl">个人履历 PDF</h2><p className="mt-3 text-[15px] leading-8 text-zinc-300">{zhText(pageCopy.resume)}</p></div>
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
        <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-950/60 p-10 text-center"><p className="font-serif text-xl text-white">暂未上传{zhText(active.position)}简历 PDF</p><p className="mt-3 text-sm leading-7 text-zinc-400">请进入后台 `/admin`，在“站点资料 → 简历展示”里为这个岗位上传 PDF，保存后这里会自动展示。</p></div>
      ) : (
        <div className="rounded-xl border border-dashed border-zinc-800 bg-zinc-950/60 p-10 text-center"><p className="font-serif text-xl text-white">暂未配置简历</p><p className="mt-3 text-sm leading-7 text-zinc-400">请进入后台 `/admin`，在“站点资料 → 简历展示”中新增岗位并上传 PDF 简历。</p></div>
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
  title = "我的创意合集",
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
    if (categoryOrder) return categoryOrder.filter((item) => item.key !== "all");
    return Array.from(new Set(items.map((item) => item.category).filter(Boolean)))
      .map((key) => ({ key, label: categoryLabel(key) }));
  }, [items, categoryOrder]);
  // 筛选项是跟着数据走的，删掉某分类最后一个作品后旧筛选值会落空，这里统一回落成「全部」。
  const activeFilter = filter === "all" || filters.some((item) => item.key === filter) ? filter : "all";
  const filteredItems = activeFilter === "all" ? items : items.filter((work) => work.category === activeFilter);

  return (
    <div className="space-y-8">
      <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end">
        <div>
          <span className="mb-2 block font-mono text-xs uppercase tracking-widest text-emerald-300/80">{eyebrow}</span>
          <h2 className="font-serif text-3xl tracking-tight text-white md:text-4xl">{zhText(title)}</h2>
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
        <div className="grid grid-cols-1 gap-6 pt-2 md:grid-cols-2">
          {filteredItems.map((work) => (
            <article
              key={work.id}
              onClick={() => onSelect(work)}
              className="group flex cursor-pointer flex-col justify-between space-y-4 rounded-xl border border-zinc-900 bg-zinc-950/60 p-5 transition-all duration-500 hover:border-zinc-800 hover:bg-zinc-950"
            >
              <div>
                <div className="mb-4 flex items-start justify-between">
                  <div className="flex items-center space-x-2.5">
                    <span className="rounded-lg border border-zinc-800 bg-zinc-900 p-2 transition-transform duration-300 group-hover:scale-105">{categoryIcon(work.category)}</span>
                    <span className="font-mono text-xs font-semibold uppercase tracking-widest text-zinc-200">{categoryLabel(work.category)}</span>
                  </div>
                  {work.badgeText && <span className="rounded border border-emerald-900 bg-emerald-950/40 px-2 py-0.5 font-mono text-[10px] text-emerald-300">{zhText(work.badgeText)}</span>}
                </div>
                <div className="relative mb-4 aspect-video overflow-hidden rounded-lg border border-zinc-900 bg-zinc-950/60 shadow-inner">
                  {work.images?.[0] ? (
                    <img src={work.images[0]} alt={zhText(work.title)} className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" referrerPolicy="no-referrer" />
                  ) : (
                    <div className="flex h-full w-full items-center justify-center bg-zinc-900/20 font-mono text-xs text-zinc-600">NO IMAGES</div>
                  )}
                  {(work.images?.length || 0) > 1 && <span className="absolute right-2 top-2 rounded border border-zinc-800 bg-black/70 px-2 py-0.5 font-mono text-[10px] text-zinc-200">{work.images.length} 图</span>}
                  <div className="absolute inset-0 flex items-center justify-center bg-black/50 opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                    <span className="rounded-md border border-zinc-850 bg-zinc-950/90 px-4 py-2 font-serif text-xs tracking-widest text-zinc-100 shadow-lg">查看详情与解读</span>
                  </div>
                </div>
                <h3 className="mb-1 line-clamp-1 font-serif text-lg font-bold tracking-wide text-white">{zhText(work.title)}</h3>
                <p className="mt-2 line-clamp-2 text-sm font-light leading-7 text-zinc-300/95 md:text-[15px]">{zhText(work.description)}</p>
              </div>
              <div className="flex flex-wrap gap-1.5 border-t border-zinc-900/50 pt-3">
                {(work.tags || []).slice(0, 3).map((tag, idx) => (
                  <span key={idx} className="rounded border border-zinc-850 bg-zinc-900 px-2.5 py-1 text-[11px] text-zinc-300 md:text-xs">{tag}</span>
                ))}
              </div>
            </article>
          ))}
        </div>
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
  eyebrow = "工程留影 / PROJECT SCREENSHOTS",
  title = "工程截图",
  description = defaultPageCopy.gallery,
  emptyTitle = "暂无工程截图",
  emptyDescription = "请在后台“工程截图”中上传图片并填写简介。",
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
  return (
    <div className="space-y-8">
      <div className="flex flex-col justify-between gap-6 md:flex-row md:items-end"><div><span className="mb-2 block font-mono text-xs uppercase tracking-widest text-emerald-300/80">{eyebrow}</span><h2 className="font-serif text-3xl tracking-tight text-white md:text-4xl">{zhText(title)}</h2><p className="mt-3 line-clamp-2 text-[15px] leading-7 text-zinc-300">{zhText(description)}</p></div><FilterRail allActive={filter === "all"} onAll={() => setFilter("all")} items={categories.map((category) => ({ key: category, label: category, active: filter === category, onSelect: () => setFilter(category) }))} /></div>
      {filtered.length > 0 ? (
        <div className="grid gap-6 md:grid-cols-2 xl:grid-cols-3">{filtered.map((item) => <button key={item.id} onClick={() => onSelect(item)} className="group flex h-full flex-col overflow-hidden rounded-xl border border-zinc-900 bg-zinc-950/60 text-left transition-all duration-300 hover:border-zinc-700 hover:bg-zinc-950"><div className="aspect-video overflow-hidden bg-zinc-900">{item.imageUrl ? <img src={item.imageUrl} alt={zhText(item.title)} className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" referrerPolicy="no-referrer" /> : <div className="flex h-full items-center justify-center font-mono text-xs text-zinc-600">NO SCREENSHOT</div>}</div><div className="flex flex-1 flex-col p-4"><span className="w-fit rounded border border-zinc-800 bg-zinc-900 px-2 py-0.5 text-[10px] text-emerald-300">{item.category || "应用"}</span><h3 className="mt-3 line-clamp-1 font-serif text-lg font-semibold text-white">{zhText(item.title)}</h3><p className="mt-2 line-clamp-2 text-sm leading-6 text-zinc-400">{zhText(item.description)}</p></div></button>)}</div>
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
  return (
    <div className="space-y-8">
      <div><span className="mb-2 block font-mono text-xs uppercase tracking-widest text-amber-300/80">{eyebrow}</span><h2 className="font-serif text-3xl tracking-tight text-white md:text-4xl">{zhText(title)}</h2><p className="mt-3 line-clamp-2 text-[15px] leading-7 text-zinc-300">{zhText(description)}</p></div>
      {items.length > 0 ? (
        <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">{items.map((item) => <button key={item.id} onClick={() => onSelect(item)} className="group overflow-hidden rounded-xl border border-zinc-900 bg-zinc-950/60 transition-all duration-300 hover:border-amber-800 hover:bg-zinc-950"><div className="aspect-[4/3] overflow-hidden bg-zinc-900">{item.imageUrl ? <img src={item.imageUrl} alt="珍藏" className="h-full w-full object-cover transition-transform duration-700 group-hover:scale-105" referrerPolicy="no-referrer" /> : <div className="flex h-full items-center justify-center font-mono text-xs text-zinc-600">NO IMAGE</div>}</div></button>)}</div>
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

function ContactPane({ data }: { data: PortfolioData }) {
  const contact = data.contact || { wechat: "", qq: "", email: "" };
  const pageCopy = { ...defaultPageCopy, ...(data.profile.pageCopy || {}) };
  const cards = [
    { label: "微信 / WeChat", value: contact.wechat, icon: <MessageCircle size={18} />, color: "text-emerald-300" },
    { label: "QQ", value: contact.qq, icon: <MessageCircle size={18} />, color: "text-blue-300" },
    { label: "电子邮箱 / Email", value: contact.email, icon: <Mail size={18} />, color: "text-amber-300" },
    { label: "手机号码 / Phone", value: contact.phone, icon: <Phone size={18} />, color: "text-rose-300" },
    { label: "GitHub", value: contact.github, icon: <Github size={18} />, color: "text-zinc-200" },
  ].filter((item) => item.value);
  return <div className="space-y-8"><div><span className="mb-1 block font-mono text-xs uppercase tracking-widest text-emerald-300/80">有缘相识，留笔通信 / INK STATION CONTACT</span><h2 className="font-serif text-3xl tracking-tight text-white md:text-4xl">与我取得联系</h2><p className="mt-3 text-[15px] leading-8 text-zinc-300">{zhText(pageCopy.contact)}</p></div><div className="grid gap-6 pt-2 md:grid-cols-2">{cards.map((card) => <a key={card.label} href={card.label === "GitHub" ? card.value : undefined} target={card.label === "GitHub" ? "_blank" : undefined} rel="noopener noreferrer" className="group flex flex-col justify-between space-y-4 rounded-xl border border-zinc-900 bg-zinc-950/60 p-5 transition-all duration-300 hover:border-zinc-800 hover:bg-zinc-950"><div className="flex items-center space-x-3"><span className={`rounded-lg border border-zinc-800 bg-zinc-900 p-2.5 ${card.color} transition-transform duration-300 group-hover:scale-105`}>{card.icon}</span><div><h4 className="font-serif text-base font-bold tracking-wider text-white">{card.label}</h4><p className="mt-0.5 font-mono text-[10px] uppercase text-zinc-500">Contact Channel</p></div></div><span className="break-all font-mono text-base font-medium tracking-wide text-white">{card.value}</span></a>)}</div></div>;
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

  const pageCopy = { ...defaultPageCopy, ...(data.profile.pageCopy || {}) };
  const floatingSentencesConfig = useMemo(() => resolveFloatingSentencesConfig(data.profile.pageCopy?.floatingSentences, activeTab), [data.profile.pageCopy?.floatingSentences, activeTab]);

  // 后台开关决定「我的珍藏」与「AI 专区」是否出现在前台。隐藏时连导航入口一起摘掉，
  // 而不是把空页面留在那里。
  //
  // 这里不需要额外的兜底副作用：站点只在挂载时取一次数据，而 activeTab 初值恒为
  // "intro"、选中项初值恒为 null，所以开关关闭时不可能停在被隐藏的栏目上。
  const treasuresVisible = isTreasuresVisible(data);
  const aiZoneVisible = isAiZoneVisible(data);
  const visibleNavItems = useMemo(
    () => navItems.filter((item) => (
      (item.key !== "treasures" || treasuresVisible) && (item.key !== "ai" || aiZoneVisible)
    )),
    [treasuresVisible, aiZoneVisible],
  );

  if (!portfolioReady) return <InitialLoader />;

  return (
    <div className="flex min-h-screen flex-col items-center justify-center overflow-x-hidden bg-[#09090b] p-4 font-sans leading-relaxed tracking-wide text-zinc-100 selection:bg-zinc-800 selection:text-white md:p-8 lg:p-12">
      <div className="fixed inset-0 z-0 pointer-events-none bg-[radial-gradient(circle_at_top,_#121215_0%,_#09090b_100%)]" />
      <div className="fixed inset-0 z-0 pointer-events-none bg-[linear-gradient(to_right,#808080_1px,transparent_1px),linear-gradient(to_bottom,#808080_1px,transparent_1px)] bg-[size:32px_32px] opacity-[0.03]" />
      <FloatingSentences config={floatingSentencesConfig} />
      <style>{`@keyframes soundWave { 0%, 100% { height: 6px; } 50% { height: 24px; } }.animate-sound-1 { animation: soundWave 0.8s ease-in-out infinite; }.animate-sound-2 { animation: soundWave 1.2s ease-in-out infinite; animation-delay: 0.2s; }.animate-sound-3 { animation: soundWave 0.9s ease-in-out infinite; animation-delay: 0.4s; }.animate-sound-4 { animation: soundWave 1.4s ease-in-out infinite; animation-delay: 0.1s; }@keyframes floatRight { 0%{transform:translate(0,0) scale(1);opacity:0.5} 42%{transform:translate(28vw,-4vh) scale(1.08);opacity:0.5} 58%{transform:translate(35vw,-2vh) scale(1.1);opacity:0.45} 78%{transform:translate(42vw,0vh) scale(1.1);opacity:0.25} 100%{transform:translate(52vw,-3vh) scale(1.1);opacity:0} }@keyframes floatLeft { 0%{transform:translate(0,0) scale(1);opacity:0.45} 48%{transform:translate(-28vw,6vh) scale(0.88);opacity:0.45} 62%{transform:translate(-35vw,8vh) scale(0.85);opacity:0.35} 78%{transform:translate(-40vw,6vh) scale(0.88);opacity:0.15} 100%{transform:translate(-42vw,10vh) scale(0.9);opacity:0} }@keyframes floatDiagonal { 0%{transform:translate(0,0) scale(0.9);opacity:0.5} 50%{transform:translate(20vw,-10vh) scale(1.14);opacity:0.5} 65%{transform:translate(14vw,0vh) scale(1.05);opacity:0.42} 78%{transform:translate(2vw,8vh) scale(0.9);opacity:0.15} 100%{transform:translate(-8vw,16vh) scale(0.8);opacity:0} }@keyframes floatUpDown { 0%{transform:translate(0,0) scale(1);opacity:0.5} 48%{transform:translate(6vw,-18vh) scale(1.05);opacity:0.5} 65%{transform:translate(3vw,-8vh) scale(1.0);opacity:0.4} 78%{transform:translate(-1vw,4vh) scale(0.9);opacity:0.15} 100%{transform:translate(1vw,14vh) scale(0.85);opacity:0} }`}</style>
      <div className="relative z-10 flex w-full max-w-7xl flex-col items-stretch gap-8 pb-12 pt-2 lg:flex-row lg:gap-12">
        <aside className="relative flex min-h-[520px] w-full shrink-0 flex-col justify-between rounded-2xl border border-zinc-900 bg-zinc-950/80 p-8 shadow-2xl md:p-10 lg:sticky lg:top-8 lg:min-h-[82vh] lg:w-[38%]">
          <div className="space-y-8">
            <div className="flex items-center justify-between border-b border-zinc-900/40 pb-4"><span className="font-mono text-xs uppercase tracking-widest text-zinc-400">我的空间 / MY SPACE</span><div className="flex h-[24px] items-end space-x-[3px] px-2 opacity-90"><div className="animate-sound-1 w-[3px] rounded-full bg-emerald-300" /><div className="animate-sound-2 w-[3px] rounded-full bg-zinc-300" /><div className="animate-sound-3 w-[3px] rounded-full bg-emerald-300" /><div className="animate-sound-4 w-[3px] rounded-full bg-zinc-300" /></div></div>
            <div className="flex flex-col space-y-5"><div className="relative h-24 w-24 overflow-hidden rounded-full border-2 border-zinc-800 shadow-md md:h-28 md:w-28"><img src={data.profile.avatar} alt={data.profile.name} className="h-full w-full object-cover transition-transform duration-700 hover:scale-110" referrerPolicy="no-referrer" /></div><div className="space-y-2"><h1 className="font-serif text-3xl font-bold tracking-widest text-white md:text-4xl">{data.profile.name}</h1><p className="text-base font-medium leading-relaxed tracking-wide text-zinc-200 md:text-lg">{zhText(data.profile.tagline)}</p></div></div>
            <div className="relative border-t border-zinc-900/60 pt-6"><span className="pointer-events-none absolute right-2 top-4 select-none font-serif text-8xl font-extrabold text-zinc-900/20">墨</span><span className="mb-4 block font-mono text-xs uppercase tracking-widest text-emerald-300/80">闲言碎语 / CASUAL CHAT</span><p className="whitespace-pre-wrap font-serif text-base italic leading-loose text-zinc-200 md:text-lg">{zhText(data.profile.quote)}</p></div>
            <div className="border-t border-zinc-900/60 pt-6"><AudioBlock tracks={data.musicTracks || []} autoplay={data.profile.musicAutoplay} /></div>
          </div>
          <div className="mt-8 flex flex-col items-center justify-between gap-2.5 border-t border-zinc-900/60 pt-5 font-mono text-[10px] text-zinc-500 sm:flex-row lg:mt-0">
            <div className="flex shrink-0 items-center space-x-1.5"><span className="h-1.5 w-1.5 animate-pulse rounded-full bg-emerald-400" /><span className="font-semibold uppercase text-zinc-300">Dear970 Studio</span><span>|</span><span>HEFEI</span></div>
            <span>© {new Date().getFullYear()} DESIGN PORTFOLIO</span>
          </div>
        </aside>
        <section className="relative flex min-h-[60vh] flex-1 flex-col rounded-2xl border border-zinc-900 bg-[#0c0c0e] p-8 shadow-2xl md:p-12">
          <header className="sticky top-0 z-20 mb-8 flex items-center justify-between border-b border-zinc-900 bg-[#0c0c0e]/95 pb-5 backdrop-blur-md">
            <nav className="hidden flex-nowrap items-center gap-2 md:flex">{visibleNavItems.map((item) => <button key={item.key} onClick={() => setActiveTab(item.key)} className={`flex shrink-0 cursor-pointer flex-col items-center justify-center rounded-xl border px-3.5 py-2.5 transition-all duration-300 ${activeTab === item.key ? "border-zinc-700 bg-zinc-900 text-white shadow-md" : "border-transparent text-zinc-300 hover:bg-zinc-950/20 hover:text-white"}`}><span className="font-serif text-[14px] font-bold tracking-widest md:text-[15px]">{item.label}</span><span className={`mt-1 font-mono text-[9px] uppercase tracking-widest ${activeTab === item.key ? "text-emerald-300/85" : "text-zinc-500"}`}>{item.sub}</span></button>)}</nav>
            <span className="font-serif text-base font-semibold tracking-wider text-white md:hidden">我的空间</span><button onClick={() => setMobileMenuOpen(!mobileMenuOpen)} className="rounded-lg border border-zinc-800 bg-zinc-900 p-2.5 text-zinc-300 hover:text-white md:hidden" aria-label="移动端菜单">{mobileMenuOpen ? <X size={18} /> : <Menu size={18} />}</button>
          </header>
          {mobileMenuOpen && <div className="absolute left-6 right-6 top-20 z-30 flex flex-col space-y-3 rounded-xl border border-zinc-800 bg-zinc-950 p-5 shadow-2xl md:hidden">{visibleNavItems.map((item) => <button key={item.key} onClick={() => { setActiveTab(item.key); setMobileMenuOpen(false); }} className={`flex w-full flex-col justify-start rounded-xl p-3 px-4 text-left transition-all ${activeTab === item.key ? "border border-zinc-700 bg-zinc-900 text-white" : "text-zinc-300 hover:bg-zinc-900/50"}`}><span className="font-serif text-base font-bold tracking-widest">{item.label}</span><span className={`mt-1 font-mono text-[10px] uppercase tracking-widest ${activeTab === item.key ? "text-emerald-300/85" : "text-zinc-500"}`}>{item.sub}</span></button>)}</div>}
          <div className="flex-1">
            {activeTab === "intro" && <div className="space-y-10"><div className="space-y-4"><span className="mb-2 block font-mono text-xs uppercase tracking-widest text-emerald-300/80">墨香独白 / MONOLOGUE BODY</span><h2 className="font-serif text-3xl leading-normal tracking-tight text-white md:text-4xl">自我评价</h2><p className="text-[15px] font-light leading-8 text-zinc-100/90 md:text-[17px] md:leading-9">{zhText(data.profile.intro)}</p></div><div className="space-y-8 border-t border-zinc-900/60 pt-8"><span className="mb-3 block font-mono text-xs uppercase tracking-widest text-emerald-300/80">尘埃之迹 / PERSONAL PATH TIMELINE</span><div className="relative space-y-8 before:absolute before:inset-y-1 before:left-2 before:w-[1.5px] before:bg-zinc-900">{data.experiences.map((exp) => <article key={exp.id} className="group relative pl-8"><div className="absolute left-[4px] top-[9px] h-2.5 w-2.5 rounded-full border-2 border-zinc-950 bg-zinc-800 transition-colors duration-300 group-hover:bg-zinc-300" /><div className="mb-2 grid gap-2 text-center md:grid-cols-3 md:items-center"><span className="justify-self-center font-mono text-xs font-semibold tracking-wider text-emerald-300/80 md:justify-self-start md:text-sm">{zhText(exp.period)}</span><span className="justify-self-center font-serif text-base font-medium text-white md:text-lg">{zhText(exp.role)}</span><span className="justify-self-center font-sans text-xs text-zinc-400 md:justify-self-end md:text-right md:text-sm">@ {zhText(exp.company)}</span></div><p className="text-[15px] font-light leading-7 text-zinc-200/90">{zhText(exp.desc)}</p></article>)}</div></div></div>}
            {activeTab === "works" && <WorksPane items={data.works} description={pageCopy.works} onSelect={setSelectedWork} categoryOrder={workCategories} />}
            {activeTab === "ai" && aiZoneVisible && <WorksPane items={data.profile.pageCopy?.aiWorks || []} description={pageCopy.aiZone} onSelect={setSelectedAiWork} eyebrow="与 AI 共作 / AI ZONE EXHIBITS" title="AI 专区" emptyTitle="暂无 AI 作品" emptyDescription="请进入后台 /admin，在「AI 专区」中新增作品并保存。" />}
            {activeTab === "prospects" && <GalleryPane items={data.gallery || []} onSelect={setSelectedGallery} description={pageCopy.gallery} />}
            {activeTab === "treasures" && treasuresVisible && <TreasurePane items={data.treasures || []} onSelect={setSelectedTreasure} description={pageCopy.treasures} />}
            {activeTab === "resume" && <ResumePane data={data} />}
            {activeTab === "contact" && <ContactPane data={data} />}
          </div>
        </section>
      </div>
      {selectedWork && <WorkModal work={selectedWork} onClose={() => setSelectedWork(null)} />}
      {selectedAiWork && <WorkModal work={selectedAiWork} onClose={() => setSelectedAiWork(null)} />}
      {selectedGallery && <GalleryModal item={selectedGallery} onClose={() => setSelectedGallery(null)} />}
      {selectedTreasure && <TreasureModal item={selectedTreasure} onClose={() => setSelectedTreasure(null)} />}
      <footer className="relative z-20 w-full pb-2 text-center font-mono text-[11px] text-zinc-500">
        备案号：
        <a href="https://beian.miit.gov.cn/" target="_blank" rel="noopener noreferrer" className="transition-colors hover:text-zinc-300">皖ICP备2026017545号</a>
      </footer>
    </div>
  );
}
