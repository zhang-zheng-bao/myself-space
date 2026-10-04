export interface Profile {
  name: string;
  avatar: string;
  tagline: string;
  intro: string;
  quote: string;
  resumePdfUrl?: string;
  musicAutoplay?: boolean;
  pageCopy?: {
    musicLeadSeconds?: number;
    resume?: string;
    works?: string;
    aiZone?: string;
    gallery?: string;
    treasures?: string;
    poems?: string;
    contact?: string;
    /**
     * 旧版的两份固定简历。保留是为了兼容线上已有数据；新数据请用 resumeProfiles。
     *
     * 前台的回退条件是「resumeProfiles **这个键不存在**」（= 后台从来没配过动态列表）。
     * 注意不要写成「过滤后数组为空就回退」：那样管理员把岗位逐个隐藏/删空之后，
     * 旧岗位会自己冒出来，等于后台的开关失效。键一旦存在（哪怕是空数组），
     * 前台就完全以后台为准。
     */
    resumePdfs?: {
      productManager?: string;
      newMedia?: string;
    };
    /**
     * 后台可自由增删的简历岗位列表（替代写死的两份简历）。
     *
     * 为什么不塞进 resumePdfs：服务端 normalizePageCopy 会重建 resumePdfs 这个对象，
     * 只保留 productManager / newMedia 两个键，放进去会被静默丢掉。
     */
    resumeProfiles?: ResumeProfile[];
    /**
     * 前台是否展示「AI 专区」栏目（由管理员后台的开关控制）。
     * 约定同 treasuresVisible：只有显式写入 false 才隐藏，缺省一律视为展示。
     */
    aiZoneVisible?: boolean;
    /**
     * AI 专区作品列表。结构与 works 完全一致，因此前台可以直接复用同一套卡片渲染。
     * 存在 pageCopy 这个 JSON 列里，避免为它新开一张 Supabase 表。
     */
    aiWorks?: Work[];
    /**
     * 「诗与惆怅」栏目的诗。和 aiWorks 一样存在 pageCopy 这个 JSON 列里，不另开表 ——
     * 诗只有文字、没有媒体要签名，塞进 JSON 最省事，也省掉用户手工执行一次建表 SQL。
     * normalizePageCopy 是「展开保留全部键」的处理方式，所以这个新键能原样往返。
     *
     * 注意和上面的 `poems?: string` 不是一回事：那个是栏目标题下面那句页首文案，
     * 这里是诗本身。两个都叫 poems 会撞名（同名不同类型直接编译不过），
     * 所以文案留在 poems、内容叫 poemList。
     */
    poemList?: Poem[];
    floatingSentences?: FloatingSentencesConfig;
    /**
     * 前台是否展示「我的珍藏」栏目（由管理员后台的开关控制）。
     *
     * 约定：只有显式写入 `false` 才隐藏；缺省（undefined）一律视为展示。
     * 这样老数据不需要迁移，也不会因为字段缺失而把栏目误隐藏。
     *
     * 存放在 pageCopy 里而不是新开数据库列，是为了复用已有的 page_copy JSON 列，
     * 避免一次 Supabase schema 变更（服务端 normalizePageCopy 是保留
     * 全部键的展开式处理，新键可以原样往返）。
     */
    treasuresVisible?: boolean;
    /**
     * 前台栏目的展示顺序。存的是栏目的 key（见 sectionKeys）。
     *
     * 缺省 = 用 sectionKeys 的固有顺序。读取时会把「数组里没提到的 key」按固有顺序
     * 补在后面，所以这个数组即使残缺、过期、或者混进了不认识的 key，前台也不会
     * 丢栏目 —— 顶多顺序不完美。后台每次移动都会写一份完整数组。
     */
    sectionOrder?: string[];
    /**
     * 每个前台栏目是否展示，形如 { works: false }。
     *
     * 约定同 aiZoneVisible / treasuresVisible：只有显式 false 才隐藏，缺省视为展示。
     * 读取优先级：sectionVisible[key] -> 旧键（aiZoneVisible / treasuresVisible）-> 展示。
     * 保留旧键是为了兼容已上线的数据，后台写入时会同时更新两边。
     */
    sectionVisible?: Record<string, boolean>;
    /**
     * 是否隐藏首页左栏的**个人头像**。
     *
     * 约定同 sectionVisible / treasuresVisible：只有显式 `false` 才隐藏，
     * 缺省（undefined）一律视为展示 —— 老数据不用迁移。
     *
     * 注意命名是 `hide*` 而不是 `avatarVisible`：宝的原话是「不展示头像的开关」，
     * 后台那个 checkbox 勾上 = 隐藏。字段名跟「勾上」这个动作同向，
     * 免得后台和前台之间要做一次 `!value` 的反转（那种地方最容易写反）。
     */
    hideAvatar?: boolean;
    /** 首页「关于我」下方三项数据标签，可在后台站点资料中编辑。 */
    homeStats?: {
      works?: Partial<HomeStatCopy>;
      plays?: Partial<HomeStatCopy>;
      ai?: Partial<HomeStatCopy>;
    };
  };
}

