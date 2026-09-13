import React, { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  ArrowLeftRight,
  AtSign,
  Briefcase,
  Check,
  CircleAlert,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  FileText,
  Gem,
  HardDrive,
  ImagePlus,
  Images,
  Info,
  LayoutGrid,
  Link as LinkIcon,
  Loader2,
  LogOut,
  MessagesSquare,
  Music,
  Plus,
  Save,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserRound,
  Video,
} from "lucide-react";
import { Experience, GalleryItem, MusicTrack, PortfolioData, ResumeProfile, TreasureItem, Work, WorkLink, defaultPageCopy } from "./types";

const emptyWork: Work = {
  id: "",
  category: "app",
  title: "",
  description: "",
  icon: "",
  badgeText: "",
  images: [],
  videoUrl: "",
  links: [],
  tags: [],
};

const emptyExperience: Experience = {
  id: "",
  period: "",
  role: "",
  company: "",
  desc: "",
};

const emptyGalleryItem: GalleryItem = {
  id: "",
  category: "应用",
  title: "",
  description: "",
  imageUrl: "",
};

const emptyTreasureItem: TreasureItem = {
  id: "",
  imageUrl: "",
};

const emptyMusicTrack: MusicTrack = {
  id: "",
  title: "",
  artist: "",
  audioUrl: "",
  coverUrl: "",
  lyrics: "",
};

const workCategoryOptions = [
  { value: "operation", label: "账号运营" },
  { value: "app", label: "应用制作" },
  { value: "prototype", label: "原型图" },
  { value: "video", label: "视频剪辑" },
];

const aiCategoryOptions = [
  { value: "agent", label: "AI Agent" },
  { value: "image", label: "AI 绘图" },
  { value: "text", label: "AI 文案" },
  { value: "video", label: "AI 视频" },
];

const galleryCategoryOptions = [
  { value: "应用", label: "应用" },
  { value: "原型图", label: "原型图" },
  { value: "Agent", label: "Agent" },
  { value: "剪辑", label: "剪辑" },
];

const defaultFloatingSentences = [
  "此情可待成追忆",
  "岁月不语，惟石能言",
  "浮生若梦，为欢几何",
  "人间有味是清欢",
  "且将新火试新茶",
  "诗酒趁年华",
];

const floatingPageOptions = [
  { key: "intro", label: "自我介绍" },
  { key: "resume", label: "个人简历" },
  { key: "works", label: "作品展示" },
  { key: "prospects", label: "工程截图" },
  { key: "treasures", label: "我的珍藏" },
  { key: "contact", label: "联系方式" },
];

function cleanSentences(items: string[]) {
  return items.map((item) => item.trim());
}

function normalizeFloatingCount(value: string | number | undefined) {
  const next = Number(value);
  if (!Number.isFinite(next)) return 2;
  return Math.min(20, Math.max(1, Math.round(next)));
}

function stripLyricTimeline(value?: string) {
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
    .filter(Boolean)
    .join("\n");
}

function applyPlainLyricsToTimeline(original: string | undefined, plain: string) {
  const plainLines = plain.split(/\r?\n/).map((line) => line.trim()).filter(Boolean);
  const timedLines = String(original || "")
    .split(/\r?\n/)
    .map((line) => ({
      source: line,
      time: line.match(/^\s*(\[[^\]]+\])/),
      text: line.replace(/\[[^\]]+\]/g, "").replace(/<[^>]+>/g, "").trim(),
    }))
    .filter((line) => line.text);

  if (timedLines.length === 0) return plainLines.join("\n");
  return plainLines.map((line, index) => {
    const source = timedLines[index];
    const timeTag = source?.time?.[1];
    return timeTag ? `${timeTag}${line}` : line;
  }).join("\n");
}

type EditableLyricChar = { char: string; time: number };
type EditableLyricLine = { time: number; chars: EditableLyricChar[] };
type EditableLyrics = { headers: string[]; lines: EditableLyricLine[] };
type MarkedLyricMap = Record<string, number>;

function parseAdminLyricTime(value: string) {
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

function formatAdminLyricTime(seconds: number) {
  const total = Math.max(0, seconds);
  const mins = Math.floor(total / 60);
  const secs = Math.floor(total % 60);
  const centis = Math.floor((total - Math.floor(total)) * 100);
  return `${String(mins).padStart(2, "0")}:${String(secs).padStart(2, "0")}.${String(centis).padStart(2, "0")}`;
}

function parseEditableLyrics(raw?: string): EditableLyrics {
  const headers: string[] = [];
  const lines: EditableLyricLine[] = [];
  String(raw || "").split(/\r?\n/).forEach((sourceLine) => {
    const line = sourceLine.trim();
    if (!line) return;
    const lineTimeMatch = line.match(/^\[(\d{1,2}:\d{1,2}(?:[.:]\d{1,3})?)\]/);
    const lineTime = lineTimeMatch ? parseAdminLyricTime(lineTimeMatch[1]) : null;
    if (lineTime === null) {
      headers.push(line);
      return;
    }

    const body = line.replace(/^\[[^\]]+\]/, "");
    const inlineTags = [...body.matchAll(/<((?:(?:\d{1,2}:)?\d{1,2}:)?\d{1,2}(?:[.,:]\d{1,3})?)>/g)]
      .map((match) => ({
        index: match.index ?? 0,
        endIndex: (match.index ?? 0) + match[0].length,
        time: parseAdminLyricTime(match[1]),
      }))
      .filter((tag): tag is { index: number; endIndex: number; time: number } => tag.time !== null);

    if (inlineTags.length === 0) {
      const text = body.replace(/<[^>]+>/g, "").trim();
      if (text) {
        lines.push({ time: lineTime, chars: text.split("").map((char, index) => ({ char, time: lineTime + index * 0.24 })) });
      }
      return;
    }

    const chars: EditableLyricChar[] = [];
    inlineTags.forEach((tag, index) => {
      const nextTag = inlineTags[index + 1];
      const segment = body.slice(tag.endIndex, nextTag?.index ?? body.length);
      segment.split("").forEach((char, charIndex) => {
        if (!char.trim() && char !== " ") return;
        const nextTime = nextTag?.time;
        const span = nextTime && nextTime > tag.time ? nextTime - tag.time : 0;
        const time = span > 0 ? tag.time + (span * charIndex) / Math.max(segment.length, 1) : tag.time;
        chars.push({ char, time });
      });
    });
    if (chars.length > 0) lines.push({ time: chars[0].time, chars });
  });
  return { headers, lines };
}

function buildEditableLyrics(editable: EditableLyrics) {
  const lyricLines = editable.lines.map((line) => {
    const firstTime = line.chars[0]?.time ?? line.time;
    return `[${formatAdminLyricTime(firstTime)}]${line.chars.map((item) => `<${formatAdminLyricTime(item.time)}>${item.char}`).join("")}`;
  });
  return [...editable.headers, ...lyricLines].join("\n");
}

function hasEnhancedLyricTimeline(value?: string) {
  return /<((?:(?:\d{1,2}:)?\d{1,2}:)?\d{1,2}(?:[.,:]\d{1,3})?)>/.test(String(value || ""));
}

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

function ArrayEditor({
  label,
  items,
  onChange,
  placeholder,
  onRemove,
}: {
  label: string;
  items: string[];
  onChange: (items: string[]) => void;
  placeholder?: string;
  onRemove?: (item: string) => void;
}) {
  const inputRefs = useRef<Array<HTMLInputElement | null>>([]);
  const [focusIndex, setFocusIndex] = useState<number | null>(null);

  useEffect(() => {
    if (focusIndex === null) return;
    const input = inputRefs.current[focusIndex];
    if (!input) return;
    input.focus();
    input.select();
    setFocusIndex(null);
  }, [focusIndex, items.length]);

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-xs font-medium text-zinc-500">{label}</span>
        <button
          onClick={() => {
            const next = [...(items || []), ""];
            onChange(next);
            setFocusIndex(next.length - 1);
          }}
          className="inline-flex items-center gap-1 rounded-md border border-zinc-800 px-2 py-1 text-xs text-zinc-300 hover:border-zinc-600"
          type="button"
        >
          <Plus size={12} /> 新增
        </button>
      </div>
      <div className="space-y-1.5">
        {(items || []).map((item, index) => (
          <div key={index} className="flex gap-2">
            <input
              ref={(element) => { inputRefs.current[index] = element; }}
              value={item}
              onChange={(event) => {
                const next = [...items];
                next[index] = event.target.value;
                onChange(next);
              }}
              placeholder={placeholder}
              className="min-w-0 flex-1 rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-2 text-sm text-zinc-100 outline-none focus:border-emerald-400"
            />
            <button
              onClick={() => {
                onRemove?.(item);
                onChange(items.filter((_, itemIndex) => itemIndex !== index));
              }}
              className="rounded-lg border border-zinc-800 px-2 text-zinc-500 hover:border-red-500 hover:text-red-300"
              type="button"
              aria-label="删除"
            >
              <Trash2 size={15} />
            </button>
          </div>
        ))}
      </div>
    </div>
  );
}

function uid(prefix: string) {
  const randomId = globalThis.crypto?.randomUUID?.()
    || `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
  return `${prefix}-${randomId}`;
}

/**
 * 列表条目的「行标识」：有 id 用 id，没有 id（历史数据）退回下标。
 *
 * **不要拿 item.id 直接去判断「哪一行展开了」。** 历史数据里 id 可能是空串，
 * 而「一行都没展开」的哨兵值一度也是空串，两者一撞就是两个后果：
 *   1. 首屏所有无 id 的行都被判成「已展开」，展开区一股脑全开；
 *   2. toggle 的「当前值」和「目标值」恒等，点了没反应。
 * 所以哨兵值一律用 null（见各 expanded*Id 的初值），并且比较时统一走 rowKey ——
 * 「null 永远不等于任何 rowKey」这条不变量保证上面两个问题不再出现。
 *
 * 空 id 时刻意加上 `#` 前缀：虽然理论上极少，但若某条目的 id 恰好是 "0"，
 * 不带前缀就会和第 0 行（无 id）撞成同一个值。
 */
function rowKey(id: string | null | undefined, index: number) {
  return id || `#${index}`;
}

function cloneData(data: PortfolioData): PortfolioData {
  return JSON.parse(JSON.stringify(data));
}

/**
 * 就地修改 pageCopy 的一个小工具。默认值先铺底，再叠上磁盘上的真实数据，最后应用本次改动，
 * 这样页面上任何一处改 pageCopy 都不会把其它键（包括新增的 aiWorks / resumeProfiles）冲掉。
 */
function editPageCopy(
  draft: PortfolioData,
  patch: Partial<NonNullable<PortfolioData["profile"]["pageCopy"]>>,
) {
  draft.profile.pageCopy = { ...defaultPageCopy, ...(draft.profile.pageCopy || {}), ...patch };
}

async function compressImageForUpload(file: File) {
  const compressibleTypes = ["image/jpeg", "image/png", "image/webp"];
  if (!compressibleTypes.includes(file.type)) return file;

  const bitmap = await createImageBitmap(file);
  const maxEdge = 1600;
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { alpha: true });
  if (!context) {
    bitmap.close();
    return file;
  }

  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob(resolve, "image/webp", 0.82);
  });

  if (!blob || blob.size >= file.size) return file;
  const cleanName = file.name.replace(/\.[^.]+$/, "");
  return new File([blob], `${cleanName}.webp`, { type: "image/webp", lastModified: Date.now() });
}

function normalize(data: PortfolioData): PortfolioData {
  return {
    ...data,
    profile: {
      ...(data.profile || { name: "", avatar: "", tagline: "", intro: "", quote: "", resumePdfUrl: "" }),
      musicAutoplay: Boolean(data.profile?.musicAutoplay),
      pageCopy: { ...defaultPageCopy, ...(data.profile?.pageCopy || {}) },
    },
    prospects: data.prospects || { title: "", content: "", points: [] },
    contact: data.contact || { wechat: "", qq: "", email: "", phone: "", github: "" },
    experiences: data.experiences || [],
    works: data.works || [],
    gallery: data.gallery || [],
    treasures: data.treasures || [],
    musicTracks: data.musicTracks || [],
  };
}

function collectWorkMedia(work: Work) {
  return [
    ...(work.images || []),
    work.videoUrl || "",
    ...(work.links || []).map((link) => link.url || ""),
  ].filter(Boolean);
}

/**
 * 输入控件的统一皮。后台 9 个栏目和登录页共用同一套边框 / 底色 / 焦点环，
 * 免得同一个后台里出现两种手感的输入框。
 */
const inputBaseClass =
  "w-full rounded-lg border border-zinc-700/80 bg-zinc-900/40 text-sm text-zinc-100 outline-none transition-colors duration-200 placeholder:text-zinc-600 hover:border-zinc-600 focus:border-emerald-400 focus-visible:ring-2 focus-visible:ring-emerald-400/25";

/**
 * 表单输入。后台 9 个栏目全部走这一个组件，所以这里改一次全局生效。
 *
 * 对比度：标签从 zinc-500 提到 zinc-400 —— 原来的 zinc-500 在 #09090b 底上只有
 * 约 4.1:1，12px 属于正文级字号，达不到 WCAG AA 的 4.5:1；zinc-400 约 7.2:1。
 * 输入框边框从 zinc-800 提到 zinc-700/80，并把底色抬到 zinc-900/40，
 * 让输入区域在暗色面板上有可见的边界，而不是只靠一根几乎看不见的线。
 */
function Field({
  label,
  value,
  onChange,
  textarea,
  placeholder,
  hint,
}: {
  label: string;
  value?: string;
  onChange: (value: string) => void;
  textarea?: boolean;
  placeholder?: string;
  /** 常驻的辅助说明（不是 placeholder 那种一输入就消失的提示），放在输入框下方。 */
  hint?: string;
}) {
  const fieldClass = `${inputBaseClass} px-3`;

  return (
    <label className="grid gap-1.5">
      <span className="text-xs font-medium text-zinc-400">{label}</span>
      {textarea ? (
        <textarea
          value={value || ""}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          rows={3}
          className={`${fieldClass} min-h-[88px] resize-y py-2.5 leading-6`}
        />
      ) : (
        <input
          value={value || ""}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className={`${fieldClass} min-h-11 py-2.5`}
        />
      )}
      {hint && <span className="text-[11px] leading-4 text-zinc-500">{hint}</span>}
    </label>
  );
}

function SelectField({
  label,
  value,
  options,
  onChange,
}: {
  label: string;
  value?: string;
  options: { value: string; label: string }[];
  onChange: (value: string) => void;
}) {
  // 只有 value 压根没传（undefined / null）才回退到第一个选项。
  // 值就是空串时必须原样保留：那代表「这条内容的分类是空的」，
  // 之前用 `value || options[0].value` 会把空分类偷偷显示成第一个选项，
  // 看起来像分类被改了，实际只是显示骗人 —— 而且迁移过来的条目分类本就可能是对面栏目的词。
  const normalizedValue = value ?? options[0]?.value ?? "";
  const hasCurrent = options.some((option) => option.value === normalizedValue);
  const visibleOptions = hasCurrent
    ? options
    : [{ value: normalizedValue, label: normalizedValue ? `${normalizedValue}（当前）` : "（当前：未设置）" }, ...options];

  return (
    <label className="grid gap-1.5">
      <span className="text-xs font-medium text-zinc-400">{label}</span>
      <select
        value={normalizedValue}
        onChange={(event) => onChange(event.target.value)}
        className={`${inputBaseClass} min-h-11 px-3 py-2.5`}
      >
        {visibleOptions.map((option) => (
          <option key={option.value} value={option.value}>
            {option.label}
          </option>
        ))}
      </select>
    </label>
  );
}

