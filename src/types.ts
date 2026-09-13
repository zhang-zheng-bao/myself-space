export interface Profile {
  name: string;
  avatar: string;
  tagline: string;
  intro: string;
  quote: string;
  resumePdfUrl?: string;
  musicAutoplay?: boolean;
  pageCopy?: {
    resume?: string;
    works?: string;
    aiZone?: string;
    gallery?: string;
    treasures?: string;
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
  };
}

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
  gallery: "“横看成岭侧成峰，远近高低各不同。”截图留住侧影。",
  treasures: "“此情可待成追忆，只是当时已惘然。”珍藏美好，岁月留香。",
  contact: "“海内存知己，天涯若比邻。”愿在此处相逢。",
} satisfies NonNullable<Profile["pageCopy"]>;

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
  musicTracks?: MusicTrack[];
  contact?: ContactInfo;
}
