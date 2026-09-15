import React, { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  Activity,
  ArrowDown,
  ArrowLeftRight,
  ArrowUp,
  AtSign,
  Ban,
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
  LayoutList,
  Link as LinkIcon,
  Loader2,
  LogOut,
  MapPin,
  MessagesSquare,
  MonitorSmartphone,
  Music,
  Plus,
  RefreshCw,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserRound,
  Video,
  X,
} from "lucide-react";
import { Experience, GalleryItem, MusicTrack, PortfolioData, ResumeProfile, SectionKey, TreasureItem, VisitRecord, VisitorRecord, VisitsPayload, Work, WorkLink, defaultPageCopy, isSectionVisible, normalizeSectionOrder, sectionMeta } from "./types";

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
  { key: "prospects", label: "应用技能" },
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

/**
 * 把某一栏目的「页首文案」写进草稿。
 *
 * pageCopy 里这六段文案是六个**具名字段**而不是一个 map，所以这里逐个列出：
 * 换成动态键名（`{ [key]: value }`）会让 TS 退化成索引签名，赋值给
 * Partial<pageCopy> 时要靠 as 断言才过 —— 那等于把这一处的类型检查关掉。
 */
function setSectionCopy(draft: PortfolioData, key: SectionKey, value: string) {
  switch (key) {
    case "resume": editPageCopy(draft, { resume: value }); return;
    case "works": editPageCopy(draft, { works: value }); return;
    case "ai": editPageCopy(draft, { aiZone: value }); return;
    case "prospects": editPageCopy(draft, { gallery: value }); return;
    case "treasures": editPageCopy(draft, { treasures: value }); return;
    case "contact": editPageCopy(draft, { contact: value }); return;
    default: return;
  }
}

/** 读某一栏目的页首文案当前值。不在这里补默认值：保持与旧表单一致（空就是空）。 */
function sectionCopyValue(pageCopy: PortfolioData["profile"]["pageCopy"], key: SectionKey): string | undefined {
  switch (key) {
    case "resume": return pageCopy?.resume;
    case "works": return pageCopy?.works;
    case "ai": return pageCopy?.aiZone;
    case "prospects": return pageCopy?.gallery;
    case "treasures": return pageCopy?.treasures;
    case "contact": return pageCopy?.contact;
    default: return undefined;
  }
}

/**
 * 开始拖拽文件。返回一个「取消监听」的函数。
 *
 * 拖拽上传最容易踩的两个坑，都在这里一次性处理掉：
 * 1. **必须 preventDefault 掉 dragover**，否则浏览器会把 drop 当成「打开这个文件」，
 *    直接导航走，后台整个页面被替换成那张图片/视频。
 * 2. **只在真的拖的是文件时才算数**，用 dragenter/dragleave 的计数抵消嵌套元素
 *    反复触发，避免鼠标划过一个子元素就闪一下高亮。
 */
