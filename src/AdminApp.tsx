import React, { ChangeEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { isInstrumental, setInstrumental } from "./musicMetadata";
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
  ChevronDown,
  ChevronRight,
  Download,
  ExternalLink,
  Eye,
  EyeOff,
  Feather,
  FileText,
  Gem,
  GripVertical,
  HardDrive,
  ImagePlus,
  Images,
  Info,
  LayoutGrid,
  LayoutList,
  Link as LinkIcon,
  ListChecks,
  Loader2,
  LogOut,
  MapPin,
  MessagesSquare,
  MonitorSmartphone,
  MousePointerClick,
  Music,
  Play,
  Plus,
  Presentation,
  RefreshCw,
  StickyNote,
  ShieldCheck,
  Sparkles,
  Trash2,
  UserRound,
  Video,
  X,
  ZoomIn,
} from "lucide-react";
import SlidePlayer from "./components/SlidePlayer";
import { Experience, GalleryItem, HomeStatCopy, ImagePost, MusicTrack, Poem, PortfolioData, SlideDeck, ResumeProfile, SectionKey, TreasureItem, AnalyticsCount, AnalyticsRange, AnalyticsSummaryPayload, AnalyticsVisitorsPayload, AssistantConversationMessage, AssistantConversationSummary, AssistantKeywordPayload, TrafficType, VisitRecord, VisitorRecord, Work, WorkLink, defaultHomeStats, defaultPageCopy, isSectionVisible, normalizeSectionOrder, sectionMeta } from "./types";

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

const emptyPoem: Poem = {
  id: "",
  title: "",
  text: "",
  note: "",
};

const emptyPost: ImagePost = {
  id: "",
  title: "",
  text: "",
  images: [],
  tags: [],
  date: "",
};

const emptySlideDeck: SlideDeck = {
  id: "",
  title: "",
  description: "",
  fileUrl: "",
  fileName: "",
  cover: "",
  date: "",
};

const pptxAccept = ".pptx,application/vnd.openxmlformats-officedocument.presentationml.presentation";

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

/**
 * 标签输入：已有标签显示成小胶囊，输入框回车或逗号添加，退格删最后一个。
 * 作品标签通常就两三个短词，用 ArrayEditor 一行一个输入框太占地方。
 */