export interface HomeStatCopy {
  value: string;
  label: string;
  detail: string;
}

export const defaultHomeStats = {
  works: { value: "10+", label: "作品", detail: "多平台内容创作" },
  plays: { value: "100W+", label: "播放", detail: "全网作品累计播放量" },
  ai: { value: "6项", label: "AI技能", detail: "熟练使用主流AI工具" },
} satisfies Record<"works" | "plays" | "ai", HomeStatCopy>;

/**
 * 各栏目「说明文字」的默认文案。
 *
 * 前后台共用这一份：前台渲染时用它兜底，后台编辑表单也用它铺底。
 * 之前 App.tsx 与 AdminApp.tsx 各自写了一份完全相同的字面量，
 * 改文案只改一边就会让前后台对不上 —— 所以收拢到这里，只留一个来源。
 *
 * 用 `satisfies` 而不是类型标注：标注会把 6 个键都放宽成 `string | undefined`，
 * 而 `App.tsx` 里它是默认参数值（`description = defaultPageCopy.gallery`），需要窄类型。
 */
export const defaultPageCopy = {
  resume: "“纸上得来终觉浅，绝知此事要躬行。”一页履历，照见实践。",
  works: "“文章合为时而著，歌诗合为事而作。”作品因想法而生。",
  aiZone: "“苟日新，日日新，又日新。”与 AI 共作，另辟一片试验田。",
  gallery: "“操千曲而后晓声，观千剑而后识器。”所学皆可施展。",
  treasures: "“此情可待成追忆，只是当时已惘然。”珍藏美好，岁月留香。",
  poems: "“文章本天成，妙手偶得之。”偶得的句子，记在这里。",
  contact: "“海内存知己，天涯若比邻。”愿在此处相逢。",
} satisfies NonNullable<Profile["pageCopy"]>;

/* ---------------------------------------------------------------------------
 * 前台栏目清单（前后台共用）
 *
 * 这是「模块」这个概念的唯一来源：前台用它排导航、按它取页面说明文案；后台的
 * 「模块管理」用它渲染每一行（开关 / 上下移 / 新增入口 / 页首文案）。两边都从
 * 这里读，就不会出现「后台加了一个模块、前台不认识」的情况。
 * ------------------------------------------------------------------------ */

export type SectionKey = "intro" | "resume" | "works" | "ai" | "prospects" | "treasures" | "poems" | "contact";

/** 栏目 key 的固有顺序（sectionOrder 缺省时就用它）。 */
export const sectionKeys: SectionKey[] = ["intro", "resume", "works", "ai", "prospects", "treasures", "poems", "contact"];

export interface SectionMeta {
  key: SectionKey;
  /** 前台导航上的名字，也是后台「模块管理」里的名字。 */
  label: string;
  /** 导航上的英文小字。 */
  sub: string;
  /** 对应 pageCopy 里的「页首诗句 / 说明」字段；没有就代表这个栏目不吃文案。 */
  copyKey?: keyof typeof defaultPageCopy;
  /** 有值 = 这个模块能「新增条目」，后台那一行会出现新增按钮。 */
  content?: "resume" | "work" | "aiWork" | "gallery" | "treasure" | "poem";
  /**
   * 旧版的独立开关键。改开关时两边一起写，老数据照样读得懂；
   * 将来数据都迁移过一轮后可以再删。
   */
  legacyVisibleKey?: "aiZoneVisible" | "treasuresVisible";
  /** 一句话说明这个模块装的是什么，后台「模块管理」里显示在名字下面。 */
  hint: string;
}