function useFileDrop(onFile: (file: File) => void, onActiveChange: (active: boolean) => void) {
  const handlerRef = useRef(onFile);
  const flagRef = useRef(onActiveChange);
  handlerRef.current = onFile;
  flagRef.current = onActiveChange;

  return useCallback(() => {
    let depth = 0;
    const onDragEnter = (event: DragEvent) => {
      if (!event.dataTransfer?.types.includes("Files")) return;
      event.preventDefault();
      depth += 1;
      if (depth === 1) flagRef.current(true);
    };
    const onDragOver = (event: DragEvent) => {
      if (!event.dataTransfer?.types.includes("Files")) return;
      event.preventDefault(); // 不写这一行 = 浏览器自己接管，页面被文件顶掉
      if (event.dataTransfer) event.dataTransfer.dropEffect = "copy";
    };
    const onDragLeave = (event: DragEvent) => {
      if (!event.dataTransfer?.types.includes("Files")) return;
      depth = Math.max(0, depth - 1);
      if (depth === 0) flagRef.current(false);
    };
    const onDrop = (event: DragEvent) => {
      if (!event.dataTransfer?.types.includes("Files")) return;
      // 在拖动结束时也要拦一次：否则浏览器会在 drop 之后继续用默认行为打开文件。
      event.preventDefault();
      depth = 0;
      flagRef.current(false);
      const file = event.dataTransfer.files?.[0];
      if (file) handlerRef.current(file);
    };
    // window 上补一层「拖到窗口外松手」的兜底，免得高亮一直留着。
    const onWindowDrop = () => { depth = 0; flagRef.current(false); };

    window.addEventListener("dragenter", onDragEnter);
    window.addEventListener("dragover", onDragOver);
    window.addEventListener("dragleave", onDragLeave);
    window.addEventListener("drop", onDrop);
    window.addEventListener("blur", onWindowDrop);
    return () => {
      window.removeEventListener("dragenter", onDragEnter);
      window.removeEventListener("dragover", onDragOver);
      window.removeEventListener("dragleave", onDragLeave);
      window.removeEventListener("drop", onDrop);
      window.removeEventListener("blur", onWindowDrop);
    };
  }, []);
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
 * 输入控件的统一皮。后台各栏目和登录页共用同一套边框 / 底色 / 焦点环，
 * 免得同一个后台里出现两种手感的输入框。
 */
const inputBaseClass =
  "w-full rounded-lg border border-zinc-700/80 bg-zinc-900/40 text-sm text-zinc-100 outline-none transition-colors duration-200 placeholder:text-zinc-600 hover:border-zinc-600 focus:border-emerald-400 focus-visible:ring-2 focus-visible:ring-emerald-400/25";

/**
 * 表单输入。后台各栏目全部走这一个组件，所以这里改一次全局生效。
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
  action,
  nested,
  children,
}: {
  title: string;
  description?: string;
  /**
   * 抬眼处的动作按钮（「新增作品」这类）。放在标题同一行、靠右 —— 宝要求
   * 「新增作品应该与上面在同一列，不要分开」。所以它不能是 children 的一部分
   * （那样会掉到说明文字下面另起一行），必须由 header 自己排版。
   */
  action?: React.ReactNode;
  /** 嵌在另一个 Section 里时置 true：换成无边框的色调分组面，读起来像「子区域」而不是「卡片里又塞了张卡片」。 */
  nested?: boolean;
  /** 可以不给：只有标题+动作按钮、没有正文的栏目（本轮「新增 X」上提到抬头后就是这种）不该留一块空内边距。 */
  children?: React.ReactNode;
}) {
  return (
    <section className={nested ? "adm-panel" : "adm-card"}>
      <div className={nested ? "px-4 pb-0 pt-3.5 md:px-5" : "border-b border-zinc-800/60 px-4 py-3 md:px-5"}>
        {/*
         * 有 action 时用两栏：左栏标题+说明竖排，右栏按钮。
         * `items-start` 让按钮跟标题的第一行对齐，而不是跟整块（含说明）垂直居中 ——
         * 说明两三行时居中会让按钮浮在中间，看着没归属。
         */}
        <div className={action ? "flex items-start justify-between gap-3" : undefined}>
          <div className="min-w-0">
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
          {action && <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">{action}</div>}
        </div>
      </div>
      {children ? (
        <div className={nested ? "space-y-3 px-4 pb-4 pt-3 md:px-5" : "space-y-4 p-4 md:p-5"}>{children}</div>
      ) : null}
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

/**
 * 视频预览 / VIDEO —— 独立模块（宝：视频预览不该挤在「前台效果」里）。
 *
 * 比例**跟着视频本身走**：
 * 视频源比例千奇百怪（竖屏 9:16、方屏 1:1、宽银幕 21:9），硬套一个 16:9 的框
 * 就一定会在两侧或上下留黑边 —— 那既是「框套框」，也让人误以为视频有问题。
 * 所以这里读一次元数据拿真实宽高比，把它写到 `aspect-ratio` 上。
 *
 * **别在同一个元素上同时要「铺满宽度」「按比例」「限高」**（踩过）：
 * 三者冲突时浏览器**保宽弃比例** —— 元素被压成 823×420（1.96）而源是 1.78，
 * 画面**横向拉伸**，比黑边更难看。探针的「渲染比例 == 源比例」那条断言就是抓这个的。
 *
 * 正解：**外层容器定形，内层 video 填满**。
 * 外层是个没有内容固有尺寸的普通 `div`，吃 `aspect-ratio` + `max-h` +
 * `w-auto max-w-full`（**关键：宽度不写死**）—— 宽度不是硬约束，浏览器才能在
 * 「尽量宽」与「高度 ≤ 420」之间按比例求解。内层 `video` 只写 `h-full w-full
 * object-contain`，不参与比例计算 ⇒ 既不拉伸、也不缩回固有像素宽、更不会在两侧
 * 留出容器底色。竖屏被 420 卡住后自动收窄，`mx-auto` 居中。
 */
function WorkVideoPanel({ work }: { work: Work }) {
  // 元数据没到位时先按 16:9 占位，避免加载瞬间高度跳一下。
  const [ratio, setRatio] = useState("16 / 9");
  const mediaKind = getMediaKind(work.videoUrl);

  if (!work.videoUrl) return null;

  if (mediaKind === "audio") {
    return <audio src={work.videoUrl} controls className="h-8 w-full" />;
  }

  if (mediaKind === "link") {
    return (
      <a href={work.videoUrl} target="_blank" rel="noreferrer" className="block truncate text-xs text-emerald-300 hover:text-emerald-200">
        {work.videoUrl}
      </a>
    );
  }

  return (
    <div className="space-y-1.5">
      {/*
       * 关键：**外层定形、内层填充**，而且外层不能同时被「铺满宽度」和「封顶高度」夹住。
       *
       * 三种写法都试过，前两种都有病：
       *  ① `<video className="w-full max-h-[420px]" style={{aspectRatio}}>` ——
       *     三段约束冲突时浏览器**保宽弃比例**，823×420（1.96）而源 1.78 ⇒ 横向拉伸。
       *  ② `<video className="w-auto max-w-full max-h-[420px]">` ——
       *     尺寸回落到**固有像素宽**（320px），在 847px 的模块里两侧露底 = 黑边。
       *  ③ 现在：外层 div 用 `max-h` + `max-w-full`，**宽度写成 `auto`**，
       *     再给 `aspect-ratio`（内联，因为值是运行时算的）。这样宽度不是硬约束，
       *     浏览器按比例求解：宽银幕铺满可用宽度且不超高；竖屏被 420 卡住后自动收窄，
       *     两侧露的是模块底色、而不是视频自己画的黑边（`mx-auto` 让窄的居中）。
       *     内层 video 只写 `h-full w-full object-contain`，不参与比例计算 ⇒ 永不变形。
       *
       * 反面教材就是 ① 和 ② —— 探针里「渲染比例 == 源比例」那条断言存在的意义。
       */}
      <div
        className="mx-auto block max-h-[420px] w-auto max-w-full"
        style={{ aspectRatio: ratio }}
      >
        <video
          // key 带上地址：换视频时重新挂载，免得沿用上一条的 aspect-ratio。
          key={work.videoUrl}
          src={work.videoUrl}
          controls
          playsInline
          preload="metadata"
          onLoadedMetadata={(event) => {
            const video = event.currentTarget;
            if (video.videoWidth > 0 && video.videoHeight > 0) {
              setRatio(video.videoWidth + " / " + video.videoHeight);
            }
          }}
          className="h-full w-full rounded-lg object-contain"
        />
      </div>
      <p className="text-[10px] leading-5 text-zinc-500">按视频原始比例显示，不套 16:9 的框。</p>
    </div>
  );
}

/**
 * 前台效果 / PREVIEW —— **只放封面缩略图与文案**。
 *
 * 宝：视频预览不该混在这个模块里，要单独一个模块；而且预览比例要跟着视频本身走。
 * 所以这里只留「缩略图 + 标题 / 分类 / 简介 / 标签」这一组，
 * 播放器搬到下面独立的「视频预览 / VIDEO」模块（见 WorkVideoPanel）。
 */
function WorkPreview({ work }: { work: Work }) {
  const firstImage = work.images?.find(Boolean);

  return (
    // 预览区是前台成品的样子，属于「只读镜像」，用左侧色条标明范围即可，不再加边框。
    <div className="border-l-2 border-zinc-700/50 pl-3">
      {/*
       * 封面**不套 16:9 的黑框**（宝：无黑边展示）。封面比例本身可能是 4:3、1:1、
       * 甚至竖屏，套 `aspect-video` + `bg-black` 就必然上下或左右留黑边。
       * 这里把宽高上限交给容器（固定列宽 180px），图片自己用 `object-contain` 按
       * 原始比例落进去，容器底色用面板色而不是纯黑 —— 留白也是「留槽色」，看着不像黑边。
       */}
      <div className="grid gap-3 lg:grid-cols-[180px_1fr]">
        <div className="flex h-[101px] items-center justify-center overflow-hidden rounded-lg bg-white/[0.04]">
          {firstImage ? (
            <img src={firstImage} alt={work.title || "作品预览"} className="max-h-full w-auto max-w-full rounded-md object-contain" />
          ) : (
            <span className="text-[11px] text-zinc-600">暂无图片</span>
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
    </div>
  );
}

/**
 * 帧选视频某一帧做封面（宝：视频/图片支持拖拽上传外，还可以帧选视频某一帧制作封面）。
 *
 * 为什么值得单独做：视频作品在前台是缩略图 + 播放器，缩略图默认取 images[0]。
 * 没有这个工具，作者只能自己截图再传 —— 而浏览器里逐帧找画面本来就该由页面做。
 *
 * 两个容易错的点，都写在这儿免得后人重踩：
 *   1. `crossOrigin="anonymous"` 是**承重的**。少了它，跨域视频画进 canvas 会把
 *      canvas 标记为 tainted，`toBlob` 抛 SecurityError。COS 的 CORS 是
 *      AllowedOrigin ["*"] + 允许 GET，所以带这行就能正常读像素。
 *   2. 滑杆拖动时要 `pause()`，否则拖到哪帧都会被播放位置覆盖回去，手感像坏了。
 */
function FrameGrabber({
  videoUrl,
  onCaptured,
  capturing,
}: {
  videoUrl: string;
  /** 拿到的 PNG File 交给调用方 —— 由它走 uploadMediaFile，别在这里自己上传。 */
  onCaptured: (file: File) => void;
  capturing?: boolean;
}) {
  const videoRef = useRef<HTMLVideoElement | null>(null);
  const [duration, setDuration] = useState(0);
  const [at, setAt] = useState(0);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const seekTo = (next: number) => {
    const video = videoRef.current;
    setAt(next);
    if (!video) return;
    // 拖动时先暂停，不然播放会立刻把 currentTime 推走，滑杆弹回去。
    if (!video.paused) video.pause();
    try {
      video.currentTime = next;
    } catch {
      /* 极端情况下（时长还没解析出来）赋值会抛，忽略即可 */
    }
  };

  const capture = async () => {
    const video = videoRef.current;
    if (!video || !video.videoWidth) return;
    setBusy(true);
    setError("");
    try {
      const canvas = document.createElement("canvas");
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      const ctx = canvas.getContext("2d");
      if (!ctx) throw new Error("当前浏览器不支持 canvas 取帧");
      ctx.drawImage(video, 0, 0, canvas.width, canvas.height);

      const blob = await new Promise<Blob | null>((resolve) => {
        // PNG：抽帧是用来当封面的，别引入 JPEG 的二次压缩噪声。
        canvas.toBlob((b) => resolve(b), "image/png");
      });
      if (!blob) throw new Error("取帧失败，请换一帧再试");

      // 文件名带上秒数，传到 COS 后能看出这一帧是从哪来的。
      const name = "frame-" + at.toFixed(2).replace(".", "_") + "s.png";
      onCaptured(new File([blob], name, { type: "image/png" }));
    } catch (err: any) {
      // 最典型的就是跨域 taint（SecurityError）—— 把原因说清楚，别只报「失败」。
      const msg = String(err && err.message ? err.message : err);
      setError(/tainted|SecurityError/i.test(msg)
        ? "这一帧读不出来：视频地址不允许跨域读取像素。换成直链或先下载再上传。"
        : msg);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-2">
      <video
        ref={videoRef}
        src={videoUrl}
        // 承重：不加这行，canvas 会被 taint，toBlob 直接抛 SecurityError。
        crossOrigin="anonymous"
        playsInline
        preload="metadata"
        onLoadedMetadata={(event) => {
          const video = event.currentTarget;
          setDuration(Number.isFinite(video.duration) ? video.duration : 0);
          setReady(true);
        }}
        onError={() => setError("视频加载失败，检查地址是否可访问。")}
        className="max-h-[220px] w-full rounded-lg bg-black object-contain"
      />
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="range"
          min={0}
          max={duration || 0}
          step={0.05}
          value={at}
          disabled={!ready || !duration}
          onChange={(event) => seekTo(Number(event.target.value))}
          className="h-1 min-w-[160px] flex-1 accent-emerald-300"
          aria-label="选择帧"
        />
        <span className="w-24 shrink-0 text-right font-mono text-[11px] text-zinc-400">
          {at.toFixed(2)} / {duration ? duration.toFixed(2) : "--"} s
        </span>
        <button
          type="button"
          onClick={() => { void capture(); }}
          disabled={!ready || busy || capturing}
          className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 px-2.5 py-1.5 text-xs text-zinc-200 hover:border-emerald-500 disabled:opacity-50"
        >
          {busy || capturing ? <Loader2 className="animate-spin" size={13} /> : <ImagePlus size={13} />}
          用这一帧做封面
        </button>
      </div>
      <p className="text-[10px] leading-5 text-zinc-500">
        拖动滑杆挑画面，点「用这一帧做封面」会上传成 PNG 并放到图集第一位（第一位即前台封面）。
      </p>
      {error && <p className="text-[11px] leading-5 text-amber-300">{error}</p>}
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
 * 列表行外壳。每一行是「缩略信息 + 一个编辑按钮」，点按钮开的是**二级弹窗**
 * （见 EditorModal），不是就地展开。
 *
 * 这是「禁止框套框」在列表上的落点：原来摘要是一张卡片、点开后下面又冒出一张
 * 独立卡片，两层框并排摆着，谁主谁次看不出来。现在整行只有一个框，状态只靠
 * 左侧色条 + 底色表达（data-expanded / data-tone）。
 *
 * 后台所有列表（作品 / AI 作品 / 简历岗位 / 经历 / 截图 / 珍藏 / 音乐 / 访客）
 * 共用它。
 */
type EditorRowProps = {
  expanded: boolean;
  /** 展开态的强调色。珍藏与「被标记屏蔽的访客」用 amber，其余用 emerald。 */
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

/**
 * 可清空的文本输入。作品表单里的「视频 / 音乐地址」需要它 ——
 * 原来的单行 input 一旦填过值就只能改不能删（清空成空串会在草稿里留一个
 * 空字段，界面上看不出到底清没清），换成 value 为 undefined 才代表「没有」。
 */
function ClearableField({ label, value, onChange, placeholder }: {
  label: string;
  value?: string;
  onChange: (value: string | undefined) => void;
  placeholder?: string;
}) {
  return (
    <label className="block">
      <span className="mb-1.5 flex items-center justify-between gap-2 text-xs font-medium text-zinc-500">
        <span>{label}</span>
        {value ? (
          <button
            type="button"
            onClick={() => onChange(undefined)}
            className="rounded border border-zinc-800 px-1.5 py-0.5 text-[10px] text-zinc-400 hover:border-red-500 hover:text-red-300"
          >
            清除
          </button>
        ) : null}
      </span>
      <input
        value={value || ""}
        onChange={(event) => onChange(event.target.value)}
        placeholder={placeholder}
        className="w-full rounded-lg border border-zinc-800 bg-zinc-950 px-2.5 py-2 text-sm text-zinc-100 outline-none transition-colors focus:border-emerald-400"
      />
    </label>
  );
}

/**
 * 「二级弹窗」编辑器外壳 —— 后台所有列表条目的完整编辑表单都装在这里。
 *
 * 为什么不做成行内展开：一个作品的完整表单（预览 + 7 个字段 + 图集 + 标签 +
 * 媒体 + 链接 + 操作区）有 1000px 高，就地展开会把列表撑成一团，而且同一屏里
 * 摘要信息和表单字段是**重复**的（标题/分类/简介各出现两遍）。改成弹窗后，
 * 列表恒是一屏能扫完的摘要，表单在独立图层里独占一屏。
 *
 * 也**不再有标题栏**：弹窗编辑的就是刚点过的那一条，标题只是把列表的字再说一遍。
 *
 * 关闭方式：点遮罩、按 Esc、底部「取消」。三条都等价于「不改了，关掉」，
 * 编辑中的改动走后台既有的
 * 草稿机制（update / updateAndSave），所以关掉弹窗不会丢改动 ——
 * 头部状态区会一直挂着「有改动还没保存」，重新打开同一条就能接着改。
 *
 * 它是新的一层表面（fixed），弹窗面板是这一层唯一的那个框；内部只用
 * .adm-panel / .adm-note / .adm-row（无整圈描边），不构成框套框。
 */
function EditorModal({
  title,
  onClose,
  footer,
  dragActive = false,
  children,
}: {
  /** 只用于 role="dialog" 的 aria-label，不渲染出来。 */
  title: string;
  onClose: () => void;
  /** 操作区（取消 / 保存 / 迁移）。常驻底部 —— 表单再长也不用滚到底找它。 */
  footer?: React.ReactNode;
  /** 有文件正被拖到这个弹窗上：只加一圈高亮，让人知道松手会落在这里。 */
  dragActive?: boolean;
  children: React.ReactNode;
}) {
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div className="adm-modal-layer flex items-stretch justify-center p-2 md:items-center md:p-6">
      <button
        type="button"
        className="adm-modal-backdrop absolute inset-0 cursor-default"
        onClick={onClose}
        aria-label="关闭编辑弹窗"
        tabIndex={-1}
      />
      <div className="adm-modal relative flex max-h-full w-full max-w-4xl flex-col" role="dialog" aria-modal="true" aria-label={title} data-drag={dragActive ? "true" : "false"}>
        {dragActive && (
          /*
           * 拖拽提示：固定的小卡片，落在**视口中央**，不再贴着弹窗顶部。
           * 贴顶部的问题是不显眼 —— 用户正盯着鼠标和光标所在的位置，视线在屏幕中间；
           * 顶部那条 11px 的胶囊很容易被忽略，白拖一场。
           * position: fixed + left/top 50% + translate(-50%,-50%) 是唯一能同时对付
           * 弹窗滚动和页面滚动的居中写法；用 absolute 的话它会跟着 .adm-modal-scroll 跑掉。
           */
          <div className="pointer-events-none fixed left-1/2 top-1/2 z-[60] -translate-x-1/2 -translate-y-1/2">
            <span className="block border-2 border-emerald-300 bg-zinc-950/95 px-5 py-3 text-center text-sm font-semibold text-emerald-200 shadow-[0_0_0_9999px_rgba(0,0,0,0.55)]">
              松手即上传
              <span className="mt-1 block text-[11px] font-normal text-zinc-400">
                图片进图集，视频 / 音乐 / 附件按类型归位
              </span>
            </span>
          </div>
        )}
        {/*
         * 没有标题栏。弹窗里编辑的是「刚点过的那一条」，标题只是把列表上的字
         * 又说一遍；关掉的方式有三种（遮罩点一下 / Esc / 底部的取消），
         * 右上角再放一个「关闭」纯属重复。底部的取消按钮和保存按钮成对摆放，
         * 位置固定，比右上角更好找。
         */}
        <div className="adm-modal-scroll min-h-0 flex-1 px-4 py-4">{children}</div>

        <footer className="flex flex-wrap items-center justify-end gap-2 border-t border-zinc-800/70 px-4 py-3">
          {/*
           * 顺序：调用方给的动作（保存全部 / 迁移…）在前，「取消」在最后 ——
           * 宝要求「取消应该在保存右边」。整条仍是 justify-end 右对齐，
           * 所以视觉上最右那颗永远是「取消」，最显眼的「保存全部」紧挨它左边。
           */}
          {footer}
          <button
            type="button"
            onClick={onClose}
            className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 px-2.5 py-1.5 text-sm text-zinc-300 transition-colors duration-200 hover:border-zinc-600 hover:text-white"
          >
            取消
          </button>
        </footer>
      </div>
    </div>
  );
}

function WorkSummary({ work, index, active, leading, onEdit, onDelete }: {
  work: Work;
  index: number;
  /** 该条目的编辑弹窗是否正开着 —— 只影响左侧色条与按钮文案。 */
  active: boolean;
  /**
   * 行内动作区里排在「编辑」左边的内容（当前用来放「迁移到 AI 专区」）。
   * 宝要求它进列表行、在编辑左边，并且弹窗里不要再有 —— 所以它是行的能力，
   * 不是弹窗的能力，别再往 EditorModal 的 footer 里加同类按钮。
   */
  leading?: React.ReactNode;
  onEdit: () => void;
  /** 删除这一条。确认框由调用方负责 —— 摘要只负责把点击递出去。 */
  onDelete: () => void;
}) {
  const firstImage = work.images?.find(Boolean);

  // 注意：这里只渲染摘要行本身，外框由调用方的 <EditorRow> 提供 —— 别再在这里加边框。
  // 外层不能用 <button>：里面还要放「删除」按钮，button 套 button 是非法 HTML，
  // 浏览器会把内层那个踢出来，行结构就散了。用 div + role/tabIndex 接管键盘可达性。
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onEdit}
      onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onEdit(); } }}
      className="grid w-full cursor-pointer gap-3 p-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-400/40 md:grid-cols-[132px_1fr_auto] md:items-center"
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
        <p className="mt-1 line-clamp-2 text-xs leading-5 text-zinc-400">{work.description || "暂无简介，点「编辑」补上。"}</p>
        <div className="mt-1 flex flex-wrap gap-2 text-[10px] text-zinc-600">
          <span>{work.images?.filter(Boolean).length || 0} 张图片</span>
          <span>{work.videoUrl ? "有媒体" : "无媒体"}</span>
          <span>{work.links?.filter((link) => link.url).length || 0} 个链接</span>
        </div>
      </div>
      <div className="flex shrink-0 items-center gap-1.5 justify-self-start md:justify-self-end">
        {leading}
        <span className="rounded-lg bg-white/[0.07] px-2.5 py-1 text-xs text-zinc-300">
          {active ? "编辑中…" : "编辑"}
        </span>
        <button
          type="button"
          aria-label={"删除作品「" + (work.title || "未命名作品") + "」"}
          onClick={(event) => { event.stopPropagation(); onDelete(); }}
          className="rounded-lg border border-zinc-800 px-2 py-1 text-xs text-zinc-400 transition-colors duration-200 hover:border-red-500 hover:text-red-300"
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
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
  upload,
  uploadFile,
  deleteMedia,
  update,
  updateAndSave,
  addDraft,
  removeAndSave,
  migrate,
  renderSaveButton,
  itemNoun,
}: {
  items: Work[];
  title: string;
  hint: string;
  /** 新增按钮的文案。不传就整个按钮都不渲染 —— 新增入口统一收在后台「模块管理」里。 */
  addLabel?: string;
  emptyDraft: Work;
  categoryOptions: { value: string; label: string }[];
  readItems: (draft: PortfolioData) => Work[];
  writeItems: (draft: PortfolioData, items: Work[]) => void;
  /** 当前开着弹窗的那条（rowKey 形式），null 表示都没开。 */
  expandedId: string | null;
  setExpandedId: (id: string | null) => void;
  /** 绑给 <input type=file> 的 change 处理器（读 event.target.files）。 */
  upload: (event: ChangeEvent<HTMLInputElement>, onUrl: (url: string, file: File) => void | Promise<void>) => void;
  /** 直接上传一个 File（拖拽走这条）。真正的实现是后台的 uploadMediaFile。 */
  uploadFile: (file: File, onUrl: (url: string, file: File) => void | Promise<void>) => Promise<void>;
  deleteMedia: (urls: string[]) => Promise<void>;
  update: (mutator: (draft: PortfolioData) => void) => void;
  updateAndSave: (mutator: (draft: PortfolioData) => void) => Promise<void>;
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
  /** 弹窗标题与按钮文案里的名词，作品媒体是「作品」，AI 专区是「AI 作品」。 */
  itemNoun?: string;
}) {
  const noun = itemNoun || "作品";

  // 迁移是「挪走」，先在原地确认再动手，避免误点把作品从当前栏目弄丢。
  const [pendingMigrateId, setPendingMigrateId] = useState<string | null>(null);
  const [migrating, setMigrating] = useState(false);

  /**
   * 哪一行的「选帧做封面」面板是展开的（按 index；null = 都收起）。
   * 同时只允许开一个：抽帧要拉着整段视频找画面，开多个既费流量也没意义。
   */
  const [frameGrabIndex, setFrameGrabIndex] = useState<number | null>(null);

  // 当前该弹窗的那一条在 items 里的下标。用 rowKey 反查而不是直接存 id ——
  // 历史数据可能没有 id，那种条目只有位置能定位它。
  // 这个「唯一的编辑位」是后台的不变量：所有栏目同一时刻只会开着一条。
  const modalIndex = expandedId === null
    ? -1
    : items.findIndex((work, index) => rowKey(work.id, index) === expandedId);

  // 拖文件进来直接上传：图和媒体分开放，投进弹窗任意位置都算。
  // 不走 <input type=file> 的 change（那种要用 event.target.files），手上已经
  // 直接是 File，所以走 uploadFile。图片只做「追加」，封面仍由图集里的「设封面」决定。
  const [dragActive, setDragActive] = useState(false);
  const bindDrop = useFileDrop((file) => {
    if (modalIndex < 0) return;
    if (file.type.startsWith("image/")) {
      void uploadFile(file, (url) => updateAndSave((draft) => {
        readItems(draft)[modalIndex].images = [...(readItems(draft)[modalIndex].images || []), url];
      }));
      return;
    }
    void uploadFile(file, (url) => {
      // 换媒体前把旧的从云端删掉 —— 与「上传视频/音乐」按钮的行为保持一致。
      void deleteMedia([items[modalIndex]?.videoUrl || ""]);
      update((draft) => { readItems(draft)[modalIndex].videoUrl = url; });
    });
  }, setDragActive);

  useEffect(() => bindDrop(), [bindDrop]);

  return (
    <>
      {/*
       * 列表说明。它只在这里出现一次 —— 弹窗里不再重复同一句话。
       * 弹窗本来就只对着一条作品，重复讲「点编辑开弹窗」纯粹是噪音。
       */}
      {/*
       * 「新增 X」走 action 槽而不是 children —— 宝要求「与上面在同一列，不要分开」。
       * 塞进 children 会掉到说明文字下面另起一行，那就又分开了。
       */}
      <Section
        title={title}
        description={hint}
        action={
          addLabel ? (
            <button
              type="button"
              onClick={() => {
                const id = uid("work");
                addDraft(
                  (draft) => { writeItems(draft, [...readItems(draft), { ...emptyDraft, id }]); },
                  () => setExpandedId(id),
                );
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 px-2.5 py-1.5 text-sm text-zinc-300 hover:border-zinc-600"
            >
              <Plus size={15} /> {addLabel}
            </button>
          ) : undefined
        }
      />

      <div className="space-y-3">
        {items.map((work, index) => {
          const active = expandedId === rowKey(work.id, index);
          return (
            <EditorRow key={rowKey(work.id, index)} expanded={active}>
              <WorkSummary
                work={work}
                index={index}
                active={active}
                leading={
                  migrate ? (
                    <button
                      type="button"
                      title={migrate.label}
                      aria-label={migrate.label + "「" + (work.title || "未命名作品") + "」"}
                      onClick={(event) => {
                        event.stopPropagation();
                        const key = rowKey(work.id, index);
                        setPendingMigrateId(pendingMigrateId === key ? null : key);
                      }}
                      className={
                        "rounded-lg border px-2 py-1 text-xs transition-colors duration-200 " +
                        (pendingMigrateId === rowKey(work.id, index)
                          ? "border-emerald-400 text-emerald-200"
                          : "border-zinc-800 text-zinc-400 hover:border-zinc-600 hover:text-white")
                      }
                    >
                      <ArrowLeftRight size={13} />
                    </button>
                  ) : undefined
                }
                onEdit={() => setExpandedId(rowKey(work.id, index))}
                onDelete={() => {
                                    void removeAndSave(
                    (draft) => { writeItems(draft, readItems(draft).filter((_, i) => i !== index)); },
                    collectWorkMedia(work),
                    () => setExpandedId(null),
                  );
                }}
              />
            </EditorRow>
          );
        })}
      </div>

      {/*
       * 迁移的两段式确认。原来挂在弹窗里，现在按钮进了行 —— 确认也跟着进行，
       * 否则会出现「按钮在行上、确认框在弹窗里」这种半截交互。
       * 仍复用 pendingMigrateId 这一个状态：同一时刻最多一条在待确认。
       */}
      {migrate && pendingMigrateId !== null && (() => {
        const i = items.findIndex((work, index) => rowKey(work.id, index) === pendingMigrateId);
        if (i < 0) return null;
        const work = items[i];
        return (
          <div className="adm-note adm-note-info text-xs leading-5 text-emerald-100/85">
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
                    .run(work, i)
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
        );
      })()}

      {modalIndex >= 0 && (() => {
        const work = items[modalIndex];
        const index = modalIndex;
        // 视频才有画面可抽；音频和外链都没有，入口只在 video 时出现。
        const mediaKind = getMediaKind(work.videoUrl);
        return (
          <EditorModal
            title={work.title?.trim() || "未命名" + noun}
            dragActive={dragActive}
            onClose={() => { setExpandedId(null); setPendingMigrateId(null); }}
            footer={renderSaveButton()}
          >
            <div className="space-y-3">
              <section className="adm-panel p-3">
                <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-zinc-500">前台效果 / PREVIEW</p>
                <WorkPreview work={work} />
              </section>

              <section className="adm-panel space-y-3 p-3">
                <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">基本信息 / BASIC</p>
                <div className="grid gap-3 md:grid-cols-2">
                  <Field label="标题" value={work.title} onChange={(value) => update((draft) => { readItems(draft)[index].title = value; })} />
                  <SelectField label="分类" value={work.category} options={categoryOptions} onChange={(value) => update((draft) => { readItems(draft)[index].category = value; })} />
                  <Field label="右上角绿色标签" value={work.badgeText || ""} onChange={(value) => update((draft) => { readItems(draft)[index].badgeText = value; })} placeholder="例如：支持在线播放" />
                </div>
                <ArrayEditor
                  label="标签"
                  items={work.tags || []}
                  onChange={(next) => update((draft) => { readItems(draft)[index].tags = next; })}
                />
                <Field label="简介" value={work.description} onChange={(value) => update((draft) => { readItems(draft)[index].description = value; })} textarea />
              </section>

              <section className="adm-panel space-y-3 p-3">
                <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">图片与媒体 / MEDIA</p>
                <div className="grid gap-3 md:grid-cols-2">
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
                    <ClearableField
                      label="视频 / 音乐地址"
                      value={work.videoUrl}
                      onChange={(value) => update((draft) => { readItems(draft)[index].videoUrl = value; })}
                      placeholder="粘贴直链，或把文件拖到弹窗里"
                    />
                    <div className="mt-2 flex flex-wrap items-center gap-2">
                      <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-zinc-800 px-2.5 py-1.5 text-xs text-zinc-300 hover:border-zinc-600">
                        <Video size={16} /> 上传视频/音乐
                        <input className="hidden" type="file" accept="video/*,audio/*" onChange={(event) => upload(event, (url) => {
                          void deleteMedia([work.videoUrl || ""]);
                          update((draft) => { readItems(draft)[index].videoUrl = url; });
                        })} />
                      </label>
                      {/*
                       * 抽帧入口只在「真的是视频」时出现：音频没有画面，
                       * 外链（YouTube 之类）也读不到像素，给了按钮只会点了报错。
                       */}
                      {mediaKind === "video" && (
                        <button
                          type="button"
                          onClick={() => setFrameGrabIndex(frameGrabIndex === index ? null : index)}
                          aria-expanded={frameGrabIndex === index}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 px-2.5 py-1.5 text-xs text-zinc-300 hover:border-emerald-500"
                        >
                          <Images size={16} /> {frameGrabIndex === index ? "收起选帧" : "选一帧做封面"}
                        </button>
                      )}
                      <span className="text-[10px] text-zinc-500">换文件会自动删掉旧的那个；「清除」只是从页面移除，不动云端文件。</span>
                    </div>
                    {mediaKind === "video" && frameGrabIndex === index && (
                      <div className="mt-3 rounded-lg bg-white/[0.03] p-3">
                        <FrameGrabber
                          videoUrl={work.videoUrl!}
                          onCaptured={(file) => {
                            // 抽出来的帧走和图片上传完全一样的那条链路（压缩/上限/进度/COS 签名）。
                            void uploadFile(file, (url) => updateAndSave((draft) => {
                              const current = readItems(draft)[index].images || [];
                              // 插到最前面 = 顺手设为封面（第一张即封面），省掉一次「设封面」点击。
                              readItems(draft)[index].images = [url, ...current];
                            }));
                          }}
                        />
                      </div>
                    )}
                  </div>
                </div>
              </section>

              {/*
               * 视频预览独立成一个模块（宝：视频预览不该挤在「前台效果」里，
               * 而且要单独给一个模块、比例跟着视频本身走）。
               * 位置放在媒体之后、链接之前 —— 挨着它的来源字段。
               * 纯音频 / 外链也在这里收口，所以 MEDIA 里不再重复放播放器。
               */}
              <section className="adm-panel space-y-3 p-3">
                <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">视频预览 / VIDEO</p>
                <WorkVideoPanel work={work} />
              </section>

              <section className="adm-panel space-y-3 p-3">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">跳转或下载链接 / LINKS</p>
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
                  {(work.links || []).length === 0 && (
                    <p className="text-xs leading-5 text-zinc-500">还没有链接。用「上传附件」把 PDF / 压缩包传上来，或点「新增链接」手填一个地址。</p>
                  )}
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
              </section>


            </div>
          </EditorModal>
        );
      })()}
    </>
  );
}

function GallerySummary({ item, index, active, onEdit, onDelete }: {
  item: GalleryItem;
  index: number;
  /** 该条目的编辑弹窗是否正开着 —— 只影响左侧色条与按钮文案。 */
  active: boolean;
  onEdit: () => void;
  /** 删除这一条。确认框由调用方负责。 */
  onDelete: () => void;
}) {
  // 只渲染摘要行，外框由调用方的 <EditorRow> 提供。
  // 用 div + role/tabIndex 而不是 <button>：行内还要放「删除」按钮。
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onEdit}
      onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onEdit(); } }}
      className="grid w-full cursor-pointer gap-3 p-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-400/40 md:grid-cols-[132px_1fr_auto] md:items-center"
    >
      <div className="overflow-hidden rounded-lg bg-white/[0.04]">
        {item.imageUrl ? (
          <img src={item.imageUrl} alt={item.title || "应用技能"} className="aspect-video w-full object-contain bg-black" />
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
        <p className="mt-1 line-clamp-2 text-xs leading-5 text-zinc-400">{item.description || "暂无简介，点「编辑」补上。"}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5 justify-self-start md:justify-self-end">
        <span className="rounded-lg bg-white/[0.07] px-2.5 py-1 text-xs text-zinc-300">
          {active ? "编辑中…" : "编辑"}
        </span>
        <button
          type="button"
          aria-label={"删除截图「" + (item.title || "未命名截图") + "」"}
          onClick={(event) => { event.stopPropagation(); onDelete(); }}
          className="rounded-lg border border-zinc-800 px-2 py-1 text-xs text-zinc-400 transition-colors duration-200 hover:border-red-500 hover:text-red-300"
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}

function TreasureSummary({ item, index, active, onEdit, onDelete }: {
  item: TreasureItem;
  index: number;
  /** 该条目的编辑弹窗是否正开着 —— 只影响左侧色条与按钮文案。 */
  active: boolean;
  onEdit: () => void;
  /** 删除这一条。确认框由调用方负责。 */
  onDelete: () => void;
}) {
  // 只渲染摘要行，外框由调用方的 <EditorRow tone="amber"> 提供。
  // 用 div + role/tabIndex 而不是 <button>：行内还要放「删除」按钮。
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onEdit}
      onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onEdit(); } }}
      className="grid w-full cursor-pointer gap-3 p-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-amber-300/40 md:grid-cols-[132px_1fr_auto] md:items-center"
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
      <div className="flex shrink-0 items-center gap-1.5 justify-self-start md:justify-self-end">
        <span className="rounded-lg bg-white/[0.07] px-2.5 py-1 text-xs text-zinc-300">
          {active ? "编辑中…" : "编辑"}
        </span>
        <button
          type="button"
          aria-label={"删除珍藏「" + (index + 1) + "」"}
          onClick={(event) => { event.stopPropagation(); onDelete(); }}
          className="rounded-lg border border-zinc-800 px-2 py-1 text-xs text-zinc-400 transition-colors duration-200 hover:border-red-500 hover:text-red-300"
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}