function TagsField({ label, tags, onChange }: { label: string; tags: string[]; onChange: (tags: string[]) => void }) {
  const [draft, setDraft] = useState("");
  const commit = () => {
    const parts = draft.split(/[,，、]/).map((part) => part.trim()).filter(Boolean);
    if (parts.length) onChange([...tags, ...parts.filter((part) => !tags.includes(part))]);
    setDraft("");
  };

  return (
    <label className="grid gap-1.5">
      <span className="text-xs font-medium text-zinc-400">{label}</span>
      <div className={`${inputBaseClass} flex min-h-11 flex-wrap items-center gap-1.5 px-2 py-1.5 focus-within:border-emerald-400`}>
        {tags.filter(Boolean).map((tag, index) => (
          <span key={`${tag}-${index}`} className="inline-flex items-center gap-1 rounded bg-white/[0.08] py-0.5 pl-2 pr-1 text-xs text-zinc-200">
            {tag}
            <button
              type="button"
              onClick={(event) => { event.preventDefault(); onChange(tags.filter((_, i) => i !== index)); }}
              className="rounded px-0.5 text-zinc-500 hover:text-red-300"
              aria-label={`删除标签「${tag}」`}
            >
              ×
            </button>
          </span>
        ))}
        <input
          value={draft}
          onChange={(event) => setDraft(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter" || event.key === "," || event.key === "，") { event.preventDefault(); commit(); }
            else if (event.key === "Backspace" && !draft && tags.length) onChange(tags.slice(0, -1));
          }}
          onBlur={commit}
          placeholder={tags.length ? "" : "输入后回车"}
          className="min-w-[5rem] flex-1 bg-transparent text-sm text-zinc-100 outline-none placeholder:text-zinc-600"
        />
      </div>
    </label>
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

type HomeStatKey = keyof typeof defaultHomeStats;

function setHomeStatCopy(draft: PortfolioData, key: HomeStatKey, patch: Partial<HomeStatCopy>) {
  const current = draft.profile.pageCopy?.homeStats || {};
  editPageCopy(draft, {
    homeStats: {
      ...current,
      [key]: { ...defaultHomeStats[key], ...current[key], ...patch },
    },
  });
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
    case "poems": editPageCopy(draft, { poems: value }); return;
    case "posts": editPageCopy(draft, { posts: value }); return;
    case "slides": editPageCopy(draft, { slides: value }); return;
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
    case "poems": return pageCopy?.poems;
    case "posts": return pageCopy?.posts;
    case "slides": return pageCopy?.slides;
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
  rows = 3,
  placeholder,
  hint,
}: {
  label: string;
  value?: string;
  onChange: (value: string) => void;
  textarea?: boolean;
  /** textarea 初始行数。内容多的字段给大一点，免得一打开就要拖角。 */
  rows?: number;
  placeholder?: string;
  /** 常驻的辅助说明（不是 placeholder 那种一输入就消失的提示），放在输入框下方。 */
  hint?: string;
}) {
  const fieldClass = `${inputBaseClass} px-3`;

  return (
    <label className="grid content-start gap-1.5">
      <span className="text-xs font-medium text-zinc-400">{label}</span>
      {textarea ? (
        <textarea
          value={value || ""}
          onChange={(event) => onChange(event.target.value)}
          placeholder={placeholder}
          rows={rows}
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
        className="mx-auto block max-h-[360px] w-auto max-w-full"
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
      <p className="text-[10px] leading-5 text-zinc-500">按视频原始比例显示。</p>
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
  // 封面也能点开放大（宝：作品选了图片却没法放大）。预览里的封面被压到 180px 宽，
  // 恰恰是最需要看清的一张 —— 它决定前台列表长什么样。
  const [zoom, setZoom] = useState(false);

  return (
    // 预览区是前台成品的样子，属于「只读镜像」，用左侧色条标明范围即可，不再加边框。
    <div className="border-l-2 border-zinc-700/50 pl-3">
      {/*
       * 封面**不套 16:9 的黑框**（宝：无黑边展示）。封面比例本身可能是 4:3、1:1、
       * 甚至竖屏，套 `aspect-video` + `bg-black` 就必然上下或左右留黑边。
       * 这里把宽高上限交给容器（固定列宽 180px），图片自己用 `object-contain` 按
       * 原始比例落进去，容器底色用面板色而不是纯黑 —— 留白也是「留槽色」，看着不像黑边。
       */}
      {/* 侧栏只有 320px 宽，封面和文案改成上下排；封面仍按原比例 object-contain，不加黑框。 */}
      <div className="grid gap-3">
        {firstImage ? (
          <button
            type="button"
            onClick={() => setZoom(true)}
            className="group relative flex aspect-video items-center justify-center overflow-hidden rounded-lg bg-white/[0.04]"
            aria-label="放大预览封面"
          >
            <img src={firstImage} alt={work.title || "作品预览"} className="max-h-full w-auto max-w-full rounded-md object-contain" />
            <span className="absolute inset-0 flex items-center justify-center bg-black/55 opacity-0 transition group-hover:opacity-100">
              <ZoomIn size={18} className="text-white" />
            </span>
          </button>
        ) : (
          <div className="flex aspect-video items-center justify-center overflow-hidden rounded-lg bg-white/[0.04]">
            <span className="text-[11px] text-zinc-600">暂无图片</span>
          </div>
        )}
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

      {zoom && firstImage && (
        <ImageLightbox
          images={work.images || []}
          index={(work.images || []).indexOf(firstImage)}
          onIndexChange={() => {}}
          onClose={() => setZoom(false)}
        />
      )}
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

/**
 * 图片放大预览（lightbox）。
 *
 * 宝：作品里选了图片却没法放大看 —— 图集里的缩略图只有 96×64，
 * `object-cover` 又把画面裁掉一圈，根本认不出自己选的是哪张，
 * 想核对「第一张是不是前台封面」只能靠猜。
 *
 * 所以这里给缩略图加一个「点开放大」的图层。几个刻意的取舍：
 *   - **压在编辑弹窗之上**（`.adm-lightbox-layer` 是 z-60，弹窗是 z-50），
 *     否则点开看不到东西，还会把弹窗的按钮一起抢走点击。
 *   - 用 `object-contain` 而不是 `object-cover`：这一层存在的意义就是**看全**，
 *     裁掉边角就白做了。底色用接近纯黑但不纯黑（`#0a0a0c`），
 *     让图片边界看得出来，又不至于像块黑补丁。
 *   - 图片来源可能没加载成功（地址填错/失效）⇒ 给一个 onError 兜底文案，
 *     否则打开是一片空白，看着像组件坏了。
 *   - 关闭方式三种齐全（遮罩 / Esc / 右上角 ✕），与 `EditorModal` 的手感一致。
 *   - 左右两侧是**兄弟缩略图**，可以直接翻页对比 —— 选封面时最常做的就是这个。
 */
function ImageLightbox({
  images,
  index,
  onIndexChange,
  onClose,
}: {
  images: string[];
  index: number;
  onIndexChange: (index: number) => void;
  onClose: () => void;
}) {
  const usable = (images || []).filter(Boolean);
  // 传进来的 index 是原数组下标，这里换算成「有效图」的位置，免得空串占位算进去。
  const current = (images || [])[index];
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    setFailed(false);
  }, [current]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.stopPropagation();
        onClose();
      }
    };
    // 用 capture 抢在 `EditorModal` 的 Esc 之前处理：不然按 Esc 会先关掉
    // 底下的编辑弹窗，放大层反而留在屏幕上（那画面很怪）。
    document.addEventListener("keydown", onKey, true);
    return () => document.removeEventListener("keydown", onKey, true);
  }, [onClose]);

  if (!current) return null;

  const validIndex = usable.indexOf(current);

  /* 用 portal 挂到 body：放大层会作为弹窗滚动容器的子孙被渲染，而
     `position: fixed` 一旦遇到带 transform / filter / contain 的祖先就会被
     拉回那个祖先的坐标系统，遮不住全屏。今天后台这条链上没有这种祖先，
     但那是「碰巧」——portal 让这件事变成「保证」。 */
  return createPortal(
    <div className="adm-lightbox-layer flex flex-col items-center justify-center gap-3 p-4 md:p-8">
      <button
        type="button"
        className="adm-modal-backdrop absolute inset-0 cursor-zoom-out"
        onClick={onClose}
        aria-label="关闭图片预览"
        tabIndex={-1}
      />
      <div className="relative z-10 flex max-h-full min-h-0 w-full flex-col items-center gap-3">
        <div className="flex w-full items-center justify-between gap-3">
          <span className="truncate text-xs text-zinc-400">
            第 {validIndex + 1} / {usable.length} 张{validIndex === 0 ? "（前台封面）" : ""}
          </span>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex shrink-0 items-center gap-1 rounded-md border border-zinc-700 px-2 py-1 text-xs text-zinc-300 hover:border-zinc-500 hover:text-white"
            aria-label="关闭"
          >
            <X size={14} /> 关闭
          </button>
        </div>

        {failed ? (
          <p className="rounded-lg border border-amber-600/40 bg-amber-950/20 px-4 py-3 text-xs text-amber-200">
            这张图加载失败，地址可能是失效的。回到图集检查一下这个 URL。
          </p>
        ) : (
          <img
            src={current}
            alt="图片放大预览"
            referrerPolicy="no-referrer"
            onError={() => setFailed(true)}
            className="max-h-[70vh] w-auto max-w-full rounded-lg border border-zinc-700/70 object-contain"
            style={{ backgroundColor: "#0a0a0c" }}
          />
        )}

        <p className="max-w-full truncate px-2 text-[10px] text-zinc-500">{current}</p>

        {usable.length > 1 && (
          <div className="flex max-w-full flex-wrap justify-center gap-2">
            {usable.map((url, thumbIndex) => (
              <button
                key={`${url}-${thumbIndex}`}
                type="button"
                onClick={() => onIndexChange((images || []).indexOf(url))}
                className={
                  "h-12 w-16 shrink-0 overflow-hidden rounded-md border transition " +
                  (url === current ? "border-emerald-400" : "border-zinc-700 hover:border-zinc-500")
                }
                aria-label={`看第 ${thumbIndex + 1} 张`}
              >
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

function WorkImagesEditor({
  images,
  onChange,
  onRemove,
  actions,
}: {
  images: string[];
  onChange: (images: string[]) => void;
  onRemove?: (url: string) => void;
  /** 标题行右侧的额外按钮（上传图片），和「新增」放一起，不再单独占一行。 */
  actions?: React.ReactNode;
}) {
  const normalizedImages = images || [];
  // -1 = 没开。存的是**原数组下标**，这样删除/新增后不会错位到别的图上。
  const [zoomIndex, setZoomIndex] = useState(-1);

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2">
        <span className="text-xs font-medium text-zinc-400">图片 · {normalizedImages.filter(Boolean).length} 张（第一张为前台封面）</span>
        <div className="flex flex-wrap items-center gap-1.5">
          {actions}
          <button type="button" onClick={() => onChange([...normalizedImages, ""])} className="inline-flex items-center gap-1 rounded-md border border-zinc-800 px-2 py-1 text-xs text-zinc-300 hover:border-zinc-600">
            <Plus size={12} /> 填地址
          </button>
        </div>
      </div>
      {normalizedImages.length === 0 && (
        <p className="rounded-lg bg-white/[0.03] px-3 py-4 text-center text-xs text-zinc-500">还没有图片。上传、粘贴地址，或把图片直接拖进弹窗。</p>
      )}
      {/*
       * 卡片式：缩略图在上、地址和操作在下。原来缩略图和输入框左右并排，
       * 双栏下输入框只剩六七个字符宽，「封面 / 放大」被挤成竖排。
       */}
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
        {normalizedImages.map((item, index) => (
          <div key={index} className="overflow-hidden rounded-lg bg-white/[0.03]">
            <div className="relative">
              {item ? (
                <button
                  type="button"
                  onClick={() => setZoomIndex(index)}
                  className="group relative block aspect-video w-full overflow-hidden bg-black"
                  aria-label={`放大预览第 ${index + 1} 张图片`}
                >
                  <img src={item} alt={`作品图片 ${index + 1}`} className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                  <span className="absolute inset-0 flex items-center justify-center bg-black/55 opacity-0 transition group-hover:opacity-100">
                    <ZoomIn size={18} className="text-white" />
                  </span>
                </button>
              ) : (
                <div className="flex aspect-video items-center justify-center bg-white/[0.04] text-[11px] text-zinc-600">待填地址</div>
              )}
              {index === 0 && item && (
                <span className="pointer-events-none absolute left-1.5 top-1.5 rounded bg-emerald-400 px-1.5 py-0.5 text-[10px] font-semibold text-zinc-950">封面</span>
              )}
            </div>
            <div className="space-y-1.5 p-1.5">
              <input
                value={item}
                onChange={(event) => {
                  const next = [...normalizedImages];
                  next[index] = event.target.value;
                  onChange(next);
                }}
                placeholder="https:// 图片地址"
                aria-label={`第 ${index + 1} 张图片地址`}
                className="w-full rounded border border-zinc-800 bg-zinc-950 px-2 py-1 text-[11px] text-zinc-100 outline-none focus:border-emerald-400"
              />
              <div className="flex items-center gap-1">
                {index > 0 && item && (
                  <button
                    type="button"
                    onClick={() => {
                      const next = [...normalizedImages];
                      const [cover] = next.splice(index, 1);
                      onChange([cover, ...next]);
                    }}
                    className="whitespace-nowrap rounded border border-zinc-800 px-1.5 py-0.5 text-[10px] text-emerald-300 hover:border-emerald-500"
                  >
                    设为封面
                  </button>
                )}
                <button
                  onClick={() => {
                    onRemove?.(item);
                    onChange(normalizedImages.filter((_, itemIndex) => itemIndex !== index));
                    // 删掉的正是正在放大的那张 ⇒ 关掉，否则会停在空索引上。
                    if (zoomIndex === index) setZoomIndex(-1);
                  }}
                  className="ml-auto rounded border border-zinc-800 px-1.5 py-0.5 text-zinc-500 hover:border-red-500 hover:text-red-300"
                  type="button"
                  aria-label={`删除第 ${index + 1} 张图片`}
                >
                  <Trash2 size={12} />
                </button>
              </div>
            </div>
          </div>
        ))}
      </div>

      {zoomIndex >= 0 && normalizedImages[zoomIndex] && (
        <ImageLightbox
          images={normalizedImages}
          index={zoomIndex}
          onIndexChange={setZoomIndex}
          onClose={() => setZoomIndex(-1)}
        />
      )}
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
  size = "md",
  children,
}: {
  /** 只用于 role="dialog" 的 aria-label，不渲染出来。 */
  title: string;
  onClose: () => void;
  /** 操作区（取消 / 保存 / 迁移）。常驻底部 —— 表单再长也不用滚到底找它。 */
  footer?: React.ReactNode;
  /** 有文件正被拖到这个弹窗上：只加一圈高亮，让人知道松手会落在这里。 */
  dragActive?: boolean;
  /** 弹窗宽度。只有四个字段的经历用 sm，带侧栏预览的作品用 lg，其余保持原来的 md。 */
  size?: "sm" | "md" | "lg";
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
      <div className={`adm-modal relative flex max-h-full w-full flex-col ${size === "sm" ? "max-w-2xl" : size === "lg" ? "max-w-6xl" : "max-w-4xl"}`} role="dialog" aria-modal="true" aria-label={title} data-drag={dragActive ? "true" : "false"}>
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

function WorkSummary({ work, index, active, leading, selecting, checked, onEdit, onDelete }: {
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
  /**
   * 多选模式。打开后整行的点击语义变成「勾选这条」，右侧的「编辑」提示
   * 也相应换成勾选状态 —— 否则用户点哪儿都是开弹窗，一条都选不上。
   */
  selecting?: boolean;
  /** 多选模式下这条是否被勾中。selecting 为假时无意义。 */
  checked?: boolean;
  onEdit: () => void;
  /** 删除这一条。确认框由调用方负责 —— 摘要只负责把点击递出去。 */
  onDelete: () => void;
}) {
  const firstImage = work.images?.find(Boolean);

  // 注意：这里只渲染摘要行本身，外框由调用方的 <EditorRow> 提供 —— 别再在这里加边框。
  // 外层不能用 <button>：里面还要放「删除」按钮，button 套 button 是非法 HTML，
  // 浏览器会把内层那个踢出来，行结构就散了。用 div + role/tabIndex 接管键盘可达性。
  // 多选模式下角色换成 checkbox，屏幕阅读器才不会把「勾选」念成「编辑」。
  return (
    <div
      role={selecting ? "checkbox" : "button"}
      aria-checked={selecting ? Boolean(checked) : undefined}
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
        {selecting ? (
          <span
            className={
              "rounded-lg px-2.5 py-1 text-xs " +
              (checked ? "bg-emerald-400/15 text-emerald-200" : "bg-white/[0.07] text-zinc-400")
            }
          >
            {checked ? "已选中" : "未选中"}
          </span>
        ) : (
          <span className="rounded-lg bg-white/[0.07] px-2.5 py-1 text-xs text-zinc-300">
            {active ? "编辑中…" : "编辑"}
          </span>
        )}
        {/* 多选模式下不给「删除」—— 那时候删除应该由底部「批量删除」统一做，
            行内再留一个单删按钮会让人分不清删的是一条还是一批。 */}
        {!selecting && (
          <button
            type="button"
            aria-label={"删除作品「" + (work.title || "未命名作品") + "」"}
            onClick={(event) => { event.stopPropagation(); onDelete(); }}
            className="rounded-lg border border-zinc-800 px-2 py-1 text-xs text-zinc-400 transition-colors duration-200 hover:border-red-500 hover:text-red-300"
          >
            <Trash2 size={13} />
          </button>
        )}
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
  reorder,
  onStatus,
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
  deleteMedia: (urls: string[]) => Promise<boolean>;
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
  /**
   * 拖动排序：给一个「把 from 挪到 to」的执行器。
   * 不传就整个拖动能力关闭（行的左侧不会出现手柄）——
   * 只有作品列表开这个，别的列表将来复用不受影响。
   */
  reorder?: (from: number, to: number) => Promise<void>;
  /**
   * 底部状态条。批量操作与拖动排序都要报一句结果，而 setStatus 是后台外壳的
   * 闭包（WorkListEditor 拿不到），所以从外面传进来。
   */
  onStatus?: (message: string) => void;
}) {
  const noun = itemNoun || "作品";

  // 迁移是「挪走」，先在原地确认再动手，避免误点把作品从当前栏目弄丢。
  const [pendingMigrateId, setPendingMigrateId] = useState<string | null>(null);
  const [migrating, setMigrating] = useState(false);

  /* ---------------------------------------------------------------- 批量操作 */
  /**
   * 多选模式。**默认关着** —— 平时的点击是「打开这条的编辑弹窗」，
   * 只有进了多选才把点击解释成「勾选」。这个切换是必须的：
   * 如果平时点击就是勾选，那单条编辑就没有入口了。
   */
  const [selecting, setSelecting] = useState(false);
  const [selectedKeys, setSelectedKeys] = useState<string[]>([]);
  /** 批量确认：null 表示没有；"delete" 或 "migrate" 表示正在确认哪一种。 */
  const [bulkConfirm, setBulkConfirm] = useState<null | "delete" | "migrate">(null);
  const [bulkBusy, setBulkBusy] = useState(false);

  /** 条目身份在**每次渲染**都要用同一条规则算，且顺序不能变（删除/迁移都按下标）。 */
  const keyOf = (work: Work, index: number) => rowKey(work.id, index);

  const selectedIndexes = selectedKeys
    .map((k) => items.findIndex((work, index) => keyOf(work, index) === k))
    .filter((i) => i >= 0);

  const toggleSelected = (key: string) => {
    setSelectedKeys((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
  };

  const exitSelecting = () => {
    setSelecting(false);
    setSelectedKeys([]);
    setBulkConfirm(null);
  };

  /**
   * 批量删除。与单条删除的区别只有一处：素材要**先收集再一次性删**，
   * 而且必须走 removeAndSave 那条路（它会真的删 COS 文件）。
   * 下标从大到小删，避免先删前面的把后面那些的位置挪掉。
   */
  const runBulkDelete = async () => {
    const indexes = [...selectedIndexes].sort((a, b) => b - a);
    if (indexes.length === 0) return;
    const media = indexes.flatMap((i) => collectWorkMedia(items[i]));
    const titles = indexes.map((i) => items[i].title || `第 ${i + 1} 个`).join("、");
    setBulkBusy(true);
    await removeAndSave(
      (draft) => {
        const list = [...readItems(draft)];
        for (const i of indexes) list.splice(i, 1);
        writeItems(draft, list);
      },
      media,
      () => { setExpandedId(null); exitSelecting(); onStatus?.(`已批量删除 ${indexes.length} 条：${titles}`); },
    );
    setBulkBusy(false);
  };

  /** 批量迁移：沿用单条迁移的迁移器，逐条跑 —— 每条都是一次独立的落库。 */
  const runBulkMigrate = async () => {
    if (!migrate || selectedIndexes.length === 0) return;
    // 迁移会把条目从当前列表摘掉，所以从大到小处理，下标才不会错位。
    const targets = [...selectedIndexes].sort((a, b) => b - a);
    setBulkBusy(true);
    let done = 0;
    for (const i of targets) {
      // 每次都从**当前最新**的列表里取，因为上一条已经把它后面的位置改了。
      const ok = await migrate.run(items[i], i);
      if (ok) done += 1;
    }
    setBulkBusy(false);
    exitSelecting();
    onStatus?.(`已批量迁移 ${done} 条，素材一并带过去。`);
  };

  /* ---------------------------------------------------------------- 拖动排序 */
  /** 正被拖的那条的下标；null = 没在拖。 */
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  /** 当前悬停到的目标下标，用来画插入提示线。 */
  const [dragOver, setDragOver] = useState<number | null>(null);
  const [reordering, setReordering] = useState(false);

  const dropTo = async (to: number) => {
    const from = dragFrom;
    setDragFrom(null);
    setDragOver(null);
    if (!reorder || from === null || from === to) return;
    setReordering(true);
    await reorder(from, to);
    setReordering(false);
  };

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
          <div className="flex flex-wrap items-center justify-end gap-2">
            {/* 多选模式的总开关。放在这里而不是行上 —— 行上已经有编辑/迁移/删除三个
                动作，再加一个勾选框会让「点哪里是什么」变得很难猜。 */}
            <button
              type="button"
              aria-pressed={selecting}
              onClick={() => (selecting ? exitSelecting() : setSelecting(true))}
              className={
                "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm transition-colors duration-200 " +
                (selecting
                  ? "border-emerald-400 text-emerald-200"
                  : "border-zinc-800 text-zinc-300 hover:border-zinc-600")
              }
            >
              <ListChecks size={15} /> {selecting ? "退出批量" : "批量操作"}
            </button>
            {addLabel ? (
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
            ) : null}
          </div>
        }
      />

      {/*
       * 批量操作条。只在多选模式下出现，固定讲清「选了几条」与两个危险动作。
       * 删除 / 迁移都走两段式确认（bulkConfirm），因为这两件事都不可随手撤销。
       */}
      {selecting && (
        <div className="adm-note adm-note-info flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-emerald-100/85">
          <LogOut size={14} className="shrink-0" />
          <span>
            已选 <span className="font-semibold text-white">{selectedIndexes.length}</span> / {items.length} 条
            {reorder ? <span className="text-emerald-200/70">（批量模式下拖动排序已暂停）</span> : null}
          </span>
          <button
            type="button"
            onClick={() => setSelectedKeys(items.map((work, index) => keyOf(work, index)))}
            className="rounded-lg border border-zinc-800 px-2 py-1 text-xs text-zinc-300 hover:border-zinc-600"
          >
            全选
          </button>
          <button
            type="button"
            onClick={() => setSelectedKeys([])}
            disabled={selectedKeys.length === 0}
            className="rounded-lg border border-zinc-800 px-2 py-1 text-xs text-zinc-300 hover:border-zinc-600 disabled:opacity-50"
          >
            清空
          </button>

          <span className="ml-auto flex flex-wrap items-center gap-2">
            {migrate && (
              bulkConfirm === "migrate" ? (
                <>
                  <span className="text-[11px] leading-5 text-emerald-100">
                    把选中的 {selectedIndexes.length} 条一起迁移？素材原样带走，不删除。
                  </span>
                  <button
                    type="button"
                    onClick={() => { void runBulkMigrate(); }}
                    disabled={bulkBusy}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-300 px-2.5 py-1.5 text-xs font-semibold text-zinc-950 hover:bg-emerald-200 disabled:opacity-60"
                  >
                    {bulkBusy ? <Loader2 className="animate-spin" size={12} /> : <ArrowLeftRight size={12} />} 确认迁移
                  </button>
                  <button
                    type="button"
                    onClick={() => setBulkConfirm(null)}
                    disabled={bulkBusy}
                    className="rounded-lg border border-zinc-800 px-2.5 py-1.5 text-xs text-zinc-300 disabled:opacity-60"
                  >
                    取消
                  </button>
                </>
              ) : (
                <button
                  type="button"
                  onClick={() => setBulkConfirm("migrate")}
                  disabled={selectedIndexes.length === 0}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 px-2.5 py-1.5 text-xs text-zinc-300 hover:border-emerald-500/60 hover:text-emerald-200 disabled:opacity-50"
                >
                  <ArrowLeftRight size={12} /> {migrate.label}
                </button>
              )
            )}

            {bulkConfirm === "delete" ? (
              <>
                <span className="text-[11px] leading-5 text-rose-200">
                  删除 {selectedIndexes.length} 条及其素材，不可恢复。
                </span>
                <button
                  type="button"
                  onClick={() => { void runBulkDelete(); }}
                  disabled={bulkBusy}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-rose-400 px-2.5 py-1.5 text-xs font-semibold text-zinc-950 hover:bg-rose-300 disabled:opacity-60"
                >
                  {bulkBusy ? <Loader2 className="animate-spin" size={12} /> : <Trash2 size={12} />} 确认删除
                </button>
                <button
                  type="button"
                  onClick={() => setBulkConfirm(null)}
                  disabled={bulkBusy}
                  className="rounded-lg border border-zinc-800 px-2.5 py-1.5 text-xs text-zinc-300 disabled:opacity-60"
                >
                  取消
                </button>
              </>
            ) : (
              <button
                type="button"
                onClick={() => setBulkConfirm("delete")}
                disabled={selectedIndexes.length === 0}
                className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 px-2.5 py-1.5 text-xs text-zinc-300 hover:border-rose-500/60 hover:text-rose-200 disabled:opacity-50"
              >
                <Trash2 size={12} /> 批量删除
              </button>
            )}
          </span>
        </div>
      )}

      <div className="space-y-3">
        {items.map((work, index) => {
          const active = expandedId === rowKey(work.id, index);
          const key = keyOf(work, index);
          const checked = selectedKeys.includes(key);
          return (
            <EditorRow key={key} expanded={active} tone={checked ? "emerald" : undefined}>
              {/* 拖动排序的落点提示：一条细线，避免整行位移造成视觉抖动。 */}
              {reorder && dragOver === index && dragFrom !== null && dragFrom !== index && (
                <div className="h-0.5 w-full rounded bg-emerald-400/70" aria-hidden="true" />
              )}
              <div
                className="flex items-stretch"
                // 拖动只在「没进多选」时开放：两套交互叠在一起会互相抢点击。
                {...(reorder && !selecting
                  ? {
                      draggable: true,
                      onDragStart: (event: React.DragEvent) => {
                        setDragFrom(index);
                        event.dataTransfer.effectAllowed = "move";
                        // Firefox 不给 dataTransfer 赋值就不触发 drag。
                        event.dataTransfer.setData("text/plain", key);
                      },
                      onDragOver: (event: React.DragEvent) => {
                        event.preventDefault();
                        event.dataTransfer.dropEffect = "move";
                        setDragOver(index);
                      },
                      onDragLeave: () => setDragOver((prev) => (prev === index ? null : prev)),
                      onDrop: (event: React.DragEvent) => {
                        event.preventDefault();
                        void dropTo(index);
                      },
                      onDragEnd: () => { setDragFrom(null); setDragOver(null); },
                    }
                  : {})}
              >
                {reorder && !selecting && (
                  <span
                    aria-hidden="true"
                    title="按住拖动可调整前台顺序"
                    className="flex w-6 shrink-0 cursor-grab items-center justify-center text-zinc-600 active:cursor-grabbing"
                  >
                    <GripVertical size={15} />
                  </span>
                )}
                {selecting && (
                  <label className="flex w-8 shrink-0 cursor-pointer items-center justify-center">
                    <input
                      type="checkbox"
                      checked={checked}
                      onChange={() => toggleSelected(key)}
                      aria-label={"选择「" + (work.title || "未命名作品") + "」"}
                      className="h-4 w-4 accent-emerald-300"
                    />
                  </label>
                )}
                <div className="min-w-0 flex-1">
                  <WorkSummary
                    work={work}
                    index={index}
                    active={active}
                    selecting={selecting}
                    checked={checked}
                    // 多选模式下整行的点击语义换成「勾选」，否则点哪儿都开弹窗、
                    // 永远选不上。迁移按钮同样在这一模式下让位。
                    leading={
                      migrate && !selecting ? (
                        <button
                          type="button"
                          title={migrate.label}
                          aria-label={migrate.label + "「" + (work.title || "未命名作品") + "」"}
                          onClick={(event) => {
                            event.stopPropagation();
                            const k = rowKey(work.id, index);
                            setPendingMigrateId(pendingMigrateId === k ? null : k);
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
                    onEdit={() => {
                      if (selecting) toggleSelected(key);
                      else setExpandedId(rowKey(work.id, index));
                    }}
                    onDelete={() => {
                      void removeAndSave(
                        (draft) => { writeItems(draft, readItems(draft).filter((_, i) => i !== index)); },
                        collectWorkMedia(work),
                        () => setExpandedId(null),
                      );
                    }}
                  />
                </div>
              </div>
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
            size="lg"
            title={work.title?.trim() || "未命名" + noun}
            dragActive={dragActive}
            onClose={() => { setExpandedId(null); setPendingMigrateId(null); }}
            footer={renderSaveButton()}
          >
            {/*
             * 双栏：左边填表，右边固定显示前台效果和视频。原来五个模块上下堆，
             * 改标题要滚回顶部才能看到效果，视频预览又在一屏以外。
             * 窄屏时表单在上、预览排到最后，打开弹窗先看到能编辑的字段。
             */}
            <div className="grid gap-3 lg:grid-cols-[minmax(0,1fr)_320px] lg:items-start">
            <aside className="order-last space-y-3 lg:sticky lg:top-0">
              <section className="adm-panel p-3">
                <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-zinc-500">前台效果 / PREVIEW</p>
                <WorkPreview work={work} />
              </section>
              {work.videoUrl && (
                <section className="adm-panel space-y-2 p-3">
                  <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">媒体预览 / VIDEO</p>
                  <WorkVideoPanel work={work} />
                </section>
              )}
            </aside>

            <div className="min-w-0 space-y-3">
              <section className="adm-panel space-y-3 p-3">
                <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">基本信息 / BASIC</p>
                <div className="grid gap-3 sm:grid-cols-2">
                  <Field label="标题" value={work.title} onChange={(value) => update((draft) => { readItems(draft)[index].title = value; })} />
                  <SelectField label="分类" value={work.category} options={categoryOptions} onChange={(value) => update((draft) => { readItems(draft)[index].category = value; })} />
                  <Field label="右上角绿色标签" value={work.badgeText || ""} onChange={(value) => update((draft) => { readItems(draft)[index].badgeText = value; })} placeholder="例如：支持在线播放" />
                  <TagsField
                    label="标签"
                    tags={work.tags || []}
                    onChange={(next) => update((draft) => { readItems(draft)[index].tags = next; })}
                  />
                </div>
                <Field label="简介" value={work.description} onChange={(value) => update((draft) => { readItems(draft)[index].description = value; })} textarea />
              </section>

              <section className="adm-panel space-y-4 p-3">
                <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">图片与媒体 / MEDIA</p>
                <WorkImagesEditor
                  images={work.images || []}
                  onChange={(next) => { void updateAndSave((draft) => { readItems(draft)[index].images = next; }); }}
                  onRemove={(url) => { void deleteMedia([url]); }}
                  actions={
                    <label className="inline-flex cursor-pointer items-center gap-1 rounded-md border border-zinc-800 px-2 py-1 text-xs text-zinc-300 hover:border-zinc-600">
                      <ImagePlus size={12} /> 上传图片
                      <input className="hidden" type="file" accept="image/*" onChange={(event) => upload(event, (url) => updateAndSave((draft) => { readItems(draft)[index].images = [...(readItems(draft)[index].images || []), url]; }))} />
                    </label>
                  }
                />
                <div className="border-t border-zinc-800/60 pt-3">
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
            </div>
          </EditorModal>
        );
      })()}
    </>
  );
}

function GallerySummary({ item, index, active, selecting, checked, onEdit, onDelete }: {
  item: GalleryItem;
  index: number;
  /** 该条目的编辑弹窗是否正开着 —— 只影响左侧色条与按钮文案。 */
  active: boolean;
  /**
   * 是否处在多选模式。开了之后这一行的语义从「按钮」变成「勾选框」，
   * 点整行 = 勾选/取消，右侧也换成「已选中/未选中」。
   * 与音乐、作品列表是同一套约定：多选默认关，点行仍然开弹窗。
   */
  selecting?: boolean;
  checked?: boolean;
  onEdit: () => void;
  /** 删除这一条。确认框由调用方负责。 */
  onDelete: () => void;
}) {
  // 只渲染摘要行，外框由调用方的 <EditorRow> 提供。
  // 用 div + role/tabIndex 而不是 <button>：行内还要放「删除」按钮。
  // role 随模式切换：多选时是 checkbox，否则是 button —— 读屏软件据此播报，
  // 不能两种模式都用 button，否则勾选状态根本读不出来。
  return (
    <div
      role={selecting ? "checkbox" : "button"}
      aria-checked={selecting ? Boolean(checked) : undefined}
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
        {selecting ? (
          <span
            className={
              "rounded-lg px-2.5 py-1 text-xs " +
              (checked ? "bg-emerald-400/15 text-emerald-200" : "bg-white/[0.07] text-zinc-400")
            }
          >
            {checked ? "已选中" : "未选中"}
          </span>
        ) : (
          <span className="rounded-lg bg-white/[0.07] px-2.5 py-1 text-xs text-zinc-300">
            {active ? "编辑中…" : "编辑"}
          </span>
        )}
        {/* 多选模式下藏掉行内删除：批量删除才是那时的删除入口，
            两个删除按钮同时在场会让人分不清删的是一个还是选中的那批。 */}
        {!selecting && (
          <button
            type="button"
            aria-label={"删除截图「" + (item.title || "未命名截图") + "」"}
            onClick={(event) => { event.stopPropagation(); onDelete(); }}
            className="rounded-lg border border-zinc-800 px-2 py-1 text-xs text-zinc-400 transition-colors duration-200 hover:border-red-500 hover:text-red-300"
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>
    </div>
  );
}

function TreasureSummary({ item, index, active, selecting, checked, onEdit, onDelete }: {
  item: TreasureItem;
  index: number;
  /** 该条目的编辑弹窗是否正开着 —— 只影响左侧色条与按钮文案。 */
  active: boolean;
  /** 多选模式。语义与 GallerySummary 完全一致（同一套约定）。 */
  selecting?: boolean;
  checked?: boolean;
  onEdit: () => void;
  /** 删除这一条。确认框由调用方负责。 */
  onDelete: () => void;
}) {
  // 只渲染摘要行，外框由调用方的 <EditorRow tone="amber"> 提供。
  // 用 div + role/tabIndex 而不是 <button>：行内还要放「删除」按钮。
  return (
    <div
      role={selecting ? "checkbox" : "button"}
      aria-checked={selecting ? Boolean(checked) : undefined}
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
        {selecting ? (
          <span
            className={
              "rounded-lg px-2.5 py-1 text-xs " +
              (checked ? "bg-emerald-400/15 text-emerald-200" : "bg-white/[0.07] text-zinc-400")
            }
          >
            {checked ? "已选中" : "未选中"}
          </span>
        ) : (
          <span className="rounded-lg bg-white/[0.07] px-2.5 py-1 text-xs text-zinc-300">
            {active ? "编辑中…" : "编辑"}
          </span>
        )}
        {!selecting && (
          <button
            type="button"
            aria-label={"删除珍藏「" + (index + 1) + "」"}
            onClick={(event) => { event.stopPropagation(); onDelete(); }}
            className="rounded-lg border border-zinc-800 px-2 py-1 text-xs text-zinc-400 transition-colors duration-200 hover:border-red-500 hover:text-red-300"
          >
            <Trash2 size={13} />
          </button>
        )}
      </div>
    </div>
  );
}

/**
 * 「诗与惆怅」栏目的列表摘要行。
 *
 * 摘要里放正文首句是刻意的：诗没有缩略图可认，标题又常常留空，只有原文能让人
 * 一眼认出是哪一首。
 */
function PoemSummary({ item, index, active, onEdit, onDelete }: {
  item: Poem;
  index: number;
  active: boolean;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const preview = (item.text || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean)[0] || "";
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onEdit}
      onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onEdit(); } }}
      className="grid w-full cursor-pointer gap-3 p-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-rose-300/40 md:grid-cols-[1fr_auto] md:items-center"
    >
      <div className="min-w-0">
        <span className="text-sm font-semibold text-white">
          {item.title ? item.title : "诗 " + (index + 1)}
        </span>
        <p className="mt-0.5 truncate font-serif text-xs text-zinc-400">
          {preview || "（还没有正文）"}
        </p>
      </div>
      <div className="flex shrink-0 items-center gap-1.5 justify-self-start md:justify-self-end">
        <span className="rounded-lg bg-white/[0.07] px-2.5 py-1 text-xs text-zinc-300">
          {active ? "编辑中…" : "编辑"}
        </span>
        <button
          type="button"
          aria-label={"删除诗「" + (index + 1) + "」"}
          onClick={(event) => { event.stopPropagation(); onDelete(); }}
          className="rounded-lg border border-zinc-800 px-2 py-1 text-xs text-zinc-400 transition-colors duration-200 hover:border-red-500 hover:text-red-300"
        >
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}

/** 把数组第 from 项挪到 to（摘出来再插进去），越界时原样返回副本。 */
function moveItem<T>(list: T[], from: number, to: number): T[] {
  const next = [...list];
  if (from < 0 || to < 0 || from >= next.length || to >= next.length || from === to) return next;
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/** 「图文分享」「演示文稿」共用的列表摘要行：缩略图 + 标题 + 一句摘要 + 上下移 / 编辑 / 删除。 */
function ListSummaryRow({ thumb, title, meta, preview, active, onEdit, onDelete, onMove, canMoveUp, canMoveDown }: {
  thumb?: string;
  title: string;
  meta: string;
  preview?: string;
  active: boolean;
  onEdit: () => void;
  onDelete: () => void;
  onMove: (delta: number) => void;
  canMoveUp: boolean;
  canMoveDown: boolean;
}) {
  const firstLine = (preview || "").split(/\r?\n/).map((l) => l.trim()).filter(Boolean)[0] || "";
  const stop = (fn: () => void) => (event: React.MouseEvent) => { event.stopPropagation(); fn(); };
  return (
    <div
      role="button"
      tabIndex={0}
      onClick={onEdit}
      onKeyDown={(event) => { if (event.key === "Enter" || event.key === " ") { event.preventDefault(); onEdit(); } }}
      className="grid w-full cursor-pointer grid-cols-[56px_1fr] gap-3 p-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-400/40 md:grid-cols-[56px_1fr_auto] md:items-center"
    >
      <div className="h-14 w-14 overflow-hidden rounded-lg bg-white/[0.04]">
        {thumb ? <img src={thumb} alt="" className="h-full w-full object-cover" /> : null}
      </div>
      <div className="min-w-0">
        <div className="flex flex-wrap items-center gap-2">
          <span className="truncate text-sm font-semibold text-white">{title}</span>
          <span className="rounded bg-white/[0.07] px-1.5 py-0.5 text-[10px] text-zinc-400">{meta}</span>
        </div>
        <p className="mt-0.5 truncate text-xs text-zinc-400">{firstLine || "（还没有文字）"}</p>
      </div>
      <div className="col-span-2 flex shrink-0 items-center gap-1.5 justify-self-start md:col-span-1 md:justify-self-end">
        <button type="button" aria-label="上移" disabled={!canMoveUp} onClick={stop(() => onMove(-1))} className="rounded-lg border border-zinc-800 p-1.5 text-zinc-300 hover:border-zinc-600 disabled:opacity-40"><ArrowUp size={13} /></button>
        <button type="button" aria-label="下移" disabled={!canMoveDown} onClick={stop(() => onMove(1))} className="rounded-lg border border-zinc-800 p-1.5 text-zinc-300 hover:border-zinc-600 disabled:opacity-40"><ArrowDown size={13} /></button>
        <span className="rounded-lg bg-white/[0.07] px-2.5 py-1 text-xs text-zinc-300">{active ? "编辑中…" : "编辑"}</span>
        <button type="button" aria-label={"删除「" + title + "」"} onClick={stop(onDelete)} className="rounded-lg border border-zinc-800 px-2 py-1 text-xs text-zinc-400 transition-colors duration-200 hover:border-red-500 hover:text-red-300">
          <Trash2 size={13} />
        </button>
      </div>
    </div>
  );
}

/**
 * 经历的前台效果。照着首页时间线（App.tsx 的 career-copy）的排版画一份：
 * 绿色时间 + 「@ 身份」一行，下面是大字标题和简介 —— 改字段时立刻能看出它落在前台哪个位置。
 */
function ExperiencePreview({ exp }: { exp: Experience }) {
  return (
    <div className="border-l-2 border-zinc-700/50 pl-3">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-0.5">
        <time className="font-mono text-[11px] font-bold text-emerald-300">{exp.period || "时间"}</time>
        <span className="text-[11px] text-zinc-500">@ {exp.company || "身份 / 组织"}</span>
      </div>
      <h3 className="mt-1 font-serif text-[15px] font-bold text-white">{exp.role || "标题"}</h3>
      <p className="mt-1 text-xs leading-5 text-zinc-400">{exp.desc || "简介"}</p>
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
          <span className="truncate text-sm font-semibold text-white">{exp.role || "未填写标题"}</span>
          <span className="rounded bg-white/[0.07] px-1.5 py-0.5 text-xs text-zinc-400">{exp.company || "未填写身份"}</span>
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

function MusicSummary({ track, index, active, selecting, checked, onEdit, onDelete }: {
  track: MusicTrack;
  index: number;
  /** 该条目的编辑弹窗是否正开着 —— 只影响左侧色条与按钮文案。 */
  active: boolean;
  /**
   * 多选模式。打开后整行的点击语义从「开弹窗」变成「勾选这条」，
   * 与作品列表的 WorkSummary 保持同一套规则（见那边的注释）。
   */
  selecting?: boolean;
  /** 多选模式下这条是否被勾中。selecting 为假时无意义。 */
  checked?: boolean;
  onEdit: () => void;
  /** 删除这一条。确认框由调用方负责。 */
  onDelete: () => void;
}) {
  // 只渲染摘要行，外框由调用方的 <EditorRow> 提供。
  // 用 div + role/tabIndex 而不是 <button>：行内还要放「删除」按钮，
  // 而且这一行里本来就嵌着 <audio controls>，button 包交互控件同样不合法。
  return (
    <div
      role={selecting ? "checkbox" : "button"}
      aria-checked={selecting ? Boolean(checked) : undefined}
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
        {selecting ? (
          <span
            className={
              "rounded-lg px-2.5 py-1 text-xs " +
              (checked ? "bg-emerald-400/15 text-emerald-200" : "bg-white/[0.07] text-zinc-400")
            }
          >
            {checked ? "已选中" : "未选中"}
          </span>
        ) : (
          <span className="rounded-lg bg-white/[0.07] px-2.5 py-1 text-xs text-zinc-300">
            {active ? "编辑中…" : "编辑"}
          </span>
        )}
        {/* 多选模式下不给「删除」—— 那时候删除应该由底部「批量删除」统一做，
            行内再留一个单删按钮会让人分不清删的是一条还是一批。 */}
        {!selecting && (
          <button
            type="button"
            aria-label={"删除音乐「" + (track.title || "未命名音乐") + "」"}
            onClick={(event) => { event.stopPropagation(); onDelete(); }}
            className="rounded-lg border border-zinc-800 px-2 py-1 text-xs text-zinc-400 transition-colors duration-200 hover:border-red-500 hover:text-red-300"
          >
            <Trash2 size={13} />
          </button>
        )}
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
  if (ms == null) return "未上报";
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

const TRAFFIC_TAGS: Record<TrafficType, { label: string; className: string }> = {
  human: { label: "真人", className: "bg-emerald-400/10 text-emerald-300" },
  bot: { label: "爬虫", className: "bg-rose-400/10 text-rose-300" },
  local: { label: "本机", className: "bg-sky-400/10 text-sky-300" },
};

function TrafficTag({ type }: { type?: TrafficType }) {
  const tag = TRAFFIC_TAGS[type || "human"];
  return <span className={`rounded px-1.5 py-0.5 text-[10px] ${tag.className}`}>{tag.label}</span>;
}

/**
 * 访问趋势柱状图。纯 SVG，不为一张图引图表库。
 * 数据是稀疏的（没人来的那天后端不返回），这里按范围补齐空档，柱子才对得上日期。
 */
function VisitTrendChart({ series, bucket, range }: {
  series: Array<{ bucket: string; visits: number; visitors: number }>;
  bucket: "hour" | "day";
  range: AnalyticsRange;
}) {
  const slots = useMemo(() => {
    const byKey = new Map(series.map((s) => [s.bucket.slice(0, bucket === "hour" ? 13 : 10), s]));
    const keys: string[] = [];
    // 后端按北京时间切桶，这里也用北京时间生成刻度。
    const shanghai = (ms: number) => new Date(ms + 8 * 3_600_000).toISOString();
    const now = Date.now();
    if (bucket === "hour") {
      const today = shanghai(now).slice(0, 10);
      for (let h = 0; h < 24; h += 1) keys.push(`${today}T${String(h).padStart(2, "0")}`);
    } else {
      const span = range === "7d" ? 7 : range === "30d" ? 30 : 0;
      if (span) {
        for (let d = span - 1; d >= 0; d -= 1) keys.push(shanghai(now - d * 86_400_000).slice(0, 10));
      } else {
        keys.push(...[...byKey.keys()].sort());
      }
    }
    return keys.map((key) => ({ key, visits: byKey.get(key)?.visits ?? 0, visitors: byKey.get(key)?.visitors ?? 0 }));
  }, [series, bucket, range]);

  const [picked, setPicked] = useState<string | null>(null);

  if (slots.length === 0) return <p className="text-xs text-zinc-500">这段时间没有访问。</p>;
  const max = Math.max(1, ...slots.map((s) => s.visits));
  const label = (key: string) => (bucket === "hour" ? `${key.slice(11, 13)}时` : key.slice(5));
  // 手机上 8 个刻度会挤在一起，少画几个。
  const every = Math.ceil(slots.length / 6);
  const current = slots.find((s) => s.key === picked);

  /*
   * 柱子用 HTML flex 而不是 SVG viewBox：viewBox 整体缩放时，手机宽度下 10px 的刻度字
   * 会被缩到五六像素看不清。flex 柱子只拉伸宽度，字号保持不变。
   * 触屏没有 hover，所以点一下柱子在说明行里显示明细。
   */
  return (
    <figure className="space-y-1.5">
      <div className="flex h-28 items-end gap-px sm:gap-0.5" role="img" aria-label="访问趋势柱状图">
        {slots.map((slot) => (
          <button
            key={slot.key}
            type="button"
            onClick={() => setPicked((prev) => (prev === slot.key ? null : slot.key))}
            title={`${label(slot.key)}：${slot.visits} 次访问，${slot.visitors} 位访客`}
            aria-label={`${label(slot.key)}：${slot.visits} 次访问，${slot.visitors} 位访客`}
            className="flex h-full min-w-0 flex-1 items-end"
          >
            <span
              className={`block w-full rounded-t-sm transition-colors ${picked === slot.key ? "bg-emerald-300" : "bg-emerald-400/70 hover:bg-emerald-300"}`}
              style={{ height: slot.visits ? `${Math.max(2, (slot.visits / max) * 100)}%` : 0 }}
            />
          </button>
        ))}
      </div>
      <div className="flex text-[10px] text-zinc-500" aria-hidden="true">
        {slots.map((slot, i) => (
          <span key={slot.key} className="min-w-0 flex-1 overflow-visible whitespace-nowrap">
            {i % every === 0 ? label(slot.key) : ""}
          </span>
        ))}
      </div>
      <figcaption className="text-[11px] text-zinc-500" aria-live="polite">
        {current
          ? `${label(current.key)}：${current.visits} 次访问，${current.visitors} 位访客`
          : `峰值 ${max} 次 · 点柱子看明细`}
      </figcaption>
    </figure>
  );
}

function TopList({ title, items, total }: { title: string; items: AnalyticsCount[]; total: number }) {
  return (
    <div className="adm-panel space-y-1.5 px-3 py-2.5">
      <p className="text-xs font-semibold text-zinc-300">{title}</p>
      {items.length === 0 ? (
        <p className="text-[11px] text-zinc-500">暂无数据</p>
      ) : (
        items.map((item) => {
          const pct = total ? Math.round((item.n / total) * 100) : 0;
          return (
            <div key={item.label} className="space-y-0.5">
              <div className="flex items-center justify-between gap-2 text-[11px]">
                <span className="min-w-0 truncate text-zinc-300" title={item.label}>{item.label}</span>
                <span className="shrink-0 tabular-nums text-zinc-500">{item.n} · {pct}%</span>
              </div>
              <div className="h-1 rounded bg-white/[0.05]">
                <div className="h-1 rounded bg-emerald-400/60" style={{ width: `${pct}%` }} />
              </div>
            </div>
          );
        })
      )}
    </div>
  );
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
        {visit.traffic_type && visit.traffic_type !== "human" && <TrafficTag type={visit.traffic_type} />}
        {(visit.country || visit.city) && (
          <span className="text-[10px] text-zinc-500">{[visit.country, visit.region, visit.city].filter(Boolean).join(" · ")}</span>
        )}
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
  const pendingMusicAudioDeletesRef = useRef<Map<string, string>>(new Map());
  const [active, setActive] = useState("profile");
  const [expandedExperienceId, setExpandedExperienceId] = useState<string | null>(null);
  const [expandedWorkId, setExpandedWorkId] = useState<string | null>(null);
  const [expandedAiWorkId, setExpandedAiWorkId] = useState<string | null>(null);
  const [expandedResumeId, setExpandedResumeId] = useState<string | null>(null);
  const [expandedGalleryId, setExpandedGalleryId] = useState<string | null>(null);
  const [expandedTreasureId, setExpandedTreasureId] = useState<string | null>(null);
  const [expandedPoemId, setExpandedPoemId] = useState<string | null>(null);
  const [expandedPostId, setExpandedPostId] = useState<string | null>(null);
  const [expandedSlideId, setExpandedSlideId] = useState<string | null>(null);
  const [previewDeck, setPreviewDeck] = useState<SlideDeck | null>(null);
  const [expandedMusicId, setExpandedMusicId] = useState<string | null>(null);
  /**
   * 音乐模块的批量操作状态。
   * 与作品列表那套（WorkListEditor 里的 selecting/selectedKeys）是**同一套规则**，
   * 只是这里没有复用那个组件 —— 它是强绑定 Work 类型的，音乐是 MusicTrack。
   * 规则记住三条：多选默认关、删除按下标从大到小、确认一律两段式。
   */
  const [musicSelecting, setMusicSelecting] = useState(false);
  const [musicSelectedKeys, setMusicSelectedKeys] = useState<string[]>([]);
  const [musicBulkConfirm, setMusicBulkConfirm] = useState<null | "delete">(null);
  const [musicBulkBusy, setMusicBulkBusy] = useState(false);
  /** 音乐拖动排序：正被拖的下标 / 悬停到的目标下标。 */
  const [musicDragFrom, setMusicDragFrom] = useState<number | null>(null);
  const [musicDragOver, setMusicDragOver] = useState<number | null>(null);

  /**
   * 「应用技能」与「我的珍藏」的批量操作 + 拖动排序状态。
   *
   * 与音乐模块是**同一套规则**（多选默认关、删除按下标从大到小、确认两段式、
   * 拖动是「摘出来再插进去」）。之所以又写一遍而不是抽公共组件：两边的条目类型
   * 不同（GalleryItem / TreasureItem），抽成泛型会把类型分发塞进每一个读写回调里，
   * 反而更难读。规则统一、实现各写一份，是这里刻意选的路。
   */
  const [gallerySelecting, setGallerySelecting] = useState(false);
  const [gallerySelectedKeys, setGallerySelectedKeys] = useState<string[]>([]);
  const [galleryBulkConfirm, setGalleryBulkConfirm] = useState<null | "delete">(null);
  const [galleryBulkBusy, setGalleryBulkBusy] = useState(false);
  const [galleryDragFrom, setGalleryDragFrom] = useState<number | null>(null);
  const [galleryDragOver, setGalleryDragOver] = useState<number | null>(null);

  const [treasureSelecting, setTreasureSelecting] = useState(false);
  const [treasureSelectedKeys, setTreasureSelectedKeys] = useState<string[]>([]);
  const [treasureBulkConfirm, setTreasureBulkConfirm] = useState<null | "delete">(null);
  const [treasureBulkBusy, setTreasureBulkBusy] = useState(false);
  const [treasureDragFrom, setTreasureDragFrom] = useState<number | null>(null);
  const [treasureDragOver, setTreasureDragOver] = useState<number | null>(null);
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
  const poemModalIndex = indexByRowKey(data.profile.pageCopy?.poemList || [], expandedPoemId);
  const postModalIndex = indexByRowKey(data.profile.pageCopy?.postList || [], expandedPostId);
  const slideModalIndex = indexByRowKey(data.profile.pageCopy?.slideList || [], expandedSlideId);
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
  // 概览（卡片 / 趋势 / 分布 / 点击排行）和访客列表是两个接口：翻页、搜索只重拉列表。
  const [analytics, setAnalytics] = useState<AnalyticsSummaryPayload | null>(null);
  const [visitorPage, setVisitorPage] = useState<AnalyticsVisitorsPayload | null>(null);
  const [analyticsRange, setAnalyticsRange] = useState<AnalyticsRange>("7d");
  // 默认只看真人：爬虫和本机预览浏览器是大头，混在一起数字没有意义。
  const [analyticsHumanOnly, setAnalyticsHumanOnly] = useState(true);
  const [analyticsView, setAnalyticsView] = useState<"overview" | "visitors" | "chats" | "clicks">("overview");
  const [visitorQuery, setVisitorQuery] = useState("");
  const [visitorQueryDraft, setVisitorQueryDraft] = useState("");
  const [visitorPageNo, setVisitorPageNo] = useState(1);
  const [visitorVisits, setVisitorVisits] = useState<{ key: string; visits: VisitRecord[]; loading: boolean } | null>(null);
  const [chatVisitorKey, setChatVisitorKey] = useState("");
  const [visitorConversations, setVisitorConversations] = useState<{ key: string; conversations: AssistantConversationSummary[]; loading: boolean } | null>(null);
  const [expandedConversationId, setExpandedConversationId] = useState("");
  const [conversationMessages, setConversationMessages] = useState<Record<string, AssistantConversationMessage[]>>({});
  const [conversationLoadingId, setConversationLoadingId] = useState("");
  const [assistantKeywords, setAssistantKeywords] = useState<AssistantKeywordPayload | null>(null);
  const [assistantKeywordsLoading, setAssistantKeywordsLoading] = useState(false);
  const [visitsLoading, setVisitsLoading] = useState(false);
  const [visitsError, setVisitsError] = useState("");
  const [visitsBusyKey, setVisitsBusyKey] = useState("");
  const [visitsExpandedKey, setVisitsExpandedKey] = useState<string | null>(null);
  const [visitsLabelDraft, setVisitsLabelDraft] = useState("");
  // 两段式确认：存 "all"（清空全部）或某位访客的 visitorKey（删这一位），null 表示没在确认。
  const [visitsConfirm, setVisitsConfirm] = useState<string | null>(null);

  const analyticsParams = () => `range=${analyticsRange}&humanOnly=${analyticsHumanOnly ? 1 : 0}`;

  async function fetchAdminJson<T>(url: string): Promise<T> {
    const res = await fetch(url);
    const json = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(json?.error || `读取失败（${res.status}）`);
    return json as T;
  }

  async function loadVisitorPage() {
    const query = visitorQuery ? `&q=${encodeURIComponent(visitorQuery)}` : "";
    setVisitorPage(await fetchAdminJson<AnalyticsVisitorsPayload>(`/api/admin/analytics/visitors?${analyticsParams()}&page=${visitorPageNo}&pageSize=20${query}`));
  }

  async function loadVisits() {
    setVisitsLoading(true);
    setVisitsError("");
    try {
      const summary = await fetchAdminJson<AnalyticsSummaryPayload>(`/api/admin/analytics/summary?${analyticsParams()}`);
      setAnalytics(summary);
      if (summary.configured) await loadVisitorPage();
    } catch (err: any) {
      setVisitsError(err?.message || "读取访问记录失败");
    } finally {
      setVisitsLoading(false);
    }
  }

  async function openVisitor(visitor: VisitorRecord) {
    setVisitsExpandedKey(visitor.visitor_key);
    setVisitsLabelDraft(visitor.label || "");
    setVisitsConfirm(null);
    setVisitorVisits({ key: visitor.visitor_key, visits: [], loading: true });
    const key = encodeURIComponent(visitor.visitor_key);
    try {
      const result = await fetchAdminJson<{ visits: VisitRecord[] }>(`/api/admin/analytics/visitors/${key}/visits`);
      setVisitorVisits((prev) => (prev?.key === visitor.visitor_key ? { key: visitor.visitor_key, visits: result.visits, loading: false } : prev));
    } catch (error: any) {
      setVisitsError(error?.message || "读取访问明细失败");
      setVisitorVisits((prev) => (prev?.key === visitor.visitor_key ? { ...prev, loading: false } : prev));
    }
  }

  async function openVisitorChats(visitor: VisitorRecord) {
    setChatVisitorKey(visitor.visitor_key);
    setVisitorConversations({ key: visitor.visitor_key, conversations: [], loading: true });
    setExpandedConversationId("");
    setConversationMessages({});
    try {
      const result = await fetchAdminJson<{ conversations: AssistantConversationSummary[] }>(
        `/api/admin/analytics/visitors/${encodeURIComponent(visitor.visitor_key)}/conversations`,
      );
      setVisitorConversations((prev) => (prev?.key === visitor.visitor_key ? { key: visitor.visitor_key, conversations: result.conversations, loading: false } : prev));
    } catch (error: any) {
      setVisitsError(error?.message || "读取聊天会话失败");
      setVisitorConversations((prev) => (prev?.key === visitor.visitor_key ? { ...prev, loading: false } : prev));
    }
  }

  async function loadAssistantKeywords() {
    setAssistantKeywordsLoading(true);
    try {
      setAssistantKeywords(await fetchAdminJson<AssistantKeywordPayload>(`/api/admin/analytics/assistant-keywords?${analyticsParams()}`));
    } catch (error: any) {
      setVisitsError(error?.message || "读取聊天关键词失败");
    } finally {
      setAssistantKeywordsLoading(false);
    }
  }

  async function toggleConversation(visitorKey: string, conversationId: string) {
    if (expandedConversationId === conversationId) {
      setExpandedConversationId("");
      return;
    }
    setExpandedConversationId(conversationId);
    if (conversationMessages[conversationId]) return;
    setConversationLoadingId(conversationId);
    try {
      const json = await fetchAdminJson<{ messages: AssistantConversationMessage[] }>(
        `/api/admin/analytics/visitors/${encodeURIComponent(visitorKey)}/conversations/${encodeURIComponent(conversationId)}/messages`,
      );
      setConversationMessages((current) => ({ ...current, [conversationId]: json.messages }));
    } catch (err: any) {
      setVisitsError(err?.message || "读取聊天消息失败");
    } finally {
      setConversationLoadingId("");
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
      setVisitorPage((prev) =>
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
      if (scoped) {
        setVisitsExpandedKey(null);
        if (visitorKeys?.includes(chatVisitorKey)) {
          setChatVisitorKey("");
          setVisitorConversations(null);
          setExpandedConversationId("");
          setConversationMessages({});
        }
      } else {
        setChatVisitorKey("");
        setVisitorConversations(null);
        setExpandedConversationId("");
        setConversationMessages({});
      }
      await Promise.all([loadVisits(), loadAssistantKeywords()]);
    } catch (err: any) {
      setVisitsError(err?.message || "清理失败");
    }
  }

  /**
   * 拖动排序：把列表里第 from 条挪到第 to 条的位置。
   *
   * 用「摘出来再插进去」而不是交换两条 —— 拖动的心智模型是「插到这个位置」，
   * 交换会让中间那几条莫名其妙地整体前移一格。
   *
   * 落库前先算好新数组再写：`readItems`/`writeItems` 走的是同一个 draft，
   * 在 mutator 里边读边写会读到已经被改过的列表。
   */
  async function reorderWorks(read: (draft: PortfolioData) => Work[], write: (draft: PortfolioData, items: Work[]) => void, from: number, to: number) {
    const list = [...read(data)];
    if (from < 0 || to < 0 || from >= list.length || to >= list.length || from === to) return;
    const [moved] = list.splice(from, 1);
    list.splice(to, 0, moved);
    await mutateAndSave(
      (draft) => { write(draft, list); },
      () => setStatus(`顺序已保存：第 ${from + 1} 条 → 第 ${to + 1} 条。`),
      { collapse: false },
    );
  }

  // 只有切到「站点检测」才拉数据：访问记录跟站点内容无关，没必要一进后台就多打一次接口。
  useEffect(() => {
    if (active !== "tracking") return;
    void loadVisits();
    // eslint 无此项目，依赖只取筛选条件是刻意的：loadVisits 每次渲染都是新函数，
    // 挂进依赖会导致「一加载完就再加载」的死循环。
  }, [active, analyticsRange, analyticsHumanOnly]);

  // 翻页 / 搜索只重拉访客列表，概览不动。首次加载由上面的 effect 负责。
  useEffect(() => {
    if (active !== "tracking" || !analytics?.configured) return;
    loadVisitorPage().catch((err: any) => setVisitsError(err?.message || "读取访客失败"));
  }, [visitorPageNo, visitorQuery]);

  useEffect(() => {
    if (active !== "tracking" || analyticsView !== "chats") return;
    void loadAssistantKeywords();
  }, [active, analyticsView, analyticsRange, analyticsHumanOnly]);

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
      { key: "poems", label: "诗与惆怅", icon: Feather },
      { key: "posts", label: "图文分享", icon: StickyNote },
      { key: "slides", label: "演示文稿", icon: Presentation },
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
      case "poems": return (data.profile.pageCopy?.poemList || []).length;
      case "posts": return (data.profile.pageCopy?.postList || []).length;
      case "slides": return (data.profile.pageCopy?.slideList || []).length;
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
    // 这次初始探测是**不可信**的：它在挂载那一刻发出去，如果服务器慢（真服务器要
    // 等 Supabase 拉数据），它的响应可能在用户**已经登录成功之后**才回来，
    // 于是 `setAuthenticated(false)` 把刚点亮的登录状态又按回去 —— 症状是
    // 「输入正确的账号密码、接口也回 success:true，但页面还停在登录框」。
    // 所以：只有当用户还没登录过时才允许它写 authenticated。
    let cancelled = false;
    Promise.all([
      fetch("/api/admin/session").then((res) => res.json()),
      fetch("/api/portfolio").then((res) => res.json()),
    ])
      .then(([session, portfolio]) => {
        if (cancelled) return;
        // 只有当「这次探测说没登录」而「本地已经登录成功」时，才不许它覆盖。
        setAuthenticated((current) => current || Boolean(session.authenticated));
        setSupabaseConfigured(Boolean(session.supabaseConfigured));
        setMaxUploadSizeMb(Number(session.maxUploadSizeMb || 50));
        setStorageProvider(session.storageProvider || "supabase");
        setData(normalize(portfolio));
      })
      .catch(() => setStatus("初始化失败，请检查服务"))
      .finally(() => { if (!cancelled) setLoading(false); });
    return () => { cancelled = true; };
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
      // 登录成功就是权威结论。初始探测那个 effect 可能还在飞，
      // 它回来时若发现本地已登录就不会再按回 false（见那边的注释）。
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
      const savedData = normalize(json.data);
      setData(savedData);
      setDirty(false);
      setStatus("已保存到数据库。");
      const referencedAudioUrls = new Set((savedData.musicTracks || []).map((track) => track.audioUrl).filter(Boolean));
      const replacedAudioUrls = [...pendingMusicAudioDeletesRef.current.values()].filter((url) => !referencedAudioUrls.has(url));
      if (replacedAudioUrls.length === 0) {
        pendingMusicAudioDeletesRef.current.clear();
      } else {
        try {
          if (await deleteMedia(replacedAudioUrls, false)) pendingMusicAudioDeletesRef.current.clear();
        } catch {
          setStatus("数据已保存，但旧音频文件清理失败；下次保存时会重试。");
        }
      }
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

  /**
   * 图文多图上传。逐张串行走 uploadMediaFile（复用压缩 / 大小上限 / 进度提示），
   * 每传完一张就按 id 追加 —— 用 id 而不是下标定位，上传途中列表被拖动排序也不会写错条目。
   */
  async function uploadPostImages(event: ChangeEvent<HTMLInputElement>, postId: string) {
    const files = Array.from(event.target.files ?? []) as File[];
    event.target.value = "";
    for (const file of files) {
      await uploadMediaFile(file, (url) => {
        update((draft) => {
          const target = (draft.profile.pageCopy?.postList || []).find((item) => item.id === postId);
          if (target) target.images = [...(target.images || []), url];
        });
      });
    }
  }

  async function uploadSlideFile(event: ChangeEvent<HTMLInputElement>, deckId: string) {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;
    if (!/\.pptx$/i.test(file.name)) {
      setStatus("请选择 .pptx 文件（旧版 .ppt 请先用 PowerPoint / WPS 另存为 .pptx）。");
      return;
    }
    await uploadMediaFile(file, (url) => {
      const previous = (data.profile.pageCopy?.slideList || []).find((item) => item.id === deckId)?.fileUrl;
      if (previous && previous !== url) void deleteMedia([previous], false);
      update((draft) => {
        const target = (draft.profile.pageCopy?.slideList || []).find((item) => item.id === deckId);
        if (!target) return;
        target.fileUrl = url;
        target.fileName = file.name;
        if (!target.title) target.title = file.name.replace(/\.pptx$/i, "");
      });
    });
  }

  async function uploadMusicAudio(file: File, trackId: string) {
    if (!file.type.startsWith("audio/") && !/\.(mp3|wav|flac|m4a|aac|ogg|opus|wma|aiff)$/i.test(file.name)) {
      setStatus("请选择音频文件。");
      return;
    }
    await uploadMediaFile(file, (url) => {
      const previousUrl = data.musicTracks?.find(item => item.id === trackId)?.audioUrl || "";
      const originalUrl = pendingMusicAudioDeletesRef.current.get(trackId);
      if (previousUrl && originalUrl === undefined) {
        pendingMusicAudioDeletesRef.current.set(trackId, previousUrl);
      } else if (previousUrl && previousUrl !== originalUrl) {
        void deleteMedia([previousUrl], false);
      }
      update((draft) => {
        const target = draft.musicTracks?.find(item => item.id === trackId);
        if (target) target.audioUrl = url;
      });
    });
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

  async function deleteMedia(urls: string[], announceSuccess = true) {
    const cleanUrls = urls.filter(Boolean);
    if (cleanUrls.length === 0) return true;

    const res = await fetch("/api/admin/delete-media", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ urls: cleanUrls }),
    });
    const json = await res.json().catch(() => ({}));
    if (!res.ok || json.failed?.length > 0) {
      setStatus("已从页面移除，但部分 COS 文件删除失败，请到腾讯云文件列表检查。");
      return false;
    }
    if (announceSuccess && json.deleted?.length > 0) {
      setStatus(`已同步删除 ${json.deleted.length} 个 COS 文件，请记得保存页面数据。`);
    }
    return true;
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
    if (isInstrumental(track.lyrics)) return "";
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
    if (!isInstrumental(track.lyrics) && track.audioUrl && plainLyrics && !hasEnhancedLyricTimeline(track.lyrics)) {
      const lyrics = await requestLyricsWithAsr(track, index, plainLyrics);
      if (!lyrics) return;
      track.lyrics = lyrics;
      setData(normalize(draft));
      await save(normalize(draft));
      return;
    }

    await save(draft);
  }

  /* ------------------------------------------------------ 音乐：排序与批量操作 */
  /**
   * 音乐列表身份规则。与列表渲染用的是同一条（`rowKey(track.id, index)`），
   * 顺序也不能变 —— 删除按下标，算错一位就删错歌。
   */
  const musicKeyOf = (track: MusicTrack, index: number) => rowKey(track.id, index);

  const musicSelectedIndexes = musicSelectedKeys
    .map((k) => (data.musicTracks || []).findIndex((track, index) => musicKeyOf(track, index) === k))
    .filter((i) => i >= 0);

  const exitMusicSelecting = () => {
    setMusicSelecting(false);
    setMusicSelectedKeys([]);
    setMusicBulkConfirm(null);
  };

  /**
   * 拖动排序：把第 from 首挪到第 to 首的位置。
   * 与作品列表同一个心智模型 —— 「插到这个位置」而不是交换两条。
   */
  async function reorderMusic(from: number, to: number) {
    const list = [...(data.musicTracks || [])];
    if (from < 0 || to < 0 || from >= list.length || to >= list.length || from === to) return;
    const [moved] = list.splice(from, 1);
    list.splice(to, 0, moved);
    await mutateAndSave(
      (draft) => { draft.musicTracks = list; },
      () => setStatus(`顺序已保存：第 ${from + 1} 首 → 第 ${to + 1} 首。`),
      { collapse: false },
    );
  }

  /**
   * 批量删除音乐。素材要**先收集再一次性删**，并且必须走 removeAndSave
   * （它会真的删 COS 上的音频与封面）。下标从大到小，避免删了前面的把后面挪位。
   */
  async function runMusicBulkDelete() {
    const indexes = [...musicSelectedIndexes].sort((a, b) => b - a);
    if (indexes.length === 0) return;
    const list = data.musicTracks || [];
    const media = indexes.flatMap((i) => [list[i]?.audioUrl, list[i]?.coverUrl].filter(Boolean) as string[]);
    const titles = indexes.map((i) => list[i]?.title || `第 ${i + 1} 首`).join("、");
    setMusicBulkBusy(true);
    await removeAndSave(
      (draft) => {
        const next = [...(draft.musicTracks || [])];
        for (const i of indexes) next.splice(i, 1);
        draft.musicTracks = next;
      },
      media,
      () => { setExpandedMusicId(null); exitMusicSelecting(); setStatus(`已批量删除 ${indexes.length} 首：${titles}`); },
    );
    setMusicBulkBusy(false);
  }

  /* ------------------------------------- 应用技能 / 我的珍藏：排序与批量操作 */
  /**
   * 身份规则必须和列表渲染里用的是同一条（`rowKey(item.id, index)`），
   * 顺序也不能变 —— 删除按下标走，算错一位就删错图。
   */
  const galleryKeyOf = (item: GalleryItem, index: number) => rowKey(item.id, index);
  const treasureKeyOf = (item: TreasureItem, index: number) => rowKey(item.id, index);

  const gallerySelectedIndexes = gallerySelectedKeys
    .map((k) => (data.gallery || []).findIndex((item, index) => galleryKeyOf(item, index) === k))
    .filter((i) => i >= 0);
  const treasureSelectedIndexes = treasureSelectedKeys
    .map((k) => (data.treasures || []).findIndex((item, index) => treasureKeyOf(item, index) === k))
    .filter((i) => i >= 0);

  const exitGallerySelecting = () => {
    setGallerySelecting(false);
    setGallerySelectedKeys([]);
    setGalleryBulkConfirm(null);
  };

  const exitTreasureSelecting = () => {
    setTreasureSelecting(false);
    setTreasureSelectedKeys([]);
    setTreasureBulkConfirm(null);
  };

  /**
   * 拖动排序：把第 from 张挪到第 to 张的位置。
   * 「摘出来再插进去」而不是交换两条 —— 拖动的心智模型是「插到这个位置」，
   * 交换会让中间那几张莫名其妙地整体挪一格。
   */
  async function reorderGallery(from: number, to: number) {
    const list = [...(data.gallery || [])];
    if (from < 0 || to < 0 || from >= list.length || to >= list.length || from === to) return;
    const [moved] = list.splice(from, 1);
    list.splice(to, 0, moved);
    await mutateAndSave(
      (draft) => { draft.gallery = list; },
      () => setStatus(`顺序已保存：第 ${from + 1} 张 → 第 ${to + 1} 张。`),
      { collapse: false },
    );
  }

  async function reorderTreasures(from: number, to: number) {
    const list = [...(data.treasures || [])];
    if (from < 0 || to < 0 || from >= list.length || to >= list.length || from === to) return;
    const [moved] = list.splice(from, 1);
    list.splice(to, 0, moved);
    await mutateAndSave(
      (draft) => { draft.treasures = list; },
      () => setStatus(`顺序已保存：第 ${from + 1} 张 → 第 ${to + 1} 张。`),
      { collapse: false },
    );
  }

  /**
   * 批量删除截图。素材**先收集再一次性删**，并且必须走 removeAndSave
   * （它会真的删 COS 上的图）。下标从大到小，避免删了前面的把后面挪位。
   */
  async function runGalleryBulkDelete() {
    const indexes = [...gallerySelectedIndexes].sort((a, b) => b - a);
    if (indexes.length === 0) return;
    const list = data.gallery || [];
    const media = indexes.flatMap((i) => [list[i]?.imageUrl].filter(Boolean) as string[]);
    const names = indexes.map((i) => list[i]?.title || `第 ${i + 1} 张`).join("、");
    setGalleryBulkBusy(true);
    await removeAndSave(
      (draft) => {
        const next = [...(draft.gallery || [])];
        for (const i of indexes) next.splice(i, 1);
        draft.gallery = next;
      },
      media,
      () => { setExpandedGalleryId(null); exitGallerySelecting(); setStatus(`已批量删除 ${indexes.length} 张：${names}`); },
    );
    setGalleryBulkBusy(false);
  }

  async function runTreasureBulkDelete() {
    const indexes = [...treasureSelectedIndexes].sort((a, b) => b - a);
    if (indexes.length === 0) return;
    const list = data.treasures || [];
    const media = indexes.flatMap((i) => [list[i]?.imageUrl].filter(Boolean) as string[]);
    setTreasureBulkBusy(true);
    await removeAndSave(
      (draft) => {
        const next = [...(draft.treasures || [])];
        for (const i of indexes) next.splice(i, 1);
        draft.treasures = next;
      },
      media,
      () => { setExpandedTreasureId(null); exitTreasureSelecting(); setStatus(`已批量删除 ${indexes.length} 张珍藏。`); },
    );
    setTreasureBulkBusy(false);
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

                {/* 「不展示头像」开关：勾上 = 前台首页左栏不渲染头像。
                    字段是 `hideAvatar` 而不是 `avatarVisible`，勾选状态与字段同向，
                    省掉一次 `!value` 反转 —— 那种地方最容易写反，前台会跟开关相反。
                    改完即保存（与「模块管理」的开关一致），不用等「保存全部」。 */}
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <VisibilitySwitch
                    name="首页头像"
                    hint="关闭后访客看不到头像，名片只剩下名称与标签；头像文件与地址都保留。"
                    checked={!data.profile.pageCopy?.hideAvatar}
                    disabled={saving}
                    onChange={(next) => {
                      void mutateAndSave(
                        (draft) => { editPageCopy(draft, { hideAvatar: !next }); },
                        undefined,
                        { collapse: false },
                      );
                    }}
                  />
                </div>
                <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                  <VisibilitySwitch
                    name="入场动画"
                    hint="关闭后访客打开或刷新网站时直接进入首页，不加载开门视频；已有视频素材和设置都会保留。"
                    checked={data.profile.pageCopy?.entranceAnimationEnabled !== false}
                    disabled={saving}
                    onChange={(next) => {
                      void mutateAndSave(
                        (draft) => { editPageCopy(draft, { entranceAnimationEnabled: next }); },
                        undefined,
                        { collapse: false },
                      );
                    }}
                  />
                </div>
                <Field label="一句话标签" value={data.profile.tagline} onChange={(value) => update((draft) => { draft.profile.tagline = value; })} textarea />
                <Field label="自我介绍" value={data.profile.intro} onChange={(value) => update((draft) => { draft.profile.intro = value; })} textarea />
                <div className="space-y-3 border-t border-zinc-800/80 pt-4">
                  <div>
                    <h3 className="text-sm font-medium text-zinc-100">首页数据标签</h3>
                    <p className="mt-1 text-xs leading-5 text-zinc-500">编辑前台“关于我”下方的作品、播放和 AI 技能数据。</p>
                  </div>
                  <div className="grid gap-4 md:grid-cols-3">
                    {(["works", "plays", "ai"] as const).map((key) => {
                      const stat = { ...defaultHomeStats[key], ...data.profile.pageCopy?.homeStats?.[key] };
                      const groupName = { works: "作品", plays: "播放", ai: "AI 技能" }[key];
                      return (
                        <div key={key} className="space-y-3 border-l-2 border-emerald-400/25 pl-3">
                          <strong className="block text-xs font-medium text-emerald-200">{groupName}</strong>
                          <Field label="醒目数值" value={stat.value} onChange={(value) => update((draft) => { setHomeStatCopy(draft, key, { value }); })} placeholder={defaultHomeStats[key].value} />
                          <Field label="短标签" value={stat.label} onChange={(value) => update((draft) => { setHomeStatCopy(draft, key, { label: value }); })} placeholder={defaultHomeStats[key].label} />
                          <Field label="补充说明" value={stat.detail} onChange={(value) => update((draft) => { setHomeStatCopy(draft, key, { detail: value }); })} placeholder={defaultHomeStats[key].detail} />
                        </div>
                      );
                    })}
                  </div>
                </div>
                <Field label="诗句/签名" value={data.profile.quote} onChange={(value) => update((draft) => { draft.profile.quote = value; })} textarea />
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
                  const total = data.experiences.length;
                  const goTo = (to: number) => setExpandedExperienceId(rowKey(data.experiences[to].id, to));
                  const descLines = (exp.desc || "").split("\n").filter((line) => line.trim()).length;
                  return (
                    <EditorModal
                      size="sm"
                      title={exp.role?.trim() || "未填写标题"}
                      onClose={() => setExpandedExperienceId(null)}
                      footer={
                        <>
                          {/* 连着改好几条时不用关了再开：上一条 / 下一条直接切。改动都在草稿里，不会丢。 */}
                          <div className="mr-auto flex items-center gap-1 text-xs text-zinc-500">
                            <button type="button" disabled={index === 0} onClick={() => goTo(index - 1)} className="rounded-md border border-zinc-800 px-2 py-1 text-zinc-300 hover:border-zinc-600 disabled:opacity-40">上一条</button>
                            <span className="px-1 font-mono">{index + 1} / {total}</span>
                            <button type="button" disabled={index === total - 1} onClick={() => goTo(index + 1)} className="rounded-md border border-zinc-800 px-2 py-1 text-zinc-300 hover:border-zinc-600 disabled:opacity-40">下一条</button>
                          </div>
                          <SaveCurrentButton label="保存全部" />
                        </>
                      }
                    >
                      <div className="space-y-3">
                        <section className="adm-panel p-3">
                          <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-zinc-500">前台效果 / PREVIEW</p>
                          <ExperiencePreview exp={exp} />
                        </section>
                        {/*
                         * 字段名对齐前台：role 是时间线上的大字标题，company 显示成「@ 负责人」。
                         * 原来标签写反了（role 标成「组织/公司」），填的人只能靠猜。
                         * 数据字段不动，只改标签和顺序 —— 先填标题，再填时间和身份。
                         */}
                        <section className="adm-panel space-y-3 p-3">
                          <Field
                            label="标题"
                            value={exp.role}
                            onChange={(value) => update((draft) => { draft.experiences[index].role = value; })}
                            placeholder="例如：APP 产品原型设计"
                            hint="时间线上最醒目的那一行。"
                          />
                          <div className="grid gap-3 sm:grid-cols-2">
                            <Field
                              label="时间"
                              value={exp.period}
                              onChange={(value) => update((draft) => { draft.experiences[index].period = value; })}
                              placeholder="例如：2025.09 - 2025.12"
                            />
                            <Field
                              label="身份 / 组织"
                              value={exp.company}
                              onChange={(value) => update((draft) => { draft.experiences[index].company = value; })}
                              placeholder="例如：负责人、某某公司"
                              hint="前台显示为「@ 负责人」。"
                            />
                          </div>
                          <Field
                            label="简介"
                            value={exp.desc}
                            onChange={(value) => update((draft) => { draft.experiences[index].desc = value; })}
                            textarea
                            rows={Math.min(10, Math.max(4, descLines + 1))}
                            hint={`${(exp.desc || "").length} 字`}
                          />
                        </section>
                      </div>
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
                  reorder={(from, to) => reorderWorks((draft) => draft.works, (draft, items) => { draft.works = items; }, from, to)}
                  migrate={{
                    label: "迁移到 AI 专区",
                    hint: "这条作品会从「作品媒体」移到「AI 专区」，访客端跟着换栏目。图片 / 视频 / 附件素材原样带过去，不会被删除；分类如果不在 AI 专区的词表里会保留原值（显示为「xxx（当前）」），迁移后可以自己改。",
                    run: (work, index) => migrateWork(work, index, "to-ai"),
                  }}
                  onStatus={setStatus}
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
                  reorder={(from, to) => reorderWorks(
                    (draft) => draft.profile.pageCopy?.aiWorks || [],
                    (draft, items) => { editPageCopy(draft, { aiWorks: items }); },
                    from,
                    to,
                  )}
                  migrate={{
                    label: "迁移回作品媒体",
                    hint: "这条 AI 作品会从「AI 专区」移回「作品媒体」，访客端跟着换栏目。图片 / 视频 / 附件素材原样带过去，不会被删除；分类如果不在「作品媒体」的词表里会保留原值（显示为「xxx（当前）」），迁移后可以自己改。",
                    run: (work, index) => migrateWork(work, index, "to-works"),
                  }}
                  onStatus={setStatus}
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
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      {/* 多选总开关。栏目不同、位置与外观一致 —— 后台里
                          「批量操作」永远在标题栏右上角，不用重新找。 */}
                      <button
                        type="button"
                        aria-pressed={gallerySelecting}
                        onClick={() => (gallerySelecting ? exitGallerySelecting() : setGallerySelecting(true))}
                        className={
                          "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm transition-colors duration-200 " +
                          (gallerySelecting
                            ? "border-emerald-400 text-emerald-200"
                            : "border-zinc-800 text-zinc-300 hover:border-zinc-600")
                        }
                      >
                        <ListChecks size={15} /> {gallerySelecting ? "退出批量" : "批量操作"}
                      </button>
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
                    </div>
                  }
                >
                  <p className="text-sm leading-5 text-zinc-400">
                    共 {(data.gallery || []).length} 张截图。分类可用：应用、原型图、Agent、剪辑，也可新建分类。
                    <span className="text-zinc-500">按住左侧手柄可拖动调整前台顺序。</span>
                  </p>
                </Section>

                {/* 批量操作条。只在多选模式下出现；删除不可撤销，所以两段式确认。 */}
                {gallerySelecting && (
                  <div className="adm-note adm-note-info flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-emerald-100/85">
                    <LogOut size={14} className="shrink-0" />
                    <span>
                      已选 <span className="font-semibold text-white">{gallerySelectedIndexes.length}</span> / {(data.gallery || []).length} 张
                      <span className="text-emerald-200/70">（批量模式下拖动排序已暂停）</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setGallerySelectedKeys((data.gallery || []).map((item, index) => galleryKeyOf(item, index)))}
                      className="rounded-lg border border-zinc-800 px-2 py-1 text-xs text-zinc-300 hover:border-zinc-600"
                    >
                      全选
                    </button>
                    <button
                      type="button"
                      onClick={() => setGallerySelectedKeys([])}
                      disabled={gallerySelectedKeys.length === 0}
                      className="rounded-lg border border-zinc-800 px-2 py-1 text-xs text-zinc-300 hover:border-zinc-600 disabled:opacity-50"
                    >
                      清空
                    </button>

                    <span className="ml-auto flex flex-wrap items-center gap-2">
                      {galleryBulkConfirm === "delete" ? (
                        <>
                          <span className="text-[11px] leading-5 text-rose-200">
                            删除 {gallerySelectedIndexes.length} 张截图及其图片文件，不可恢复。
                          </span>
                          <button
                            type="button"
                            onClick={() => { void runGalleryBulkDelete(); }}
                            disabled={galleryBulkBusy}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-rose-400 px-2.5 py-1.5 text-xs font-semibold text-zinc-950 hover:bg-rose-300 disabled:opacity-60"
                          >
                            {galleryBulkBusy ? <Loader2 className="animate-spin" size={12} /> : <Trash2 size={12} />} 确认删除
                          </button>
                          <button
                            type="button"
                            onClick={() => setGalleryBulkConfirm(null)}
                            disabled={galleryBulkBusy}
                            className="rounded-lg border border-zinc-800 px-2.5 py-1.5 text-xs text-zinc-300 disabled:opacity-60"
                          >
                            取消
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setGalleryBulkConfirm("delete")}
                          disabled={gallerySelectedIndexes.length === 0}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 px-2.5 py-1.5 text-xs text-zinc-300 hover:border-rose-500/60 hover:text-rose-200 disabled:opacity-50"
                        >
                          <Trash2 size={12} /> 批量删除
                        </button>
                      )}
                    </span>
                  </div>
                )}

                {(data.gallery || []).map((item: GalleryItem, index: number) => {
                  const active = expandedGalleryId === rowKey(item.id, index);
                  const key = galleryKeyOf(item, index);
                  const checked = gallerySelectedKeys.includes(key);
                  return (
                    <EditorRow key={key} expanded={active} tone={checked ? "emerald" : undefined}>
                      {/* 拖动落点提示：一条细线，不做整行位移（否则会视觉抖动）。 */}
                      {galleryDragOver === index && galleryDragFrom !== null && galleryDragFrom !== index && (
                        <div className="h-0.5 w-full rounded bg-emerald-400/70" aria-hidden="true" />
                      )}
                      <div
                        className="flex items-stretch"
                        // 拖动只在「没进多选」时开放：两套交互叠一起会互相抢点击。
                        {...(!gallerySelecting
                          ? {
                              draggable: true,
                              onDragStart: (event: React.DragEvent) => {
                                setGalleryDragFrom(index);
                                event.dataTransfer.effectAllowed = "move";
                                // Firefox 不给 dataTransfer 赋值就不触发 drag。
                                event.dataTransfer.setData("text/plain", key);
                              },
                              onDragOver: (event: React.DragEvent) => {
                                event.preventDefault();
                                event.dataTransfer.dropEffect = "move";
                                setGalleryDragOver(index);
                              },
                              onDragLeave: () => setGalleryDragOver((prev) => (prev === index ? null : prev)),
                              onDrop: (event: React.DragEvent) => {
                                event.preventDefault();
                                const from = galleryDragFrom;
                                setGalleryDragFrom(null);
                                setGalleryDragOver(null);
                                if (from !== null && from !== index) void reorderGallery(from, index);
                              },
                              onDragEnd: () => { setGalleryDragFrom(null); setGalleryDragOver(null); },
                            }
                          : {})}
                      >
                        {!gallerySelecting && (
                          <span
                            aria-hidden="true"
                            title="按住拖动可调整前台顺序"
                            className="flex w-6 shrink-0 cursor-grab items-center justify-center text-zinc-600 active:cursor-grabbing"
                          >
                            <GripVertical size={15} />
                          </span>
                        )}
                        {gallerySelecting && (
                          <label className="flex w-8 shrink-0 cursor-pointer items-center justify-center">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => setGallerySelectedKeys((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]))}
                              aria-label={"选择「" + (item.title || "未命名截图") + "」"}
                              className="h-4 w-4 accent-emerald-300"
                            />
                          </label>
                        )}
                        <div className="min-w-0 flex-1">
                          <GallerySummary
                            item={item}
                            index={index}
                            active={active}
                            selecting={gallerySelecting}
                            checked={checked}
                            onEdit={() => {
                              // 多选模式下点击语义换成「勾选」，否则点哪儿都开弹窗、永远选不上。
                              if (gallerySelecting) {
                                setGallerySelectedKeys((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
                                return;
                              }
                              setExpandedGalleryId(key);
                            }}
                            onDelete={() => {
                              void removeAndSave(
                                (draft) => { draft.gallery = (draft.gallery || []).filter((_, i) => i !== index); },
                                [item.imageUrl],
                                () => setExpandedGalleryId(null),
                              );
                            }}
                          />
                        </div>
                      </div>
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
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <button
                        type="button"
                        aria-pressed={treasureSelecting}
                        onClick={() => (treasureSelecting ? exitTreasureSelecting() : setTreasureSelecting(true))}
                        className={
                          "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm transition-colors duration-200 " +
                          (treasureSelecting
                            ? "border-emerald-400 text-emerald-200"
                            : "border-zinc-800 text-zinc-300 hover:border-zinc-600")
                        }
                      >
                        <ListChecks size={15} /> {treasureSelecting ? "退出批量" : "批量操作"}
                      </button>
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
                    </div>
                  }
                >
                  <p className="text-sm leading-5 text-zinc-400">
                    共 {(data.treasures || []).length} 张珍藏。
                    <span className="text-zinc-500">按住左侧手柄可拖动调整前台顺序。</span>
                  </p>
                </Section>

                {/* 批量操作条。与截图、音乐同一套：只在多选模式下出现，删除两段式确认。 */}
                {treasureSelecting && (
                  <div className="adm-note adm-note-info flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-emerald-100/85">
                    <LogOut size={14} className="shrink-0" />
                    <span>
                      已选 <span className="font-semibold text-white">{treasureSelectedIndexes.length}</span> / {(data.treasures || []).length} 张
                      <span className="text-emerald-200/70">（批量模式下拖动排序已暂停）</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setTreasureSelectedKeys((data.treasures || []).map((item, index) => treasureKeyOf(item, index)))}
                      className="rounded-lg border border-zinc-800 px-2 py-1 text-xs text-zinc-300 hover:border-zinc-600"
                    >
                      全选
                    </button>
                    <button
                      type="button"
                      onClick={() => setTreasureSelectedKeys([])}
                      disabled={treasureSelectedKeys.length === 0}
                      className="rounded-lg border border-zinc-800 px-2 py-1 text-xs text-zinc-300 hover:border-zinc-600 disabled:opacity-50"
                    >
                      清空
                    </button>

                    <span className="ml-auto flex flex-wrap items-center gap-2">
                      {treasureBulkConfirm === "delete" ? (
                        <>
                          <span className="text-[11px] leading-5 text-rose-200">
                            删除 {treasureSelectedIndexes.length} 张珍藏及其图片文件，不可恢复。
                          </span>
                          <button
                            type="button"
                            onClick={() => { void runTreasureBulkDelete(); }}
                            disabled={treasureBulkBusy}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-rose-400 px-2.5 py-1.5 text-xs font-semibold text-zinc-950 hover:bg-rose-300 disabled:opacity-60"
                          >
                            {treasureBulkBusy ? <Loader2 className="animate-spin" size={12} /> : <Trash2 size={12} />} 确认删除
                          </button>
                          <button
                            type="button"
                            onClick={() => setTreasureBulkConfirm(null)}
                            disabled={treasureBulkBusy}
                            className="rounded-lg border border-zinc-800 px-2.5 py-1.5 text-xs text-zinc-300 disabled:opacity-60"
                          >
                            取消
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setTreasureBulkConfirm("delete")}
                          disabled={treasureSelectedIndexes.length === 0}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 px-2.5 py-1.5 text-xs text-zinc-300 hover:border-rose-500/60 hover:text-rose-200 disabled:opacity-50"
                        >
                          <Trash2 size={12} /> 批量删除
                        </button>
                      )}
                    </span>
                  </div>
                )}

                {(data.treasures || []).map((item: TreasureItem, index: number) => {
                  const active = expandedTreasureId === rowKey(item.id, index);
                  const key = treasureKeyOf(item, index);
                  const checked = treasureSelectedKeys.includes(key);
                  return (
                    // tone 默认 amber（珍藏的固有色调），勾选中时让位给 emerald ——
                    // 这跟音乐列表一个规矩：状态色优先于栏目色。
                    <EditorRow key={key} expanded={active} tone={checked ? "emerald" : "amber"}>
                      {treasureDragOver === index && treasureDragFrom !== null && treasureDragFrom !== index && (
                        <div className="h-0.5 w-full rounded bg-emerald-400/70" aria-hidden="true" />
                      )}
                      <div
                        className="flex items-stretch"
                        {...(!treasureSelecting
                          ? {
                              draggable: true,
                              onDragStart: (event: React.DragEvent) => {
                                setTreasureDragFrom(index);
                                event.dataTransfer.effectAllowed = "move";
                                event.dataTransfer.setData("text/plain", key);
                              },
                              onDragOver: (event: React.DragEvent) => {
                                event.preventDefault();
                                event.dataTransfer.dropEffect = "move";
                                setTreasureDragOver(index);
                              },
                              onDragLeave: () => setTreasureDragOver((prev) => (prev === index ? null : prev)),
                              onDrop: (event: React.DragEvent) => {
                                event.preventDefault();
                                const from = treasureDragFrom;
                                setTreasureDragFrom(null);
                                setTreasureDragOver(null);
                                if (from !== null && from !== index) void reorderTreasures(from, index);
                              },
                              onDragEnd: () => { setTreasureDragFrom(null); setTreasureDragOver(null); },
                            }
                          : {})}
                      >
                        {!treasureSelecting && (
                          <span
                            aria-hidden="true"
                            title="按住拖动可调整前台顺序"
                            className="flex w-6 shrink-0 cursor-grab items-center justify-center text-zinc-600 active:cursor-grabbing"
                          >
                            <GripVertical size={15} />
                          </span>
                        )}
                        {treasureSelecting && (
                          <label className="flex w-8 shrink-0 cursor-pointer items-center justify-center">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => setTreasureSelectedKeys((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]))}
                              aria-label={"选择「珍藏 " + (index + 1) + "」"}
                              className="h-4 w-4 accent-emerald-300"
                            />
                          </label>
                        )}
                        <div className="min-w-0 flex-1">
                          <TreasureSummary
                            item={item}
                            index={index}
                            active={active}
                            selecting={treasureSelecting}
                            checked={checked}
                            onEdit={() => {
                              if (treasureSelecting) {
                                setTreasureSelectedKeys((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
                                return;
                              }
                              setExpandedTreasureId(key);
                            }}
                            onDelete={() => {
                              void removeAndSave(
                                (draft) => { draft.treasures = (draft.treasures || []).filter((_, i) => i !== index); },
                                [item.imageUrl],
                                () => setExpandedTreasureId(null),
                              );
                            }}
                          />
                        </div>
                      </div>
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

            {active === "poems" && (
              <>
                <Section
                  title="诗与惆怅"
                  description="前台「诗与惆怅」栏目里的作品，按这里的顺序一首首铺开。页首文案在「模块管理」里。"
                  action={
                    <button
                      type="button"
                      onClick={() => {
                        const id = uid("poem");
                        addDraft(
                          (draft) => { draft.profile.pageCopy!.poemList = [...(draft.profile.pageCopy!.poemList || []), { ...emptyPoem, id }]; },
                          () => setExpandedPoemId(id),
                        );
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 px-2.5 py-1.5 text-sm text-zinc-300 hover:border-zinc-600"
                    >
                      <Plus size={15} /> 新增一首
                    </button>
                  }
                >
                  <p className="text-sm leading-5 text-zinc-400">
                    共 {(data.profile.pageCopy?.poemList || []).length} 首。正文换行即分段，五言 / 七言 / 词 / 现代诗由前台自动排版。
                  </p>
                </Section>
                {(data.profile.pageCopy?.poemList || []).map((item: Poem, index: number) => {
                  const active = expandedPoemId === rowKey(item.id, index);
                  return (
                    <EditorRow key={rowKey(item.id, index)} expanded={active} tone="amber">
                      <PoemSummary
                        item={item}
                        index={index}
                        active={active}
                        onEdit={() => setExpandedPoemId(rowKey(item.id, index))}
                        onDelete={() => {
                          void removeAndSave(
                            (draft) => { draft.profile.pageCopy!.poemList = (draft.profile.pageCopy!.poemList || []).filter((_, i) => i !== index); },
                            [],
                            () => setExpandedPoemId(null),
                          );
                        }}
                      />
                    </EditorRow>
                  );
                })}

                {poemModalIndex >= 0 && (() => {
                  const item = (data.profile.pageCopy?.poemList || [])[poemModalIndex];
                  const index = poemModalIndex;
                  return (
                    <EditorModal
                      title={"诗 " + (index + 1)}
                      onClose={() => setExpandedPoemId(null)}
                      footer={<SaveCurrentButton label="保存全部" />}
                    >
                      <section className="adm-panel space-y-3 p-3">
                        <Field label="题目（可留空）" value={item.title} onChange={(value) => update((draft) => { draft.profile.pageCopy!.poemList![index].title = value; })} />
                        <Field label="正文（换行分段）" value={item.text} textarea onChange={(value) => update((draft) => { draft.profile.pageCopy!.poemList![index].text = value; })} />
                        <Field label="落款（可留空）" value={item.note || ""} onChange={(value) => update((draft) => { draft.profile.pageCopy!.poemList![index].note = value; })} />
                        {/* 封面：和作品一样可以上传。替换时先删旧的，免得 COS 里越攒越多孤儿文件。 */}
                        <div className="flex flex-wrap items-end gap-3">
                          <div className="min-w-[260px] flex-1"><Field label="封面图 URL（可留空）" value={item.imageUrl || ""} onChange={(value) => update((draft) => { draft.profile.pageCopy!.poemList![index].imageUrl = value; })} /></div>
                          <label className="inline-flex cursor-pointer items-center justify-center gap-1.5 rounded-lg border border-zinc-800 px-2.5 py-2 text-xs text-zinc-300 hover:border-zinc-600">
                            <ImagePlus size={16} /> 上传封面
                            <input className="hidden" type="file" accept="image/*" onChange={(event) => upload(event, (url) => {
                              const previous = item.imageUrl;
                              if (previous) void deleteMedia([previous]);
                              update((draft) => { draft.profile.pageCopy!.poemList![index].imageUrl = url; });
                            })} />
                          </label>
                          {item.imageUrl ? (
                            <button
                              type="button"
                              onClick={() => {
                                const previous = item.imageUrl;
                                update((draft) => { draft.profile.pageCopy!.poemList![index].imageUrl = ""; });
                                if (previous) void deleteMedia([previous]);
                              }}
                              className="rounded-lg border border-zinc-800 px-2.5 py-2 text-xs text-zinc-400 hover:border-red-500 hover:text-red-300"
                            >
                              移除封面
                            </button>
                          ) : null}
                        </div>
                      </section>
                      {item.imageUrl ? (
                        <section className="adm-panel mt-3 p-3">
                          <p className="mb-2 font-mono text-[10px] uppercase tracking-widest text-zinc-500">封面预览 / COVER</p>
                          <img src={item.imageUrl} alt="封面预览" className="max-h-[36vh] w-full rounded-lg bg-black object-contain" />
                        </section>
                      ) : null}
                      {item.text.trim() ? (
                        <section className="adm-panel mt-3 p-3">
                          <p className="mb-3 font-mono text-[10px] uppercase tracking-widest text-zinc-500">前台排版预览 / PREVIEW</p>
                          {item.title ? <h3 className="mb-4 text-center font-serif text-lg tracking-[0.2em] text-white">{item.title}</h3> : null}
                          <pre className="whitespace-pre-wrap text-center font-serif text-base leading-loose text-zinc-200">{item.text}</pre>
                          {item.note ? <p className="mt-5 text-right font-mono text-[11px] text-zinc-500">—— {item.note}</p> : null}
                        </section>
                      ) : (
                        <p className="mt-3 rounded-lg border border-dashed border-zinc-800 px-3 py-6 text-center text-xs text-zinc-500">写下正文后这里会出现排版预览。</p>
                      )}
                    </EditorModal>
                  );
                })()}
              </>
            )}

            {active === "posts" && (
              <>
                <Section
                  title="图文分享"
                  description="前台按这里的顺序上下滑切换，每条的图片按顺序左右翻页（第一张是封面）。页首文案在「模块管理」里。"
                  action={
                    <button
                      type="button"
                      onClick={() => {
                        const id = uid("post");
                        addDraft(
                          (draft) => { draft.profile.pageCopy!.postList = [...(draft.profile.pageCopy!.postList || []), { ...emptyPost, id }]; },
                          () => setExpandedPostId(id),
                        );
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 px-2.5 py-1.5 text-sm text-zinc-300 hover:border-zinc-600"
                    >
                      <Plus size={15} /> 新增图文
                    </button>
                  }
                >
                  <p className="text-sm leading-5 text-zinc-400">共 {(data.profile.pageCopy?.postList || []).length} 条。</p>
                </Section>
                {(data.profile.pageCopy?.postList || []).map((item: ImagePost, index: number) => {
                  const key = rowKey(item.id, index);
                  const isActive = expandedPostId === key;
                  return (
                    <EditorRow key={key} expanded={isActive}>
                      <ListSummaryRow
                        thumb={item.images?.[0]}
                        title={item.title || "图文 " + (index + 1)}
                        meta={`${(item.images || []).length} 张图`}
                        preview={item.text}
                        active={isActive}
                        onEdit={() => setExpandedPostId(key)}
                        canMoveUp={index > 0}
                        canMoveDown={index < (data.profile.pageCopy?.postList || []).length - 1}
                        onMove={(delta) => void mutateAndSave((draft) => { draft.profile.pageCopy!.postList = moveItem(draft.profile.pageCopy!.postList || [], index, index + delta); }, undefined, { collapse: false })}
                        onDelete={() => {
                          void removeAndSave(
                            (draft) => { draft.profile.pageCopy!.postList = (draft.profile.pageCopy!.postList || []).filter((_, i) => i !== index); },
                            item.images || [],
                            () => setExpandedPostId(null),
                          );
                        }}
                      />
                    </EditorRow>
                  );
                })}

                {postModalIndex >= 0 && (() => {
                  const item = (data.profile.pageCopy?.postList || [])[postModalIndex];
                  const index = postModalIndex;
                  const images = item.images || [];
                  const setImages = (next: string[]) => update((draft) => { draft.profile.pageCopy!.postList![index].images = next; });
                  return (
                    <EditorModal title={"图文 " + (index + 1)} size="lg" onClose={() => setExpandedPostId(null)} footer={<SaveCurrentButton label="保存全部" />}>
                      <section className="adm-panel space-y-3 p-3">
                        <Field label="标题" value={item.title} onChange={(value) => update((draft) => { draft.profile.pageCopy!.postList![index].title = value; })} />
                        <Field label="正文（换行分段）" value={item.text} textarea rows={6} onChange={(value) => update((draft) => { draft.profile.pageCopy!.postList![index].text = value; })} />
                        <div className="grid gap-3 md:grid-cols-2">
                          <Field label="标签（逗号分隔）" value={(item.tags || []).join("，")} hint="前台显示为 #标签" onChange={(value) => update((draft) => { draft.profile.pageCopy!.postList![index].tags = value.split(/[,，]/).map((tag) => tag.trim()).filter(Boolean); })} />
                          <Field label="日期（可留空）" value={item.date || ""} placeholder="例如 2026-10" onChange={(value) => update((draft) => { draft.profile.pageCopy!.postList![index].date = value; })} />
                        </div>
                      </section>
                      <section className="adm-panel mt-3 p-3">
                        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                          <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">图片 / IMAGES · {images.length} 张 · 第一张为封面</p>
                          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-zinc-800 px-2.5 py-1.5 text-xs text-zinc-300 hover:border-zinc-600">
                            <ImagePlus size={15} /> 上传图片（可多选）
                            <input className="hidden" type="file" accept="image/*" multiple onChange={(event) => void uploadPostImages(event, item.id)} />
                          </label>
                        </div>
                        {images.length > 0 ? (
                          <div className="grid grid-cols-3 gap-2 sm:grid-cols-4">
                            {images.map((url, i) => (
                              <div key={`${url}-${i}`} className="group relative aspect-[3/4] overflow-hidden rounded-lg border border-zinc-800 bg-black">
                                <img src={url} alt={`第 ${i + 1} 张`} className="h-full w-full object-cover" />
                                {i === 0 && <span className="absolute left-1.5 top-1.5 rounded bg-emerald-500/90 px-1.5 py-0.5 text-[10px] text-black">封面</span>}
                                <div className="absolute inset-x-0 bottom-0 flex justify-between gap-1 bg-black/70 p-1">
                                  <button type="button" aria-label="前移" disabled={i === 0} onClick={() => setImages(moveItem(images, i, i - 1))} className="rounded p-1 text-zinc-200 hover:bg-white/10 disabled:opacity-30"><ArrowUp size={13} className="-rotate-90" /></button>
                                  <button type="button" aria-label="删除这张" onClick={() => { setImages(images.filter((_, j) => j !== i)); void deleteMedia([url], false); }} className="rounded p-1 text-zinc-200 hover:bg-red-500/30 hover:text-red-200"><Trash2 size={13} /></button>
                                  <button type="button" aria-label="后移" disabled={i === images.length - 1} onClick={() => setImages(moveItem(images, i, i + 1))} className="rounded p-1 text-zinc-200 hover:bg-white/10 disabled:opacity-30"><ArrowUp size={13} className="rotate-90" /></button>
                                </div>
                              </div>
                            ))}
                          </div>
                        ) : (
                          <p className="rounded-lg border border-dashed border-zinc-800 px-3 py-6 text-center text-xs text-zinc-500">还没有图片。建议 3:4 竖图，前台卡片按这个比例裁切。</p>
                        )}
                      </section>
                    </EditorModal>
                  );
                })()}
              </>
            )}

            {active === "slides" && (
              <>
                <Section
                  title="演示文稿"
                  description="上传 .pptx，前台在浏览器里直接演示（翻页 / 全屏 / 自动播放）。复杂动画、切换效果和部分字体无法还原，上传后点「预览」确认效果。"
                  action={
                    <button
                      type="button"
                      onClick={() => {
                        const id = uid("slides");
                        addDraft(
                          (draft) => { draft.profile.pageCopy!.slideList = [...(draft.profile.pageCopy!.slideList || []), { ...emptySlideDeck, id }]; },
                          () => setExpandedSlideId(id),
                        );
                      }}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 px-2.5 py-1.5 text-sm text-zinc-300 hover:border-zinc-600"
                    >
                      <Plus size={15} /> 新增演示
                    </button>
                  }
                >
                  <p className="text-sm leading-5 text-zinc-400">共 {(data.profile.pageCopy?.slideList || []).length} 份。没有上传文件的条目前台不显示。</p>
                </Section>
                {(data.profile.pageCopy?.slideList || []).map((item: SlideDeck, index: number) => {
                  const key = rowKey(item.id, index);
                  const isActive = expandedSlideId === key;
                  return (
                    <EditorRow key={key} expanded={isActive}>
                      <ListSummaryRow
                        thumb={item.cover}
                        title={item.title || "演示 " + (index + 1)}
                        meta={item.fileUrl ? (item.fileName || "已上传") : "未上传文件"}
                        preview={item.description}
                        active={isActive}
                        onEdit={() => setExpandedSlideId(key)}
                        canMoveUp={index > 0}
                        canMoveDown={index < (data.profile.pageCopy?.slideList || []).length - 1}
                        onMove={(delta) => void mutateAndSave((draft) => { draft.profile.pageCopy!.slideList = moveItem(draft.profile.pageCopy!.slideList || [], index, index + delta); }, undefined, { collapse: false })}
                        onDelete={() => {
                          void removeAndSave(
                            (draft) => { draft.profile.pageCopy!.slideList = (draft.profile.pageCopy!.slideList || []).filter((_, i) => i !== index); },
                            [item.fileUrl, item.cover || ""],
                            () => setExpandedSlideId(null),
                          );
                        }}
                      />
                    </EditorRow>
                  );
                })}

                {slideModalIndex >= 0 && (() => {
                  const item = (data.profile.pageCopy?.slideList || [])[slideModalIndex];
                  const index = slideModalIndex;
                  return (
                    <EditorModal title={"演示 " + (index + 1)} onClose={() => setExpandedSlideId(null)} footer={<SaveCurrentButton label="保存全部" />}>
                      <section className="adm-panel space-y-3 p-3">
                        <Field label="标题" value={item.title} onChange={(value) => update((draft) => { draft.profile.pageCopy!.slideList![index].title = value; })} />
                        <Field label="简介（可留空）" value={item.description || ""} textarea onChange={(value) => update((draft) => { draft.profile.pageCopy!.slideList![index].description = value; })} />
                        <Field label="日期（可留空）" value={item.date || ""} placeholder="例如 2026-10" onChange={(value) => update((draft) => { draft.profile.pageCopy!.slideList![index].date = value; })} />
                      </section>
                      <section className="adm-panel mt-3 space-y-3 p-3">
                        <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">文件 / PPTX</p>
                        <div className="flex flex-wrap items-center gap-2">
                          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-zinc-800 px-2.5 py-2 text-xs text-zinc-300 hover:border-zinc-600">
                            <FileText size={15} /> {item.fileUrl ? "替换 .pptx" : "上传 .pptx"}
                            <input className="hidden" type="file" accept={pptxAccept} onChange={(event) => void uploadSlideFile(event, item.id)} />
                          </label>
                          {item.fileUrl ? (
                            <>
                              <span className="max-w-[260px] truncate text-xs text-zinc-400" title={item.fileName}>{item.fileName || item.fileUrl}</span>
                              <button type="button" onClick={() => setPreviewDeck(item)} className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-500/40 px-2.5 py-2 text-xs text-emerald-300 hover:border-emerald-400">
                                <Play size={14} /> 预览演示
                              </button>
                            </>
                          ) : (
                            <span className="text-xs text-zinc-500">只支持 .pptx；旧版 .ppt 请先另存为 .pptx。</span>
                          )}
                        </div>
                      </section>
                      <section className="adm-panel mt-3 space-y-3 p-3">
                        <p className="font-mono text-[10px] uppercase tracking-widest text-zinc-500">封面 / COVER（可留空）</p>
                        <div className="flex flex-wrap items-center gap-2">
                          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-zinc-800 px-2.5 py-2 text-xs text-zinc-300 hover:border-zinc-600">
                            <ImagePlus size={15} /> 上传封面
                            <input className="hidden" type="file" accept="image/*" onChange={(event) => upload(event, (url) => {
                              const previous = item.cover;
                              if (previous) void deleteMedia([previous], false);
                              update((draft) => { draft.profile.pageCopy!.slideList![index].cover = url; });
                            })} />
                          </label>
                          {item.cover ? (
                            <button type="button" onClick={() => { const previous = item.cover; update((draft) => { draft.profile.pageCopy!.slideList![index].cover = ""; }); if (previous) void deleteMedia([previous], false); }} className="rounded-lg border border-zinc-800 px-2.5 py-2 text-xs text-zinc-400 hover:border-red-500 hover:text-red-300">移除封面</button>
                          ) : <span className="text-xs text-zinc-500">建议 16:9，可以直接用第一页的截图。</span>}
                        </div>
                        {item.cover ? <img src={item.cover} alt="封面预览" className="aspect-video w-full rounded-lg bg-black object-cover" /> : null}
                      </section>
                    </EditorModal>
                  );
                })()}
                {previewDeck ? <SlidePlayer deck={previewDeck} onClose={() => setPreviewDeck(null)} /> : null}
              </>
            )}

            {active === "music" && (
              <>
                <Section
                  title="首页音乐播放器"
                  description="前台首页背景音乐列表，可导入歌词并逐字校准时间轴。"
                  action={
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      {/* 多选模式总开关。与作品列表同一位置、同一外观 —— 后台里
                          「批量操作」在哪个栏目都是同一个地方，不用重新找。 */}
                      <button
                        type="button"
                        aria-pressed={musicSelecting}
                        onClick={() => (musicSelecting ? exitMusicSelecting() : setMusicSelecting(true))}
                        className={
                          "inline-flex items-center gap-1.5 rounded-lg border px-2.5 py-1.5 text-sm transition-colors duration-200 " +
                          (musicSelecting
                            ? "border-emerald-400 text-emerald-200"
                            : "border-zinc-800 text-zinc-300 hover:border-zinc-600")
                        }
                      >
                        <ListChecks size={15} /> {musicSelecting ? "退出批量" : "批量操作"}
                      </button>
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
                  }
                >
                  <p className="text-sm leading-5 text-zinc-400">
                    共 {(data.musicTracks || []).length} 首音乐。封面、标题、作者和歌词都在弹窗里改。
                  </p>

                  {/* 自动播放开关。宝的要求：这里是「开关」不是「勾选框」，而且必须
                      待在音乐模块里 —— 它管的是播放器行为，放在「站点资料」里没人找得到。
                      用 VisibilitySwitch 保证与其它开关同一套外观与「改完即存」行为。 */}
                  <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
                    <VisibilitySwitch
                      name="自动播放"
                      hint="开启后按音乐提前入场时间尝试播放第一首；浏览器可能要求先有交互。"
                      checked={Boolean(data.profile.musicAutoplay)}
                      disabled={saving}
                      onChange={(next) => {
                        void mutateAndSave(
                          (draft) => { draft.profile.musicAutoplay = next; },
                          undefined,
                          { collapse: false },
                        );
                      }}
                    />
                    <label className="flex items-center gap-2 text-sm text-zinc-300">
                      音乐提前入场时间
                      <input
                        key={data.profile.pageCopy?.musicLeadSeconds ?? 3}
                        type="number"
                        min={0}
                        max={15}
                        step={0.5}
                        defaultValue={data.profile.pageCopy?.musicLeadSeconds ?? 3}
                        disabled={saving}
                        className="w-20 rounded-lg border border-zinc-700 bg-zinc-950 px-2 py-1.5 text-zinc-100"
                        onBlur={(event) => {
                          const value = event.currentTarget.valueAsNumber;
                          const next = Number.isFinite(value) ? Math.min(15, Math.max(0, value)) : 3;
                          event.currentTarget.value = String(next);
                          if (next === (data.profile.pageCopy?.musicLeadSeconds ?? 3)) return;
                          void mutateAndSave((draft) => {
                            draft.profile.pageCopy = { ...draft.profile.pageCopy, musicLeadSeconds: next };
                          }, undefined, { collapse: false });
                        }}
                      />
                      秒
                    </label>
                  </div>
                </Section>

                {/* 批量操作条。只在多选模式下出现；删除不可撤销，所以两段式确认。 */}
                {musicSelecting && (
                  <div className="adm-note adm-note-info flex flex-wrap items-center gap-x-3 gap-y-2 text-xs text-emerald-100/85">
                    <LogOut size={14} className="shrink-0" />
                    <span>
                      已选 <span className="font-semibold text-white">{musicSelectedIndexes.length}</span> / {(data.musicTracks || []).length} 首
                      <span className="text-emerald-200/70">（批量模式下拖动排序已暂停）</span>
                    </span>
                    <button
                      type="button"
                      onClick={() => setMusicSelectedKeys((data.musicTracks || []).map((track, index) => musicKeyOf(track, index)))}
                      className="rounded-lg border border-zinc-800 px-2 py-1 text-xs text-zinc-300 hover:border-zinc-600"
                    >
                      全选
                    </button>
                    <button
                      type="button"
                      onClick={() => setMusicSelectedKeys([])}
                      disabled={musicSelectedKeys.length === 0}
                      className="rounded-lg border border-zinc-800 px-2 py-1 text-xs text-zinc-300 hover:border-zinc-600 disabled:opacity-50"
                    >
                      清空
                    </button>

                    <span className="ml-auto flex flex-wrap items-center gap-2">
                      {musicBulkConfirm === "delete" ? (
                        <>
                          <span className="text-[11px] leading-5 text-rose-200">
                            删除 {musicSelectedIndexes.length} 首及其音频、封面，不可恢复。
                          </span>
                          <button
                            type="button"
                            onClick={() => { void runMusicBulkDelete(); }}
                            disabled={musicBulkBusy}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-rose-400 px-2.5 py-1.5 text-xs font-semibold text-zinc-950 hover:bg-rose-300 disabled:opacity-60"
                          >
                            {musicBulkBusy ? <Loader2 className="animate-spin" size={12} /> : <Trash2 size={12} />} 确认删除
                          </button>
                          <button
                            type="button"
                            onClick={() => setMusicBulkConfirm(null)}
                            disabled={musicBulkBusy}
                            className="rounded-lg border border-zinc-800 px-2.5 py-1.5 text-xs text-zinc-300 disabled:opacity-60"
                          >
                            取消
                          </button>
                        </>
                      ) : (
                        <button
                          type="button"
                          onClick={() => setMusicBulkConfirm("delete")}
                          disabled={musicSelectedIndexes.length === 0}
                          className="inline-flex items-center gap-1.5 rounded-lg border border-zinc-800 px-2.5 py-1.5 text-xs text-zinc-300 hover:border-rose-500/60 hover:text-rose-200 disabled:opacity-50"
                        >
                          <Trash2 size={12} /> 批量删除
                        </button>
                      )}
                    </span>
                  </div>
                )}

                {(data.musicTracks || []).map((track: MusicTrack, index: number) => {
                  const active = expandedMusicId === rowKey(track.id, index);
                  const key = musicKeyOf(track, index);
                  const checked = musicSelectedKeys.includes(key);
                  return (
                    <EditorRow key={key} expanded={active} tone={checked ? "emerald" : undefined}>
                      {/* 拖动落点提示：一条细线，不做整行位移（否则会视觉抖动）。 */}
                      {musicDragOver === index && musicDragFrom !== null && musicDragFrom !== index && (
                        <div className="h-0.5 w-full rounded bg-emerald-400/70" aria-hidden="true" />
                      )}
                      <div
                        className="flex items-stretch"
                        // 拖动只在「没进多选」时开放：两套交互叠一起会互相抢点击。
                        {...(!musicSelecting
                          ? {
                              draggable: true,
                              onDragStart: (event: React.DragEvent) => {
                                setMusicDragFrom(index);
                                event.dataTransfer.effectAllowed = "move";
                                // Firefox 不给 dataTransfer 赋值就不触发 drag。
                                event.dataTransfer.setData("text/plain", key);
                              },
                              onDragOver: (event: React.DragEvent) => {
                                event.preventDefault();
                                event.dataTransfer.dropEffect = "move";
                                setMusicDragOver(index);
                              },
                              onDragLeave: () => setMusicDragOver((prev) => (prev === index ? null : prev)),
                              onDrop: (event: React.DragEvent) => {
                                event.preventDefault();
                                const from = musicDragFrom;
                                setMusicDragFrom(null);
                                setMusicDragOver(null);
                                if (from !== null && from !== index) void reorderMusic(from, index);
                              },
                              onDragEnd: () => { setMusicDragFrom(null); setMusicDragOver(null); },
                            }
                          : {})}
                      >
                        {!musicSelecting && (
                          <span
                            aria-hidden="true"
                            title="按住拖动可调整前台顺序"
                            className="flex w-6 shrink-0 cursor-grab items-center justify-center text-zinc-600 active:cursor-grabbing"
                          >
                            <GripVertical size={15} />
                          </span>
                        )}
                        {musicSelecting && (
                          <label className="flex w-8 shrink-0 cursor-pointer items-center justify-center">
                            <input
                              type="checkbox"
                              checked={checked}
                              onChange={() => setMusicSelectedKeys((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]))}
                              aria-label={"选择「" + (track.title || "未命名音乐") + "」"}
                              className="h-4 w-4 accent-emerald-300"
                            />
                          </label>
                        )}
                        <div className="min-w-0 flex-1">
                          <MusicSummary
                            track={track}
                            index={index}
                            active={active}
                            selecting={musicSelecting}
                            checked={checked}
                            onEdit={() => {
                              // 多选模式下点击语义换成「勾选」，否则点哪儿都开弹窗、永远选不上。
                              if (musicSelecting) {
                                setMusicSelectedKeys((prev) => (prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key]));
                                return;
                              }
                              setExpandedMusicId(key);
                            }}
                            onDelete={() => {
                              void removeAndSave(
                                (draft) => { draft.musicTracks = (draft.musicTracks || []).filter((_, i) => i !== index); },
                                [track.audioUrl, track.coverUrl],
                                () => setExpandedMusicId(null),
                              );
                            }}
                          />
                        </div>
                      </div>
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
                          <VisibilitySwitch name="纯音乐" checked={isInstrumental(track.lyrics)} disabled={saving || Boolean(asrLoadingTrackId)} onChange={(next) => update((draft) => { draft.musicTracks![index].lyrics = setInstrumental(track.lyrics, next); })} />
                        </div>
                        {!isInstrumental(track.lyrics) && <div className="mt-3">
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
                        }
                        <div className="mt-3 flex flex-wrap gap-3">
                          <label className="flex w-full cursor-pointer items-center justify-center gap-2 rounded-lg border border-dashed border-zinc-600 p-5 text-sm text-zinc-300 hover:border-emerald-400 focus-within:border-emerald-400"
                            onDragOver={(event) => { event.preventDefault(); event.stopPropagation(); event.currentTarget.style.borderColor = "#62f5ce"; }}
                            onDragLeave={(event) => { event.currentTarget.style.borderColor = ""; }}
                            onDrop={(event) => {
                              event.preventDefault(); event.stopPropagation(); event.currentTarget.style.borderColor = "";
                              if (uploadProgress || saving) return;
                              const files = Array.from(event.dataTransfer.files) as File[];
                              if (files.length !== 1) { setStatus("每次请选择一个音频文件。"); return; }
                              void uploadMusicAudio(files[0], track.id);
                            }}>
                            <Music size={18} /> {uploadProgress ? "音频上传中" : "拖拽音频到此处，或点击上传"}
                            <input className="sr-only" type="file" accept="audio/*,.mp3,.wav,.flac,.m4a,.aac,.ogg,.opus,.wma,.aiff" disabled={Boolean(uploadProgress) || saving} onChange={(event) => {
                              const file = event.currentTarget.files?.[0];
                              event.currentTarget.value = "";
                              if (file) void uploadMusicAudio(file, track.id);
                            }} />
                          </label>
                          <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-zinc-800 px-2.5 py-1.5 text-xs text-zinc-300 hover:border-zinc-600">
                            <ImagePlus size={16} /> 上传封面
                            <input className="hidden" type="file" accept="image/*" onChange={(event) => upload(event, (url) => {
                              void deleteMedia([track.coverUrl]);
                              update((draft) => { draft.musicTracks![index].coverUrl = url; });
                            })} />
                          </label>
                          {!isInstrumental(track.lyrics) && <label className="inline-flex cursor-pointer items-center gap-1.5 rounded-lg border border-zinc-800 px-2.5 py-1.5 text-xs text-zinc-300 hover:border-zinc-600">
                            <FileText size={16} /> 上传歌词/字幕
                            <input className="hidden" type="file" accept=".lrc,.srt,.vtt,.txt,text/plain,text/vtt,application/x-subrip" onChange={(event) => importLyrics(event, (text) => update((draft) => { draft.musicTracks![index].lyrics = text; }))} />
                          </label>}
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
                description="访客每次打开网站都会记一条：IP 与归属地、设备、浏览器、停留时长和按钮点击。爬虫、扫描器直接不记录；本机和内网访问会记下来但默认隐藏。"
              >
                {visitsError && (
                  <p className="adm-note adm-note-warn text-xs leading-5 text-amber-200" role="alert">{visitsError}</p>
                )}

                {analytics && !analytics.configured && (
                  <p className="adm-note adm-note-warn text-xs leading-5 text-amber-200">
                    {analytics.reason === "tables-missing" ? (
                      <>
                        检测数据表还没建。把项目里的{" "}
                        <span className="font-mono text-amber-100">supabase/schema.sql</span> 整份粘进
                        Supabase 控制台的 SQL Editor 跑一次（脚本是幂等的，重复跑没有副作用），然后点「刷新」。
                      </>
                    ) : (
                      <>
                        当前没有连接 Supabase（后台正跑在「本地 JSON 模式」），访问记录无处可写。配好
                        SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 并重启服务后，这里才会开始积累数据。
                      </>
                    )}
                  </p>
                )}

                {analytics?.configured && analytics.schemaReady === false && (
                  <p className="adm-note adm-note-warn text-xs leading-5 text-amber-200">
                    数据库还是旧版结构：统计暂时在服务端临时计算（最多取最近 1 万条）。在 Supabase SQL Editor 重新执行一次
                    <span className="mx-1 font-mono text-amber-100">supabase/schema.sql</span>
                    即可给历史记录打上「真人 / 爬虫 / 本机」标签并改用数据库统计，现有数据不会被删除。
                  </p>
                )}

                <div className="flex flex-wrap items-center gap-2">
                  <div className="inline-flex rounded-lg border border-zinc-800 p-0.5" role="group" aria-label="时间范围">
                    {([["today", "今天"], ["7d", "7 天"], ["30d", "30 天"], ["all", "全部"]] as const).map(([key, label]) => (
                      <button
                        key={key}
                        type="button"
                        aria-pressed={analyticsRange === key}
                        onClick={() => { setAnalyticsRange(key); setVisitorPageNo(1); }}
                        className={`min-h-8 rounded-md px-2.5 text-xs transition-colors duration-200 ${analyticsRange === key ? "bg-white/[0.1] text-white" : "text-zinc-400 hover:text-white"}`}
                      >
                        {label}
                      </button>
                    ))}
                  </div>

                  <label className="inline-flex min-h-9 cursor-pointer items-center gap-2 rounded-lg border border-zinc-800 px-3 text-xs text-zinc-300">
                    <input
                      type="checkbox"
                      checked={analyticsHumanOnly}
                      onChange={(event) => { setAnalyticsHumanOnly(event.target.checked); setVisitorPageNo(1); }}
                      className="accent-emerald-400"
                    />
                    只看真人
                  </label>

                  <button
                    type="button"
                    onClick={() => { void loadVisits(); if (analyticsView === "chats") void loadAssistantKeywords(); }}
                    disabled={visitsLoading}
                    className="inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-zinc-800 px-3 text-sm text-zinc-300 transition-colors duration-200 hover:border-zinc-600 hover:text-white disabled:opacity-60"
                  >
                    {visitsLoading ? <Loader2 className="animate-spin" size={14} /> : <RefreshCw size={14} />}
                    {visitsLoading ? "读取中…" : "刷新"}
                  </button>

                  {visitsConfirm === "all" ? (
                    <>
                      <span className="text-xs leading-5 text-amber-200">
                        确定清空全部访问记录（包括隐藏的爬虫和本机记录）？备注与屏蔽标记也会一起删掉，且无法恢复。
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
                      disabled={!analytics?.configured}
                      className="ml-auto inline-flex min-h-9 items-center gap-1.5 rounded-lg border border-zinc-800 px-3 text-sm text-zinc-400 transition-colors duration-200 hover:border-rose-500/60 hover:text-rose-200 disabled:opacity-40"
                    >
                      <Trash2 size={14} /> 清空全部
                    </button>
                  )}
                </div>

                {visitsLoading && !analytics && (
                  <p className="flex items-center gap-2 text-sm text-zinc-400">
                    <Loader2 className="animate-spin text-emerald-300" size={14} /> 正在读取访问记录…
                  </p>
                )}

                {analytics?.configured && analytics.summary && (() => {
                  const s = analytics.summary;
                  const hidden = s.hiddenBots + s.hiddenLocal;
                  return (
                    <>
                      {/* 统计数字用 .adm-panel 当底：只有色调、没有边框，不会在卡片里再套一层框。 */}
                      <div className="grid grid-cols-2 gap-2 lg:grid-cols-4">
                        {[
                          { label: analyticsHumanOnly ? "真人访客" : "访客", value: String(s.visitors), hint: "同一浏览器算一位" },
                          { label: "访问次数", value: String(s.visits), hint: "每次打开页面算一次" },
                          { label: "平均停留", value: s.avgDwellMs ? formatVisitDuration(s.avgDwellMs) : "—", hint: `${Math.round(s.bounceRate * 100)}% 的访问不足 10 秒` },
                          { label: "按钮点击", value: String(s.clicks), hint: "前台按钮与链接" },
                        ].map((stat) => (
                          <div key={stat.label} className="adm-panel px-3 py-2.5">
                            <p className="text-xs text-zinc-400">{stat.label}</p>
                            <p className="mt-0.5 text-2xl font-semibold tabular-nums text-white">{stat.value}</p>
                            <p className="mt-0.5 text-[10px] leading-4 text-zinc-500">{stat.hint}</p>
                          </div>
                        ))}
                      </div>

                      {analyticsHumanOnly && hidden > 0 && (
                        <p className="text-[11px] leading-5 text-zinc-500">
                          已隐藏 {s.hiddenBots} 次爬虫 / 扫描器访问和 {s.hiddenLocal} 次本机 / 内网访问。
                          <button type="button" onClick={() => setAnalyticsHumanOnly(false)} className="ml-1 text-emerald-300 underline-offset-2 hover:underline">
                            显示全部
                          </button>
                        </p>
                      )}

                      <div className="flex gap-1 border-b border-zinc-800" role="tablist" aria-label="站点检测视图">
                        {([["overview", "概览"], ["visitors", `访客${visitorPage ? ` · ${visitorPage.total}` : ""}`], ["chats", "聊天会话"], ["clicks", "行为"]] as const).map(([key, label]) => (
                          <button
                            key={key}
                            type="button"
                            role="tab"
                            aria-selected={analyticsView === key}
                            onClick={() => setAnalyticsView(key)}
                            className={`-mb-px border-b-2 px-3 py-2 text-sm transition-colors duration-200 ${analyticsView === key ? "border-emerald-400 text-white" : "border-transparent text-zinc-400 hover:text-white"}`}
                          >
                            {label}
                          </button>
                        ))}
                      </div>

                      {analyticsView === "overview" && (
                        <div className="space-y-3">
                          <div className="adm-panel px-3 py-3">
                            <p className="mb-2 text-xs font-semibold text-zinc-300">{analytics.bucket === "hour" ? "今日每小时访问" : "每日访问"}</p>
                            <VisitTrendChart series={s.series} bucket={analytics.bucket || "day"} range={analyticsRange} />
                          </div>
                          <div className="grid gap-2 md:grid-cols-2 xl:grid-cols-3">
                            <TopList title="地区" items={s.cities} total={s.visits} />
                            <TopList title="国家" items={s.countries} total={s.visits} />
                            <TopList title="来源" items={s.referrers} total={s.visits} />
                            <TopList title="设备" items={s.devices} total={s.visits} />
                            <TopList title="系统 / 浏览器" items={s.browsers} total={s.visits} />
                          </div>
                        </div>
                      )}

                      {analyticsView === "clicks" && (
                        <div className="space-y-2">
                          <div className="flex flex-wrap items-end justify-between gap-2">
                            <div>
                              <h3 className="flex items-center gap-2 text-sm font-semibold text-white">
                                <MousePointerClick size={15} className="text-emerald-300" /> 按钮点击排行
                              </h3>
                              <p className="mt-1 text-[11px] leading-4 text-zinc-500">
                                自动采集前台按钮和链接；独立访客按同一浏览器去重，不采集输入内容。
                              </p>
                            </div>
                            <span className="text-[11px] text-zinc-500">共 {analytics.clickStats?.length ?? 0} 个控件</span>
                          </div>
                          {!analytics.eventsConfigured ? (
                            <p className="adm-note adm-note-warn text-xs leading-5 text-amber-200">
                              点击事件表尚未建立。请在 Supabase SQL Editor 重新执行一次
                              <span className="mx-1 font-mono text-amber-100">supabase/schema.sql</span>，现有访问数据不会被覆盖。
                            </p>
                          ) : !analytics.clickStats?.length ? (
                            <p className="adm-note text-xs leading-5 text-zinc-400">这段时间还没有按钮点击记录。</p>
                          ) : (
                            <div className="overflow-hidden rounded-lg border border-zinc-800/80">
                              <div className="grid grid-cols-[minmax(0,1fr)_72px_72px] gap-2 border-b border-zinc-800 bg-white/[0.03] px-3 py-2 text-[10px] uppercase text-zinc-500 md:grid-cols-[minmax(0,1.4fr)_minmax(100px,.5fr)_80px_80px_140px]">
                                <span>控件</span><span className="hidden md:block">页面</span><span className="text-right">点击</span><span className="text-right">访客</span><span className="hidden text-right md:block">最近点击</span>
                              </div>
                              {analytics.clickStats.map((item) => (
                                <div key={`${item.path}:${item.element_key}`} className="grid grid-cols-[minmax(0,1fr)_72px_72px] gap-2 border-b border-zinc-900 px-3 py-2.5 last:border-b-0 md:grid-cols-[minmax(0,1.4fr)_minmax(100px,.5fr)_80px_80px_140px] md:items-center">
                                  <div className="min-w-0">
                                    <p className="truncate text-xs font-medium text-zinc-200" title={item.element_label}>{item.element_label}</p>
                                    <p className="mt-0.5 truncate font-mono text-[10px] text-zinc-600" title={item.element_key}>{item.element_key}</p>
                                  </div>
                                  <span className="hidden truncate font-mono text-[10px] text-zinc-500 md:block">{item.path}</span>
                                  <span className="text-right text-sm font-semibold tabular-nums text-emerald-300">{item.clicks}</span>
                                  <span className="text-right text-xs tabular-nums text-zinc-300">{item.unique_visitors}</span>
                                  <span className="hidden text-right text-[10px] text-zinc-500 md:block">{formatVisitTime(item.last_clicked_at)}</span>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </>
                  );
                })()}

                {analytics?.configured && analyticsView === "visitors" && visitorPage && (() => {
                  const pages = Math.max(1, Math.ceil(visitorPage.total / visitorPage.pageSize));
                  return (
                    <div className="space-y-2">
                      <form
                        className="flex flex-wrap items-center gap-2"
                        onSubmit={(event) => { event.preventDefault(); setVisitorPageNo(1); setVisitorQuery(visitorQueryDraft.trim()); }}
                      >
                        <input
                          value={visitorQueryDraft}
                          onChange={(event) => setVisitorQueryDraft(event.target.value)}
                          placeholder="搜索备注、IP、城市或访客 ID"
                          aria-label="搜索访客"
                          className={`${inputBaseClass} min-h-9 min-w-[220px] flex-1 px-3 py-1.5 text-sm`}
                        />
                        <button type="submit" className="inline-flex min-h-9 items-center rounded-lg border border-zinc-800 px-3 text-sm text-zinc-300 hover:border-zinc-600 hover:text-white">
                          搜索
                        </button>
                        {visitorQuery && (
                          <button
                            type="button"
                            onClick={() => { setVisitorQueryDraft(""); setVisitorQuery(""); setVisitorPageNo(1); }}
                            className="text-xs text-zinc-400 hover:text-white"
                          >
                            清除
                          </button>
                        )}
                        <span className="ml-auto text-[11px] text-zinc-500">按最近访问排序 · 共 {visitorPage.total} 位</span>
                      </form>

                      {visitorPage.visitors.length === 0 && (
                        <p className="adm-note text-xs leading-5 text-zinc-400">
                          {visitorQuery ? "没有匹配的访客。" : "这段时间没有访客。换个时间范围，或取消「只看真人」看看被隐藏的记录。"}
                        </p>
                      )}

                      {visitorPage.visitors.map((visitor) => {
                        const expanded = visitsExpandedKey === visitor.visitor_key;
                        const busy = visitsBusyKey === visitor.visitor_key;
                        const records = visitorVisits?.key === visitor.visitor_key ? visitorVisits : null;
                        return (
                          // 被标记为屏蔽的访客用琥珀色条目，跟正常访客的绿色区分开。
                          <EditorRow key={visitor.visitor_key} expanded={expanded} tone={visitor.blocked ? "amber" : "emerald"}>
                            <button
                              type="button"
                              onClick={() => { void openVisitor(visitor); }}
                              className="grid w-full gap-1 p-2.5 text-left outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-400/40 md:grid-cols-[1fr_auto] md:items-center"
                            >
                              <div className="min-w-0">
                                <div className="flex flex-wrap items-center gap-2">
                                  <span className="truncate text-sm font-semibold text-white">
                                    {visitor.label || `访客 ${shortVisitorKey(visitor.visitor_key)}`}
                                  </span>
                                  <TrafficTag type={visitor.traffic_type} />
                                  {visitor.blocked && (
                                    <span className="inline-flex items-center gap-1 rounded bg-amber-400/10 px-1.5 py-0.5 text-[10px] text-amber-300">
                                      <Ban size={10} /> 已屏蔽标记
                                    </span>
                                  )}
                                  <span className="inline-flex items-center gap-1 text-[11px] text-zinc-400">
                                    <MapPin size={11} /> {visitorLocation(visitor)}
                                  </span>
                                  <span className="inline-flex items-center gap-1 text-[11px] text-zinc-400">
                                    <MonitorSmartphone size={11} /> {visitorDevice(visitor)}
                                  </span>
                                </div>
                                <p className="mt-1 text-xs leading-5 text-zinc-500">
                                  <span className="tabular-nums text-zinc-300">{visitor.visit_count}</span> 次访问
                                  · 累计停留 <span className="text-zinc-300">{formatVisitDuration(visitor.total_dwell_ms)}</span>
                                  · {visitor.last_ip || "IP 未知"}
                                </p>
                              </div>
                              <span className="text-xs text-zinc-400 md:text-right" title={formatVisitTime(visitor.last_seen)}>
                                {formatVisitAgo(visitor.last_seen)}
                              </span>
                            </button>

                            {expanded && (
                              <EditorModal
                                title={visitor.label || "访客 " + shortVisitorKey(visitor.visitor_key)}
                                onClose={() => { setVisitsExpandedKey(null); setVisitsConfirm(null); setVisitorVisits(null); }}
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

                                <p className="font-mono text-[10px] leading-5 text-zinc-600">
                                  {visitor.visitor_key} · 首次 {formatVisitTime(visitor.first_seen)} · 最近 {formatVisitTime(visitor.last_seen)}
                                </p>

                                <div className="space-y-2">
                                  <p className="text-xs font-semibold text-zinc-300">
                                    访问记录 · {records?.loading ? "读取中…" : `最近 ${records?.visits.length ?? 0} 条`}
                                  </p>
                                  {records?.loading ? (
                                    <p className="flex items-center gap-2 text-xs text-zinc-500"><Loader2 className="animate-spin" size={12} /> 正在读取…</p>
                                  ) : !records?.visits.length ? (
                                    <p className="text-xs leading-5 text-zinc-500">没有读到这位访客的访问明细。</p>
                                  ) : (
                                    records.visits.map((visit) => <VisitTimelineItem key={visit.id} visit={visit} />)
                                  )}
                                </div>
                              </EditorModal>
                            )}
                          </EditorRow>
                        );
                      })}

                      {pages > 1 && (
                        <nav className="flex items-center justify-center gap-2 pt-1" aria-label="访客分页">
                          <button
                            type="button"
                            disabled={visitorPageNo <= 1}
                            onClick={() => setVisitorPageNo((n) => Math.max(1, n - 1))}
                            className="inline-flex min-h-8 items-center rounded-lg border border-zinc-800 px-3 text-xs text-zinc-300 hover:border-zinc-600 disabled:opacity-40"
                          >
                            上一页
                          </button>
                          <span className="text-xs tabular-nums text-zinc-400">{visitorPageNo} / {pages}</span>
                          <button
                            type="button"
                            disabled={visitorPageNo >= pages}
                            onClick={() => setVisitorPageNo((n) => Math.min(pages, n + 1))}
                            className="inline-flex min-h-8 items-center rounded-lg border border-zinc-800 px-3 text-xs text-zinc-300 hover:border-zinc-600 disabled:opacity-40"
                          >
                            下一页
                          </button>
                        </nav>
                      )}
                    </div>
                  );
                })()}

                {analytics?.configured && analyticsView === "chats" && visitorPage && (() => {
                  const pages = Math.max(1, Math.ceil(visitorPage.total / visitorPage.pageSize));
                  const chats = visitorConversations?.key === chatVisitorKey ? visitorConversations : null;
                  const selectedVisitor = visitorPage.visitors.find((visitor) => visitor.visitor_key === chatVisitorKey);
                  const maxKeywordCount = Math.max(1, ...(assistantKeywords?.keywords.map((keyword) => keyword.n) || [1]));
                  const keywordColors = ["text-emerald-200", "text-cyan-200", "text-zinc-100", "text-emerald-400", "text-sky-300"];
                  return (
                    <div className="space-y-4">
                      <section className="adm-panel px-4 py-4" aria-labelledby="assistant-keywords-title">
                        <div className="flex flex-wrap items-start justify-between gap-3">
                          <div>
                            <h3 id="assistant-keywords-title" className="flex items-center gap-2 text-sm font-semibold text-white">
                              <MessagesSquare size={15} className="text-emerald-300" /> 聊天关键词
                            </h3>
                            <p className="mt-1 text-[11px] leading-4 text-zinc-500">只统计访客提问，已过滤常见语气词和无意义词。</p>
                          </div>
                          <span className="text-[11px] tabular-nums text-zinc-500">
                            {assistantKeywordsLoading ? "统计中…" : `${assistantKeywords?.visitorCount ?? 0} 位访客 · ${assistantKeywords?.messageCount ?? 0} 条提问`}
                          </span>
                        </div>
                        {assistantKeywordsLoading ? (
                          <p className="mt-5 flex items-center gap-2 text-xs text-zinc-500"><Loader2 className="animate-spin" size={12} /> 正在生成词云…</p>
                        ) : !assistantKeywords?.configured ? (
                          <p className="mt-4 text-xs leading-5 text-zinc-500">聊天记忆表尚未启用，执行新版数据库脚本后会开始统计。</p>
                        ) : !assistantKeywords.keywords.length ? (
                          <p className="mt-4 text-xs leading-5 text-zinc-500">当前时间范围内还没有足够的聊天关键词。</p>
                        ) : (
                          <div className="mt-4 flex min-h-28 flex-wrap content-center items-baseline justify-center gap-x-5 gap-y-3 px-3 py-2 text-center">
                            {assistantKeywords.keywords.map((keyword, index) => (
                              <span
                                key={keyword.label}
                                title={`${keyword.label} · ${keyword.n} 次`}
                                className={`cursor-default font-semibold leading-none transition-opacity hover:opacity-70 ${keywordColors[index % keywordColors.length]}`}
                                style={{ fontSize: `${13 + Math.round((keyword.n / maxKeywordCount) * 18)}px` }}
                              >
                                {keyword.label}
                              </span>
                            ))}
                          </div>
                        )}
                      </section>

                      <form
                        className="flex flex-wrap items-center gap-2"
                        onSubmit={(event) => { event.preventDefault(); setVisitorPageNo(1); setVisitorQuery(visitorQueryDraft.trim()); }}
                      >
                        <input
                          value={visitorQueryDraft}
                          onChange={(event) => setVisitorQueryDraft(event.target.value)}
                          placeholder="搜索要查看会话的访客"
                          aria-label="搜索聊天访客"
                          className={`${inputBaseClass} min-h-9 min-w-[220px] flex-1 px-3 py-1.5 text-sm`}
                        />
                        <button type="submit" className="inline-flex min-h-9 items-center rounded-lg border border-zinc-800 px-3 text-sm text-zinc-300 hover:border-zinc-600 hover:text-white">搜索</button>
                        {visitorQuery && (
                          <button type="button" onClick={() => { setVisitorQueryDraft(""); setVisitorQuery(""); setVisitorPageNo(1); }} className="text-xs text-zinc-400 hover:text-white">清除</button>
                        )}
                      </form>

                      <div className="grid min-h-[420px] overflow-hidden rounded-lg border border-zinc-800/80 lg:grid-cols-[280px_minmax(0,1fr)]">
                        <aside className="border-b border-zinc-800/80 bg-black/10 lg:border-b-0 lg:border-r" aria-label="聊天访客列表">
                          <div className="border-b border-zinc-800/80 px-3 py-2.5 text-[11px] text-zinc-500">选择访客 · 共 {visitorPage.total} 位</div>
                          <div className="max-h-[560px] overflow-y-auto">
                            {visitorPage.visitors.map((visitor) => {
                              const selected = chatVisitorKey === visitor.visitor_key;
                              return (
                                <button
                                  key={visitor.visitor_key}
                                  type="button"
                                  onClick={() => { void openVisitorChats(visitor); }}
                                  aria-pressed={selected}
                                  className={`block w-full border-b border-zinc-900 px-3 py-3 text-left outline-none transition-colors focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-400/40 ${selected ? "bg-emerald-400/[0.08]" : "hover:bg-white/[0.03]"}`}
                                >
                                  <span className="flex items-center justify-between gap-2">
                                    <strong className={`truncate text-xs font-medium ${selected ? "text-emerald-200" : "text-zinc-200"}`}>
                                      {visitor.label || `访客 ${shortVisitorKey(visitor.visitor_key)}`}
                                    </strong>
                                    <time className="shrink-0 text-[9px] text-zinc-600">{formatVisitAgo(visitor.last_seen)}</time>
                                  </span>
                                  <span className="mt-1 block truncate text-[10px] text-zinc-500">{visitorLocation(visitor)} · {visitorDevice(visitor)}</span>
                                </button>
                              );
                            })}
                            {!visitorPage.visitors.length && <p className="px-3 py-5 text-xs text-zinc-500">没有匹配的访客。</p>}
                          </div>
                          {pages > 1 && (
                            <div className="flex items-center justify-between gap-2 border-t border-zinc-800/80 px-3 py-2">
                              <button type="button" disabled={visitorPageNo <= 1} onClick={() => setVisitorPageNo((n) => Math.max(1, n - 1))} className="text-xs text-zinc-400 hover:text-white disabled:opacity-30">上一页</button>
                              <span className="text-[10px] tabular-nums text-zinc-600">{visitorPageNo} / {pages}</span>
                              <button type="button" disabled={visitorPageNo >= pages} onClick={() => setVisitorPageNo((n) => Math.min(pages, n + 1))} className="text-xs text-zinc-400 hover:text-white disabled:opacity-30">下一页</button>
                            </div>
                          )}
                        </aside>

                        <section className="min-w-0 px-4 py-4" aria-label="聊天会话内容">
                          {!chatVisitorKey ? (
                            <div className="grid min-h-[360px] place-items-center text-center">
                              <div>
                                <MessagesSquare className="mx-auto text-zinc-700" size={28} />
                                <p className="mt-3 text-sm text-zinc-400">从左侧选择一位访客</p>
                                <p className="mt-1 text-[11px] text-zinc-600">会话和消息将在这里单独显示。</p>
                              </div>
                            </div>
                          ) : (
                            <div className="space-y-3">
                              <div className="flex flex-wrap items-end justify-between gap-2 border-b border-zinc-800/80 pb-3">
                                <div>
                                  <h3 className="text-sm font-semibold text-white">{selectedVisitor?.label || `访客 ${shortVisitorKey(chatVisitorKey)}`}</h3>
                                  <p className="mt-1 font-mono text-[10px] text-zinc-600">{chatVisitorKey}</p>
                                </div>
                                <span className="text-[11px] text-zinc-500">{chats?.loading ? "读取中…" : `${chats?.conversations.length ?? 0} 个会话`}</span>
                              </div>
                              {chats?.loading ? (
                                <p className="flex items-center gap-2 py-4 text-xs text-zinc-500"><Loader2 className="animate-spin" size={12} /> 正在读取聊天会话…</p>
                              ) : !chats?.conversations.length ? (
                                <p className="py-4 text-xs leading-5 text-zinc-500">这位访客还没有留下聊天会话。</p>
                              ) : (
                                <div className="divide-y divide-zinc-800/80 border-y border-zinc-800/80">
                                  {chats.conversations.map((conversation) => {
                                    const opened = expandedConversationId === conversation.id;
                                    const messages = conversationMessages[conversation.id];
                                    const loadingMessages = conversationLoadingId === conversation.id;
                                    return (
                                      <div key={conversation.id}>
                                        <button type="button" onClick={() => { void toggleConversation(chatVisitorKey, conversation.id); }} className="grid w-full grid-cols-[auto_1fr_auto] items-center gap-2 px-1 py-3 text-left outline-none transition-colors hover:bg-zinc-900/60 focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-emerald-400/40">
                                          {opened ? <ChevronDown size={14} className="text-emerald-300" /> : <ChevronRight size={14} className="text-zinc-500" />}
                                          <span className="min-w-0">
                                            <strong className="block truncate text-xs font-medium text-zinc-200">{conversation.name || "未命名会话"}</strong>
                                            <span className="mt-0.5 block font-mono text-[10px] text-zinc-600">{conversation.exchangeCount == null ? "Dify 会话" : `${conversation.exchangeCount} 轮问答`} · {conversation.id.slice(0, 8)}</span>
                                          </span>
                                          <time className="text-[10px] text-zinc-500" title={formatVisitTime(conversation.updatedAt)}>{formatVisitAgo(conversation.updatedAt)}</time>
                                        </button>
                                        {opened && (
                                          <div className="space-y-2 border-t border-zinc-800/60 bg-black/15 px-3 py-3">
                                            {loadingMessages ? (
                                              <p className="flex items-center gap-2 text-xs text-zinc-500"><Loader2 className="animate-spin" size={12} /> 正在读取消息…</p>
                                            ) : !messages?.length ? (
                                              <p className="text-xs text-zinc-500">没有读到这段会话的消息。</p>
                                            ) : messages.map((message) => (
                                              <div key={message.id} className={`flex ${message.role === "user" ? "justify-end" : "justify-start"}`}>
                                                <div className={`max-w-[88%] px-3 py-2 text-xs leading-5 ${message.role === "user" ? "rounded-lg bg-emerald-300/12 text-emerald-50" : "border-l-2 border-emerald-400/45 bg-zinc-900/55 text-zinc-300"}`}>
                                                  <p className="mb-1 text-[10px] font-medium text-zinc-500">{message.role === "user" ? "访客" : "小柴"}</p>
                                                  <p className="whitespace-pre-wrap break-words">{message.content}</p>
                                                  {message.createdAt && <time className="mt-1 block text-[9px] text-zinc-600">{formatVisitTime(message.createdAt)}</time>}
                                                </div>
                                              </div>
                                            ))}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              )}
                            </div>
                          )}
                        </section>
                      </div>
                    </div>
                  );
                })()}
              </Section>
            )}

          </div>
        </div>
      </div>

    </main>
  );
}
