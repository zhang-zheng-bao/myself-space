import React, { ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import {
  FileText,
  ImagePlus,
  Link as LinkIcon,
  Loader2,
  LogOut,
  Music,
  Plus,
  Save,
  Trash2,
  Video,
} from "lucide-react";
import { Experience, GalleryItem, MusicTrack, PortfolioData, TreasureItem, Work, WorkLink } from "./types";

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

const defaultPageCopy = {
  resume: "“纸上得来终觉浅，绝知此事要躬行。”一页履历，照见实践。",
  works: "“文章合为时而著，歌诗合为事而作。”作品因想法而生。",
  gallery: "“横看成岭侧成峰，远近高低各不同。”截图留住侧影。",
  treasures: "“此情可待成追忆，只是当时已惘然。”珍藏美好，岁月留香。",
  contact: "“海内存知己，天涯若比邻。”愿在此处相逢。",
};

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

function cloneData(data: PortfolioData): PortfolioData {
  return JSON.parse(JSON.stringify(data));
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

function Field({
  label,
  value,
  onChange,
  textarea,
  placeholder,
}: {
  label: string;
  value?: string;
  onChange: (value: string) => void;
  textarea?: boolean;
  placeholder?: string;
}) {
  return (
    <label className="grid gap-1">
      <span className="text-xs font-medium text-zinc-500">{label}</span>
      {textarea ? (
        <textarea
          value={value || ""}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          rows={3}
          className="resize-y rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm leading-5 text-zinc-100 outline-none focus:border-emerald-400"
        />
      ) : (
        <input
          value={value || ""}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 outline-none focus:border-emerald-400"
        />
      )}
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
  const normalizedValue = value || options[0]?.value || "";
  const hasCurrent = options.some((option) => option.value === normalizedValue);
  const visibleOptions = hasCurrent
    ? options
    : [{ value: normalizedValue, label: `${normalizedValue}（当前）` }, ...options];

  return (
    <label className="grid gap-1">
      <span className="text-xs font-medium text-zinc-500">{label}</span>
      <select
        value={normalizedValue}
        onChange={(event) => onChange(event.target.value)}
        className="rounded-lg border border-zinc-800 bg-zinc-950 px-3 py-2.5 text-sm text-zinc-100 outline-none focus:border-emerald-400"
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
      <div className="rounded-xl border border-zinc-900 bg-zinc-950/70 p-3 text-xs leading-5 text-zinc-500">
        保存这首音乐后会自动生成逐字时间轴，随后可在这里手动微调。
      </div>
    );
  }

  return (
    <div className="rounded-xl border border-zinc-900 bg-zinc-950/70 p-3">
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
      <div className="mt-3 max-h-72 space-y-2 overflow-y-auto pr-1">
        {editable.lines.map((line, lineIndex) => (
          <div key={lineIndex} className="rounded-lg border border-zinc-900 bg-black/20 p-2">
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
                return (
                  <div key={`${lineIndex}-${charIndex}`} className={`flex items-center gap-1 rounded-md border px-1.5 py-1 ${marked ? "border-emerald-300 bg-emerald-950/50" : anchored ? "border-emerald-800 bg-emerald-950/25" : active ? "border-emerald-500/70 bg-emerald-950/30" : "border-zinc-850 bg-zinc-950"}`}>
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

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-xl border border-zinc-850 bg-zinc-950/70 p-3 shadow-xl">
      <h2 className="text-base font-semibold text-white">{title}</h2>
      <div className="mt-3 space-y-3">{children}</div>
    </section>
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
    <div className="space-y-3 rounded-lg border border-zinc-900 bg-zinc-900/35 p-2.5">
      <div className="grid gap-3 lg:grid-cols-[180px_1fr]">
        <div className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950">
          {firstImage ? (
            <img src={firstImage} alt={work.title || "作品预览"} className="aspect-video h-full w-full object-contain bg-black" />
          ) : (
            <div className="flex aspect-video items-center justify-center text-[11px] text-zinc-600">暂无图片</div>
          )}
        </div>
        <div className="min-w-0 space-y-2">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-semibold text-white">{work.title || "未命名作品"}</span>
            <span className="rounded-full border border-zinc-800 px-2 py-0.5 text-[10px] text-zinc-400">{work.category || "未分类"}</span>
            <span className="text-[10px] text-zinc-600">{work.images?.filter(Boolean).length || 0} 图 / {work.links?.filter((link) => link.url).length || 0} 链接</span>
          </div>
          <p className="line-clamp-2 text-xs leading-5 text-zinc-400">{work.description || "暂无简介"}</p>
          {work.tags?.length > 0 && (
            <div className="flex flex-wrap gap-1">
              {work.tags.filter(Boolean).map((tag, index) => (
                <span key={`${tag}-${index}`} className="rounded border border-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-500">{tag}</span>
              ))}
            </div>
          )}
        </div>
      </div>
      {work.videoUrl && mediaKind === "audio" && <audio src={work.videoUrl} controls className="h-8 w-full max-w-md" />}
      {work.videoUrl && mediaKind === "video" && (
        <div className="max-w-lg">
          <span className="mb-1 block text-[10px] text-zinc-500">视频预览</span>
          <video src={work.videoUrl} controls playsInline className="max-h-[200px] w-full rounded-lg border border-zinc-800 bg-black object-contain" />
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
          <div key={index} className="flex gap-2 rounded-lg border border-zinc-900 bg-zinc-950/60 p-2">
            {item ? (
              <div className="h-16 w-24 shrink-0 overflow-hidden rounded-md border border-zinc-800 bg-zinc-900">
                <img src={item} alt={`作品图片 ${index + 1}`} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
              </div>
            ) : (
              <div className="flex h-16 w-24 shrink-0 items-center justify-center rounded-md border border-zinc-800 bg-zinc-900 text-[10px] text-zinc-600">空白</div>
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

function WorkSummary({ work, index, expanded, onToggle }: {
  work: Work;
  index: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  const firstImage = work.images?.find(Boolean);

  return (
    <div className={`rounded-xl border bg-zinc-950 transition ${expanded ? "border-emerald-500/50" : "border-zinc-900 hover:border-zinc-700"}`}>
      <button type="button" onClick={onToggle} className="grid w-full gap-3 p-2.5 text-left md:grid-cols-[132px_1fr_auto] md:items-center">
        <div className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950">
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
            <span className="rounded border border-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-500">{work.category || "未分类"}</span>
          </div>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-zinc-400">{work.description || "暂无简介，展开后可编辑。"}</p>
          <div className="mt-1 flex flex-wrap gap-2 text-[10px] text-zinc-600">
            <span>{work.images?.filter(Boolean).length || 0} 张图片</span>
            <span>{work.videoUrl ? "有媒体" : "无媒体"}</span>
            <span>{work.links?.filter((link) => link.url).length || 0} 个链接</span>
          </div>
        </div>
        <span className="justify-self-start rounded-lg border border-zinc-800 px-2.5 py-1 text-xs text-zinc-300 md:justify-self-end">
          {expanded ? "收起编辑" : "展开编辑"}
        </span>
      </button>
    </div>
  );
}

function GallerySummary({ item, index, expanded, onToggle }: {
  item: GalleryItem;
  index: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className={`rounded-xl border bg-zinc-950 transition ${expanded ? "border-emerald-500/50" : "border-zinc-900 hover:border-zinc-700"}`}>
      <button type="button" onClick={onToggle} className="grid w-full gap-3 p-2.5 text-left md:grid-cols-[132px_1fr_auto] md:items-center">
        <div className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950">
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
            <span className="rounded border border-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-500">{item.category || "未分类"}</span>
          </div>
          <p className="mt-1 line-clamp-2 text-xs leading-5 text-zinc-400">{item.description || "暂无简介，展开后可编辑。"}</p>
        </div>
        <span className="justify-self-start rounded-lg border border-zinc-800 px-2.5 py-1 text-xs text-zinc-300 md:justify-self-end">
          {expanded ? "收起编辑" : "展开编辑"}
        </span>
      </button>
    </div>
  );
}

function TreasureSummary({ item, index, expanded, onToggle }: {
  item: TreasureItem;
  index: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className={`rounded-xl border bg-zinc-950 transition ${expanded ? "border-amber-500/50" : "border-zinc-900 hover:border-zinc-700"}`}>
      <button type="button" onClick={onToggle} className="grid w-full gap-3 p-2.5 text-left md:grid-cols-[132px_1fr_auto] md:items-center">
        <div className="overflow-hidden rounded-lg border border-zinc-800 bg-zinc-950">
          {item.imageUrl ? (
            <img src={item.imageUrl} alt={`珍藏 ${index + 1}`} className="aspect-video w-full object-contain bg-black" />
          ) : (
            <div className="flex aspect-video items-center justify-center text-[11px] text-zinc-600">暂无缩略图</div>
          )}
        </div>
        <div className="min-w-0">
          <span className="text-sm font-semibold text-white">珍藏 {index + 1}</span>
        </div>
        <span className="justify-self-start rounded-lg border border-zinc-800 px-2.5 py-1 text-xs text-zinc-300 md:justify-self-end">
          {expanded ? "收起编辑" : "展开编辑"}
        </span>
      </button>
    </div>
  );
}

function ExperienceSummary({ exp, index, expanded, onToggle }: {
  exp: Experience;
  index: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className={`rounded-xl border bg-zinc-950 transition ${expanded ? "border-emerald-500/50" : "border-zinc-900 hover:border-zinc-700"}`}>
      <button type="button" onClick={onToggle} className="grid w-full gap-3 p-2.5 text-left md:grid-cols-[120px_1fr_auto] md:items-center">
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/50 px-2.5 py-2">
          <div className="text-xs text-zinc-500">经历 {index + 1}</div>
          <div className="mt-1 line-clamp-2 text-sm font-medium text-emerald-300">{exp.period || "未填写时间"}</div>
        </div>
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <span className="truncate text-sm font-semibold text-white">{exp.role || "未填写角色"}</span>
            <span className="rounded border border-zinc-800 px-1.5 py-0.5 text-xs text-zinc-500">{exp.company || "未填写组织"}</span>
          </div>
          <p className="mt-1 line-clamp-2 text-sm leading-5 text-zinc-400">{exp.desc || "暂无简介，展开后可编辑。"}</p>
        </div>
        <span className="justify-self-start rounded-lg border border-zinc-800 px-2.5 py-1 text-xs text-zinc-300 md:justify-self-end">
          {expanded ? "收起编辑" : "展开编辑"}
        </span>
      </button>
    </div>
  );
}

function MusicSummary({ track, index, expanded, onToggle }: {
  track: MusicTrack;
  index: number;
  expanded: boolean;
  onToggle: () => void;
}) {
  return (
    <div className={`rounded-xl border bg-zinc-950 transition ${expanded ? "border-emerald-500/50" : "border-zinc-900 hover:border-zinc-700"}`}>
      <button type="button" onClick={onToggle} className="grid w-full gap-3 p-2.5 text-left md:grid-cols-[72px_1fr_auto] md:items-center">
        <div className="h-16 w-16 overflow-hidden rounded-full border border-zinc-800 bg-zinc-900">
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
            <span className="rounded border border-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-500">{track.artist || "未填写作者"}</span>
          </div>
          <div className="mt-1 flex flex-wrap gap-2 text-[10px] text-zinc-600">
            <span>{track.audioUrl ? "有音频" : "无音频"}</span>
            <span>{track.coverUrl ? "有封面" : "无封面"}</span>
          </div>
          {track.audioUrl && <audio src={track.audioUrl} controls className="mt-2 h-8 w-full max-w-xl" />}
        </div>
        <span className="justify-self-start rounded-lg border border-zinc-800 px-2.5 py-1 text-xs text-zinc-300 md:justify-self-end">
          {expanded ? "收起编辑" : "展开编辑"}
        </span>
      </button>
    </div>
  );
}

export default function AdminApp() {
  const [authenticated, setAuthenticated] = useState(false);
  const [phone, setPhone] = useState("");
  const [password, setPassword] = useState("");
  const [data, setData] = useState<PortfolioData>(normalize(emptyPortfolioData));
  const [status, setStatus] = useState("");
  const [uploadProgress, setUploadProgress] = useState<{ fileName: string; percent: number } | null>(null);
  const [saving, setSaving] = useState(false);
  const [loading, setLoading] = useState(true);
  const [active, setActive] = useState("profile");
  const [expandedExperienceId, setExpandedExperienceId] = useState("");
  const [expandedWorkId, setExpandedWorkId] = useState("");
  const [expandedGalleryId, setExpandedGalleryId] = useState("");
  const [expandedTreasureId, setExpandedTreasureId] = useState("");
  const [expandedMusicId, setExpandedMusicId] = useState("");
  const [expandedFloatingId, setExpandedFloatingId] = useState("");
  const [supabaseConfigured, setSupabaseConfigured] = useState(false);
  const [maxUploadSizeMb, setMaxUploadSizeMb] = useState(50);
  const [storageProvider, setStorageProvider] = useState("supabase");
  const [asrLoadingTrackId, setAsrLoadingTrackId] = useState("");
  const [visibleLyricTimelineTrackId, setVisibleLyricTimelineTrackId] = useState("");
  const [visibleLyricEditorTrackId, setVisibleLyricEditorTrackId] = useState("");

  const nav = useMemo(
    () => [
      ["profile", "站点资料"],
      ["experiences", "我的经历"],
      ["works", "作品媒体"],
      ["gallery", "工程截图"],
      ["treasures", "我的珍藏"],
      ["music", "音乐播放"],
      ["contact", "联系方式"],
      ["floating", "弹幕设置"],
    ],
    [],
  );

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
    setData((current) => {
      const draft = cloneData(current);
      mutator(draft);
      return normalize(draft);
    });
  }

  async function login(event: React.FormEvent) {
    event.preventDefault();
    setStatus("");
    const res = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ phone, password }),
    });
    const json = await res.json();
    if (!res.ok) {
      setStatus(json.error || "登录失败");
      return;
    }
    setAuthenticated(true);
    setPhone("");
    setPassword("");
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
      setStatus("已保存到数据库。");
      if (collapse) {
        setExpandedExperienceId("");
        setExpandedWorkId("");
        setExpandedGalleryId("");
        setExpandedTreasureId("");
        setExpandedMusicId("");
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
      <div className="flex min-h-screen items-center justify-center bg-zinc-950 text-zinc-300">
        <Loader2 className="mr-2 animate-spin" size={18} /> 正在进入后台
      </div>
    );
  }

  if (!authenticated) {
    return (
      <main className="grid min-h-screen place-items-center bg-[#09090b] p-4 text-zinc-100">
        <form onSubmit={login} className="w-full max-w-sm rounded-2xl border border-zinc-800 bg-zinc-950 p-6 shadow-2xl">
          <p className="font-mono text-xs uppercase tracking-[0.28em] text-emerald-300">Portfolio Admin</p>
          <h1 className="mt-3 text-2xl font-semibold">管理员登录</h1>
          <p className="mt-2 text-sm leading-6 text-zinc-400">请输入环境变量中设置的管理员手机号和密码。</p>
          <input
            type="tel"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            className="mt-6 w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 outline-none focus:border-emerald-400"
            placeholder="管理员手机号"
          />
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            className="mt-3 w-full rounded-xl border border-zinc-800 bg-zinc-900 px-4 py-3 outline-none focus:border-emerald-400"
            placeholder="管理员密码"
          />
          <button className="mt-3 w-full rounded-xl bg-emerald-300 px-4 py-3 font-semibold text-zinc-950 hover:bg-emerald-200">
            登录
          </button>
          {status && <p className="mt-3 text-sm text-amber-300">{status}</p>}
        </form>
      </main>
    );
  }

  const productResumeUrl = data.profile.pageCopy?.resumePdfs?.productManager || data.profile.resumePdfUrl || "";
  const newMediaResumeUrl = data.profile.pageCopy?.resumePdfs?.newMedia || "";

  return (
    <main className="min-h-screen bg-[#09090b] text-zinc-100">
      <header className="sticky top-0 z-30 border-b border-zinc-900 bg-zinc-950/90 px-3 py-2 backdrop-blur md:px-4">
        <div className="mx-auto flex max-w-[1500px] flex-col gap-2 md:flex-row md:items-center md:justify-between">
          <div>
            <p className="font-mono text-xs uppercase tracking-[0.22em] text-emerald-300">Portfolio CMS</p>
            <h1 className="mt-0.5 text-lg font-semibold">网站数据管理后台</h1>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <span className={`rounded-full border px-2.5 py-1 text-xs ${supabaseConfigured ? "border-emerald-700 text-emerald-300" : "border-amber-700 text-amber-300"}`}>
              {supabaseConfigured ? "Supabase 已连接" : "本地 JSON 模式"}
            </span>
            <span className="rounded-full border border-sky-800 px-2.5 py-1 text-xs text-sky-300">
              媒体存储：{storageProvider === "tencent-cos" ? "腾讯云 COS 私有签名" : "Supabase"}
            </span>
            <a href="/" className="rounded-lg border border-zinc-800 px-3 py-1.5 text-sm text-zinc-300 hover:border-zinc-600">
              查看网站
            </a>
            <button onClick={logout} className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 px-3 py-1.5 text-sm text-zinc-300 hover:border-zinc-600">
              <LogOut size={14} /> 退出
            </button>
          </div>
        </div>
        {(status || uploadProgress) && (
          <div className="mx-auto mt-2 max-w-[1500px] space-y-1.5">
            {status && <div className="text-sm text-amber-300">{status}</div>}
            {uploadProgress && (
              <div className="rounded-lg border border-zinc-800 bg-zinc-900/70 px-2.5 py-2">
                <div className="mb-1 flex items-center justify-between gap-3 text-xs text-zinc-400">
                  <span className="truncate">上传中：{uploadProgress.fileName}</span>
                  <span className="font-mono text-emerald-300">{uploadProgress.percent}%</span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800">
                  <div
                    className="h-full rounded-full bg-emerald-300 transition-[width] duration-200"
                    style={{ width: `${uploadProgress.percent}%` }}
                  />
                </div>
              </div>
            )}
          </div>
        )}
      </header>

      <div className="mx-auto grid max-w-[1500px] gap-3 p-3 md:grid-cols-[150px_1fr] md:p-4">
        <aside className="h-fit rounded-xl border border-zinc-900 bg-zinc-950/70 p-1.5 md:sticky md:top-[76px]">
          {nav.map(([key, label]) => (
            <button
              key={key}
              onClick={() => setActive(key)}
              className={`block w-full rounded-lg px-2.5 py-2 text-left text-xs ${active === key ? "bg-zinc-800 text-white" : "text-zinc-400 hover:bg-zinc-900"}`}
            >
              {label}
            </button>
          ))}
        </aside>

        <div className="space-y-3">
          {active === "profile" && (
            <Section title="站点资料">
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
              <div className="rounded-xl border border-zinc-900 bg-zinc-950/60 p-3">
                <div className="mb-3 flex items-center justify-between gap-3">
                  <div>
                    <p className="text-xs font-semibold text-zinc-200">新媒体运营简历</p>
                    <p className="mt-1 text-[11px] text-zinc-500">新增第二份 PDF，前台在“新媒体运营”选项卡展示。</p>
                  </div>
                  <label className="inline-flex shrink-0 cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-zinc-800 px-2.5 py-2 text-xs text-zinc-300 hover:border-zinc-600">
                    <FileText size={16} /> 闪传 PDF
                    <input className="hidden" type="file" accept="application/pdf,.pdf" onChange={(event) => upload(event, (url) => {
                      void deleteMedia([newMediaResumeUrl || ""]);
                      update((draft) => {
                        draft.profile.pageCopy = {
                          ...defaultPageCopy,
                          ...(draft.profile.pageCopy || {}),
                          resumePdfs: {
                            ...(draft.profile.pageCopy?.resumePdfs || {}),
                            newMedia: url,
                          },
                        };
                      });
                    })} />
                  </label>
                </div>
                <Field label="新媒体运营简历 PDF URL" value={newMediaResumeUrl} onChange={(value) => update((draft) => {
                  draft.profile.pageCopy = {
                    ...defaultPageCopy,
                    ...(draft.profile.pageCopy || {}),
                    resumePdfs: {
                      ...(draft.profile.pageCopy?.resumePdfs || {}),
                      newMedia: value,
                    },
                  };
                })} />
              </div>
              <div className="grid gap-3 md:grid-cols-[1fr_auto] md:items-end">
                <Field label="真实简历 PDF URL" value={data.profile.resumePdfUrl} onChange={(value) => update((draft) => { draft.profile.resumePdfUrl = value; })} />
                <label className="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-zinc-800 px-2.5 py-2 text-xs text-zinc-300 hover:border-zinc-600">
                  <FileText size={16} /> 上传 PDF
                  <input className="hidden" type="file" accept="application/pdf,.pdf" onChange={(event) => upload(event, (url) => {
                    void deleteMedia([data.profile.resumePdfUrl || ""]);
                    update((draft) => { draft.profile.resumePdfUrl = url; });
                  })} />
                </label>
              </div>
              <Field label="一句话标签" value={data.profile.tagline} onChange={(value) => update((draft) => { draft.profile.tagline = value; })} textarea />
              <Field label="自我介绍" value={data.profile.intro} onChange={(value) => update((draft) => { draft.profile.intro = value; })} textarea />
              <Field label="诗句/签名" value={data.profile.quote} onChange={(value) => update((draft) => { draft.profile.quote = value; })} textarea />
              <label className="flex items-center justify-between gap-4 rounded-xl border border-zinc-900 bg-zinc-950/60 p-3">
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
              <div className="rounded-xl border border-zinc-900 bg-zinc-950/60 p-3">
                <div className="mb-3 text-xs font-semibold text-zinc-300">页面诗句说明</div>
                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="个人简历说明" value={data.profile.pageCopy?.resume} onChange={(value) => update((draft) => { draft.profile.pageCopy = { ...defaultPageCopy, ...(draft.profile.pageCopy || {}), resume: value }; })} textarea />
                  <Field label="创意合集说明" value={data.profile.pageCopy?.works} onChange={(value) => update((draft) => { draft.profile.pageCopy = { ...defaultPageCopy, ...(draft.profile.pageCopy || {}), works: value }; })} textarea />
                  <Field label="工程截图说明" value={data.profile.pageCopy?.gallery} onChange={(value) => update((draft) => { draft.profile.pageCopy = { ...defaultPageCopy, ...(draft.profile.pageCopy || {}), gallery: value }; })} textarea />
                  <Field label="我的珍藏说明" value={data.profile.pageCopy?.treasures} onChange={(value) => update((draft) => { draft.profile.pageCopy = { ...defaultPageCopy, ...(draft.profile.pageCopy || {}), treasures: value }; })} textarea />
                  <Field label="联系方式说明" value={data.profile.pageCopy?.contact} onChange={(value) => update((draft) => { draft.profile.pageCopy = { ...defaultPageCopy, ...(draft.profile.pageCopy || {}), contact: value }; })} textarea />
                </div>
              </div>
              <SaveCurrentButton label="保存站点资料" />
            </Section>
          )}

          {active === "experiences" && (
            <>
              <Section title="经历管理">
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
                <div key={exp.id || index} className="space-y-2">
                  <ExperienceSummary
                    exp={exp}
                    index={index}
                    expanded={expandedExperienceId === exp.id}
                    onToggle={() => setExpandedExperienceId(expandedExperienceId === exp.id ? "" : exp.id)}
                  />
                  {expandedExperienceId === exp.id && (
                    <div className="rounded-xl border border-zinc-900 bg-zinc-950/70 p-3">
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
                              () => { if (expandedExperienceId === exp.id) setExpandedExperienceId(""); },
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
                </div>
              ))}
            </>
          )}

          {active === "works" && (
            <>
              <Section title="作品管理">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="text-xs text-zinc-400">共 {data.works.length} 个作品。默认只显示缩略图和简介，点击后展开详细编辑。</div>
                  <button
                    type="button"
                    onClick={() => {
                      const id = uid("work");
                      addDraft(
                        (draft) => { draft.works = [...(draft.works || []), { ...emptyWork, id }]; },
                        () => setExpandedWorkId(id),
                      );
                    }}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 px-2.5 py-1.5 text-sm text-zinc-300"
                  >
                    <Plus size={15} /> 新增作品
                  </button>
                </div>
              </Section>

              {data.works.map((work, workIndex) => (
                <div key={work.id || workIndex} className="space-y-2">
                  <WorkSummary
                    work={work}
                    index={workIndex}
                    expanded={expandedWorkId === work.id}
                    onToggle={() => setExpandedWorkId(expandedWorkId === work.id ? "" : work.id)}
                  />
                  {expandedWorkId === work.id && (
                    <div className="rounded-xl border border-zinc-900 bg-zinc-950/70 p-3">
                      <WorkPreview work={work} />
                      <div className="mt-3 grid gap-3 md:grid-cols-2">
                        <Field label="标题" value={work.title} onChange={(value) => update((draft) => { draft.works[workIndex].title = value; })} />
                        <SelectField label="分类" value={work.category} options={workCategoryOptions} onChange={(value) => update((draft) => { draft.works[workIndex].category = value; })} />
                        <Field label="图标名" value={work.icon} onChange={(value) => update((draft) => { draft.works[workIndex].icon = value; })} />
                        <Field label="右上角绿色标签" value={work.badgeText || ""} onChange={(value) => update((draft) => { draft.works[workIndex].badgeText = value; })} placeholder="例如：支持在线播放" />
                        <Field label="视频/音乐 URL" value={work.videoUrl} onChange={(value) => update((draft) => { draft.works[workIndex].videoUrl = value; })} />
                      </div>
                      <div className="mt-3">
                        <Field label="简介" value={work.description} onChange={(value) => update((draft) => { draft.works[workIndex].description = value; })} textarea />
                      </div>
                      <div className="mt-3 grid gap-3 md:grid-cols-2">
                        <div>
                          <WorkImagesEditor
                            images={work.images || []}
                            onChange={(items) => { void updateAndSave((draft) => { draft.works[workIndex].images = items; }); }}
                            onRemove={(url) => { void deleteMedia([url]); }}
                          />
                          <label className="mt-2 inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-zinc-800 px-2.5 py-1.5 text-xs text-zinc-300 hover:border-zinc-600">
                            <ImagePlus size={16} /> 上传图片
                            <input className="hidden" type="file" accept="image/*" onChange={(event) => upload(event, (url) => updateAndSave((draft) => { draft.works[workIndex].images = [...(draft.works[workIndex].images || []), url]; }))} />
                          </label>
                        </div>
                        <div>
                          <ArrayEditor
                            label="标签"
                            items={work.tags || []}
                            onChange={(items) => update((draft) => { draft.works[workIndex].tags = items; })}
                          />
                          <label className="mt-2 inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-zinc-800 px-2.5 py-1.5 text-xs text-zinc-300 hover:border-zinc-600">
                            <Video size={16} /> 上传视频/音乐
                            <input className="hidden" type="file" accept="video/*,audio/*" onChange={(event) => upload(event, (url) => {
                              void deleteMedia([work.videoUrl || ""]);
                              update((draft) => { draft.works[workIndex].videoUrl = url; });
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
                                const links = draft.works[workIndex].links || [];
                                draft.works[workIndex].links = [...links, { label: file.name, url, kind: "attachment", fileName: file.name }];
                              }))}
                            />
                          </label>
                          <button
                            onClick={() => update((draft) => { draft.works[workIndex].links = [...(draft.works[workIndex].links || []), { label: "", url: "", kind: "link" }]; })}
                            className="inline-flex items-center gap-1 rounded-lg border border-zinc-800 px-2 py-1 text-xs text-zinc-300"
                          >
                            <LinkIcon size={12} /> 新增链接
                          </button>
                          </div>
                        </div>
                        <div className="space-y-2">
                          {(work.links || []).map((link: WorkLink, linkIndex: number) => (
                            <div key={linkIndex} className="grid gap-2 md:grid-cols-[0.35fr_1fr_auto]">
                              <input value={link.label} onChange={(event) => update((draft) => { draft.works[workIndex].links![linkIndex].label = event.target.value; })} placeholder="按钮文案" className="rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-2 text-xs" />
                              <input value={link.url} onChange={(event) => update((draft) => { draft.works[workIndex].links![linkIndex].url = event.target.value; })} placeholder="https:// 或下载地址" className="rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-2 text-xs" />
                              <button
                                onClick={() => {
                                  void deleteMedia([link.url]);
                                  update((draft) => { draft.works[workIndex].links = draft.works[workIndex].links!.filter((_, i) => i !== linkIndex); });
                                }}
                                className="rounded-lg border border-zinc-800 px-2 text-red-300"
                              >
                                <Trash2 size={15} />
                              </button>
                            </div>
                          ))}
                        </div>
                      </div>
                      <div className="mt-3 flex justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => {
                            void removeAndSave(
                              (draft) => { draft.works = (draft.works || []).filter((_, i) => i !== workIndex); },
                              collectWorkMedia(work),
                              () => { if (expandedWorkId === work.id) setExpandedWorkId(""); },
                            );
                          }}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 px-2.5 py-1.5 text-sm text-red-300 hover:border-red-500"
                        >
                          <Trash2 size={14} /> 删除作品
                        </button>
                        <SaveCurrentButton label="保存这个作品" />
                      </div>
                    </div>
                  )}
                </div>
              ))}
            </>
          )}

          {active === "gallery" && (
            <>
              <Section title="工程截图图库">
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
                <div key={item.id || index} className="space-y-2">
                  <GallerySummary
                    item={item}
                    index={index}
                    expanded={expandedGalleryId === item.id}
                    onToggle={() => setExpandedGalleryId(expandedGalleryId === item.id ? "" : item.id)}
                  />
                  {expandedGalleryId === item.id && (
                    <div className="rounded-xl border border-zinc-900 bg-zinc-950/70 p-3">
                      <div className="grid gap-3 md:grid-cols-2">
                        <SelectField label="分类" value={item.category} options={galleryCategoryOptions} onChange={(value) => update((draft) => { draft.gallery![index].category = value; })} />
                        <Field label="标题" value={item.title} onChange={(value) => update((draft) => { draft.gallery![index].title = value; })} />
                        <Field label="ͼƬ URL" value={item.imageUrl} onChange={(value) => update((draft) => { draft.gallery![index].imageUrl = value; })} />
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
                              () => { if (expandedGalleryId === item.id) setExpandedGalleryId(""); },
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
                </div>
              ))}
            </>
          )}

          {active === "floating" && (
            <>
              <Section title="弹幕设置">
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
                    <div className="rounded-xl border border-zinc-900 bg-zinc-950/70 p-3">
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
                        <div className="mt-3 border-t border-zinc-900 pt-3">
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
                          <div key={page.key} className="rounded-xl border border-zinc-900 bg-zinc-950/70 p-3">
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
                              <div className="mt-3 border-t border-zinc-900 pt-3">
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
                  <div className="flex justify-end border-t border-zinc-900 pt-3">
                    <SaveCurrentButton label="保存弹幕设置" />
                  </div>
                </div>
              </Section>
            </>
          )}

          {active === "treasures" && (
            <>
              <Section title="我的珍藏图库">
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
                <div key={item.id || index} className="space-y-2">
                  <TreasureSummary
                    item={item}
                    index={index}
                    expanded={expandedTreasureId === item.id}
                    onToggle={() => setExpandedTreasureId(expandedTreasureId === item.id ? "" : item.id)}
                  />
                  {expandedTreasureId === item.id && (
                    <div className="rounded-xl border border-zinc-900 bg-zinc-950/70 p-3">
                      <div className="flex flex-wrap items-end gap-3">
                        <div className="min-w-[260px] flex-1"><Field label="ͼƬ URL" value={item.imageUrl} onChange={(value) => update((draft) => { draft.treasures![index].imageUrl = value; })} /></div>
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
                              () => { if (expandedTreasureId === item.id) setExpandedTreasureId(""); },
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
                </div>
              ))}
            </>
          )}

          {active === "music" && (
            <>
              <Section title="首页音乐播放器">
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
                <div key={track.id || index} className="space-y-2">
                  <MusicSummary
                    track={track}
                    index={index}
                    expanded={expandedMusicId === track.id}
                    onToggle={() => setExpandedMusicId(expandedMusicId === track.id ? "" : track.id)}
                  />
                  {expandedMusicId === track.id && (
                    <div className="rounded-xl border border-zinc-900 bg-zinc-950/70 p-3">
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
                              () => { if (expandedMusicId === track.id) setExpandedMusicId(""); },
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
                </div>
              ))}
            </>
          )}

          {active === "contact" && (
            <Section title="联系方式">
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
    </main>
  );
}