function ExperienceSummary({ exp, index, active, onEdit, onDelete }: {
  exp: Experience;
  index: number;
  /** 该条目的编辑弹窗是否正开着 —— 只影响左侧色条与按钮文案。 */
  active: boolean;
  onEdit: () => void;
  /** 删除这一条。确认框由调用方负责。 */
  onDelete: () => void;
}) {
  // 只渲染摘要行，外框由调用方的 <EditorRow> 提供。
  // 用 div + role/tabIndex 而不是 <button>：行内还要放「删除」按钮。
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onEdit}
      onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onEdit(); } }}
      className="grid w-full cursor-pointer gap-3 p-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-400/40 md:grid-cols-[120px_1fr_auto] md:items-center"
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
        <p className="mt-1 line-clamp-2 text-sm leading-5 text-zinc-400">{exp.desc || "暂无简介，点「编辑」补上。"}</p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5 justify-self-start md:justify-self-end">
        <span className="rounded-lg bg-white/[0.07] px-2.5 py-1 text-xs text-zinc-300">
          {active ? "编辑中…" : "编辑"}
        </span>
        <button
          type="button"
          aria-label={"删除经历「" + (exp.role || "未填写角色") + "」"}
          onClick={(event) => { event.stopPropagation(); onDelete(); }}
          className="rounded-lg border border-zinc-800 px-2 py-1 text-xs text-zinc-400 transition-colors duration-200 hover:border-red-500 hover:text-red-300"
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}