function LyricTimelineEditor({
  track,
  onChange,
}: {
  track: MusicTrack;
  onChange: (lyrics: string) => void;
}) {
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const [lastMarkedKey, setLastMarkedKey] = useState("");
  const [markedTimes, setMarkedTimes] = useState<MarkedLyricMap>({});
  const editable = useMemo(() => parseEditableLyrics(track.lyrics), [track.lyrics]);
  const hasTimeline = editable.lines.some((line) => line.chars.length > 0);

  const redistributeLine = (line: EditableLyricLine, lineIndex: number, anchors: MarkedLyricMap) => {
    if (line.chars.length < 2) return;
    const anchorIndexes = line.chars
      .map((_, index) => index)
      .filter((index) => anchors[`${lineIndex}-${index}`] !== undefined)
      .sort((a, b) => a - b);
    if (anchorIndexes.length === 0) return;

    const spread = (from: number, to: number, startTime: number, endTime: number) => {
      const count = to - from;
      if (count <= 0) return;
      const span = Math.max(0.05, (endTime - startTime) / count);
      for (let index = from; index <= to; index += 1) {
        line.chars[index].time = Number((startTime + span * (index - from)).toFixed(2));
      }
    };

    anchorIndexes.forEach((anchorIndex) => {
      line.chars[anchorIndex].time = Number(anchors[`${lineIndex}-${anchorIndex}`].toFixed(2));
    });

    const first = anchorIndexes[0];
    if (first > 0) {
      const naturalSpan = first > 1 ? Math.max(0.08, Math.min(0.38, (line.chars[first].time - line.chars[0].time) / first)) : 0.2;
      const startTime = Math.max(0, line.chars[first].time - naturalSpan * first);
      spread(0, first, startTime, line.chars[first].time);
    }

    for (let index = 0; index < anchorIndexes.length - 1; index += 1) {
      const from = anchorIndexes[index];
      const to = anchorIndexes[index + 1];
      spread(from, to, line.chars[from].time, line.chars[to].time);
    }

    const last = anchorIndexes[anchorIndexes.length - 1];
    if (last < line.chars.length - 1) {
      const previousSpan = last > 0 ? Math.max(0.08, Math.min(0.38, line.chars[last].time - line.chars[last - 1].time)) : 0.2;
      for (let index = last + 1; index < line.chars.length; index += 1) {
        line.chars[index].time = Number((line.chars[index - 1].time + previousSpan).toFixed(2));
      }
    }

    line.time = line.chars[0]?.time ?? line.time;
  };

  const updateCharTime = (lineIndex: number, charIndex: number, time: number) => {
    const next = parseEditableLyrics(track.lyrics);
    const line = next.lines[lineIndex];
    const item = line?.chars[charIndex];
    if (!line || !item) return;
    item.time = Math.max(0, Number(time.toFixed(2)));
    line.chars.forEach((char, index) => {
      if (index === 0) return;
      const previous = line.chars[index - 1];
      if (char.time <= previous.time) char.time = Number((previous.time + 0.05).toFixed(2));
    });
    line.time = line.chars[0]?.time ?? line.time;
    onChange(buildEditableLyrics(next));
  };

  const markCharTime = (lineIndex: number, charIndex: number, time: number) => {
    const key = `${lineIndex}-${charIndex}`;
    const nextMarked = { ...markedTimes, [key]: Math.max(0, Number(time.toFixed(2))) };
    const next = parseEditableLyrics(track.lyrics);
    const line = next.lines[lineIndex];
    if (!line) return;
    redistributeLine(line, lineIndex, nextMarked);
    setMarkedTimes(nextMarked);
    setLastMarkedKey(key);
    onChange(buildEditableLyrics(next));
  };

  const seekTo = async (time: number) => {
    const audio = audioRef.current;
    if (!audio) return;
    audio.currentTime = Math.max(0, time);
    setCurrentTime(audio.currentTime);
    try {
      await audio.play();
    } catch {
      // Browser may block autoplay-like playback until direct interaction settles.
    }
  };

  const markCharAtCurrentTime = (lineIndex: number, charIndex: number) => {
    const audio = audioRef.current;
    const time = audio?.currentTime ?? currentTime;
    markCharTime(lineIndex, charIndex, time);
  };

  if (!hasTimeline) {
    return (
      <div className="adm-note text-xs leading-5 text-zinc-500">
        保存这首音乐后会自动生成逐字时间轴，随后可在这里手动微调。
      </div>
    );
  }

  return (
    // 这里原来是「外框 → 逐句框 → 逐字框」三层边框叠在一起，是全后台最深的框套框。
    // 现在整块只有分隔线：句子之间一条线，字块只保留自己的小色块。
    <div className="space-y-3">
      <div className="grid gap-3 md:grid-cols-[minmax(220px,320px),1fr] md:items-center">
        <audio
          ref={audioRef}
          src={track.audioUrl}
          controls
          className="h-8 w-full"
          onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime || 0)}
        />
        <div className="flex flex-wrap items-center gap-2 text-xs text-zinc-400">
          <span className="font-mono text-emerald-300">{currentTime.toFixed(2)}s</span>
          <span>听到哪个字就点哪个字，系统会记录当前播放时间。小“听”用于回放核对。</span>
        </div>
      </div>
      <div className="max-h-72 divide-y divide-zinc-800/50 overflow-y-auto pr-1">
        {editable.lines.map((line, lineIndex) => (
          <div key={lineIndex} className="py-2.5">
            <div className="mb-2 flex items-center justify-between text-[10px] text-zinc-600">
              <span>第 {lineIndex + 1} 句</span>
              <button
                type="button"
                onClick={() => { void seekTo(line.chars[0]?.time ?? line.time); }}
                className="rounded border border-zinc-800 px-2 py-0.5 text-zinc-400 hover:border-emerald-500 hover:text-emerald-200"
              >
                听本句
              </button>
            </div>
            <div className="flex flex-wrap gap-1.5">
              {line.chars.map((item, charIndex) => {
                const active = currentTime >= item.time && currentTime < (line.chars[charIndex + 1]?.time ?? item.time + 0.35);
                const marked = lastMarkedKey === `${lineIndex}-${charIndex}`;
                const anchored = markedTimes[`${lineIndex}-${charIndex}`] !== undefined;
                // 字块是「控件」不是「容器」，保留小色块，但用底色 + ring 代替描边，
                // 免得一屏几十个描边把整页读成一堆小框。
                return (
                  <div key={`${lineIndex}-${charIndex}`} className={`flex items-center gap-1 rounded-md px-1.5 py-1 ring-1 ring-inset transition-colors duration-150 ${marked ? "bg-emerald-400/25 ring-emerald-300" : anchored ? "bg-emerald-400/12 ring-emerald-500/40" : active ? "bg-emerald-400/15 ring-emerald-400/60" : "bg-white/[0.04] ring-transparent"}`}>
                    <button
                      type="button"
                      onClick={() => markCharAtCurrentTime(lineIndex, charIndex)}
                      className="min-w-6 rounded px-1 font-serif text-base text-zinc-100 hover:bg-emerald-300/10 hover:text-emerald-200"
                      title={`点击打点为当前播放时间 ${currentTime.toFixed(2)}s`}
                    >
                      {item.char}
                    </button>
                    {anchored && <span className="h-1.5 w-1.5 rounded-full bg-emerald-300" title="手动锚点" />}
                    <button type="button" onClick={() => { void seekTo(item.time); }} className="rounded border border-zinc-800 px-1 text-[10px] text-zinc-500 hover:border-emerald-500 hover:text-emerald-200">听</button>
                    <button type="button" onClick={() => updateCharTime(lineIndex, charIndex, item.time - 0.05)} className="text-[10px] text-zinc-500 hover:text-emerald-200">-</button>
                    <input
                      type="number"
                      step="0.01"
                      value={item.time.toFixed(2)}
                      onChange={(event) => updateCharTime(lineIndex, charIndex, Number(event.target.value))}
                      className="w-14 rounded border border-zinc-800 bg-black px-1 py-0.5 font-mono text-[10px] text-zinc-300 outline-none focus:border-emerald-400"
                    />
                    <button type="button" onClick={() => updateCharTime(lineIndex, charIndex, item.time + 0.05)} className="text-[10px] text-zinc-500 hover:text-emerald-200">+</button>
                  </div>
                );
              })}
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * 内容面板。后台所有栏目共用。
 *
 * 层级规则见 index.css 的「后台信息层级基元」。这里只有两种形态，就是为了
 * 「禁止框套框」：
 *   - 默认（.adm-card）：栏目级卡片，**全后台唯一的边框**。
 *   - nested（.adm-panel）：栏目内部的分组，只有色调和圆角，**没有边框**。
 *     一眼看上去是「一块区域」，不会读成「框里又套了个框」。
 *
 * 历史上这里写过 `border-zinc-850` —— Tailwind 的 zinc 色阶是
 * 50/100/.../900/950，**根本没有 850**，那个类不会生成任何样式；而 `border`
 * 只给了宽度和样式，颜色会回落到 `currentColor`，于是每张卡片都描着一圈近乎
 * 白色的边（后台根节点是 text-zinc-100）。所以现在的写法是：卡片样式集中在
 * index.css 的 .adm-card / .adm-panel 里，不在这里拼 Tailwind 类名。
 */
function Section({
  title,
  description,
  nested,
  children,
}: {
  title: string;
  description?: string;
  /** 嵌在另一个 Section 里时置 true：换成无边框的色调分组面，读起来像「子区域」而不是「卡片里又塞了张卡片」。 */
  nested?: boolean;
  children: React.ReactNode;
}) {
  return (
    <section className={nested ? "adm-panel" : "adm-card"}>
      <div className={nested ? "px-4 pb-0 pt-3.5 md:px-5" : "border-b border-zinc-800/60 px-4 py-3 md:px-5"}>
        <h2
          className={
            nested
              ? "text-xs font-semibold tracking-[0.12em] text-zinc-300"
              : "text-sm font-semibold tracking-wide text-white"
          }
        >
          {title}
        </h2>
        {description && <p className="mt-1 text-xs leading-5 text-zinc-400">{description}</p>}
      </div>
      <div className={nested ? "space-y-3 px-4 pb-4 pt-3 md:px-5" : "space-y-4 p-4 md:p-5"}>{children}</div>
    </section>
  );
}

/**
 * 前台栏目显隐开关。「我的珍藏」和「AI 专区」共用这一个组件，避免两处各写一套
 * 开关后交互和可访问性逐渐走样——要调样式只改这里。
 *
 * 可访问性要点：真实控件保留原生 checkbox + role="switch"，所以键盘 Space、读屏
 * 播报「switch on/off」都是原生行为；焦点圈画在视觉轨道上（peer-focus-visible）；
 * 状态不只靠颜色，右边始终有「已开启 / 已关闭」文字。
 */
function VisibilitySwitch({
  name,
  hint,
  checked,
  disabled,
  onChange,
  compact = false,
}: {
  /** 栏目名，例如「我的珍藏」栏目。开关文案和隐藏提示都由它拼出来。 */
  name: string;
  hint?: string;
  checked: boolean;
  disabled?: boolean;
  onChange: (next: boolean) => void;
  /** 紧凑模式：给列表里逐条使用，只留一行开关，不带说明卡片和警告文案。 */
  compact?: boolean;
}) {
  const label = `在网站前台展示${name}`;
  const toggle = (
    <label className="inline-flex shrink-0 cursor-pointer items-center gap-3 rounded-lg px-1 py-2.5">
      <span className={`text-sm ${checked ? "text-emerald-300" : "text-zinc-500"}`}>
        {checked ? "已开启" : "已关闭"}
      </span>
      <input
        type="checkbox"
        role="switch"
        aria-checked={checked}
        aria-label={label}
        className="peer sr-only"
        checked={checked}
        disabled={disabled}
        onChange={(event) => onChange(event.target.checked)}
      />
      <span
        aria-hidden="true"
        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors duration-200 ease-out peer-focus-visible:ring-2 peer-focus-visible:ring-emerald-300 peer-focus-visible:ring-offset-2 peer-focus-visible:ring-offset-zinc-950 ${
          checked ? "bg-emerald-400" : "bg-zinc-700"
        } ${disabled ? "opacity-50" : ""}`}
      >
        <span
          className={`absolute left-0.5 h-5 w-5 rounded-full bg-white shadow-sm transition-transform duration-200 ease-out ${
            checked ? "translate-x-5" : "translate-x-0"
          }`}
        />
      </span>
    </label>
  );

  if (compact) {
    return (
      <div className="flex items-center justify-between gap-3">
        <span className="text-xs text-zinc-400">前台展示</span>
        {toggle}
      </div>
    );
  }

  return (
    <>
      {/*
       * 这里原来是一张带边框的小卡片，而它本身就长在 Section 卡片里面 ——
       * 典型的一层框套一层框。现在改成「左侧 2px 色条 + 缩进」：
       * 色条颜色跟着开关状态走，不用再加一圈描边也一眼看出这是个可操作的设置项。
       */}
      <div
        className={`flex flex-wrap items-center justify-between gap-3 border-l-2 pl-3 transition-colors duration-200 ${
          checked ? "border-emerald-400/50" : "border-zinc-700"
        }`}
      >
        <div className="min-w-[220px] flex-1">
          <p className="text-sm text-zinc-200">{label}</p>
          <p className="mt-1 text-xs leading-5 text-zinc-500">{hint}</p>
        </div>
        {toggle}
      </div>
      {!checked && (
        <p className="adm-note adm-note-warn text-xs leading-5 text-amber-200">
          当前{name}在前台处于隐藏状态，访客看不到它。后台数据与素材都会保留，随时可以重新打开。
        </p>
      )}
    </>
  );
}

function getMediaKind(url?: string) {
  const cleanUrl = (url || "").split("?")[0].toLowerCase();
  if (/\.(mp3|wav|ogg|m4a|aac|flac)$/.test(cleanUrl)) return "audio";
  if (/\.(mp4|webm|mov|m4v|avi)$/.test(cleanUrl)) return "video";
  return "link";
}

function WorkPreview({ work }: { work: Work }) {
  const firstImage = work.images?.find(Boolean);
  const mediaKind = getMediaKind(work.videoUrl);

  return (
    // 预览区是前台成品的样子，属于「只读镜像」，用左侧色条标明范围即可，不再加边框。
    <div className="space-y-3 border-l-2 border-zinc-700/50 pl-3">
      <div className="grid gap-3 lg:grid-cols-[180px_1fr]">
        <div className="overflow-hidden rounded-lg bg-white/[0.04]">
          {firstImage ? (
            <img src={firstImage} alt={work.title || "作品预览"} className="aspect-video h-full w-full object-contain bg-black" />
          ) : (
            <div className="flex aspect-video items-center justify-center text-[11px] text-zinc-600">暂无图片</div>
          )}
        </div>
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-semibold text-white">{work.title || "未命名作品"}</span>
            <span className="rounded-full bg-white/[0.07] px-2 py-0.5 text-[10px] text-zinc-400">{work.category || "未分类"}</span>
            <span className="text-[10px] text-zinc-600">{work.images?.filter(Boolean).length || 0} 图 / {work.links?.filter((link) => link.url).length || 0} 链接</span>
          </div>
          <p className="line-clamp-2 text-xs leading-5 text-zinc-400">{work.description || "暂无简介"}</p>
          {work.tags?.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {work.tags.filter(Boolean).map((tag, index) => (
                <span key={`${tag}-${index}`} className="rounded bg-white/[0.06] px-1.5 py-0.5 text-[10px] text-zinc-400">{tag}</span>
              ))}
            </div>
          )}
        </div>
      </div>
      {work.videoUrl && mediaKind === "audio" && <audio src={work.videoUrl} controls className="h-8 w-full max-w-md" />}
      {work.videoUrl && mediaKind === "video" && (
        <div className="max-w-lg">
          <span className="mb-1 block text-[10px] text-zinc-500">视频预览</span>
          <video src={work.videoUrl} controls playsInline className="max-h-[200px] w-full rounded-lg bg-black object-contain" />
        </div>
      )}
      {work.videoUrl && mediaKind === "link" && (
        <a href={work.videoUrl} target="_blank" rel="noreferrer" className="block truncate text-xs text-emerald-300 hover:text-emerald-200">
          {work.videoUrl}
        </a>
      )}
    </div>
  );
}

function WorkImagesEditor({
  images,
  onChange,
  onRemove,
}: {
  images: string[];
  onChange: (images: string[]) => void;
  onRemove?: (url: string) => void;
}) {
  const normalizedImages = images || [];

  return (
    <div>
      <div className="mb-1.5 flex items-center justify-between">
        <span className="text-xs font-medium text-zinc-500">图片 URL（第一张为前台封面）</span>
        <button type="button" onClick={() => onChange([...normalizedImages, ""])} className="inline-flex items-center gap-1 rounded-md border border-zinc-800 px-2 py-1 text-xs text-zinc-300 hover:border-zinc-600">
          <Plus size={12} /> 新增
        </button>
      </div>
      <div className="grid gap-2 md:grid-cols-2">
        {normalizedImages.map((item, index) => (
          <div key={index} className="flex gap-2 rounded-lg bg-white/[0.03] p-2">
            {item ? (
              <div className="h-16 w-24 shrink-0 overflow-hidden rounded-md bg-black">
                <img src={item} alt={`作品图片 ${index + 1}`} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
              </div>
            ) : (
              <div className="flex h-16 w-24 shrink-0 items-center justify-center rounded-md bg-white/[0.05] text-[10px] text-zinc-600">空白</div>
            )}
            <div className="flex min-w-0 flex-1 flex-col gap-1">
              <input
                value={item}
                onChange={(event) => {
                  const next = [...normalizedImages];
                  next[index] = event.target.value;
                  onChange(next);
                }}
                placeholder="图片地址"
                className="w-full rounded border border-zinc-800 bg-zinc-950 px-2 py-1.5 text-xs text-zinc-100 outline-none focus:border-emerald-400"
              />
              <div className="flex gap-1">
                <button
                  type="button"
                  onClick={() => {
                    if (index === 0) return;
                    const next = [...normalizedImages];
                    const [cover] = next.splice(index, 1);
                    onChange([cover, ...next]);
                  }}
                  disabled={index === 0}
                  className="rounded border border-zinc-800 px-1.5 py-0.5 text-[10px] text-emerald-300 hover:border-emerald-500 disabled:text-zinc-600 disabled:hover:border-zinc-800"
                >
                  {index === 0 ? "封面" : "设封面"}
                </button>
                <button
                  onClick={() => {
                    onRemove?.(item);
                    onChange(normalizedImages.filter((_, itemIndex) => itemIndex !== index));
                  }}
                  className="rounded border border-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-500 hover:border-red-500 hover:text-red-300"
                  type="button"
                  aria-label="删除"
                >
                  <Trash2 size={13} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}

/**
 * 列表行外壳。把「摘要行 + 展开出来的编辑区」包进**同一个**框里。
 *
 * 这是「禁止框套框」在列表上的落点：原来摘要是一张卡片、点开后下面又冒出一张
 * 独立卡片，两层框并排摆着，谁主谁次看不出来。现在整行只有一个框，展开只是让
 * 框的颜色变一下（data-expanded），编辑区靠 .adm-drawer 的一条分隔线接在下面。
 *
 * 后台六个列表（作品 / AI 作品 / 经历 / 截图 / 珍藏 / 音乐）共用它。
 */
type EditorRowProps = {
  expanded: boolean;
  /** 展开态的强调色。珍藏用 amber，其余用 emerald，跟各自栏目的气质一致。 */
  tone?: "emerald" | "amber";
  children: React.ReactNode;
  /** 列表 key。本项目未装 @types/react，JSX 不做 IntrinsicAttributes 特判，故显式声明。 */
  key?: string | number;
};

function EditorRow({ expanded, tone = "emerald", children }: EditorRowProps) {
  return (
    <div className="adm-row" data-expanded={expanded ? "true" : "false"} data-tone={tone}>
      {children}
    </div>
  );
}

function WorkSummary({ work, index, expanded, onToggle }: {
  work: Work;
  index: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  const firstImage = work.images?.find(Boolean);

  // 注意：这里只渲染摘要行本身，外框由调用方的 <EditorRow> 提供 —— 别再在这里加边框。
  return (
    <button
      type="button"
      onClick={onToggle}
      className="grid w-full gap-3 p-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-400/40 md:grid-cols-[132px_1fr_auto] md:items-center"
    >
      <div className="overflow-hidden rounded-lg bg-white/[0.04]">
        {firstImage ? (
          <img src={firstImage} alt={work.title || "作品缩略图"} className="aspect-video w-full object-contain bg-black" />
        ) : (
          <div className="flex aspect-video items-center justify-center text-[11px] text-zinc-600">暂无缩略图</div>
        )}
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-zinc-500">作品 {index + 1}</span>
          <span className="truncate text-sm font-semibold text-white">{work.title || "未命名作品"}</span>
          <span className="rounded bg-white/[0.07] px-1.5 py-0.5 text-[10px] text-zinc-400">{work.category || "未分类"}</span>
        </div>
        <p className="mt-1 line-clamp-2 text-xs leading-5 text-zinc-400">{work.description || "暂无简介，展开后可编辑。"}</p>
        <div className="mt-1 flex flex-wrap gap-2 text-[10px] text-zinc-600">
          <span>{work.images?.filter(Boolean).length || 0} 张图片</span>
          <span>{work.videoUrl ? "有媒体" : "无媒体"}</span>
          <span>{work.links?.filter((link) => link.url).length || 0} 个链接</span>
        </div>
      </div>
      <span className="justify-self-start rounded-lg bg-white/[0.07] px-2.5 py-1 text-xs text-zinc-300 md:justify-self-end">
        {expanded ? "收起编辑" : "展开编辑"}
      </span>
    </button>
  );
}

/**
 * 作品列表编辑器。「作品媒体」和「AI专区」共用这一份实现——两者的作品结构
 * （Work）完全一样，唯一差别只是列表存在哪里：一个是顶层 works，一个是
 * pageCopy.aiWorks。所以把「怎么读、怎么写」抽成两个回调传进来，其余 UI 与
 * 交互一字不差，将来改一处两边同时生效。
 */
function WorkListEditor({
  items,
  title,
  hint,
  addLabel,
  emptyDraft,
  categoryOptions,
  readItems,
  writeItems,
  expandedId,
  setExpandedId,
  update,
  updateAndSave,
  upload,
  deleteMedia,
  addDraft,
  removeAndSave,
  migrate,
  renderSaveButton,
}: {
  items: Work[];
  title: string;
  hint: string;
  addLabel: string;
  emptyDraft: Work;
  categoryOptions: { value: string; label: string }[];
  readItems: (draft: PortfolioData) => Work[];
  writeItems: (draft: PortfolioData, items: Work[]) => void;
  expandedId: string | null;
  setExpandedId: (id: string | null) => void;
  update: (mutator: (draft: PortfolioData) => void) => void;
  updateAndSave: (mutator: (draft: PortfolioData) => void) => Promise<void>;
  upload: (event: ChangeEvent<HTMLInputElement>, onUrl: (url: string, file: File) => void | Promise<void>) => void;
  deleteMedia: (urls: string[]) => Promise<void>;
  addDraft: (mutator: (draft: PortfolioData) => void, onDone?: () => void) => void;
  removeAndSave: (mutator: (draft: PortfolioData) => void, mediaUrls?: string[], onSuccess?: () => void) => Promise<void>;
  /**
   * 「作品媒体 ⇄ AI 专区」互相迁移的接线。不传就整个按钮都不渲染 ——
   * 这个组件将来被别的列表复用时不受影响。
   */
  migrate?: {
    /** 按钮文案，例如「迁移到 AI 专区」。 */
    label: string;
    /** 点开后确认区里的一句话，必须讲清后果（素材不删、分类可能对不上）。 */
    hint: string;
    /** 真正执行迁移。传 index 是为了兼容没有 id 的历史数据（按位置摘除）。返回 true 表示已落库。 */
    run: (work: Work, index: number) => Promise<boolean>;
  };
  /** 保存按钮由调用方传入：SaveCurrentButton 是后台组件内部的闭包，这里拿不到。 */
  renderSaveButton: () => React.ReactNode;
}) {
  // 迁移是「挪走」，先在原地确认再动手，避免误点把作品从当前栏目弄丢。
  const [pendingMigrateId, setPendingMigrateId] = useState<string | null>(null);
  const [migrating, setMigrating] = useState(false);

  return (
    <>
      <Section title={title}>
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="text-xs text-zinc-400">{hint}</div>
          <button
            type="button"
            onClick={() => {
              const id = uid("work");
              addDraft(
                (draft) => { writeItems(draft, [...readItems(draft), { ...emptyDraft, id }]); },
                () => setExpandedId(id),
              );
            }}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 px-2.5 py-1.5 text-sm text-zinc-300"
          >
            <Plus size={15} /> {addLabel}
          </button>
        </div>
      </Section>

      <div className="space-y-3">
        {items.map((work, index) => (
          <EditorRow key={rowKey(work.id, index)} expanded={expandedId === rowKey(work.id, index)}>
            <WorkSummary
              work={work}
              index={index}
              expanded={expandedId === rowKey(work.id, index)}
              onToggle={() => setExpandedId(expandedId === rowKey(work.id, index) ? null : rowKey(work.id, index))}
            />
            {expandedId === rowKey(work.id, index) && (
              <div className="adm-drawer p-3">
                <WorkPreview work={work} />
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <Field label="标题" value={work.title} onChange={(value) => update((draft) => { readItems(draft)[index].title = value; })} />
                <SelectField label="分类" value={work.category} options={categoryOptions} onChange={(value) => update((draft) => { readItems(draft)[index].category = value; })} />
                <Field label="图标名" value={work.icon} onChange={(value) => update((draft) => { readItems(draft)[index].icon = value; })} />
                <Field label="右上角绿色标签" value={work.badgeText || ""} onChange={(value) => update((draft) => { readItems(draft)[index].badgeText = value; })} placeholder="例如：支持在线播放" />
                <Field label="视频/音乐 URL" value={work.videoUrl} onChange={(value) => update((draft) => { readItems(draft)[index].videoUrl = value; })} />
              </div>
              <div className="mt-3">
                <Field label="简介" value={work.description} onChange={(value) => update((draft) => { readItems(draft)[index].description = value; })} textarea />
              </div>
              <div className="mt-3 grid gap-3 md:grid-cols-2">
                <div>
                  <WorkImagesEditor
                    images={work.images || []}
                    onChange={(next) => { void updateAndSave((draft) => { readItems(draft)[index].images = next; }); }}
                    onRemove={(url) => { void deleteMedia([url]); }}
                  />
                  <label className="mt-2 inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-zinc-800 px-2.5 py-1.5 text-xs text-zinc-300 hover:border-zinc-600">
                    <ImagePlus size={16} /> 上传图片
                    <input className="hidden" type="file" accept="image/*" onChange={(event) => upload(event, (url) => updateAndSave((draft) => { readItems(draft)[index].images = [...(readItems(draft)[index].images || []), url]; }))} />
                  </label>
                </div>
                <div>
                  <ArrayEditor
                    label="标签"
                    items={work.tags || []}
                    onChange={(next) => update((draft) => { readItems(draft)[index].tags = next; })}
                  />
                  <label className="mt-2 inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-zinc-800 px-2.5 py-1.5 text-xs text-zinc-300 hover:border-zinc-600">
                    <Video size={16} /> 上传视频/音乐
                    <input className="hidden" type="file" accept="video/*,audio/*" onChange={(event) => upload(event, (url) => {
                      void deleteMedia([work.videoUrl || ""]);
                      update((draft) => { readItems(draft)[index].videoUrl = url; });
                    })} />
                  </label>
                </div>
              </div>
              <div className="mt-3">
                <div className="mb-2 flex items-center justify-between">
                  <span className="text-xs font-medium text-zinc-400">跳转或下载链接</span>
                  <div className="flex flex-wrap gap-2">
                    <label className="inline-flex cursor-pointer items-center gap-1 rounded-lg border border-zinc-800 px-2 py-1 text-xs text-zinc-300 hover:border-zinc-600">
                      <FileText size={12} /> 上传附件
                      <input
                        className="hidden"
                        type="file"
                        accept=".pdf,.doc,.docx,.xls,.xlsx,.ppt,.pptx,.zip,.rar,.7z,.txt,.csv,.md,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document,application/vnd.ms-excel,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet,application/vnd.ms-powerpoint,application/vnd.openxmlformats-officedocument.presentationml.presentation,application/zip,application/x-rar-compressed,application/x-7z-compressed,text/plain,text/csv"
                        onChange={(event) => upload(event, (url, file) => updateAndSave((draft) => {
                          const links = readItems(draft)[index].links || [];
                          readItems(draft)[index].links = [...links, { label: file.name, url, kind: "attachment", fileName: file.name }];
                        }))}
                      />
                    </label>
                    <button
                      onClick={() => update((draft) => { readItems(draft)[index].links = [...(readItems(draft)[index].links || []), { label: "", url: "", kind: "link" }]; })}
                      className="inline-flex items-center gap-1 rounded-lg border border-zinc-800 px-2 py-1 text-xs text-zinc-300"
                    >
                      <LinkIcon size={12} /> 新增链接
                    </button>
                  </div>
                </div>
                <div className="space-y-2">
                  {(work.links || []).map((link: WorkLink, linkIndex: number) => (
                    <div key={linkIndex} className="grid gap-2 md:grid-cols-[0.35fr_1fr_auto]">
                      <input value={link.label} onChange={(event) => update((draft) => { readItems(draft)[index].links![linkIndex].label = event.target.value; })} placeholder="按钮文案" className="rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-2 text-xs" />
                      <input value={link.url} onChange={(event) => update((draft) => { readItems(draft)[index].links![linkIndex].url = event.target.value; })} placeholder="https:// 或下载地址" className="rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-2 text-xs" />
                      <button
                        onClick={() => {
                          void deleteMedia([link.url]);
                          update((draft) => { readItems(draft)[index].links = readItems(draft)[index].links!.filter((_, i) => i !== linkIndex); });
                        }}
                        className="rounded-lg border border-zinc-800 px-2 text-red-300"
                      >
                        <Trash2 size={15} />
                      </button>
                    </div>
                  ))}
                </div>
              </div>
              <div className="mt-3">
                {migrate && pendingMigrateId === rowKey(work.id, index) && (
                  <div className="adm-note adm-note-info mt-0 text-xs leading-5 text-emerald-100/85">
                    <p>{migrate.hint}</p>
                    <div className="mt-2 flex flex-wrap justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setPendingMigrateId(null)}
                        disabled={migrating}
                        className="rounded-lg border border-zinc-800 px-2.5 py-1.5 text-xs text-zinc-300 disabled:opacity-60"
                      >
                        取消
                      </button>
                      <button
                        type="button"
                        onClick={() => {
                          setMigrating(true);
                          void migrate
                            .run(work, index)
                            .finally(() => {
                              setMigrating(false);
                              setPendingMigrateId(null);
                            });
                        }}
                        disabled={migrating}
                        className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-300 px-2.5 py-1.5 text-xs font-semibold text-zinc-950 hover:bg-emerald-200 disabled:opacity-60"
                      >
                        {migrating ? <Loader2 className="animate-spin" size={12} /> : <ArrowLeftRight size={12} />} 确认迁移
                      </button>
                    </div>
                  </div>
                )}
              </div>
              <div className="mt-3 flex flex-wrap justify-end gap-2">
                {migrate && (
                  <button
                    type="button"
                    onClick={() => setPendingMigrateId(pendingMigrateId === rowKey(work.id, index) ? null : rowKey(work.id, index))}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 px-2.5 py-1.5 text-sm text-zinc-300 hover:border-zinc-600"
                  >
                    <ArrowLeftRight size={14} /> {migrate.label}
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    void removeAndSave(
                      (draft) => { writeItems(draft, readItems(draft).filter((_, i) => i !== index)); },
                      collectWorkMedia(work),
                      () => { if (expandedId === rowKey(work.id, index)) setExpandedId(null); },
                    );
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 px-2.5 py-1.5 text-sm text-red-300 hover:border-red-500"
                >
                  <Trash2 size={14} /> 删除作品
                </button>
                {renderSaveButton()}
              </div>
            </div>
          )}
          </EditorRow>
        ))}
      </div>
    </>
  );
}

function GallerySummary({ item, index, expanded, onToggle }: {
  item: GalleryItem;
  index: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  // 只渲染摘要行，外框由调用方的 <EditorRow> 提供。
  return (
    <button
      type="button"
      onClick={onToggle}
      className="grid w-full gap-3 p-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-400/40 md:grid-cols-[132px_1fr_auto] md:items-center"
    >
      <div className="overflow-hidden rounded-lg bg-white/[0.04]">
        {item.imageUrl ? (
          <img src={item.imageUrl} alt={item.title || "工程截图"} className="aspect-video w-full object-contain bg-black" />
        ) : (
          <div className="flex aspect-video items-center justify-center text-[11px] text-zinc-600">暂无缩略图</div>
        )}
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-zinc-500">截图 {index + 1}</span>
          <span className="truncate text-sm font-semibold text-white">{item.title || "未命名截图"}</span>
          <span className="rounded bg-white/[0.07] px-1.5 py-0.5 text-[10px] text-zinc-400">{item.category || "未分类"}</span>
        </div>
        <p className="mt-1 line-clamp-2 text-xs leading-5 text-zinc-400">{item.description || "暂无简介，展开后可编辑。"}</p>
      </div>
      <span className="justify-self-start rounded-lg bg-white/[0.07] px-2.5 py-1 text-xs text-zinc-300 md:justify-self-end">
        {expanded ? "收起编辑" : "展开编辑"}
      </span>
    </button>
  );
}

function TreasureSummary({ item, index, expanded, onToggle }: {
  item: TreasureItem;
  index: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  // 只渲染摘要行，外框由调用方的 <EditorRow tone="amber"> 提供。
  return (
    <button
      type="button"
      onClick={onToggle}
      className="grid w-full gap-3 p-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-300/40 md:grid-cols-[132px_1fr_auto] md:items-center"
    >
      <div className="overflow-hidden rounded-lg bg-white/[0.04]">
        {item.imageUrl ? (
          <img src={item.imageUrl} alt={`珍藏 ${index + 1}`} className="aspect-video w-full object-contain bg-black" />
        ) : (
          <div className="flex aspect-video items-center justify-center text-[11px] text-zinc-600">暂无缩略图</div>
        )}
      </div>
      <div className="min-w-0">
        <span className="text-sm font-semibold text-white">珍藏 {index + 1}</span>
      </div>
      <span className="justify-self-start rounded-lg bg-white/[0.07] px-2.5 py-1 text-xs text-zinc-300 md:justify-self-end">
        {expanded ? "收起编辑" : "展开编辑"}
      </span>
    </button>
  );
}

function ExperienceSummary({ exp, index, expanded, onToggle }: {
  exp: Experience;
  index: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  // 只渲染摘要行，外框由调用方的 <EditorRow> 提供。
  return (
    <button
      type="button"
      onClick={onToggle}
      className="grid w-full gap-3 p-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-400/40 md:grid-cols-[120px_1fr_auto] md:items-center"
    >
      <div className="rounded-lg bg-white/[0.04] px-2.5 py-2">
        <div className="text-xs text-zinc-500">经历 {index + 1}</div>
        <div className="mt-1 line-clamp-2 text-sm font-medium text-emerald-300">{exp.period || "未填写时间"}</div>
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-semibold text-white">{exp.role || "未填写角色"}</span>
          <span className="rounded bg-white/[0.07] px-1.5 py-0.5 text-xs text-zinc-400">{exp.company || "未填写组织"}</span>
        </div>
        <p className="mt-1 line-clamp-2 text-sm leading-5 text-zinc-400">{exp.desc || "暂无简介，展开后可编辑。"}</p>
      </div>
      <span className="justify-self-start rounded-lg bg-white/[0.07] px-2.5 py-1 text-xs text-zinc-300 md:justify-self-end">
        {expanded ? "收起编辑" : "展开编辑"}
      </span>
    </button>
  );
}

function MusicSummary({ track, index, expanded, onToggle }: {
  track: MusicTrack;
  index: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  // 只渲染摘要行，外框由调用方的 <EditorRow> 提供。
  return (
    <button
      type="button"
      onClick={onToggle}
      className="grid w-full gap-3 p-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-400/40 md:grid-cols-[72px_1fr_auto] md:items-center"
    >
      <div className="h-16 w-16 overflow-hidden rounded-full bg-white/[0.04]">
        {track.coverUrl ? (
          <img src={track.coverUrl} alt={track.title || "音乐封面"} className="h-full w-full object-cover" />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-zinc-600"><Music size={18} /></div>
        )}
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs text-zinc-500">音乐 {index + 1}</span>
          <span className="truncate text-sm font-semibold text-white">{track.title || "未命名音乐"}</span>
          <span className="rounded bg-white/[0.07] px-1.5 py-0.5 text-[10px] text-zinc-400">{track.artist || "未填写作者"}</span>
        </div>
        <div className="mt-1 flex flex-wrap gap-2 text-[10px] text-zinc-600">
          <span>{track.audioUrl ? "有音频" : "无音频"}</span>
          <span>{track.coverUrl ? "有封面" : "无封面"}</span>
        </div>
        {track.audioUrl && <audio src={track.audioUrl} controls className="mt-2 h-8 w-full max-w-xl" />}
      </div>
      <span className="justify-self-start rounded-lg bg-white/[0.07] px-2.5 py-1 text-xs text-zinc-300 md:justify-self-end">
        {expanded ? "收起编辑" : "展开编辑"}
      </span>
    </button>
  );
}

export default function AdminApp() {
  const [authenticated, setAuthenticated] = useState(false);
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  // 登录时手机号打错的概率不低，给个「显示密码」开关，省得整段重输。
  const [showPassword, setShowPassword] = useState(false);
  const [loggingIn, setLoggingIn] = useState(false);
  const [data, setData] = useState<PortfolioData>(normalize(emptyPortfolioData));
  const [status, setStatus] = useState("");
  const [uploadProgress, setUploadProgress] = useState<{ fileName: string; percent: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  // 有没有「改了但还没保存」的内容。任何走 update() 的编辑都会点亮它，save() 成功才熄灭。
  // 用途有两个：底部状态条常驻提示、以及在用户关页面时拦一下（长表单最容易白填）。
  const [dirty, setDirty] = useState(false);
  const [active, setActive] = useState("profile");
  const [expandedExperienceId, setExpandedExperienceId] = useState<string | null>(null);
  const [expandedWorkId, setExpandedWorkId] = useState<string | null>(null);
  const [expandedAiWorkId, setExpandedAiWorkId] = useState<string | null>(null);
  const [expandedResumeId, setExpandedResumeId] = useState<string | null>(null);
  const [expandedGalleryId, setExpandedGalleryId] = useState<string | null>(null);
  const [expandedTreasureId, setExpandedTreasureId] = useState<string | null>(null);
  const [expandedMusicId, setExpandedMusicId] = useState<string | null>(null);
  const [expandedFloatingId, setExpandedFloatingId] = useState("");
  const [supabaseConfigured, setSupabaseConfigured] = useState(false);
  const [maxUploadSizeMb, setMaxUploadSizeMb] = useState(50);
  const [storageProvider, setStorageProvider] = useState("supabase");
  const [asrLoadingTrackId, setAsrLoadingTrackId] = useState<string | null>(null);
  const [visibleLyricTimelineTrackId, setVisibleLyricTimelineTrackId] = useState<string | null>(null);
  const [visibleLyricEditorTrackId, setVisibleLyricEditorTrackId] = useState<string | null>(null);

  // 侧栏导航。图标和文字都给（只用图标会牺牲可发现性），顺序按「先看内容、再看设置」排：
  // 前四项是站点的主要内容，后面依次是图集 / 珍藏 / 音乐 / 联系 / 装饰性设置。
  const nav = useMemo(
    () => [
      { key: "profile", label: "站点资料", icon: UserRound },
      { key: "experiences", label: "我的经历", icon: Briefcase },
      { key: "works", label: "作品媒体", icon: LayoutGrid },
      { key: "ai", label: "AI专区", icon: Sparkles },
      { key: "gallery", label: "工程截图", icon: Images },
      { key: "treasures", label: "我的珍藏", icon: Gem },
      { key: "music", label: "音乐播放", icon: Music },
      { key: "contact", label: "联系方式", icon: AtSign },
      { key: "floating", label: "弹幕设置", icon: MessagesSquare },
    ],
    [],
  );

  // 「我的珍藏」/「AI 专区」栏目是否在前台展示。与 App.tsx 的 isTreasuresVisible /
  // isAiZoneVisible 共用同一约定：只有显式写入 false 才隐藏，缺省（undefined）视为展示，
  // 因此历史数据无需迁移。
  const treasuresVisible = data.profile.pageCopy?.treasuresVisible !== false;
  const aiZoneVisible = data.profile.pageCopy?.aiZoneVisible !== false;

  useEffect(() => {
    Promise.all([
      fetch("/api/admin/session").then((res) => res.json()),
      fetch("/api/portfolio").then((res) => res.json()),
    ])
      .then(([session, portfolio]) => {
        setAuthenticated(Boolean(session.authenticated));
        setSupabaseConfigured(Boolean(session.supabaseConfigured));
        setMaxUploadSizeMb(Number(session.maxUploadSizeMb || 50));
        setStorageProvider(session.storageProvider || "supabase");
        setData(normalize(portfolio));
      })
      .catch(() => setStatus("初始化失败，请检查服务"))
      .finally(() => setLoading(false));
  }, []);

  function update(mutator: (draft: PortfolioData) => void) {
    setDirty(true);
    setData((current) => {
      const draft = cloneData(current);
      mutator(draft);
      return normalize(draft);
    });
  }

  // 有未保存改动时，离开页面（关标签页 / 刷新 / 点外链跳走）先弹一次浏览器原生确认。
  // 只挂 beforeunload，不拦站内切换——站内切换不会丢内存里的 data，没必要烦人。
  useEffect(() => {
    if (!dirty) return;
    const guard = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", guard);
    return () => window.removeEventListener("beforeunload", guard);
  }, [dirty]);

  async function login(event: React.FormEvent) {
    event.preventDefault();
    setStatus("");
    setLoggingIn(true);
    try {
      const res = await fetch("/api/admin/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ phone, password }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus(json.error || "登录失败");
        return;
      }
      setAuthenticated(true);
      setPhone("");
      setPassword("");
      setShowPassword(false);
    } catch (error: any) {
      setStatus(error?.message || "登录请求失败，请检查服务是否在运行。");
    } finally {
      setLoggingIn(false);
    }
  }

  async function logout() {
    await fetch("/api/admin/logout", { method: "POST" });
    setAuthenticated(false);
  }

  async function save(nextData = data, options: { collapse?: boolean } = {}) {
    const { collapse = true } = options;
    setSaving(true);
    setStatus("");
    try {
      const res = await fetch("/api/admin/portfolio", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(nextData),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) {
        setStatus(json.error || "保存失败");
        return false;
      }
      setData(normalize(json.data));
      setDirty(false);
      setStatus("已保存到数据库。");
      if (collapse) {
        setExpandedExperienceId(null);
        setExpandedWorkId(null);
        setExpandedAiWorkId(null);
        setExpandedResumeId(null);
        setExpandedGalleryId(null);
        setExpandedTreasureId(null);
        setExpandedMusicId(null);
      }
      return true;
    } catch (error: any) {
      setStatus(error.message || "保存失败，请检查服务");
      return false;
    } finally {
      setSaving(false);
    }
  }

  async function updateAndSave(mutator: (draft: PortfolioData) => void) {
    const draft = cloneData(data);
    mutator(draft);
    const nextData = normalize(draft);
    setData(nextData);
    await save(nextData);
  }

  async function mutateAndSave(mutator: (draft: PortfolioData) => void, onSuccess?: () => void, options: { collapse?: boolean } = {}) {
    const before = data;
    const draft = cloneData(data);
    mutator(draft);
    const nextData = normalize(draft);
    setData(nextData);
    const ok = await save(nextData, options);
    if (!ok) {
      setData(before);
      return false;
    }
    onSuccess?.();
    return true;
  }

  function addDraft(mutator: (draft: PortfolioData) => void, onDone?: () => void) {
    update(mutator);
    onDone?.();
    setStatus("已新建草稿，填写内容后请点击保存。");
  }

  async function removeAndSave(mutator: (draft: PortfolioData) => void, mediaUrls: string[] = [], onSuccess?: () => void) {
    const confirmed = window.confirm("确定删除吗？删除后会同步保存到数据库。");
    if (!confirmed) return;
    const ok = await mutateAndSave(mutator, onSuccess, { collapse: false });
    if (ok && mediaUrls.some(Boolean)) {
      await deleteMedia(mediaUrls);
    }
  }

  /**
   * 「作品媒体」和「AI 专区」之间互相迁移（双向）。
   *
   * 两边的作品结构（Work）本来就是一个类型，所以迁移只是「从这头摘掉、往那头追加」，
   * 一次 PUT 落库、要么都成要么都不成（mutateAndSave 失败会整体回滚）。
   *
   * 三条刻意的设计：
   *  1. **绝不删素材**。图片 / 视频 / 附件的 COS 地址是同一批，只是换了个栏目归属，
   *     所以这里不走 removeAndSave（那个会在删行之后顺手删掉媒体文件）。
   *  2. **换 id**。新 id 保证不会和「对面栏目里已有的条目」撞 key。
   *  3. **分类原样带过去**。两个栏目的分类词表不一样（例如「账号运营」在 AI 专区里没有对应项），
   *     硬改会偷偷篡改用户填的内容。SelectField 遇到不认识的分类会显示成「xxx（当前）」，
   *     用户迁移后在目标栏目里自己改一下即可。
   */
  async function migrateWork(work: Work, index: number, direction: "to-ai" | "to-works") {
    const moved: Work = { ...work, id: uid(direction === "to-ai" ? "aiwork" : "work") };
    const targetLabel = direction === "to-ai" ? "AI 专区" : "作品媒体";
    const drop = (list: Work[]) => list.filter((_, i) => i !== index);

    return mutateAndSave(
      (draft) => {
        const works = draft.works || [];
        const aiWorks = draft.profile.pageCopy?.aiWorks || [];
        if (direction === "to-ai") {
          draft.works = drop(works);
          editPageCopy(draft, { aiWorks: [...aiWorks, moved] });
        } else {
          editPageCopy(draft, { aiWorks: drop(aiWorks) });
          draft.works = [...works, moved];
        }
      },
      () => {
        // 条目已经不在当前列表里了，展开态跟着收掉，免得留一个指不到东西的 id。
        setExpandedWorkId(null);
        setExpandedAiWorkId(null);
        setStatus(`已迁移到「${targetLabel}」，素材一并带过去，原栏目不再显示。`);
      },
      { collapse: false },
    );
  }

  async function upload(event: ChangeEvent<HTMLInputElement>, onUrl: (url: string, file: File) => void | Promise<void>) {
    const file = event.target.files?.[0];
    if (!file) return;
    const maxBytes = maxUploadSizeMb * 1024 * 1024;
    let uploadFile = file;

    if (file.type.startsWith("image/")) {
      setStatus("正在压缩图片...");
      try {
        uploadFile = await compressImageForUpload(file);
      } catch {
        uploadFile = file;
      }
    }

    if (uploadFile.size > maxBytes) {
      setStatus(`文件超过 ${maxUploadSizeMb}MB 上传上限，请压缩后再试，或调整 MAX_UPLOAD_SIZE_MB。`);
      event.target.value = "";
      return;
    }

    const savedSize = file.size - uploadFile.size;
    const savedText = savedSize > 0 ? `，已压缩 ${Math.round((savedSize / file.size) * 100)}%` : "";
    setStatus(`正在上传媒体${savedText}...`);
    setUploadProgress({ fileName: uploadFile.name, percent: 0 });

    if (storageProvider === "tencent-cos") {
      try {
        const tokenRes = await fetch("/api/admin/upload-token", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            fileName: uploadFile.name,
            contentType: uploadFile.type || "application/octet-stream",
            size: uploadFile.size,
          }),
        });
        const token = await tokenRes.json().catch(() => ({}));
        if (!tokenRes.ok || !token.uploadUrl) throw new Error(token.error || "创建上传签名失败");

        await new Promise<void>((resolve, reject) => {
          const xhr = new XMLHttpRequest();
          xhr.open("PUT", token.uploadUrl);
          xhr.timeout = 15 * 60 * 1000;
          xhr.setRequestHeader("Content-Type", token.contentType || uploadFile.type || "application/octet-stream");
          xhr.upload.onprogress = (progressEvent) => {
            if (!progressEvent.lengthComputable) return;
            const percent = Math.min(99, Math.round((progressEvent.loaded / progressEvent.total) * 100));
            setUploadProgress({ fileName: uploadFile.name, percent });
          };
          xhr.onload = () => {
            if (xhr.status >= 200 && xhr.status < 300) resolve();
            else reject(new Error(`腾讯云上传失败：${xhr.status || "无响应"}`));
          };
          xhr.onerror = () => reject(new Error("腾讯云上传失败，请检查 COS 跨域或网络"));
          xhr.ontimeout = () => reject(new Error("腾讯云上传超时，请压缩视频后再试"));
          xhr.send(uploadFile);
        });

        await onUrl(token.signedUrl || token.url, file);
        setUploadProgress({ fileName: uploadFile.name, percent: 100 });
        setStatus("媒体已上传。");
        window.setTimeout(() => setUploadProgress(null), 1000);
        event.target.value = "";
        return;
      } catch (error: any) {
        setStatus(error.message || "腾讯云直传失败");
        setUploadProgress(null);
        event.target.value = "";
        return;
      }
    }

    const formData = new FormData();
    formData.append("file", uploadFile);

    let json: { success?: boolean; url?: string; error?: string };
    try {
      json = await new Promise((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open("POST", "/api/admin/upload");
        xhr.timeout = 15 * 60 * 1000;
        xhr.upload.onprogress = (progressEvent) => {
          if (!progressEvent.lengthComputable) return;
          const percent = Math.min(99, Math.round((progressEvent.loaded / progressEvent.total) * 100));
          setUploadProgress({ fileName: uploadFile.name, percent });
          if (percent >= 99) setStatus("文件已传到服务器，正在转存到云端，请稍等...");
        };
        xhr.onload = () => {
          try {
            const payload = JSON.parse(xhr.responseText || "{}");
            if (xhr.status >= 200 && xhr.status < 300) {
              resolve(payload);
            } else {
              reject(new Error(payload.error || "上传失败"));
            }
          } catch {
            reject(new Error("上传失败，服务器响应异常。"));
          }
        };
        xhr.onerror = () => reject(new Error("上传失败，请检查后端服务"));
        xhr.ontimeout = () => reject(new Error("上传超时：视频已传到服务器后云端转存耗时过长，请稍后重试或压缩视频。"));
        xhr.send(formData);
      });
    } catch (error: any) {
      setStatus(error.message || "上传失败");
      setUploadProgress(null);
      event.target.value = "";
      return;
    }

    if (!json.url) {
      setStatus(json.error || "上传失败");
      setUploadProgress(null);
      event.target.value = "";
      return;
    }

    await onUrl(json.url, file);
    setUploadProgress({ fileName: uploadFile.name, percent: 100 });
    setStatus("媒体已上传。");
    window.setTimeout(() => setUploadProgress(null), 1000);
    event.target.value = "";
  }

  async function deleteMedia(urls: string[]) {
    const cleanUrls = urls.filter(Boolean);
    if (cleanUrls.length === 0) return;

    const res = await fetch("/api/admin/delete-media", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ urls: cleanUrls }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.failed?.length > 0) {
      setStatus("已从页面移除，但部分 COS 文件删除失败，请到腾讯云文件列表检查。");
      return;
    }
    if (json.deleted?.length > 0) {
      setStatus(`已同步删除 ${json.deleted.length} 个 COS 文件，请记得保存页面数据。`);
    }
  }

  async function importLyrics(event: ChangeEvent<HTMLInputElement>, onText: (text: string) => void) {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    onText(stripLyricTimeline(text));
    setStatus("字幕文本已导入。保存这首音乐时会自动获取腾讯云时间轴。");
    event.target.value = "";
  }

  async function requestLyricsWithAsr(track: MusicTrack, index: number, referenceLyrics: string) {
    if (!track.audioUrl) {
      setStatus("请先上传或填写音频 URL。");
      return "";
    }

    setAsrLoadingTrackId(track.id || String(index));
    setStatus("正在从腾讯云获取时间轴并套用到歌词文本，歌曲较长时可能需要几十秒...");
    try {
      const res = await fetch("/api/admin/asr/lyrics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          audioUrl: track.audioUrl,
          title: track.title,
          artist: track.artist,
          referenceLyrics,
        }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok || !json.lyrics) {
        setStatus(json.error || "腾讯云 ASR 识别失败。");
        return "";
      }
      return String(json.lyrics);
    } catch (error: any) {
      setStatus(error.message || "腾讯云 ASR 识别失败。");
      return "";
    } finally {
      setAsrLoadingTrackId("");
    }
  }

  async function saveMusicTrack(index: number) {
    const draft = cloneData(data);
    const track = draft.musicTracks?.[index];
    if (!track) {
      await save();
      return;
    }

    const plainLyrics = stripLyricTimeline(track.lyrics);
    if (track.audioUrl && plainLyrics && !hasEnhancedLyricTimeline(track.lyrics)) {
      const lyrics = await requestLyricsWithAsr(track, index, plainLyrics);
      if (!lyrics) return;
      track.lyrics = lyrics;
      setData(normalize(draft));
      await save(normalize(draft));
      return;
    }

    await save(draft);
  }

  const SaveCurrentButton = ({ label = "保存当前" }: { label?: string }) => (
    <button
      type="button"
      onClick={() => { void save(); }}
      disabled={saving}
      className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-300 px-3 py-2 text-sm font-semibold text-zinc-950 hover:bg-emerald-200 disabled:opacity-60"
    >
      {saving ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />} {label}
    </button>
  );

  if (loading) {
    return (
      <div className="grid min-h-dvh place-items-center bg-[#09090b] text-zinc-300">
        <div className="flex flex-col items-center gap-3">
          <Loader2 className="animate-spin text-emerald-300" size={26} />
          <p className="text-sm text-zinc-400">正在进入后台…</p>
        </div>
      </div>
    );
  }

  if (!authenticated) {
    return (
      <main className="grid min-h-dvh place-items-center bg-[#09090b] p-4 text-zinc-100">
        <form
          onSubmit={login}
          className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-950/80 p-6 shadow-2xl shadow-black/40"
        >
          <div className="flex items-center gap-2">
            <ShieldCheck size={16} className="text-emerald-300" />
            <p className="font-mono text-xs uppercase tracking-[0.28em] text-emerald-300">Portfolio Admin</p>
          </div>
          <h1 className="mt-3 text-2xl font-semibold tracking-tight">管理员登录</h1>
          <p className="mt-2 text-sm leading-6 text-zinc-400">
            请输入环境变量 <code className="rounded bg-zinc-900 px-1 py-0.5 font-mono text-[11px] text-zinc-300">ADMIN_PHONE</code> /{" "}
            <code className="rounded bg-zinc-900 px-1 py-0.5 font-mono text-[11px] text-zinc-300">ADMIN_PASSWORD</code> 中设置的内容。
          </p>

          <label className="mt-6 grid gap-1.5">
            <span className="text-xs font-medium text-zinc-400">管理员手机号</span>
            <input
              type="tel"
              autoComplete="username"
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              className={`${inputBaseClass} min-h-11 px-4 py-2.5`}
              placeholder="请输入手机号"
            />
          </label>

          <label className="mt-3 grid gap-1.5">
            <span className="text-xs font-medium text-zinc-400">管理员密码</span>
            <span className="relative block">
              <input
                type={showPassword ? "text" : "password"}
                autoComplete="current-password"
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                className={`${inputBaseClass} min-h-11 py-2.5 pl-4 pr-12`}
                placeholder="请输入密码"
              />
              <button
                type="button"
                onClick={() => setShowPassword((value) => !value)}
                aria-label={showPassword ? "隐藏密码" : "显示密码"}
                className="absolute inset-y-0 right-1 my-1 inline-flex w-10 items-center justify-center rounded-md text-zinc-500 hover:bg-zinc-800/60 hover:text-zinc-200"
              >
                {showPassword ? <EyeOff size={16} /> : <Eye size={16} />}
              </button>
            </span>
          </label>

          <button
            type="submit"
            disabled={loggingIn}
            className="mt-4 inline-flex min-h-11 w-full items-center justify-center gap-2 rounded-xl bg-emerald-300 px-4 font-semibold text-zinc-950 transition-colors duration-200 hover:bg-emerald-200 focus-visible:ring-2 focus-visible:ring-emerald-300/50 disabled:opacity-60"
          >
            {loggingIn && <Loader2 className="animate-spin" size={16} />}
            {loggingIn ? "登录中…" : "登录"}
          </button>

          {status && (
            <p className="mt-3 flex items-start gap-2 text-sm leading-6 text-amber-300" role="alert">
              <CircleAlert size={15} className="mt-1 shrink-0" />
              <span className="min-w-0 break-words">{status}</span>
            </p>
          )}
        </form>
      </main>
    );
  }

  // 旧版两份固定简历：只用来做「导入」的数据源和前台回退，不再直接编辑。
  const legacyProductResumeUrl = data.profile.pageCopy?.resumePdfs?.productManager || data.profile.resumePdfUrl || "";
  const legacyNewMediaResumeUrl = data.profile.pageCopy?.resumePdfs?.newMedia || "";
  const resumeProfiles = data.profile.pageCopy?.resumeProfiles || [];
  const hasLegacyResume = Boolean(legacyProductResumeUrl || legacyNewMediaResumeUrl);

  return (
    /*
     * 后台外壳。这里是那个「出现滚动条布局就跳」的 bug 的根治点。
     *
     * 原来：main 是最小高度铺满（min-h-screen），整页内容一起长高 —— 内容一超过一屏，
     * 滚动条长在**文档**上。文档滚动条一出现，可视宽度立刻少掉十几像素，所有
     * mx-auto 居中的东西整体横移一下，看起来就是「布局变了」。
     *
     * 现在：外壳固定一屏高（h-dvh）且 overflow-hidden，滚动只发生在右栏的
     * .admin-scroll 容器里（见 index.css）。文档永远不滚动 → 文档滚动条永不出现
     * → 宽度恒定。再加 scrollbar-gutter: stable 把右栏滚动槽也常驻，
     * 切栏目时连右栏内部都不会横跳。两层保险。
     */
    <main className="flex h-dvh flex-col overflow-hidden bg-[#09090b] text-zinc-100">
      <header className="z-30 shrink-0 border-b border-zinc-900 bg-zinc-950/90 px-3 py-2.5 backdrop-blur md:px-5">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-2.5 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0">
            <p className="font-mono text-[11px] uppercase tracking-[0.22em] text-emerald-300">Portfolio CMS</p>
            <h1 className="mt-0.5 truncate text-lg font-semibold tracking-tight">网站数据管理后台</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span
              className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs ${
                supabaseConfigured ? "border-emerald-800 bg-emerald-400/10 text-emerald-300" : "border-amber-700/70 bg-amber-400/10 text-amber-300"
              }`}
              title={supabaseConfigured ? "数据写入 Supabase 数据库" : "Supabase 未配置，数据写入本地 JSON"}
            >
              {supabaseConfigured ? <Check size={12} /> : <CircleAlert size={12} />}
              {supabaseConfigured ? "Supabase 已连接" : "本地 JSON 模式"}
            </span>
            <span className="inline-flex items-center gap-1.5 rounded-full border border-sky-800/70 bg-sky-400/10 px-2.5 py-1 text-xs text-sky-300">
              <HardDrive size={12} />
              媒体存储：{storageProvider === "tencent-cos" ? "腾讯云 COS" : "Supabase"}
            </span>
            <a
              href="/"
              target="_blank"
              rel="noreferrer"
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-zinc-800 px-3 text-sm text-zinc-300 transition-colors duration-200 hover:border-zinc-600 hover:text-white"
            >
              <ExternalLink size={14} /> 查看网站
            </a>
            <button
              type="button"
              onClick={() => { void logout(); }}
              className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-zinc-800 px-3 text-sm text-zinc-300 transition-colors duration-200 hover:border-rose-500/60 hover:text-rose-200"
            >
              <LogOut size={14} /> 退出
            </button>
          </div>
        </div>
      </header>

      {/* min-h-0 是关键：flex 子项默认 min-height:auto，不加这一条，右栏会被内容顶高，
          外层 overflow-hidden 也压不住，还是要靠文档滚动条。 */}
      <div className="mx-auto flex w-full min-h-0 max-w-[1600px] flex-1 flex-col md:flex-row">
        {/*
         * 侧栏。手机上横排成一条可横滑的标签带（后台主要还是在电脑上用，手机只求能用），
         * md 以上变回竖排。按钮都是 min-h-11（44px），满足触摸目标尺寸。
         */}
        <aside className="flex min-h-0 shrink-0 flex-col border-b border-zinc-900 bg-zinc-950/60 md:w-[196px] md:border-b-0 md:border-r">
          {/*
           * 导航自己也要能滚：9 项 × 44px 在很矮的窗口里会超出侧栏高度，
           * 而外壳是 overflow-hidden —— 不滚就会被裁掉并且够不着。
           * 用 no-scrollbar 隐藏条子，避免侧栏里再出现一条和内容区并列的滚动条。
           */}
          <nav className="no-scrollbar flex min-h-0 gap-1 overflow-x-auto p-2 md:flex-1 md:flex-col md:overflow-y-auto md:p-2.5">
            {nav.map(({ key, label, icon: Icon }) => {
              const isActive = active === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setActive(key)}
                  aria-current={isActive ? "page" : undefined}
                  className={`inline-flex min-h-11 shrink-0 items-center gap-2 rounded-lg px-3 text-sm transition-colors duration-200 md:w-full ${
                    isActive
                      ? "bg-emerald-400/10 font-medium text-emerald-200 ring-1 ring-inset ring-emerald-400/30"
                      : "text-zinc-400 hover:bg-zinc-900 hover:text-zinc-100"
                  }`}
                >
                  <Icon size={16} className={`shrink-0 ${isActive ? "text-emerald-300" : "text-zinc-500"}`} />
                  <span className="whitespace-nowrap">{label}</span>
                </button>
              );
            })}
          </nav>
        </aside>

        {/*
         * 内容区 = 全后台唯一的滚动容器。min-h-0 + flex-1 + overflow-y-auto 三件套，
         * 配合 .admin-scroll 的 scrollbar-gutter: stable，滚动条无论有没有都占位，
         * 所以切栏目时内容不会横跳。
         */}
        <div className="admin-scroll min-h-0 flex-1 overflow-y-auto px-3 py-3 md:px-5 md:py-4">
          <div className="mx-auto w-full max-w-4xl space-y-3.5">
            {active === "profile" && (
              <Section title="站点资料" description="站点的基本信息：名称、头像、简介、签名，以及前台各栏目的说明文案。">
                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="名称" value={data.profile.name} onChange={(value) => update((draft) => { draft.profile.name = value; })} />
                  <Field label="头像 URL" value={data.profile.avatar} onChange={(value) => update((draft) => { draft.profile.avatar = value; })} />
                </div>
                <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-zinc-800 px-2.5 py-1.5 text-xs text-zinc-300 hover:border-zinc-600">
                  <ImagePlus size={16} /> 上传头像
                  <input className="hidden" type="file" accept="image/*" onChange={(event) => upload(event, (url) => {
                    void deleteMedia([data.profile.avatar]);
                    update((draft) => { draft.profile.avatar = url; });
                  })} />
                </label>
                <Section title="简历展示" nested description="前台的「个人简历」按这里的顺序生成选项卡；岗位名称、副标题、PDF 都可自定义，也可以单独隐藏或删除。">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-xs leading-5 text-zinc-400">
                      当前共 <span className="font-mono text-zinc-200">{resumeProfiles.length}</span> 个岗位。
                    </p>
                    <div className="flex flex-wrap gap-2">
                      {resumeProfiles.length === 0 && hasLegacyResume && (
                        <button
                          type="button"
                          onClick={() => update((draft) => {
                            // 把旧版写死的两份简历搬进新列表，之后就可以自由增删了。
                            const imported: ResumeProfile[] = [];
                            if (legacyProductResumeUrl) imported.push({ id: uid("resume"), position: "产品经理", name: "PRODUCT MANAGER", url: legacyProductResumeUrl, visible: true });
                            if (legacyNewMediaResumeUrl) imported.push({ id: uid("resume"), position: "新媒体运营", name: "NEW MEDIA OPS", url: legacyNewMediaResumeUrl, visible: true });
                            editPageCopy(draft, { resumeProfiles: imported });
                          })}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 px-2.5 py-1.5 text-xs text-zinc-300 hover:border-zinc-600"
                        >
                          <Download size={14} /> 导入旧版两份简历
                        </button>
                      )}
                      <button
                        type="button"
                        onClick={() => {
                          const id = uid("resume");
                          addDraft(
                            (draft) => {
                              editPageCopy(draft, {
                                resumeProfiles: [...(draft.profile.pageCopy?.resumeProfiles || []), { id, position: "新岗位", name: "", url: "", visible: true }],
                              });
                            },
                            () => setExpandedResumeId(id),
                          );
                        }}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 px-2.5 py-1.5 text-xs text-zinc-300 hover:border-zinc-600"
                      >
                        <Plus size={14} /> 新增岗位
                      </button>
                    </div>
                  </div>

                  {resumeProfiles.length === 0 && (
                    <p className="adm-note text-center text-xs leading-5 text-zinc-400">
                      还没有配置任何岗位简历。点「新增岗位」开始，前台会自动回退到旧版两份简历（如果曾经上传过）。
                    </p>
                  )}

                  {resumeProfiles.map((profile, index) => {
                    const resumeVisible = profile.visible !== false;
                    return (
                      <EditorRow key={profile.id} expanded={expandedResumeId === rowKey(profile.id, index)}>
                        <div className="flex flex-wrap items-center justify-between gap-2 p-3">
                          <div className="min-w-0 flex-1">
                            <div className="flex flex-wrap items-center gap-2">
                              <span className="text-xs text-zinc-500">岗位 {index + 1}</span>
                              <span className="truncate text-sm font-semibold text-white">{profile.position || "未命名岗位"}</span>
                              {profile.name && <span className="rounded bg-white/[0.07] px-1.5 py-0.5 font-mono text-[10px] uppercase text-zinc-400">{profile.name}</span>}
                              {!resumeVisible && <span className="rounded bg-amber-400/10 px-1.5 py-0.5 text-[10px] text-amber-300">已隐藏</span>}
                            </div>
                            <p className="mt-1 truncate text-[11px] text-zinc-500">{profile.url ? profile.url.split("?")[0] : "尚未上传 PDF"}</p>
                          </div>
                          <button
                            type="button"
                            onClick={() => setExpandedResumeId(expandedResumeId === rowKey(profile.id, index) ? null : rowKey(profile.id, index))}
                            className="shrink-0 rounded-lg border border-zinc-800 px-2.5 py-1 text-xs text-zinc-300"
                          >
                            {expandedResumeId === rowKey(profile.id, index) ? "收起编辑" : "展开编辑"}
                          </button>
                        </div>

                        {expandedResumeId === rowKey(profile.id, index) && (
                          <div className="adm-drawer space-y-3 p-3">
                            <div className="grid gap-3 md:grid-cols-2">
                              <Field label="岗位名称（前台选项卡主标题）" value={profile.position} onChange={(value) => update((draft) => { draft.profile.pageCopy!.resumeProfiles![index].position = value; })} placeholder="例如：产品经理" />
                              <Field label="自定义名称（副标题，可留空）" value={profile.name || ""} onChange={(value) => update((draft) => { draft.profile.pageCopy!.resumeProfiles![index].name = value; })} placeholder="例如：PRODUCT MANAGER" />
                            </div>
                            <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
                              <Field label="简历 PDF URL" value={profile.url} onChange={(value) => update((draft) => { draft.profile.pageCopy!.resumeProfiles![index].url = value; })} />
                              <label className="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-zinc-800 px-2.5 py-2 text-xs text-zinc-300 hover:border-zinc-600">
                                <FileText size={16} /> 上传 PDF
                                <input className="hidden" type="file" accept="application/pdf,.pdf" onChange={(event) => upload(event, (url) => {
                                  const previous = profile.url;
                                  updateAndSave((draft) => { draft.profile.pageCopy!.resumeProfiles![index].url = url; }).then(() => {
                                    if (previous && previous !== url) void deleteMedia([previous]);
                                  });
                                })} />
                              </label>
                            </div>
                            <VisibilitySwitch
                              name={`「${profile.position || "未命名岗位"}」简历`}
                              checked={resumeVisible}
                              disabled={saving}
                              compact
                              onChange={(next) => {
                                void mutateAndSave(
                                  (draft) => { draft.profile.pageCopy!.resumeProfiles![index].visible = next; },
                                  undefined,
                                  { collapse: false },
                                );
                              }}
                            />
                            <div className="flex justify-end gap-2 pt-1">
                              <button
                                type="button"
                                onClick={() => {
                                  void removeAndSave(
                                    (draft) => {
                                      editPageCopy(draft, { resumeProfiles: (draft.profile.pageCopy?.resumeProfiles || []).filter((_, i) => i !== index) });
                                    },
                                    [profile.url || ""],
                                    () => { if (expandedResumeId === rowKey(profile.id, index)) setExpandedResumeId(null); },
                                  );
                                }}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 px-2.5 py-1.5 text-sm text-red-300 hover:border-red-500"
                              >
                                <Trash2 size={14} /> 删除这个岗位
                              </button>
                            </div>
                          </div>
                        )}
                      </EditorRow>
                    );
                  })}
                </Section>
                <Field label="一句话标签" value={data.profile.tagline} onChange={(value) => update((draft) => { draft.profile.tagline = value; })} textarea />
                <Field label="自我介绍" value={data.profile.intro} onChange={(value) => update((draft) => { draft.profile.intro = value; })} textarea />
                <Field label="诗句/签名" value={data.profile.quote} onChange={(value) => update((draft) => { draft.profile.quote = value; })} textarea />
                <label className="flex items-center justify-between gap-4 rounded-xl bg-white/[0.03] p-3">
                  <span>
                    <span className="block text-xs font-semibold text-zinc-200">允许前台自动播放音乐</span>
                    <span className="mt-1 block text-[11px] text-zinc-500">开启后前台会默认尝试播放列表第一首音乐。</span>
                  </span>
                  <input
                    type="checkbox"
                    checked={Boolean(data.profile.musicAutoplay)}
                    onChange={(event) => update((draft) => { draft.profile.musicAutoplay = event.target.checked; })}
                    className="h-5 w-5 accent-emerald-300"
                  />
                </label>
                <div className="space-y-3 border-t border-zinc-800/60 pt-4">
                  <div className="text-xs font-semibold text-zinc-300">页面诗句说明</div>
                  <div className="grid gap-3 md:grid-cols-2">
                    <Field label="个人简历说明" value={data.profile.pageCopy?.resume} onChange={(value) => update((draft) => { editPageCopy(draft, { resume: value }); })} textarea />
                    <Field label="创意合集说明" value={data.profile.pageCopy?.works} onChange={(value) => update((draft) => { editPageCopy(draft, { works: value }); })} textarea />
                    <Field label="AI 专区说明" value={data.profile.pageCopy?.aiZone} onChange={(value) => update((draft) => { editPageCopy(draft, { aiZone: value }); })} textarea />
                    <Field label="工程截图说明" value={data.profile.pageCopy?.gallery} onChange={(value) => update((draft) => { editPageCopy(draft, { gallery: value }); })} textarea />
                    <Field label="我的珍藏说明" value={data.profile.pageCopy?.treasures} onChange={(value) => update((draft) => { editPageCopy(draft, { treasures: value }); })} textarea />
                    <Field label="联系方式说明" value={data.profile.pageCopy?.contact} onChange={(value) => update((draft) => { editPageCopy(draft, { contact: value }); })} textarea />
                  </div>
                </div>
                <SaveCurrentButton label="保存站点资料" />
              </Section>
            )}

            {active === "experiences" && (
              <>
                <Section title="经历管理" description="前台「我的经历」按这里的顺序渲染；条目默认折叠，点开才编辑细节。">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div className="text-sm text-zinc-400">共 {data.experiences.length} 条经历。默认只显示时间、角色、组织和简介，点击后展开详细编辑。</div>
                    <button
                      type="button"
                      onClick={() => {
                        const id = uid("exp");
                        addDraft(
                          (draft) => { draft.experiences = [...(draft.experiences || []), { ...emptyExperience, id }]; },
                          () => setExpandedExperienceId(id),
                        );
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 px-2.5 py-1.5 text-sm text-zinc-300"
                    >
                      <Plus size={15} /> 新增经历
                    </button>
                  </div>
                </Section>
                {data.experiences.map((exp, index) => (
                  <EditorRow key={rowKey(exp.id, index)} expanded={expandedExperienceId === rowKey(exp.id, index)}>
                    <ExperienceSummary
                      exp={exp}
                      index={index}
                      expanded={expandedExperienceId === rowKey(exp.id, index)}
                      onToggle={() => setExpandedExperienceId(expandedExperienceId === rowKey(exp.id, index) ? null : rowKey(exp.id, index))}
                    />
                    {expandedExperienceId === rowKey(exp.id, index) && (
                      <div className="adm-drawer p-3">
                        <div className="grid gap-3 md:grid-cols-2">
                          <Field label="时间" value={exp.period} onChange={(value) => update((draft) => { draft.experiences[index].period = value; })} />
                          <Field label="组织/公司" value={exp.role} onChange={(value) => update((draft) => { draft.experiences[index].role = value; })} />
                          <Field label="角色" value={exp.company} onChange={(value) => update((draft) => { draft.experiences[index].company = value; })} />
                        </div>
                        <div className="mt-3">
                          <Field label="简介" value={exp.desc} onChange={(value) => update((draft) => { draft.experiences[index].desc = value; })} textarea />
                        </div>
                        <div className="mt-3 flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              void removeAndSave(
                                (draft) => { draft.experiences = draft.experiences.filter((_, i) => i !== index); },
                                [],
                                () => { if (expandedExperienceId === rowKey(exp.id, index)) setExpandedExperienceId(null); },
                              );
                            }}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 px-2.5 py-1.5 text-sm text-red-300 hover:border-red-500"
                          >
                            <Trash2 size={14} /> 删除经历
                          </button>
                          <SaveCurrentButton label="保存这条经历" />
                        </div>
                      </div>
                    )}
                  </EditorRow>
                ))}
              </>
            )}

            {active === "works" && (
              <WorkListEditor
                items={data.works}
                title="作品管理"
                hint={`共 ${data.works.length} 个作品。默认只显示缩略图和简介，点击后展开详细编辑；展开后还能一键迁移到「AI 专区」。`}
                addLabel="新增作品"
                emptyDraft={emptyWork}
                categoryOptions={workCategoryOptions}
                readItems={(draft) => draft.works}
                writeItems={(draft, items) => { draft.works = items; }}
                expandedId={expandedWorkId}
                setExpandedId={setExpandedWorkId}
                update={update}
                updateAndSave={updateAndSave}
                upload={upload}
                deleteMedia={deleteMedia}
                addDraft={addDraft}
                removeAndSave={removeAndSave}
                migrate={{
                  label: "迁移到 AI 专区",
                  hint: "这条作品会从「作品媒体」移到「AI 专区」，访客端跟着换栏目。图片 / 视频 / 附件素材原样带过去，不会被删除；分类如果不在 AI 专区的词表里会保留原值（显示为「xxx（当前）」），迁移后可以自己改。",
                  run: (work, index) => migrateWork(work, index, "to-ai"),
                }}
                renderSaveButton={() => <SaveCurrentButton label="保存这个作品" />}
              />
            )}

            {active === "ai" && (
              <>
                <Section title="前台展示" description="决定 AI 专区对访客是否可见。">
                  <VisibilitySwitch
                    name="「AI 专区」栏目"
                    hint="开启后，网站顶部导航会出现「AI专区」入口，访客可以浏览下面这些 AI 作品。关闭后入口与栏目一起隐藏，数据与素材都保留。"
                    checked={aiZoneVisible}
                    disabled={saving}
                    onChange={(next) => {
                      void mutateAndSave(
                        (draft) => { editPageCopy(draft, { aiZoneVisible: next }); },
                        undefined,
                        { collapse: false },
                      );
                    }}
                  />
                </Section>

                <WorkListEditor
                  items={data.profile.pageCopy?.aiWorks || []}
                  title="AI 作品"
                  hint={`共 ${(data.profile.pageCopy?.aiWorks || []).length} 个 AI 作品。展示方式与「作品媒体」完全一致：一张缩略图加一句简介，点击后展开详细编辑；展开后还能一键迁移回「作品媒体」。`}
                  addLabel="新增 AI 作品"
                  emptyDraft={{ ...emptyWork, category: "agent" }}
                  categoryOptions={aiCategoryOptions}
                  readItems={(draft) => draft.profile.pageCopy?.aiWorks || []}
                  writeItems={(draft, items) => { editPageCopy(draft, { aiWorks: items }); }}
                  expandedId={expandedAiWorkId}
                  setExpandedId={setExpandedAiWorkId}
                  update={update}
                  updateAndSave={updateAndSave}
                  upload={upload}
                  deleteMedia={deleteMedia}
                  addDraft={addDraft}
                  removeAndSave={removeAndSave}
                  migrate={{
                    label: "迁移回作品媒体",
                    hint: "这条 AI 作品会从「AI 专区」移回「作品媒体」，访客端跟着换栏目。图片 / 视频 / 附件素材原样带过去，不会被删除；分类如果不在「作品媒体」的词表里会保留原值（显示为「xxx（当前）」），迁移后可以自己改。",
                    run: (work, index) => migrateWork(work, index, "to-works"),
                  }}
                  renderSaveButton={() => <SaveCurrentButton label="保存这个 AI 作品" />}
                />
              </>
            )}

            {active === "gallery" && (
              <>
                <Section title="工程截图图库" description="前台「工程截图」栏目里的图片，按这里的顺序展示。">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm leading-5 text-zinc-400">
                      共 {(data.gallery || []).length} 张截图。默认只显示缩略图和简介，点击后展开详细编辑。分类可用：应用、原型图、Agent、剪辑，也可新建分类。
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        const id = uid("gallery");
                        addDraft(
                          (draft) => { draft.gallery = [...(draft.gallery || []), { ...emptyGalleryItem, id }]; },
                          () => setExpandedGalleryId(id),
                        );
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 px-2.5 py-1.5 text-sm text-zinc-300"
                    >
                      <Plus size={15} /> 新增截图
                    </button>
                  </div>
                </Section>
                {(data.gallery || []).map((item: GalleryItem, index: number) => (
                  <EditorRow key={rowKey(item.id, index)} expanded={expandedGalleryId === rowKey(item.id, index)}>
                    <GallerySummary
                      item={item}
                      index={index}
                      expanded={expandedGalleryId === rowKey(item.id, index)}
                      onToggle={() => setExpandedGalleryId(expandedGalleryId === rowKey(item.id, index) ? null : rowKey(item.id, index))}
                    />
                    {expandedGalleryId === rowKey(item.id, index) && (
                      <div className="adm-drawer p-3">
                        <div className="grid gap-3 md:grid-cols-2">
                          <SelectField label="分类" value={item.category} options={galleryCategoryOptions} onChange={(value) => update((draft) => { draft.gallery![index].category = value; })} />
                          <Field label="标题" value={item.title} onChange={(value) => update((draft) => { draft.gallery![index].title = value; })} />
                          <Field label="图片 URL" value={item.imageUrl} onChange={(value) => update((draft) => { draft.gallery![index].imageUrl = value; })} />
                          <label className="self-end inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-zinc-800 px-2.5 py-2 text-xs text-zinc-300 hover:border-zinc-600">
                            <ImagePlus size={16} /> 上传截图
                            <input className="hidden" type="file" accept="image/*" onChange={(event) => upload(event, (url) => {
                              void deleteMedia([item.imageUrl]);
                              update((draft) => { draft.gallery![index].imageUrl = url; });
                            })} />
                          </label>
                        </div>
                        <div className="mt-3">
                          <Field label="图片简介" value={item.description} onChange={(value) => update((draft) => { draft.gallery![index].description = value; })} textarea />
                        </div>
                        <div className="mt-3 flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              void removeAndSave(
                                (draft) => { draft.gallery = (draft.gallery || []).filter((_, i) => i !== index); },
                                [item.imageUrl],
                                () => { if (expandedGalleryId === rowKey(item.id, index)) setExpandedGalleryId(null); },
                              );
                            }}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 px-2.5 py-1.5 text-sm text-red-300 hover:border-red-500"
                          >
                            <Trash2 size={14} /> 删除截图
                          </button>
                          <SaveCurrentButton label="保存这张截图" />
                        </div>
                      </div>
                    )}
                  </EditorRow>
                ))}
              </>
            )}

            {active === "floating" && (
              <>
                <Section title="弹幕设置" description="访客留言会在前台以漂浮弹幕的形式出现；这里逐条或整体控制。">
                  <div className="space-y-4">
                    <div className="flex flex-wrap items-center gap-3">
                      <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-zinc-800 px-3 py-2 text-sm text-zinc-200 hover:border-zinc-600">
                        <input
                          type="checkbox"
                          checked={data.profile.pageCopy?.floatingSentences?.global === true}
                          onChange={(event) => update((draft) => {
                            if (!draft.profile.pageCopy) draft.profile.pageCopy = {};
                            const current = draft.profile.pageCopy.floatingSentences || {};
                            draft.profile.pageCopy.floatingSentences = {
                              ...current,
                              global: event.target.checked,
                              enabled: current.enabled ?? true,
                              speed: 5,
                              count: current.count || 2,
                              sentences: current.sentences?.length ? current.sentences : [...defaultFloatingSentences],
                              pages: current.pages || {},
                            };
                          })}
                        />
                        全局应用
                      </label>
                      <p className="text-xs text-zinc-500">开启后，所有页面使用同一组句子；关闭后，每个页面单独设置。</p>
                    </div>
                    {data.profile.pageCopy?.floatingSentences?.global === true ? (
                      <div className="adm-panel p-3">
                        <div className="flex flex-wrap items-center justify-between gap-3">
                          <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-zinc-200">
                            <input
                              type="checkbox"
                              checked={data.profile.pageCopy?.floatingSentences?.enabled !== false}
                              onChange={(event) => update((draft) => {
                                if (!draft.profile.pageCopy) draft.profile.pageCopy = {};
                                const current = draft.profile.pageCopy.floatingSentences || {};
                                draft.profile.pageCopy.floatingSentences = {
                                  ...current,
                                  global: true,
                                  enabled: event.target.checked,
                                  speed: 5,
                                  count: current.count || 2,
                                  sentences: current.sentences?.length ? current.sentences : [...defaultFloatingSentences],
                                  pages: current.pages || {},
                                };
                              })}
                            />
                            开启全站弹幕
                          </label>
                          <label className="inline-flex cursor-pointer items-center gap-2 text-sm text-zinc-200">
                            <input
                              type="checkbox"
                              checked={data.profile.pageCopy?.floatingSentences?.borderEnabled !== false}
                              onChange={(event) => update((draft) => {
                                if (!draft.profile.pageCopy) draft.profile.pageCopy = {};
                                const current = draft.profile.pageCopy.floatingSentences || {};
                                draft.profile.pageCopy.floatingSentences = {
                                  ...current,
                                  global: true,
                                  enabled: current.enabled ?? true,
                                  borderEnabled: event.target.checked,
                                  speed: 5,
                                  count: current.count || 2,
                                  sentences: current.sentences?.length ? current.sentences : [...defaultFloatingSentences],
                                  pages: current.pages || {},
                                };
                              })}
                            />
                            显示边框
                          </label>
                          <div className="flex items-center gap-2">
                            <label className="flex items-center gap-1.5 text-xs text-zinc-400">
                              每句重复
                              <input
                                type="number"
                                min={1}
                                max={20}
                                value={data.profile.pageCopy?.floatingSentences?.count || 2}
                                onChange={(event) => update((draft) => {
                                  if (!draft.profile.pageCopy) draft.profile.pageCopy = {};
                                  const current = draft.profile.pageCopy.floatingSentences || {};
                                  draft.profile.pageCopy.floatingSentences = {
                                    ...current,
                                    global: true,
                                    enabled: current.enabled ?? true,
                                    speed: 5,
                                    count: normalizeFloatingCount(event.target.value),
                                    sentences: current.sentences?.length ? current.sentences : [...defaultFloatingSentences],
                                    pages: current.pages || {},
                                  };
                                })}
                                className="w-16 rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-1 text-xs text-zinc-100 outline-none focus:border-zinc-600"
                              />
                            </label>
                            <button
                              type="button"
                              onClick={() => setExpandedFloatingId(expandedFloatingId === "global" ? "" : "global")}
                              className="rounded-lg border border-zinc-800 px-2.5 py-1.5 text-xs text-zinc-300 hover:border-zinc-600"
                            >
                              {expandedFloatingId === "global" ? "收起内容" : "编辑内容"}
                            </button>
                          </div>
                        </div>
                        <p className="mt-2 line-clamp-1 text-xs text-zinc-500">
                          {(data.profile.pageCopy?.floatingSentences?.sentences?.length ? data.profile.pageCopy.floatingSentences.sentences : defaultFloatingSentences).join(" / ")}
                        </p>
                        {expandedFloatingId === "global" && (
                          <div className="adm-drawer mt-3 pt-3">
                            <ArrayEditor
                              label="全局句子"
                              items={data.profile.pageCopy?.floatingSentences?.sentences?.length ? data.profile.pageCopy.floatingSentences.sentences : defaultFloatingSentences}
                              onChange={(items) => update((draft) => {
                                if (!draft.profile.pageCopy) draft.profile.pageCopy = {};
                                const current = draft.profile.pageCopy.floatingSentences || {};
                                draft.profile.pageCopy.floatingSentences = {
                                  ...current,
                                  global: true,
                                  enabled: current.enabled ?? true,
                                  speed: 5,
                                  count: current.count || 2,
                                  sentences: cleanSentences(items),
                                  pages: current.pages || {},
                                };
                              })}
                              placeholder="此情可待成追忆"
                            />
                          </div>
                        )}
                      </div>
                    ) : (
                      <div className="grid gap-3 md:grid-cols-2">
                        {floatingPageOptions.map((page) => {
                          const pageConfig = data.profile.pageCopy?.floatingSentences?.pages?.[page.key];
                          return (
                            <div key={page.key} className="adm-panel p-3">
                              <div className="flex flex-wrap items-center justify-between gap-3">
                                <label className="inline-flex cursor-pointer items-center gap-2 text-sm font-medium text-zinc-100">
                                  <input
                                    type="checkbox"
                                    checked={pageConfig?.enabled === true}
                                    onChange={(event) => update((draft) => {
                                      if (!draft.profile.pageCopy) draft.profile.pageCopy = {};
                                      const current = draft.profile.pageCopy.floatingSentences || {};
                                      const pages = current.pages || {};
                                      const existing = pages[page.key] || {};
                                      draft.profile.pageCopy.floatingSentences = {
                                        ...current,
                                        global: false,
                                        speed: 5,
                                        count: current.count || 2,
                                        pages: {
                                          ...pages,
                                          [page.key]: {
                                            ...existing,
                                            enabled: event.target.checked,
                                            count: existing.count || 2,
                                            sentences: existing.sentences?.length ? existing.sentences : [...defaultFloatingSentences],
                                          },
                                        },
                                      };
                                    })}
                                  />
                                  {page.label}
                                </label>
                                <label className="inline-flex cursor-pointer items-center gap-2 text-xs text-zinc-400">
                                  <input
                                    type="checkbox"
                                    checked={pageConfig?.borderEnabled !== false}
                                    onChange={(event) => update((draft) => {
                                      if (!draft.profile.pageCopy) draft.profile.pageCopy = {};
                                      const current = draft.profile.pageCopy.floatingSentences || {};
                                      const pages = current.pages || {};
                                      const existing = pages[page.key] || {};
                                      draft.profile.pageCopy.floatingSentences = {
                                        ...current,
                                        global: false,
                                        speed: 5,
                                        count: current.count || 2,
                                        pages: {
                                          ...pages,
                                          [page.key]: {
                                            ...existing,
                                            enabled: existing.enabled ?? false,
                                            borderEnabled: event.target.checked,
                                            count: existing.count || 2,
                                            sentences: existing.sentences?.length ? existing.sentences : [...defaultFloatingSentences],
                                          },
                                        },
                                      };
                                    })}
                                  />
                                  显示边框
                                </label>
                                <div className="flex items-center gap-2">
                                  <label className="flex items-center gap-1.5 text-xs text-zinc-400">
                                    每句重复
                                    <input
                                      type="number"
                                      min={1}
                                      max={20}
                                      value={pageConfig?.count || 2}
                                      onChange={(event) => update((draft) => {
                                        if (!draft.profile.pageCopy) draft.profile.pageCopy = {};
                                        const current = draft.profile.pageCopy.floatingSentences || {};
                                        const pages = current.pages || {};
                                        const existing = pages[page.key] || {};
                                        draft.profile.pageCopy.floatingSentences = {
                                          ...current,
                                          global: false,
                                          speed: 5,
                                          count: current.count || 2,
                                          pages: {
                                            ...pages,
                                            [page.key]: {
                                              ...existing,
                                              enabled: existing.enabled ?? false,
                                              count: normalizeFloatingCount(event.target.value),
                                              sentences: existing.sentences?.length ? existing.sentences : [...defaultFloatingSentences],
                                            },
                                          },
                                        };
                                      })}
                                      className="w-16 rounded-lg border border-zinc-800 bg-zinc-950 px-2 py-1 text-xs text-zinc-100 outline-none focus:border-zinc-600"
                                    />
                                  </label>
                                  <button
                                    type="button"
                                    onClick={() => setExpandedFloatingId(expandedFloatingId === page.key ? "" : page.key)}
                                    className="rounded-lg border border-zinc-800 px-2.5 py-1.5 text-xs text-zinc-300 hover:border-zinc-600"
                                  >
                                    {expandedFloatingId === page.key ? "收起内容" : "编辑内容"}
                                  </button>
                                </div>
                              </div>
                              <p className="mt-2 line-clamp-1 text-xs text-zinc-500">
                                {(pageConfig?.sentences?.length ? pageConfig.sentences : defaultFloatingSentences).join(" / ")}
                              </p>
                              {expandedFloatingId === page.key && (
                                <div className="adm-drawer mt-3 pt-3">
                                  <ArrayEditor
                                    label="句子内容"
                                    items={pageConfig?.sentences?.length ? pageConfig.sentences : defaultFloatingSentences}
                                    onChange={(items) => update((draft) => {
                                      if (!draft.profile.pageCopy) draft.profile.pageCopy = {};
                                      const current = draft.profile.pageCopy.floatingSentences || {};
                                      const pages = current.pages || {};
                                      const existing = pages[page.key] || {};
                                      draft.profile.pageCopy.floatingSentences = {
                                        ...current,
                                        global: false,
                                        speed: 5,
                                        count: current.count || 2,
                                        pages: {
                                          ...pages,
                                          [page.key]: {
                                            ...existing,
                                            enabled: existing.enabled ?? false,
                                            count: existing.count || 2,
                                            sentences: cleanSentences(items),
                                          },
                                        },
                                      };
                                    })}
                                    placeholder="此情可待成追忆"
                                  />
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                    <div className="flex justify-end border-t border-zinc-800/60 pt-3">
                      <SaveCurrentButton label="保存弹幕设置" />
                    </div>
                  </div>
                </Section>
              </>
            )}

            {active === "treasures" && (
              <>
                <Section title="前台展示" description="决定「我的珍藏」对访客是否可见。">
                  <VisibilitySwitch
                    name="「我的珍藏」栏目"
                    hint="关闭后，访客看不到「我的珍藏」的导航入口和页面内容；后台数据与图片都会保留，随时可以重新打开。"
                    checked={treasuresVisible}
                    disabled={saving}
                    onChange={(next) => {
                      // 开关属于单一布尔项，改完即落库；失败时 mutateAndSave 会回滚并给出提示。
                      void mutateAndSave(
                        (draft) => {
                          if (!draft.profile.pageCopy) draft.profile.pageCopy = {};
                          draft.profile.pageCopy.treasuresVisible = next;
                        },
                        undefined,
                        { collapse: false },
                      );
                    }}
                  />
                </Section>
                <Section title="我的珍藏图库" description="前台「我的珍藏」栏目里的收藏，按这里的顺序展示。">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm leading-5 text-zinc-400">
                      共 {(data.treasures || []).length} 张珍藏。默认只显示缩略图和简介，点击后展开详细编辑。
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        const id = uid("treasure");
                        addDraft(
                          (draft) => { draft.treasures = [...(draft.treasures || []), { ...emptyTreasureItem, id }]; },
                          () => setExpandedTreasureId(id),
                        );
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 px-2.5 py-1.5 text-sm text-zinc-300"
                    >
                      <Plus size={15} /> 新增珍藏
                    </button>
                  </div>
                </Section>
                {(data.treasures || []).map((item: TreasureItem, index: number) => (
                  <EditorRow key={rowKey(item.id, index)} expanded={expandedTreasureId === rowKey(item.id, index)} tone="amber">
                    <TreasureSummary
                      item={item}
                      index={index}
                      expanded={expandedTreasureId === rowKey(item.id, index)}
                      onToggle={() => setExpandedTreasureId(expandedTreasureId === rowKey(item.id, index) ? null : rowKey(item.id, index))}
                    />
                    {expandedTreasureId === rowKey(item.id, index) && (
                      <div className="adm-drawer p-3">
                        <div className="flex flex-wrap items-end gap-3">
                          <div className="min-w-[260px] flex-1"><Field label="图片 URL" value={item.imageUrl} onChange={(value) => update((draft) => { draft.treasures![index].imageUrl = value; })} /></div>
                          <label className="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-zinc-800 px-2.5 py-2 text-xs text-zinc-300 hover:border-zinc-600">
                            <ImagePlus size={16} /> 上传珍藏
                            <input className="hidden" type="file" accept="image/*" onChange={(event) => upload(event, (url) => {
                              void deleteMedia([item.imageUrl]);
                              update((draft) => { draft.treasures![index].imageUrl = url; });
                            })} />
                          </label>
                        </div>
                        <div className="mt-3 flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              void removeAndSave(
                                (draft) => { draft.treasures = (draft.treasures || []).filter((_, i) => i !== index); },
                                [item.imageUrl],
                                () => { if (expandedTreasureId === rowKey(item.id, index)) setExpandedTreasureId(null); },
                              );
                            }}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 px-2.5 py-1.5 text-sm text-red-300 hover:border-red-500"
                          >
                            <Trash2 size={14} /> 删除珍藏
                          </button>
                          <SaveCurrentButton label="保存这张珍藏" />
                        </div>
                      </div>
                    )}
                  </EditorRow>
                ))}
              </>
            )}

            {active === "music" && (
              <>
                <Section title="首页音乐播放器" description="前台首页背景音乐列表，可导入歌词并逐字校准时间轴。">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="text-sm leading-5 text-zinc-400">
                      共 {(data.musicTracks || []).length} 首音乐。默认只显示封面、标题、作者和播放状态，点击后展开详细编辑。
                    </p>
                    <button
                      type="button"
                      onClick={() => {
                        const id = uid("track");
                        addDraft(
                          (draft) => { draft.musicTracks = [...(draft.musicTracks || []), { ...emptyMusicTrack, id }]; },
                          () => setExpandedMusicId(id),
                        );
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 px-2.5 py-1.5 text-sm text-zinc-300"
                    >
                      <Plus size={15} /> 新增音乐
                    </button>
                  </div>
                </Section>
                {(data.musicTracks || []).map((track: MusicTrack, index: number) => (
                  <EditorRow key={rowKey(track.id, index)} expanded={expandedMusicId === rowKey(track.id, index)}>
                    <MusicSummary
                      track={track}
                      index={index}
                      expanded={expandedMusicId === rowKey(track.id, index)}
                      onToggle={() => setExpandedMusicId(expandedMusicId === rowKey(track.id, index) ? null : rowKey(track.id, index))}
                    />
                    {expandedMusicId === rowKey(track.id, index) && (
                      <div className="adm-drawer p-3">
                        <div className="grid gap-3 md:grid-cols-2">
                          <Field label="歌曲名称" value={track.title} onChange={(value) => update((draft) => { draft.musicTracks![index].title = value; })} />
                          <Field label="作者/歌手" value={track.artist} onChange={(value) => update((draft) => { draft.musicTracks![index].artist = value; })} />
                          <Field label="音频 URL" value={track.audioUrl} onChange={(value) => update((draft) => { draft.musicTracks![index].audioUrl = value; })} />
                          <Field label="封面 URL" value={track.coverUrl} onChange={(value) => update((draft) => { draft.musicTracks![index].coverUrl = value; })} />
                        </div>
                        <div className="mt-3">
                          <Field
                            label="歌词文本"
                            value={stripLyricTimeline(track.lyrics)}
                            onChange={(value) => update((draft) => { draft.musicTracks![index].lyrics = applyPlainLyricsToTimeline(track.lyrics, value); })}
                            textarea
                            placeholder={"在这里填写纯歌词，方便断句。\n保存这首音乐时，会自动从腾讯云获取时间轴并套用到这份文本。"}
                          />
                          <div className="mt-2 flex justify-end">
                            <button
                              type="button"
                              onClick={() => setVisibleLyricTimelineTrackId(visibleLyricTimelineTrackId === (track.id || String(index)) ? "" : (track.id || String(index)))}
                              className="rounded-lg border border-zinc-800 px-2.5 py-1.5 text-xs text-zinc-400 hover:border-zinc-600 hover:text-zinc-200"
                            >
                              {visibleLyricTimelineTrackId === (track.id || String(index)) ? "隐藏时间轴" : "显示时间轴"}
                            </button>
                          </div>
                          {visibleLyricTimelineTrackId === (track.id || String(index)) && (
                            <div className="mt-2">
                              <Field
                                label="时间轴原文"
                                value={track.lyrics || ""}
                                onChange={(value) => update((draft) => { draft.musicTracks![index].lyrics = value; })}
                                textarea
                                placeholder={"[ti:歌曲名]\n[ar:歌手]\n[00:12.00]<00:12.10>我<00:12.32>爱<00:12.58>这<00:12.80>首<00:13.06>歌"}
                              />
                            </div>
                          )}
                          <div className="mt-2 flex justify-end">
                            <button
                              type="button"
                              onClick={() => setVisibleLyricEditorTrackId(visibleLyricEditorTrackId === (track.id || String(index)) ? "" : (track.id || String(index)))}
                              className="rounded-lg border border-zinc-800 px-2.5 py-1.5 text-xs text-zinc-400 hover:border-emerald-500 hover:text-emerald-200"
                            >
                              {visibleLyricEditorTrackId === (track.id || String(index)) ? "收起逐字微调" : "逐字时间轴微调"}
                            </button>
                          </div>
                          {visibleLyricEditorTrackId === (track.id || String(index)) && (
                            <div className="mt-2">
                              <LyricTimelineEditor
                                track={track}
                                onChange={(lyrics) => update((draft) => { draft.musicTracks![index].lyrics = lyrics; })}
                              />
                            </div>
                          )}
                        </div>
                        <div className="mt-3 flex flex-wrap gap-3">
                          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-zinc-800 px-2.5 py-1.5 text-xs text-zinc-300 hover:border-zinc-600">
                            <Music size={16} /> 上传音频
                            <input className="hidden" type="file" accept="audio/*" onChange={(event) => upload(event, (url) => {
                              void deleteMedia([track.audioUrl]);
                              update((draft) => { draft.musicTracks![index].audioUrl = url; });
                            })} />
                          </label>
                          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-zinc-800 px-2.5 py-1.5 text-xs text-zinc-300 hover:border-zinc-600">
                            <ImagePlus size={16} /> 上传封面
                            <input className="hidden" type="file" accept="image/*" onChange={(event) => upload(event, (url) => {
                              void deleteMedia([track.coverUrl]);
                              update((draft) => { draft.musicTracks![index].coverUrl = url; });
                            })} />
                          </label>
                          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-zinc-800 px-2.5 py-1.5 text-xs text-zinc-300 hover:border-zinc-600">
                            <FileText size={16} /> 上传歌词/字幕
                            <input className="hidden" type="file" accept=".lrc,.srt,.vtt,.txt,text/plain,text/vtt,application/x-subrip" onChange={(event) => importLyrics(event, (text) => update((draft) => { draft.musicTracks![index].lyrics = text; }))} />
                          </label>
                        </div>
                        <div className="mt-3 flex justify-end gap-2">
                          <button
                            type="button"
                            onClick={() => {
                              void removeAndSave(
                                (draft) => { draft.musicTracks = (draft.musicTracks || []).filter((_, i) => i !== index); },
                                [track.audioUrl, track.coverUrl],
                                () => { if (expandedMusicId === rowKey(track.id, index)) setExpandedMusicId(null); },
                              );
                            }}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 px-2.5 py-1.5 text-sm text-red-300 hover:border-red-500"
                          >
                            <Trash2 size={14} /> 删除音乐
                          </button>
                          <button
                            type="button"
                            onClick={() => { void saveMusicTrack(index); }}
                            disabled={saving || asrLoadingTrackId === (track.id || String(index))}
                            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-300 px-3 py-2 text-sm font-semibold text-zinc-950 hover:bg-emerald-200 disabled:opacity-60"
                          >
                            {(saving || asrLoadingTrackId === (track.id || String(index))) ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />}
                            保存这首音乐
                          </button>
                        </div>
                      </div>
                    )}
                  </EditorRow>
                ))}
              </>
            )}

            {active === "contact" && (
              <Section title="联系方式" description="前台「联系方式」栏目展示的条目，留空即不显示。">
                <div className="grid gap-3 md:grid-cols-2">
                  {(["wechat", "qq", "email", "phone", "github"] as const).map((key) => (
                    <div key={key}>
                      <Field
                        label={key}
                        value={data.contact?.[key]}
                        onChange={(value) => update((draft) => { draft.contact = { ...draft.contact!, [key]: value }; })}
                      />
                    </div>
                  ))}
                </div>
                <SaveCurrentButton label="保存联系方式" />
              </Section>
            )}

          </div>
        </div>
      </div>

      {/*
       * 常驻底栏。状态和上传进度原来挂在 header 里 —— 那是同一类毛病的第二个来源：
       * 有消息时 header 变高、消息消失又变矮，整页内容跟着上下抖一下。
       * 放到底栏并且**永远渲染**（没消息就显示提示语），高度就恒定了。
       */}
      <footer className="z-20 shrink-0 border-t border-zinc-900 bg-zinc-950/90 px-3 py-2 backdrop-blur md:px-5">
        <div className="mx-auto flex max-w-[1600px] flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div className="min-w-0 flex-1">
            {uploadProgress ? (
              <div className="min-w-0">
                <div className="mb-1 flex items-center justify-between gap-3 text-xs text-zinc-400">
                  <span className="flex min-w-0 items-center gap-1.5">
                    <Loader2 className="shrink-0 animate-spin text-emerald-300" size={12} />
                    <span className="truncate">上传中：{uploadProgress.fileName}</span>
                  </span>
                  <span className="shrink-0 font-mono text-emerald-300">{uploadProgress.percent}%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800">
                  <div
                    className="h-full rounded-full bg-emerald-300 transition-[width] duration-200"
                    style={{ width: `${uploadProgress.percent}%` }}
                  />
                </div>
              </div>
            ) : status ? (
              <p className="flex min-w-0 items-start gap-2 text-xs leading-5 text-amber-300" role="status">
                <CircleAlert size={14} className="mt-0.5 shrink-0" />
                <span className="min-w-0 break-words">{status}</span>
              </p>
            ) : dirty ? (
              <p className="flex items-center gap-1.5 text-xs text-amber-300/90">
                <Info size={14} className="shrink-0" /> 有改动还没保存。
              </p>
            ) : (
              <p className="text-xs text-zinc-500">各栏目可单独保存，也可以用右侧「保存全部」一次性写入。</p>
            )}
          </div>
          <button
            type="button"
            onClick={() => { void save(); }}
            disabled={saving}
            className="inline-flex min-h-9 shrink-0 items-center justify-center gap-1.5 rounded-lg bg-emerald-300 px-3 text-sm font-semibold text-zinc-950 transition-colors duration-200 hover:bg-emerald-200 focus-visible:ring-2 focus-visible:ring-emerald-300/50 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {saving ? <Loader2 className="animate-spin" size={14} /> : <Save size={14} />}
            {saving ? "保存中…" : "保存全部"}
          </button>
        </div>
      </footer>
    </main>
  );
}