export const sectionCatalog: SectionMeta[] = [
  { key: "intro", label: "自我介绍", sub: "BIOGRAPHY", hint: "首屏：头像、一句话签名、闲言碎语，以及个人经历时间线。" },
  { key: "resume", label: "个人简历", sub: "CURRICULUM", copyKey: "resume", content: "resume", hint: "按岗位分标签展示简历 PDF；前台按后台顺序生成选项卡。" },
  { key: "works", label: "作品展示", sub: "PORTFOLIO", copyKey: "works", content: "work", hint: "主要作品列表，按分类筛选，点击弹出详情。" },
  { key: "ai", label: "AI专区", sub: "AI ZONE", copyKey: "aiZone", content: "aiWork", legacyVisibleKey: "aiZoneVisible", hint: "与 AI 共作的作品，渲染方式与「作品展示」一致。" },
  { key: "prospects", label: "应用技能", sub: "SKILLS", copyKey: "gallery", content: "gallery", hint: "成果截图墙，点击放大看细节。" },
  { key: "treasures", label: "我的珍藏", sub: "TREASURES", copyKey: "treasures", content: "treasure", legacyVisibleKey: "treasuresVisible", hint: "一些舍不得删的图。" },
  { key: "poems", label: "诗与惆怅", sub: "POEMS", copyKey: "poems", content: "poem", hint: "自己写下的诗与断句，按后台顺序铺成一首一张卡。" },
  { key: "contact", label: "联系方式", sub: "CONTACT", copyKey: "contact", hint: "微信 / QQ / 邮箱 / GitHub，留空的条目不显示。" },
];

export function sectionMeta(key: string): SectionMeta | undefined {
  return sectionCatalog.find((item) => item.key === key);
}

/**
 * 把 sectionOrder 归一化成一份完整、去重、只含已知 key 的顺序数组。
 *
 * 容错点：数据可能来自老版本（没有这个键）、被手工改坏（重复、错字、残缺）。
 * 任何异常都只能影响顺序，绝不能把栏目弄丢 —— 所以最后一定把没提到的 key
 * 按固有顺序补在尾部。
 */
export function normalizeSectionOrder(order?: string[]): SectionKey[] {
  const seen = new Set<string>();
  const out: SectionKey[] = [];
  for (const raw of Array.isArray(order) ? order : []) {
    const key = String(raw);
    if (!sectionKeys.includes(key as SectionKey) || seen.has(key)) continue;
    seen.add(key);
    out.push(key as SectionKey);
  }
  for (const key of sectionKeys) if (!seen.has(key)) out.push(key);
  return out;
}

/**
 * 某个前台栏目是否展示。
 *
 * 读取优先级：sectionVisible[key] → 旧键（aiZoneVisible / treasuresVisible）→ 展示。
 * 缺省一律视为展示 —— 老数据没有这些键，不能因此把栏目误隐藏。
 */
export function isSectionVisible(pageCopy: Profile["pageCopy"], key: SectionKey): boolean {
  const explicit = pageCopy?.sectionVisible?.[key];
  if (typeof explicit === "boolean") return explicit;
  const legacyKey = sectionMeta(key)?.legacyVisibleKey;
  if (legacyKey && typeof pageCopy?.[legacyKey] === "boolean") return pageCopy[legacyKey] === true;
  return true;
}

export interface Experience {
  id: string;
  period: string;
  role: string;
  company: string;
  desc: string;
}

export interface Prospects {
  title: string;
  content: string;
  points: string[];
}

export interface WorkLink {
  label: string;
  url: string;
  kind?: "link" | "attachment";
  fileName?: string;
}

/**
 * 一条简历展示项。后台可以随意增删，前台按「岗位」分标签展示。
 */
export interface ResumeProfile {
  id: string;
  /** 岗位名称，作为前台标签的主标题，例如「产品经理」。 */
  position: string;
  /** 自定义副标题，留空时前台用「PDF RESUME」占位。 */
  name?: string;
  /** 简历 PDF 地址。 */
  url: string;
  /** 是否在前台展示。只有显式 false 才隐藏，缺省视为展示。 */
  visible?: boolean;
}

export interface Work {
  id: string;
  category: "operation" | "app" | "prototype" | "video" | "poetry" | string;
  title: string;
  description: string;
  icon?: string;
  badgeText?: string;
  images: string[];
  videoUrl?: string;
  links?: WorkLink[];
  tags: string[];
}

export interface ContactInfo {
  wechat: string;
  qq: string;
  email: string;
  phone?: string;
  github?: string;
}

export interface GalleryItem {
  id: string;
  category: string;
  title: string;
  description: string;
  imageUrl: string;
}

export interface TreasureItem {
  id: string;
  imageUrl: string;
}

/**
 * 一首诗 / 一段断句。
 *
 * `text` 是唯一必填的正文字段，用换行分段 —— 前台按行渲染，并复用「闲诗」
 * 那套按行宽自动排版的逻辑（`detectPoetryFormat`），所以五言/七言/词/现代
 * 都能排得像样，不需要作者手动加空格。
 *
 * 和作品一样带封面：诗也可以配一张图，前台排在正文上方。
 */
export interface Poem {
  id: string;
  /** 题目。可以留空 —— 只有断句没题目的时候，前台就不渲染标题那一行。 */
  title: string;
  /** 正文。换行 = 分段，前台的排版逻辑会按字数判断体裁。 */
  text: string;
  /** 封面图地址。和作品封面同一套上传/签名处理；留空则只显示文字。 */
  imageUrl?: string;
  /** 落款：写下的时间、地点、或给谁的。留空则不显示。 */
  note?: string;
}