function MusicSummary({ track, index, active, onEdit, onDelete }: {
  track: MusicTrack;
  index: number;
  /** 该条目的编辑弹窗是否正开着 —— 只影响左侧色条与按钮文案。 */
  active: boolean;
  onEdit: () => void;
  /** 删除这一条。确认框由调用方负责。 */
  onDelete: () => void;
}) {
  // 只渲染摘要行，外框由调用方的 <EditorRow> 提供。
  // 用 div + role/tabIndex 而不是 <button>：行内还要放「删除」按钮，
  // 而且这一行里本来就嵌着 <audio controls>，button 包交互控件同样不合法。
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onEdit}
      onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onEdit(); } }}
      className="grid w-full cursor-pointer gap-3 p-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-400/40 md:grid-cols-[72px_1fr_auto] md:items-center"
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
      <div className="flex shrink-0 items-center gap-1.5 justify-self-start md:justify-self-end">
        <span className="rounded-lg bg-white/[0.07] px-2.5 py-1 text-xs text-zinc-300">
          {active ? "编辑中…" : "编辑"}
        </span>
        <button
          type="button"
          aria-label={"删除音乐「" + (track.title || "未命名音乐") + "」"}
          onClick={(event) => { event.stopPropagation(); onDelete(); }}
          className="rounded-lg border border-zinc-800 px-2 py-1 text-xs text-zinc-400 transition-colors duration-200 hover:border-red-500 hover:text-red-300"
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}

/* ---------------------------------------------------------------------------
 * 站点检测：展示用的小工具。
 *
 * 全部是纯函数，放模块作用域而不是组件内 —— 放在组件里每次渲染都会重建，
 * 而且这些逻辑跟后台状态没有任何关系。时间一律按**本地时区**显示：后台要看的是
 * 「他什么时候来的」，UTC 反而不好读。
 * ------------------------------------------------------------------------ */

function formatVisitTime(iso?: string) {
  if (!iso) return "—";
  const at = new Date(iso);
  if (Number.isNaN(at.getTime())) return "—";
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${at.getFullYear()}-${pad(at.getMonth() + 1)}-${pad(at.getDate())} ${pad(at.getHours())}:${pad(at.getMinutes())}:${pad(at.getSeconds())}`;
}

/** 「3 分钟前」。跨度越大粒度越粗，列表里扫一眼就够。 */
function formatVisitAgo(iso?: string) {
  if (!iso) return "—";
  const at = new Date(iso).getTime();
  if (!Number.isFinite(at)) return "—";
  const diff = Date.now() - at;
  if (diff < 0) return "刚刚";
  if (diff < 60_000) return "刚刚";
  const mins = Math.floor(diff / 60_000);
  if (mins < 60) return `${mins} 分钟前`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} 小时前`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days} 天前`;
  return formatVisitTime(iso).slice(0, 10);
}

function formatVisitDuration(ms?: number | null) {
  const total = Math.max(0, Math.round(Number(ms) || 0));
  if (total < 1000) return "不足 1 秒";
  const secs = Math.round(total / 1000);
  if (secs < 60) return `${secs} 秒`;
  const mins = Math.floor(secs / 60);
  if (mins < 60) return `${mins} 分 ${secs % 60} 秒`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours} 小时 ${mins % 60} 分`;
  return `${Math.floor(hours / 24)} 天 ${hours % 24} 小时`;
}

/** 访客标识太长，列表里只露前 8 位；完整值在展开区里给。 */
function shortVisitorKey(key?: string) {
  const value = String(key || "");
  return value ? `${value.slice(0, 8)}…` : "—";
}

function visitorLocation(v: VisitorRecord) {
  const parts = [v.last_country, v.last_region, v.last_city].filter(Boolean);
  return parts.length ? parts.join(" · ") : "归属地未知";
}

function visitorDevice(v: VisitorRecord) {
  const parts = [v.last_device, v.last_os, v.last_browser].filter(Boolean);
  return parts.length ? parts.join(" · ") : "设备未知";
}

/**
 * new Date().getTimezoneOffset() 说的是「本地比 UTC 慢多少分钟」，跟日常说的
 * UTC+8 符号相反，所以这里取负再格式化，免得显示成 UTC-08:00。
 */
function formatUtcOffset(minutesBehindUtc?: number | null) {
  if (minutesBehindUtc == null || !Number.isFinite(minutesBehindUtc)) return "";
  const total = -minutesBehindUtc;
  const sign = total < 0 ? "-" : "+";
  const abs = Math.abs(total);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `UTC${sign}${pad(Math.floor(abs / 60))}:${pad(abs % 60)}`;
}

/** 单次访问的明细块。数据是只读的，所以这里只是一堆键值对，没有任何编辑控件。 */
function VisitTimelineItem({ visit }: {
  visit: VisitRecord;
  /** 列表 key。本项目未装 @types/react，JSX 不做 IntrinsicAttributes 特判，故显式声明（同 EditorRowProps）。 */
  key?: string | number;
}) {
  const details: [string, string][] = [
    ["屏幕", visit.screen || "—"],
    ["视口", visit.viewport || "—"],
    ["像素比", visit.pixel_ratio != null ? String(visit.pixel_ratio) : "—"],
    ["色深", visit.color_depth != null ? `${visit.color_depth} bit` : "—"],
    ["时区", visit.timezone ? `${visit.timezone} ${formatUtcOffset(visit.timezone_offset)}`.trim() : "—"],
    ["语言", visit.language || "—"],
    ["语言偏好", visit.languages || "—"],
    ["平台", visit.platform || "—"],
    ["CPU 核心", visit.cpu_cores != null ? String(visit.cpu_cores) : "—"],
    ["内存", visit.device_memory != null ? `${visit.device_memory} GB` : "—"],
    ["触摸点", visit.touch_points != null ? String(visit.touch_points) : "—"],
    ["渲染引擎", visit.engine || "—"],
    ["系统版本", visit.os_version || "—"],
    ["浏览器版本", visit.browser_version || "—"],
    ["Cookie", visit.cookie_enabled == null ? "—" : visit.cookie_enabled ? "可用" : "禁用"],
    ["DNT", visit.dnt || "—"],
    ["运营商", visit.isp || "—"],
    ["设备指纹", visit.fingerprint || "—"],
  ];

  return (
    // 左侧 2px 色条标明一条记录的边界。不再加整圈描边 —— 它嵌在 .adm-row 里，
    // 一旦有自己的边框就变成「框套框」了（见 index.css 的层级基元）。
    <div className="border-l-2 border-zinc-800 pl-2.5">
      <div className="flex flex-wrap items-center gap-x-2 gap-y-0.5">
        <span className="font-mono text-[11px] text-zinc-300">{formatVisitTime(visit.created_at)}</span>
        <span className="text-[11px] text-zinc-500">{formatVisitAgo(visit.created_at)}</span>
        <span className="text-[11px] text-zinc-500">· 停留 {formatVisitDuration(visit.dwell_ms)}</span>
        {visit.path && (
          <span className="rounded bg-white/[0.06] px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">{visit.path}</span>
        )}
        {visit.ip && <span className="font-mono text-[10px] text-zinc-600">{visit.ip}</span>}
      </div>

      <dl className="mt-1.5 grid grid-cols-2 gap-x-3 gap-y-1 text-[11px] md:grid-cols-3">
        {details.map(([label, value]) => (
          <div key={label} className="flex min-w-0 gap-1.5">
            <dt className="shrink-0 text-zinc-500">{label}</dt>
            <dd className="min-w-0 truncate text-zinc-300" title={value}>{value}</dd>
          </div>
        ))}
      </dl>

      {visit.referrer && (
        <p className="mt-1 truncate text-[10px] text-zinc-600" title={visit.referrer}>来源页面：{visit.referrer}</p>
      )}
      {visit.user_agent && (
        <p className="mt-0.5 truncate font-mono text-[10px] text-zinc-600" title={visit.user_agent}>UA {visit.user_agent}</p>
      )}
    </div>
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
  // 「模块管理」打开的是哪一个模块的页首文案弹窗。存 SectionKey 而不是下标 ——
  // 上下移之后下标会变，key 不会。
  const [expandedModuleKey, setExpandedModuleKey] = useState<string | null>(null);

  /**
   * 各列表「当前开着编辑弹窗的是第几条」。
   *
   * 统一用 rowKey 反查而不是直接存 id：历史数据里可能没有 id，那种条目只有位置
   * 能定位（跟 rowKey 的约定一致）。返回 -1 表示没有弹窗该开 —— 条目被删掉后
   * 下标自然失配，弹窗就会自己关掉，不需要额外的清理逻辑。
   */
  const indexByRowKey = (list: Array<{ id?: string }>, key: string | null) => (
    key === null ? -1 : list.findIndex((item, index) => rowKey(item.id, index) === key)
  );
  const experienceModalIndex = indexByRowKey(data.experiences || [], expandedExperienceId);
  const galleryModalIndex = indexByRowKey(data.gallery || [], expandedGalleryId);
  const treasureModalIndex = indexByRowKey(data.treasures || [], expandedTreasureId);
  const musicModalIndex = indexByRowKey(data.musicTracks || [], expandedMusicId);

  const [expandedFloatingId, setExpandedFloatingId] = useState("");
  const [supabaseConfigured, setSupabaseConfigured] = useState(false);
  const [maxUploadSizeMb, setMaxUploadSizeMb] = useState(50);
  const [storageProvider, setStorageProvider] = useState("supabase");
  const [asrLoadingTrackId, setAsrLoadingTrackId] = useState<string | null>(null);
  const [visibleLyricTimelineTrackId, setVisibleLyricTimelineTrackId] = useState<string | null>(null);
  const [visibleLyricEditorTrackId, setVisibleLyricEditorTrackId] = useState<string | null>(null);
  // 站点检测（访问记录）。这份数据不在 /api/portfolio 里，是独立接口按需拉的，
  // 所以不参与 dirty / SaveCurrentButton 那套「编辑-保存」流程 —— 它只有「读」和
  // 「打标注」两种动作，改完立刻回写，不需要草稿态。
  const [visitsData, setVisitsData] = useState<VisitsPayload | null>(null);
  const [visitsLoading, setVisitsLoading] = useState(false);
  const [visitsError, setVisitsError] = useState("");
  const [visitsBusyKey, setVisitsBusyKey] = useState("");
  const [visitsExpandedKey, setVisitsExpandedKey] = useState<string | null>(null);
  const [visitsLabelDraft, setVisitsLabelDraft] = useState("");
  // 两段式确认：存 "all"（清空全部）或某位访客的 visitorKey（删这一位），null 表示没在确认。
  const [visitsConfirm, setVisitsConfirm] = useState<string | null>(null);

  async function loadVisits() {
    setVisitsLoading(true);
    setVisitsError("");
    try {
      const res = await fetch("/api/admin/visits?limit=500");
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || `读取失败（${res.status}）`);
      setVisitsData(json as VisitsPayload);
    } catch (err: any) {
      setVisitsError(err?.message || "读取访问记录失败");
    } finally {
      setVisitsLoading(false);
    }
  }

  async function patchVisitor(visitorKey: string, patch: { label?: string; blocked?: boolean }) {
    setVisitsBusyKey(visitorKey);
    setVisitsError("");
    try {
      const res = await fetch("/api/admin/visits", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ visitorKey, ...patch }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "保存失败");
      // 就地合并，不为一次改名把整页记录重拉一遍。
      setVisitsData((prev) =>
        prev
          ? { ...prev, visitors: prev.visitors.map((v) => (v.visitor_key === visitorKey ? { ...v, ...patch } : v)) }
          : prev,
      );
    } catch (err: any) {
      setVisitsError(err?.message || "保存失败");
    } finally {
      setVisitsBusyKey("");
    }
  }

  /** 不传 visitorKeys 表示清空全部。删除是真删，所以调用方必须先过两段式确认。 */
  async function clearVisits(visitorKeys?: string[]) {
    const scoped = Array.isArray(visitorKeys) && visitorKeys.length > 0;
    setVisitsError("");
    try {
      const res = await fetch("/api/admin/visits/clear", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(scoped ? { visitorKeys } : { all: true }),
      });
      const json = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(json?.error || "清理失败");
      setVisitsConfirm(null);
      if (scoped) setVisitsExpandedKey(null);
      await loadVisits();
    } catch (err: any) {
      setVisitsError(err?.message || "清理失败");
    }
  }

  // 只有切到「站点检测」才拉数据：访问记录跟站点内容无关，没必要一进后台就多打一次接口。
  useEffect(() => {
    if (active !== "tracking") return;
    void loadVisits();
    // eslint 无此项目，依赖只取 active 是刻意的：loadVisits 每次渲染都是新函数，
    // 挂进依赖会导致「一加载完就再加载」的死循环。
  }, [active]);

  // 侧栏导航。图标和文字都给（只用图标会牺牲可发现性），顺序按「先看结构、再看内容、
  // 最后是设置」排：站点资料 + 模块管理是站点的结构层；中间是各栏目的内容；
  // 弹幕设置是装饰性的；「站点检测」是纯运维的访问记录，与站点内容无关，单独放最后。
  const nav = useMemo(
    () => [
      { key: "profile", label: "站点资料", icon: UserRound },
      { key: "modules", label: "模块管理", icon: LayoutList },
      { key: "resume", label: "个人简历", icon: FileText },
      { key: "experiences", label: "我的经历", icon: Briefcase },
      { key: "works", label: "作品媒体", icon: LayoutGrid },
      { key: "ai", label: "AI专区", icon: Sparkles },
      { key: "gallery", label: "应用技能", icon: Images },
      { key: "treasures", label: "我的珍藏", icon: Gem },
      { key: "music", label: "音乐播放", icon: Music },
      { key: "contact", label: "联系方式", icon: AtSign },
      { key: "floating", label: "弹幕设置", icon: MessagesSquare },
      { key: "tracking", label: "站点检测", icon: Activity },
    ],
    [],
  );

  /* ------------------------------------------------------------------
   * 模块管理
   *
   * 前台导航的每个栏目都在这里被管：显隐开关、上下移、新增入口、页首文案。
   * 顺序与显隐读的是 types.ts 的 sectionCatalog / normalizeSectionOrder /
   * isSectionVisible —— 与前台完全同一份规则，所以后台看到的就是访客看到的。
   * ------------------------------------------------------------------ */

  // 实际的栏目顺序。normalizeSectionOrder 会把残缺 / 过期 / 重复的 sectionOrder
  // 补成一份完整名单，所以这里永远是 7 项、且不含未知键。
  const moduleOrder = useMemo(
    () => normalizeSectionOrder(data.profile.pageCopy?.sectionOrder),
    [data.profile.pageCopy],
  );

  const moduleModalIndex = expandedModuleKey === null
    ? -1
    : moduleOrder.indexOf(expandedModuleKey as SectionKey);

  /** 每个模块当前有多少条内容。自我介绍 / 联系方式没有条目列表，返回 null（不显示）。 */
  function moduleItemCount(key: SectionKey): number | null {
    switch (key) {
      case "resume": return resumeProfiles.length;
      case "works": return (data.works || []).length;
      case "ai": return (data.profile.pageCopy?.aiWorks || []).length;
      case "prospects": return (data.gallery || []).length;
      case "treasures": return (data.treasures || []).length;
      default: return null;
    }
  }

  /** 上移 / 下移一格。写回的是**一整份**顺序数组，前台只认这一份。 */
  function moveModule(key: SectionKey, delta: number) {
    const order = normalizeSectionOrder(data.profile.pageCopy?.sectionOrder);
    const from = order.indexOf(key);
    const to = from + delta;
    if (from < 0 || to < 0 || to >= order.length) return;
    const next = [...order];
    next[from] = order[to];
    next[to] = order[from];
    // 改完即存，和下面的显隐开关一致。
    // 这两个控件都是模块管理行里的即时动作：点一下箭头，行的位置立刻变了，
    // 用户没有任何理由再去找一个「保存」来确认这一步。
    // 底栏还在的时候它靠草稿机制兜着，底栏一撤（宝：不需要底栏了），
    // 这里再走 update() 就会变成「点了箭头、数字变了、刷新之后顺序回去」的静默丢数据。
    void mutateAndSave((draft) => { editPageCopy(draft, { sectionOrder: next }); }, undefined, { collapse: false });
  }

  /**
   * 模块显隐。开关是单一布尔项，改完即落库（与原来两个独立开关的行为一致）。
   * 除了新键 sectionVisible，还同步写旧键 aiZoneVisible / treasuresVisible ——
   * 线上旧数据与 App.tsx 的兼容读法都还认那两个键。
   */
  function setModuleVisible(key: SectionKey, next: boolean) {
    const legacy = sectionMeta(key)?.legacyVisibleKey;
    void mutateAndSave(
      (draft) => {
        const current = draft.profile.pageCopy?.sectionVisible || {};
        const patch: Partial<NonNullable<PortfolioData["profile"]["pageCopy"]>> = {
          sectionVisible: { ...current, [key]: next },
        };
        if (legacy === "aiZoneVisible") patch.aiZoneVisible = next;
        if (legacy === "treasuresVisible") patch.treasuresVisible = next;
        editPageCopy(draft, patch);
      },
      undefined,
      { collapse: false },
    );
  }

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
    await uploadMediaFile(file, onUrl);
    event.target.value = "";
  }

  /**
   * 上传的核心流程。文件选择框和拖拽都走这里 —— 两条路各写一遍必然分叉
   * （压缩策略、大小上限、进度条、失败提示全都要抄一遍）。
   * 调用方负责清空 input.value。
   */
  async function uploadMediaFile(file: File, onUrl: (url: string, file: File) => void | Promise<void>) {
    const maxBytes = maxUploadSizeMb * 1024 * 1024;
    // 压缩可能换掉文件名（jpg → webp），所以另起一个变量，file 留着算压缩率。
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
        return;
      } catch (error: any) {
        setStatus(error.message || "腾讯云直传失败");
        setUploadProgress(null);
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
      return;
    }

    if (!json.url) {
      setStatus(json.error || "上传失败");
      setUploadProgress(null);
      return;
    }

    await onUrl(json.url, file);
    setUploadProgress({ fileName: uploadFile.name, percent: 100 });
    setStatus("媒体已上传。");
    window.setTimeout(() => setUploadProgress(null), 1000);
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

  const SaveCurrentButton = ({ label = "保存全部" }: { label?: string }) => (
    <button
      type="button"
      onClick={() => { void save(); }}
      disabled={saving}
      className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-300 px-3 py-2 text-sm font-semibold text-zinc-950 hover:bg-emerald-200 disabled:opacity-60"
    >
      {/*
       * 不带图标（宝：保存不需要又 ICON）。整排按钮里只有它一个挂着图标会很跳，
       * 而且「保存」这两个字已经说完了全部意思。
       * 转圈的 Loader2 保留 —— 那是保存中的状态反馈，不是装饰。
       */}
      {saving ? <Loader2 className="animate-spin" size={14} /> : null} {label}
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
  // 简历弹窗开在第几条。放在这里是因为 resumeProfiles 在这个位置才解析出来。
  const resumeModalIndex = indexByRowKey(resumeProfiles, expandedResumeId);

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
            {/*
             * 原底栏搬上来的状态区。底栏已经删掉了（宝：不需要底栏了），
             * 但「正在上传 / 上传失败 / 有改动还没保存」不能跟着消失 ——
             * 少了它，一次失败的上传会彻底静默，用户只会以为按钮坏了。
             *
             * 高度锁死：东西出现或消失，header 高度不许变。这就是当初把它从
             * 顶栏中间挪走的原因，现在放回来，靠 min-h + 单行 + truncate 守住同一条线。
             */}
            <div className="order-last flex min-h-9 w-full min-w-0 items-center md:order-none md:w-auto md:max-w-[42ch]">
              {uploadProgress ? (
                <div className="w-full min-w-0">
                  <div className="mb-1 flex items-center justify-between gap-2 text-[11px] text-zinc-400">
                    <span className="flex min-w-0 items-center gap-1.5">
                      <Loader2 className="shrink-0 animate-spin text-emerald-300" size={12} />
                      <span className="truncate">上传中：{uploadProgress.fileName}</span>
                    </span>
                    <span className="shrink-0 font-mono text-emerald-300">{uploadProgress.percent}%</span>
                  </div>
                  <div className="h-1 overflow-hidden bg-zinc-800">
                    <div
                      className="h-full bg-emerald-300 transition-[width] duration-200"
                      style={{ width: `${uploadProgress.percent}%` }}
                    />
                  </div>
                </div>
              ) : status ? (
                <p className="flex min-w-0 items-center gap-1.5 text-xs leading-5 text-amber-300" role="status">
                  <CircleAlert size={14} className="shrink-0" />
                  <span className="min-w-0 truncate" title={status}>{status}</span>
                </p>
              ) : dirty ? (
                <p className="flex items-center gap-1.5 text-xs text-amber-300/90">
                  <Info size={14} className="shrink-0" /> 有改动还没保存，打开对应条目点「保存全部」。
                </p>
              ) : null}
            </div>
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
           * 导航自己也要能滚：11 项 × 44px 在很矮的窗口里会超出侧栏高度，
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
            {active === "modules" && (
              <>
                <Section
                  title="模块管理"
                  description="前台导航里的每一个栏目都在这里。开关决定访客能不能看到它，箭头调整它们在前台的先后，「页首文案」改该栏目标题下面那句诗。新增内容请到各栏目自己的抬头。"
                >
                  <p className="adm-note adm-note-info text-xs leading-5 text-emerald-200">
                    顺序和开关都是改完即保存；「页首文案」在弹窗里点「保存全部」。
                  </p>

                  <div className="space-y-3">
                    {moduleOrder.map((key, index) => {
                      const meta = sectionMeta(key);
                      if (!meta) return null;
                      const shown = isSectionVisible(data.profile.pageCopy, key);
                      const count = moduleItemCount(key);
                      const open = expandedModuleKey === key;
                      return (
                        <EditorRow key={key} expanded={open} tone={shown ? "emerald" : "amber"}>
                          <div className="flex flex-wrap items-center gap-x-3 gap-y-2 p-3">
                            <div className="min-w-[210px] flex-1">
                              <div className="flex flex-wrap items-center gap-2">
                                <span className="text-sm font-semibold text-white">{meta.label}</span>
                                <span className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">{meta.sub}</span>
                                {count !== null && (
                                  <span className="rounded bg-white/[0.07] px-1.5 py-0.5 text-[10px] text-zinc-400">{count} 条内容</span>
                                )}
                                {index === 0 && shown && (
                                  <span className="rounded bg-emerald-400/10 px-1.5 py-0.5 text-[10px] text-emerald-300">访客首屏</span>
                                )}
                                {!shown && (
                                  <span className="rounded bg-amber-400/10 px-1.5 py-0.5 text-[10px] text-amber-300">已隐藏</span>
                                )}
                              </div>
                              <p className="mt-1 text-xs leading-5 text-zinc-500">{meta.hint}</p>
                              {!shown && (
                                <p className="mt-1 text-[11px] leading-4 text-amber-300/90">
                                  访客看不到这个栏目；数据与素材都保留，随时可以重新打开。
                                </p>
                              )}
                            </div>

                            <div className="flex items-center gap-1.5">
                              <button
                                type="button"
                                aria-label={"把「" + meta.label + "」上移"}
                                title="上移"
                                disabled={index === 0}
                                onClick={() => moveModule(key, -1)}
                                className="rounded-lg border border-zinc-800 p-1.5 text-zinc-300 transition-colors duration-200 hover:border-zinc-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                <ArrowUp size={14} />
                              </button>
                              <button
                                type="button"
                                aria-label={"把「" + meta.label + "」下移"}
                                title="下移"
                                disabled={index === moduleOrder.length - 1}
                                onClick={() => moveModule(key, 1)}
                                className="rounded-lg border border-zinc-800 p-1.5 text-zinc-300 transition-colors duration-200 hover:border-zinc-600 hover:text-white disabled:cursor-not-allowed disabled:opacity-40"
                              >
                                <ArrowDown size={14} />
                              </button>
                            </div>

                            <VisibilitySwitch
                              name={"「" + meta.label + "」栏目"}
                              compact
                              checked={shown}
                              disabled={saving}
                              onChange={(next) => { setModuleVisible(key, next); }}
                            />

                            {meta.copyKey && (
                              <button
                                type="button"
                                onClick={() => setExpandedModuleKey(open ? null : key)}
                                aria-label={"编辑「" + meta.label + "」页首文案"}
                                className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 px-2.5 py-1.5 text-sm text-zinc-300 transition-colors duration-200 hover:border-zinc-600 hover:text-white"
                              >
                                <FileText size={14} /> 页首文案
                              </button>
                            )}
                          </div>
                        </EditorRow>
                      );
                    })}
                  </div>
                </Section>

                {moduleModalIndex >= 0 && (() => {
                  const key = moduleOrder[moduleModalIndex];
                  const meta = sectionMeta(key)!;
                  return (
                    <EditorModal
                      title={meta.label + " · 页首文案"}
                      onClose={() => setExpandedModuleKey(null)}
                      footer={<SaveCurrentButton label="保存全部" />}
                    >
                      <section className="adm-panel space-y-3 p-3">
                        <p className="text-xs leading-5 text-zinc-400">{meta.hint}</p>
                        <Field
                          label={meta.label + "说明"}
                          value={sectionCopyValue(data.profile.pageCopy, key)}
                          onChange={(value) => update((draft) => { setSectionCopy(draft, key, value); })}
                          textarea
                        />
                      </section>
                    </EditorModal>
                  );
                })()}
              </>
            )}

            {active === "profile" && (
              <Section title="站点资料" description="站点的基本信息：名称、头像、简介、签名。">
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
                <SaveCurrentButton label="保存全部" />
              </Section>
            )}

            {active === "resume" && (
              <Section
                title="个人简历"
                description="前台的「个人简历」按这里的顺序生成选项卡；岗位名称、副标题、PDF 都可自定义，也可以单独隐藏或删除。"
                action={
                  <>
                    {/*
                     * 旧版写死的两份简历（产品经理 / 新媒体运营）没有进 resumeProfiles。
                     * 一条岗位都没有、而旧版确实有 PDF 时，给一次「导入」把它们搬进来 ——
                     * 之后就和手工新增的岗位一样能自由增删改。有岗位了就不再出现，
                     * 免得用户已经整理好列表又被塞回两条。
                     */}
                    {resumeProfiles.length === 0 && hasLegacyResume && (
                      <button
                        type="button"
                        onClick={() => update((draft) => {
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
                          (draft) => { editPageCopy(draft, { resumeProfiles: [...(draft.profile.pageCopy?.resumeProfiles || []), { id, position: "新岗位", name: "", url: "", visible: true }] }); },
                          () => setExpandedResumeId(id),
                        );
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 px-2.5 py-1.5 text-xs text-zinc-300 hover:border-zinc-600"
                    >
                      <Plus size={14} /> 新增岗位
                    </button>
                  </>
                }
              >
                {resumeProfiles.length === 0 && (
                  <p className="adm-note text-center text-xs leading-5 text-zinc-400">
                    还没有配置任何岗位简历。点上面的「新增岗位」加一个；一条都没有时，前台会自动回退到旧版两份简历（如果曾经上传过）。
                  </p>
                )}

                {resumeProfiles.map((profile, index) => {
                  const resumeVisible = profile.visible !== false;
                  const active = expandedResumeId === rowKey(profile.id, index);
                  return (
                    <EditorRow key={profile.id} expanded={active}>
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
                        <div className="flex shrink-0 items-center gap-1.5">
                          <button
                            type="button"
                            onClick={() => setExpandedResumeId(rowKey(profile.id, index))}
                            className="rounded-lg border border-zinc-800 px-2.5 py-1 text-xs text-zinc-300 hover:border-zinc-600"
                          >
                            {active ? "编辑中…" : "编辑"}
                          </button>
                          <button
                            type="button"
                            aria-label={"删除岗位「" + (profile.position || "未命名岗位") + "」"}
                            onClick={() => {
                              void removeAndSave(
                                (draft) => {
                                  editPageCopy(draft, { resumeProfiles: (draft.profile.pageCopy?.resumeProfiles || []).filter((_, i) => i !== index) });
                                },
                                [profile.url || ""],
                                () => setExpandedResumeId(null),
                              );
                            }}
                            className="rounded-lg border border-zinc-800 px-2 py-1 text-xs text-zinc-400 transition-colors duration-200 hover:border-red-500 hover:text-red-300"
                          >
                            <Trash2 size={13} />
                          </button>
                        </div>
                      </div>
                    </EditorRow>
                  );
                })}

                {resumeModalIndex >= 0 && (() => {
                  const profile = resumeProfiles[resumeModalIndex];
                  const index = resumeModalIndex;
                  const resumeVisible = profile.visible !== false;
                  return (
                    <EditorModal
                      title={profile.position?.trim() || "未命名岗位"}
                      onClose={() => setExpandedResumeId(null)}
                      footer={<SaveCurrentButton label="保存全部" />}
                    >
                      <section className="adm-panel space-y-3 p-3">
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
                          name={"「" + (profile.position || "未命名岗位") + "」简历"}
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
                      </section>
                    </EditorModal>
                  );
                })()}
                <SaveCurrentButton label="保存全部" />
              </Section>
            )}

            {active === "experiences" && (
              <>
                <Section
                  title="经历管理"
                  description="前台「我的经历」按这里的顺序渲染；列表只出摘要，点「编辑」开弹窗改细节。"
                  action={
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
                  }
                >
                  <p className="text-sm text-zinc-400">共 {data.experiences.length} 条经历。时间、角色、组织、简介都在弹窗里改。</p>
                </Section>
                {data.experiences.map((exp, index) => {
                  const active = expandedExperienceId === rowKey(exp.id, index);
                  return (
                    <EditorRow key={rowKey(exp.id, index)} expanded={active}>
                      <ExperienceSummary
                        exp={exp}
                        index={index}
                        active={active}
                        onEdit={() => setExpandedExperienceId(rowKey(exp.id, index))}
                        onDelete={() => {
                                                    void removeAndSave(
                            (draft) => { draft.experiences = draft.experiences.filter((_, i) => i !== index); },
                            [],
                            () => setExpandedExperienceId(null),
                          );
                        }}
                      />
                    </EditorRow>
                  );
                })}

                {experienceModalIndex >= 0 && (() => {
                  const exp = data.experiences[experienceModalIndex];
                  const index = experienceModalIndex;
                  return (
                    <EditorModal
                      title={exp.role?.trim() || "未填写角色"}
                      onClose={() => setExpandedExperienceId(null)}
                      footer={
                        <SaveCurrentButton label="保存全部" />
                      }
                    >
                      <section className="adm-panel space-y-3 p-3">
                        <div className="grid gap-3 md:grid-cols-3">
                          <Field label="时间" value={exp.period} onChange={(value) => update((draft) => { draft.experiences[index].period = value; })} />
                          <Field label="组织/公司" value={exp.role} onChange={(value) => update((draft) => { draft.experiences[index].role = value; })} />
                          <Field label="角色" value={exp.company} onChange={(value) => update((draft) => { draft.experiences[index].company = value; })} />
                        </div>
                        <Field label="简介" value={exp.desc} onChange={(value) => update((draft) => { draft.experiences[index].desc = value; })} textarea />
                      </section>
                    </EditorModal>
                  );
                })()}
              </>
            )}

            {active === "works" && (
              <>
                <WorkListEditor
                  items={data.works}
                  title="作品管理"
                  hint={`共 ${data.works.length} 个作品。想搬到 AI 专区就打开这条的弹窗，那里有「迁移到 AI 专区」。`}
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
                  uploadFile={uploadMediaFile}
                  deleteMedia={deleteMedia}
                  addDraft={addDraft}
                  removeAndSave={removeAndSave}
                  migrate={{
                    label: "迁移到 AI 专区",
                    hint: "这条作品会从「作品媒体」移到「AI 专区」，访客端跟着换栏目。图片 / 视频 / 附件素材原样带过去，不会被删除；分类如果不在 AI 专区的词表里会保留原值（显示为「xxx（当前）」），迁移后可以自己改。",
                    run: (work, index) => migrateWork(work, index, "to-ai"),
                  }}
                  renderSaveButton={() => <SaveCurrentButton label="保存全部" />}
                />
              </>
            )}

            {active === "ai" && (
              <>

                <WorkListEditor
                  items={data.profile.pageCopy?.aiWorks || []}
                  title="AI 作品"
                  hint={`共 ${(data.profile.pageCopy?.aiWorks || []).length} 个 AI 作品。想搬回作品媒体就打开这条的弹窗，那里有「迁移回作品媒体」。`}
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
                  uploadFile={uploadMediaFile}
                  deleteMedia={deleteMedia}
                  addDraft={addDraft}
                  removeAndSave={removeAndSave}
                  migrate={{
                    label: "迁移回作品媒体",
                    hint: "这条 AI 作品会从「AI 专区」移回「作品媒体」，访客端跟着换栏目。图片 / 视频 / 附件素材原样带过去，不会被删除；分类如果不在「作品媒体」的词表里会保留原值（显示为「xxx（当前）」），迁移后可以自己改。",
                    run: (work, index) => migrateWork(work, index, "to-works"),
                  }}
                  renderSaveButton={() => <SaveCurrentButton label="保存全部" />}
                />
              </>
            )}

            {active === "gallery" && (
              <>
                <Section
                  title="应用技能图库"
                  description="前台「应用技能」栏目里的图片，按这里的顺序展示。"
                  action={
                    <button
                      type="button"
                      onClick={() => {
                        const id = uid("gallery");
                        addDraft(
                          (draft) => { draft.gallery = [...(draft.gallery || []), { ...emptyGalleryItem, id }]; },
                          () => setExpandedGalleryId(id),
                        );
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 px-2.5 py-1.5 text-sm text-zinc-300 hover:border-zinc-600"
                    >
                      <Plus size={15} /> 新增截图
                    </button>
                  }
                >
                  <p className="text-sm leading-5 text-zinc-400">
                    共 {(data.gallery || []).length} 张截图。分类可用：应用、原型图、Agent、剪辑，也可新建分类。
                  </p>
                </Section>
                {(data.gallery || []).map((item: GalleryItem, index: number) => {
                  const active = expandedGalleryId === rowKey(item.id, index);
                  return (
                    <EditorRow key={rowKey(item.id, index)} expanded={active}>
                      <GallerySummary
                        item={item}
                        index={index}
                        active={active}
                        onEdit={() => setExpandedGalleryId(rowKey(item.id, index))}
                        onDelete={() => {
                                                    void removeAndSave(
                            (draft) => { draft.gallery = (draft.gallery || []).filter((_, i) => i !== index); },
                            [item.imageUrl],
                            () => setExpandedGalleryId(null),
                          );
                        }}
                      />
                    </EditorRow>
                  );
                })}

                {galleryModalIndex >= 0 && (() => {
                  const item = (data.gallery || [])[galleryModalIndex];
                  const index = galleryModalIndex;
                  return (
                    <EditorModal
                      title={item.title?.trim() || "未命名截图"}
                      onClose={() => setExpandedGalleryId(null)}
                      footer={
                        <SaveCurrentButton label="保存全部" />
                      }
                    >
                      <section className="adm-panel space-y-3 p-3">
                        <div className="grid gap-3 md:grid-cols-[1fr_1fr_auto] md:items-end">
                          <SelectField label="分类" value={item.category} options={galleryCategoryOptions} onChange={(value) => update((draft) => { draft.gallery![index].category = value; })} />
                          <Field label="标题" value={item.title} onChange={(value) => update((draft) => { draft.gallery![index].title = value; })} />
                          <label className="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-zinc-800 px-2.5 py-2 text-xs text-zinc-300 hover:border-zinc-600">
                            <ImagePlus size={16} /> 上传截图
                            <input className="hidden" type="file" accept="image/*" onChange={(event) => upload(event, (url) => {
                              void deleteMedia([item.imageUrl]);
                              update((draft) => { draft.gallery![index].imageUrl = url; });
                            })} />
                          </label>
                        </div>
                        <Field label="图片 URL" value={item.imageUrl} onChange={(value) => update((draft) => { draft.gallery![index].imageUrl = value; })} />
                        <Field label="图片简介" value={item.description} onChange={(value) => update((draft) => { draft.gallery![index].description = value; })} textarea />
                      </section>
                      {item.imageUrl && (
                        <section className="adm-panel mt-3 p-3">
                          <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-zinc-500">图片预览 / PREVIEW</p>
                          <img src={item.imageUrl} alt={item.title || "截图预览"} className="max-h-[42vh] w-full rounded-lg bg-black object-contain" />
                        </section>
                      )}
                    </EditorModal>
                  );
                })()}
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
                              {expandedFloatingId === "global" ? "编辑中…" : "编辑"}
                            </button>
                          </div>
                        </div>
                        <p className="mt-2 line-clamp-1 text-xs text-zinc-500">
                          {(data.profile.pageCopy?.floatingSentences?.sentences?.length ? data.profile.pageCopy.floatingSentences.sentences : defaultFloatingSentences).join(" / ")}
                        </p>
                        {expandedFloatingId === "global" && (
                          <EditorModal
                            title="全局飘字句子"
                            onClose={() => setExpandedFloatingId("")}
                          >
                            <section className="adm-panel p-3">
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
                            </section>
                          </EditorModal>
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
                                    {expandedFloatingId === page.key ? "编辑中…" : "编辑"}
                                  </button>
                                </div>
                              </div>
                              <p className="mt-2 line-clamp-1 text-xs text-zinc-500">
                                {(pageConfig?.sentences?.length ? pageConfig.sentences : defaultFloatingSentences).join(" / ")}
                              </p>
                              {expandedFloatingId === page.key && (
                                <EditorModal
                                  title={page.label + " · 飘字句子"}
                                  onClose={() => setExpandedFloatingId("")}
                                >
                                  <section className="adm-panel p-3">
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
                                  </section>
                                </EditorModal>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    )}
                    <div className="flex justify-end border-t border-zinc-800/60 pt-3">
                      <SaveCurrentButton label="保存全部" />
                    </div>
                  </div>
                </Section>
              </>
            )}

            {active === "treasures" && (
              <>
                <Section
                  title="我的珍藏图库"
                  description="前台「我的珍藏」栏目里的收藏，按这里的顺序展示。页首文案在「模块管理」里。"
                  action={
                    <button
                      type="button"
                      onClick={() => {
                        const id = uid("treasure");
                        addDraft(
                          (draft) => { draft.treasures = [...(draft.treasures || []), { ...emptyTreasureItem, id }]; },
                          () => setExpandedTreasureId(id),
                        );
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 px-2.5 py-1.5 text-sm text-zinc-300 hover:border-zinc-600"
                    >
                      <Plus size={15} /> 新增珍藏
                    </button>
                  }
                >
                  <p className="text-sm leading-5 text-zinc-400">
                    共 {(data.treasures || []).length} 张珍藏。
                  </p>
                </Section>
                {(data.treasures || []).map((item: TreasureItem, index: number) => {
                  const active = expandedTreasureId === rowKey(item.id, index);
                  return (
                    <EditorRow key={rowKey(item.id, index)} expanded={active} tone="amber">
                      <TreasureSummary
                        item={item}
                        index={index}
                        active={active}
                        onEdit={() => setExpandedTreasureId(rowKey(item.id, index))}
                        onDelete={() => {
                                                    void removeAndSave(
                            (draft) => { draft.treasures = (draft.treasures || []).filter((_, i) => i !== index); },
                            [item.imageUrl],
                            () => setExpandedTreasureId(null),
                          );
                        }}
                      />
                    </EditorRow>
                  );
                })}

                {treasureModalIndex >= 0 && (() => {
                  const item = (data.treasures || [])[treasureModalIndex];
                  const index = treasureModalIndex;
                  return (
                    <EditorModal
                      title={"珍藏 " + (index + 1)}
                      onClose={() => setExpandedTreasureId(null)}
                      footer={
                        <SaveCurrentButton label="保存全部" />
                      }
                    >
                      <section className="adm-panel space-y-3 p-3">
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
                      </section>
                      {item.imageUrl && (
                        <section className="adm-panel mt-3 p-3">
                          <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-zinc-500">图片预览 / PREVIEW</p>
                          <img src={item.imageUrl} alt="珍藏预览" className="max-h-[42vh] w-full rounded-lg bg-black object-contain" />
                        </section>
                      )}
                    </EditorModal>
                  );
                })()}
              </>
            )}

            {active === "music" && (
              <>
                <Section
                  title="首页音乐播放器"
                  description="前台首页背景音乐列表，可导入歌词并逐字校准时间轴。"
                  action={
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
                  }
                >
                  <p className="text-sm leading-5 text-zinc-400">
                    共 {(data.musicTracks || []).length} 首音乐。封面、标题、作者和歌词都在弹窗里改。
                  </p>
                </Section>
                {(data.musicTracks || []).map((track: MusicTrack, index: number) => {
                  const active = expandedMusicId === rowKey(track.id, index);
                  return (
                    <EditorRow key={rowKey(track.id, index)} expanded={active}>
                      <MusicSummary
                        track={track}
                        index={index}
                        active={active}
                        onEdit={() => setExpandedMusicId(rowKey(track.id, index))}
                        onDelete={() => {
                                                    void removeAndSave(
                            (draft) => { draft.musicTracks = (draft.musicTracks || []).filter((_, i) => i !== index); },
                            [track.audioUrl, track.coverUrl],
                            () => setExpandedMusicId(null),
                          );
                        }}
                      />
                    </EditorRow>
                  );
                })}

                {musicModalIndex >= 0 && (() => {
                  const track = (data.musicTracks || [])[musicModalIndex];
                  const index = musicModalIndex;
                  return (
                    <EditorModal
                      title={track.title?.trim() || "未命名音乐"}
                      onClose={() => setExpandedMusicId(null)}
                      footer={
                        <>
                          <button
                            type="button"
                            onClick={() => { void saveMusicTrack(index); }}
                            disabled={saving || asrLoadingTrackId === (track.id || String(index))}
                            className="inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-300 px-3 py-2 text-sm font-semibold text-zinc-950 hover:bg-emerald-200 disabled:opacity-60"
                          >
                            {(saving || asrLoadingTrackId === (track.id || String(index))) ? <Loader2 className="animate-spin" size={14} /> : null}
                            保存全部
                          </button>
                        </>
                      }
                    >
                      <div className="adm-panel p-3">
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
                      </div>
                    </EditorModal>
                  );
                })()}
              </>
            )}

            {active === "contact" && (
              <>
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
                  <SaveCurrentButton label="保存全部" />
                </Section>
              </>
            )}

            {active === "tracking" && (
              <Section
                title="站点检测"
                description="访客每次打开网站都会记一条：IP 与归属地、设备、系统、浏览器、屏幕、时区与停留时长。同一个浏览器重复访问会归到同一位访客，点开就能看到他在什么时间来过、每次待了多久。"
              >
                {visitsError && (
                  <p className="adm-note adm-note-warn text-xs leading-5 text-amber-200" role="alert">{visitsError}</p>
                )}

                {visitsData && !visitsData.configured && (
                  <p className="adm-note adm-note-warn text-xs leading-5 text-amber-200">
                    {visitsData.reason === "tables-missing" ? (
                      <>
                        检测数据表还没建。把项目里的{" "}
                        <span className="font-mono text-amber-100">supabase/schema.sql</span> 整份粘进
                        Supabase 控制台的 SQL Editor 跑一次（脚本是幂等的，重复跑没有副作用），
                        然后点上面的「刷新记录」即可开始积累数据。
                      </>
                    ) : (
                      <>
                        当前没有连接 Supabase（后台正跑在「本地 JSON 模式」），访问记录无处可写。配好
                        SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 并重启服务后，这里才会开始积累数据。
                      </>
                    )}
                  </p>
                )}

                {/* 统计数字用 .adm-panel 当底：只有色调、没有边框，不会在卡片里再套一层框。 */}
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { label: "访客数", value: visitsData?.stats.visitors ?? 0, hint: "同一浏览器算一位" },
                    { label: "总访问次数", value: visitsData?.stats.visits ?? 0, hint: "每次打开页面算一次" },
                    { label: "近 24 小时", value: visitsData?.stats.today ?? 0, hint: "最近一天的访问量" },
                  ].map((stat) => (
                    <div key={stat.label} className="adm-panel px-3 py-2.5">
                      <p className="text-xs text-zinc-400">{stat.label}</p>
                      <p className="mt-0.5 text-2xl font-semibold tabular-nums text-white">{stat.value}</p>
                      <p className="mt-0.5 text-[10px] leading-4 text-zinc-500">{stat.hint}</p>
                    </div>
                  ))}
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={() => { void loadVisits(); }}
                    disabled={visitsLoading}
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-zinc-800 px-3 text-sm text-zinc-300 transition-colors duration-200 hover:border-zinc-600 hover:text-white disabled:opacity-60"
                  >
                    {visitsLoading ? <Loader2 className="animate-spin" size={14} /> : <RefreshCw size={14} />}
                    {visitsLoading ? "读取中…" : "刷新记录"}
                  </button>

                  {visitsConfirm === "all" ? (
                    <>
                      <span className="text-xs leading-5 text-amber-200">
                        确定清空全部访问记录？访客的备注与屏蔽标记也会一起删掉，且无法恢复。
                      </span>
                      <button
                        type="button"
                        onClick={() => { void clearVisits(); }}
                        className="inline-flex min-h-9 items-center gap-1.5 rounded-lg bg-rose-400 px-3 text-sm font-semibold text-zinc-950 transition-colors duration-200 hover:bg-rose-300"
                      >
                        <Trash2 size={14} /> 确认清空
                      </button>
                      <button
                        type="button"
                        onClick={() => setVisitsConfirm(null)}
                        className="inline-flex min-h-9 items-center rounded-lg border border-zinc-800 px-3 text-sm text-zinc-300 hover:border-zinc-600"
                      >
                        取消
                      </button>
                    </>
                  ) : (
                    <button
                      type="button"
                      onClick={() => setVisitsConfirm("all")}
                      disabled={!visitsData || visitsData.stats.visits === 0}
                      className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-zinc-800 px-3 text-sm text-zinc-300 transition-colors duration-200 hover:border-rose-500/60 hover:text-rose-200 disabled:opacity-40"
                    >
                      <Trash2 size={14} /> 清空全部
                    </button>
                  )}

                  <span className="text-[11px] text-zinc-500">最多显示最近 500 条访问、1000 位访客</span>
                </div>

                {visitsLoading && !visitsData && (
                  <p className="flex items-center gap-2 text-sm text-zinc-400">
                    <Loader2 className="animate-spin text-emerald-300" size={14} /> 正在读取访问记录…
                  </p>
                )}

                {visitsData && !visitsLoading && visitsData.visitors.length === 0 && (
                  <p className="adm-note text-xs leading-5 text-zinc-400">
                    还没有任何访问记录。换一台设备或换个浏览器打开一次前台首页，这里就会出现第一位访客。
                  </p>
                )}

                {visitsData && visitsData.visitors.map((visitor) => {
                  const expanded = visitsExpandedKey === visitor.visitor_key;
                  const records = (visitsData.visits || []).filter((v) => v.visitor_key === visitor.visitor_key);
                  const busy = visitsBusyKey === visitor.visitor_key;
                  return (
                    // 被标记为屏蔽的访客用琥珀色条目，跟正常访客的绿色区分开。
                    <EditorRow key={visitor.visitor_key} expanded={expanded} tone={visitor.blocked ? "amber" : "emerald"}>
                      <button
                        type="button"
                        onClick={() => {
                          setVisitsExpandedKey(visitor.visitor_key);
                          setVisitsLabelDraft(visitor.label || "");
                          setVisitsConfirm(null);
                        }}
                        className="grid w-full gap-2 p-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-400/40 md:grid-cols-[1fr_auto] md:items-center"
                      >
                        <div className="min-w-0">
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="truncate text-sm font-semibold text-white">
                              {visitor.label || `访客 ${shortVisitorKey(visitor.visitor_key)}`}
                            </span>
                            {visitor.blocked && (
                              <span className="inline-flex items-center gap-1 rounded bg-amber-400/10 px-1.5 py-0.5 text-[10px] text-amber-300">
                                <Ban size={10} /> 已屏蔽标记
                              </span>
                            )}
                            <span className="inline-flex items-center gap-1 rounded bg-white/[0.07] px-1.5 py-0.5 text-[10px] text-zinc-400">
                              <MapPin size={10} /> {visitorLocation(visitor)}
                            </span>
                            <span className="inline-flex items-center gap-1 rounded bg-white/[0.07] px-1.5 py-0.5 text-[10px] text-zinc-400">
                              <MonitorSmartphone size={10} /> {visitorDevice(visitor)}
                            </span>
                          </div>
                          <p className="mt-1 text-xs leading-5 text-zinc-400">
                            访问 <span className="font-semibold tabular-nums text-zinc-200">{visitor.visit_count}</span> 次
                            · 累计停留 <span className="font-semibold text-zinc-200">{formatVisitDuration(visitor.total_dwell_ms)}</span>
                            · 最近一次 {formatVisitTime(visitor.last_seen)}（{formatVisitAgo(visitor.last_seen)}）
                          </p>
                          <p className="mt-0.5 font-mono text-[10px] text-zinc-600">
                            {visitor.last_ip || "IP 未知"} · {visitor.visitor_key} · 首次 {formatVisitTime(visitor.first_seen)}
                          </p>
                        </div>
                        <span className="justify-self-start rounded-lg bg-white/[0.07] px-2.5 py-1 text-xs text-zinc-300 md:justify-self-end">
                          {expanded ? "查看中…" : `查看 ${records.length} 次访问`}
                        </span>
                      </button>

                      {expanded && (
                        <EditorModal
                          title={visitor.label || "访客 " + shortVisitorKey(visitor.visitor_key)}
                          onClose={() => { setVisitsExpandedKey(null); setVisitsConfirm(null); }}
                          footer={
                            <p className="mr-auto text-[11px] leading-5 text-zinc-500">
                              备注与屏蔽标记即时保存；删除不可恢复，所以要点两次。
                            </p>
                          }
                        >
                          <div className="flex flex-wrap items-end gap-2">
                            <label className="grid min-w-[200px] flex-1 gap-1.5">
                              <span className="text-xs font-medium text-zinc-400">备注名（只改后台显示，方便认出自己人）</span>
                              <input
                                value={visitsLabelDraft}
                                onChange={(event) => setVisitsLabelDraft(event.target.value)}
                                placeholder="例如：我自己 / 客户张三 / 疑似爬虫"
                                className={`${inputBaseClass} min-h-10 px-3 py-2`}
                              />
                            </label>
                            <button
                              type="button"
                              onClick={() => { void patchVisitor(visitor.visitor_key, { label: visitsLabelDraft.trim() }); }}
                              disabled={busy}
                              className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-emerald-300 px-3 text-sm font-semibold text-zinc-950 transition-colors duration-200 hover:bg-emerald-200 disabled:opacity-60"
                            >
                              {busy ? <Loader2 className="animate-spin" size={14} /> : null} 保存备注
                            </button>
                            <button
                              type="button"
                              onClick={() => { void patchVisitor(visitor.visitor_key, { blocked: !visitor.blocked }); }}
                              disabled={busy}
                              className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-zinc-800 px-3 text-sm text-zinc-300 transition-colors duration-200 hover:border-amber-500/60 hover:text-amber-200 disabled:opacity-60"
                            >
                              <Ban size={14} /> {visitor.blocked ? "取消屏蔽标记" : "标记为屏蔽"}
                            </button>

                            {visitsConfirm === visitor.visitor_key ? (
                              <>
                                <button
                                  type="button"
                                  onClick={() => { void clearVisits([visitor.visitor_key]); }}
                                  className="inline-flex min-h-10 items-center gap-1.5 rounded-lg bg-rose-400 px-3 text-sm font-semibold text-zinc-950 transition-colors duration-200 hover:bg-rose-300"
                                >
                                  <Trash2 size={14} /> 确认删除
                                </button>
                                <button
                                  type="button"
                                  onClick={() => setVisitsConfirm(null)}
                                  className="inline-flex min-h-10 items-center rounded-lg border border-zinc-800 px-3 text-sm text-zinc-300 hover:border-zinc-600"
                                >
                                  取消
                                </button>
                              </>
                            ) : (
                              <button
                                type="button"
                                onClick={() => setVisitsConfirm(visitor.visitor_key)}
                                className="inline-flex min-h-10 items-center gap-1.5 rounded-lg border border-zinc-800 px-3 text-sm text-zinc-300 transition-colors duration-200 hover:border-rose-500/60 hover:text-rose-200"
                              >
                                <Trash2 size={14} /> 删除该访客
                              </button>
                            )}
                          </div>

                          <p className="adm-note text-[11px] leading-5 text-zinc-400">
                            「屏蔽标记」只是给这条记录打个记号、方便把它和真人访客区分开
                            <span className="text-zinc-300">（前台是纯展示站点，不做准入，所以它不会真的拦住对方访问）</span>。
                            删除则是把这位访客和名下的全部访问记录一起从数据库里抹掉，不可恢复。
                          </p>

                          <div className="space-y-2">
                            <p className="text-xs font-semibold text-zinc-300">访问记录 · 共 {records.length} 条</p>
                            {records.length === 0 ? (
                              <p className="text-xs leading-5 text-zinc-500">
                                这位访客的明细不落在本次读取窗口里（列表按时间倒序只取最近 500 条），
                                但上面的「访问次数 / 累计停留 / 最近一次」是聚合表里的全量值，不受影响。
                              </p>
                            ) : (
                              records.map((visit) => <VisitTimelineItem key={visit.id} visit={visit} />)
                            )}
                          </div>
                        </EditorModal>
                      )}
                    </EditorRow>
                  );
                })}
              </Section>
            )}

          </div>
        </div>
      </div>

    </main>
  );
}