export interface FloatingSentencesConfig {
  enabled?: boolean;
  speed?: number;
  count?: number;
  sentences?: string[];
  borderEnabled?: boolean;
  global?: boolean;
  pages?: Record<string, { enabled?: boolean; sentences?: string[]; count?: number; borderEnabled?: boolean }>;
}

export interface MusicTrack {
  id: string;
  title: string;
  artist: string;
  audioUrl: string;
  coverUrl: string;
  lyrics?: string;
}

export interface PortfolioData {
  profile: Profile;
  experiences: Experience[];
  prospects: Prospects;
  works: Work[];
  gallery?: GalleryItem[];
  treasures?: TreasureItem[];
  poems?: Poem[];
  musicTracks?: MusicTrack[];
  contact?: ContactInfo;
}

/* ---------------------------------------------------------------------------
 * 站点检测（访问记录）
 *
 * 这两个类型只是 Supabase 两张表的镜像，字段名与列名逐一对应 —— 接口是
 * select("*") 直出的，不做驼峰转换，所以这里保持 snake_case，不「美化」它。
 * 站点内容走 PortfolioData，访问记录走这两个，两者互不相干：访问记录不参与
 * 「编辑-保存」流程，是只读+少量标注的独立数据集。
 * ------------------------------------------------------------------------ */

/** 一次页面加载 = 一条访问记录。 */
export interface VisitRecord {
  id: number;
  visitor_key: string;
  session_id?: string;
  ip?: string;
  ip_geo?: Record<string, unknown> | null;
  country?: string;
  region?: string;
  city?: string;
  isp?: string;
  device_type?: string;
  browser?: string;
  browser_version?: string;
  os?: string;
  os_version?: string;
  engine?: string;
  user_agent?: string;
  path?: string;
  referrer?: string;
  screen?: string;
  viewport?: string;
  pixel_ratio?: number | null;
  color_depth?: number | null;
  timezone?: string;
  timezone_offset?: number | null;
  language?: string;
  languages?: string;
  platform?: string;
  cpu_cores?: number | null;
  device_memory?: number | null;
  touch_points?: number | null;
  gpu?: string;
  cookie_enabled?: boolean | null;
  dnt?: string;
  fingerprint?: string;
  dwell_ms?: number | null;
  traffic_type?: TrafficType;
  created_at: string;
}

/** 一位访客（同一浏览器）的聚合行，visitor_key 是主键。 */
export interface VisitorRecord {
  visitor_key: string;
  first_seen: string;
  last_seen: string;
  visit_count: number;
  page_views: number;
  total_dwell_ms: number;
  label?: string;
  blocked?: boolean;
  last_ip?: string;
  last_country?: string;
  last_region?: string;
  last_city?: string;
  last_isp?: string;
  last_device?: string;
  last_browser?: string;
  last_os?: string;
  traffic_type?: TrafficType;
}

/** Aggregated click count returned by the admin analytics endpoint. */
export interface ClickStat {
  element_key: string;
  element_label: string;
  element_type: string;
  path: string;
  clicks: number;
  unique_visitors: number;
  last_clicked_at: string;
}

/** 流量分类：真人 / 爬虫扫描器 / 本机内网。 */
export type TrafficType = "human" | "bot" | "local";

export type AnalyticsRange = "today" | "7d" | "30d" | "all";

export interface AnalyticsCount {
  label: string;
  n: number;
}

/** GET /api/admin/analytics/summary 的响应。 */
export interface AnalyticsSummaryPayload {
  configured: boolean;
  /** configured 为 false 时的原因："supabase-missing" | "tables-missing" */
  reason?: string;
  /** 数据库是否已跑新版 schema.sql（有 traffic_type 与统计函数） */
  schemaReady?: boolean;
  eventsConfigured?: boolean;
  range?: AnalyticsRange;
  humanOnly?: boolean;
  bucket?: "hour" | "day";
  summary?: {
    visits: number;
    visitors: number;
    avgDwellMs: number;
    bounceRate: number;
    clicks: number;
    hiddenBots: number;
    hiddenLocal: number;
    series: Array<{ bucket: string; visits: number; visitors: number }>;
    countries: AnalyticsCount[];
    cities: AnalyticsCount[];
    devices: AnalyticsCount[];
    browsers: AnalyticsCount[];
    referrers: AnalyticsCount[];
  };
  clickStats?: ClickStat[];
}

/** GET /api/admin/analytics/visitors 的响应。 */
export interface AnalyticsVisitorsPayload {
  visitors: VisitorRecord[];
  total: number;
  page: number;
  pageSize: number;
}
