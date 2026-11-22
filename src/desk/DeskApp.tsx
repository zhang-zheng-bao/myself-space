import ThemePicker from "../components/ThemePicker";
import { dismissBootLoader } from "../themeTransition";
import WeChatComposer, { type LocalMessage } from './WeChatComposer';
import { Fragment, createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { Video, Settings, Image, Bookmark, Volume2, Maximize, Minimize, Aperture, ArrowLeft, ChevronLeft, ChevronRight, CirclePlus, Compass, Ellipsis, ExternalLink, MessageCircle, Mic, Newspaper, Pause, Play, Search, SkipForward, Smile, Tag, User, UserPlus, Users, X } from "lucide-react";
import { isSectionVisible, type PortfolioData, type ResumeProfile, type SectionKey, type SlideDeck, type Work } from "../types";
import { defaultCaseWorks } from "../caseStudies";
import AssistantVideoCall from "../components/AssistantVideoCall";
import SlidePlayer from "../components/SlidePlayer";
import { getVisitorKey } from "../tracking";
import { createDeskScene, type DeskHotspot, type DeskScene } from "./deskScene";
import { appIconUrl, homeApps, homeSize, homeScreenUrl, wallpaperUrl, type HomeDevice } from "./deviceAppearance";
import "./desk.css";
import wechatOwnerAvatar from "./assets/wechat-owner-avatar.jpg";
import { toolUrl } from "../toolNavigation";
import { universityBooks, readUniversityBooks } from "./universityBooks";

/**
 * 3D 书桌版主页。场景本身见 deskScene.ts；这里负责数据、悬停提示、
 * 以及点开物件后从它在屏幕上的位置「放大」出来的设备界面。
 */

type Device = "laptop" | "tablet" | "phone" | "notebook" | "speaker";

const LABELS: Record<DeskHotspot, string> = {
  poster: "相框",
  laptop: "笔记本电脑 · 桌面",
  tablet: "平板 · 相册、视频、作品",
  phone: "手机 · 微信聊天",
  notebook: "笔记本 · 诗与随笔",
  lamp: "台灯 · 查看触摸开关",
  mug: "咖啡",
  speaker: "小音箱 · 听歌",
  socket: "插线板 · 总电源",
  keyboard: "键盘 · 俯视查看",
  mouse: "鼠标 · 俯视查看",
  plant: "绿植",
  bookshelf: "书架 · 大学四年",
  scissors: "剪刀 · 万创核心",
};

const emptyData: PortfolioData = {
  profile: { name: "", avatar: "", tagline: "", intro: "", quote: "", pageCopy: {} },
  experiences: [],
  prospects: { title: "", content: "", points: [] },
  works: [],
  gallery: [],
  treasures: [],
  musicTracks: [],
  contact: { wechat: "", qq: "", email: "", phone: "", github: "" },
};

const isVideo = (work: Work) => Boolean(work.videoUrl) && !/\.(mp3|wav|m4a|aac|flac|ogg|opus)(?:$|[?#])/i.test(work.videoUrl || "");
const paragraphs = (text = "") => text.split(/\n+/).map(line => line.trim()).filter(Boolean);
const clock = () => new Date().toLocaleTimeString("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false });

/**
 * 和经典版主页用同一套规则：后台隐藏的栏目不出现在书桌上，
 * 案例没配置时用默认案例，简历列表一旦配置过就完全以后台为准。
 */
function visibleData(data: PortfolioData): PortfolioData {
  const pageCopy = data.profile.pageCopy || {};
  const shown = (key: SectionKey) => isSectionVisible(pageCopy, key);
  const legacyPdfs = pageCopy.resumePdfs || {};
  const resumeProfiles: ResumeProfile[] = pageCopy.resumeProfiles
    ? pageCopy.resumeProfiles.filter(item => item?.visible !== false)
    : [
        { id: "productManager", position: "产品经理", name: "PRODUCT MANAGER", url: legacyPdfs.productManager || data.profile.resumePdfUrl || "" },
        { id: "newMedia", position: "新媒体运营", name: "NEW MEDIA OPS", url: legacyPdfs.newMedia || "" },
      ];
  return {
    ...data,
    works: shown("works") ? data.works : [],
    gallery: shown("prospects") ? data.gallery : [],
    treasures: shown("treasures") ? data.treasures : [],
    poems: shown("poems") ? data.poems : [],
    contact: shown("contact") ? data.contact : emptyData.contact,
    profile: {
      ...data.profile,
      pageCopy: {
        ...pageCopy,
        caseWorks: shown("cases") ? pageCopy.caseWorks ?? defaultCaseWorks : [],
        aiWorks: shown("ai") ? pageCopy.aiWorks : [],
        postList: shown("posts") ? pageCopy.postList : [],
        slideList: shown("slides") ? pageCopy.slideList : [],
        poemList: shown("poems") ? pageCopy.poemList : [],
        resumeProfiles: shown("resume") ? resumeProfiles.filter(item => item.url?.trim()) : [],
      },
    },
  };
}

/** 读不到接口时返回 null，调用方保留手上已有的内容。 */
async function loadPortfolio(): Promise<PortfolioData | null> {
  let data: PortfolioData | null = null;
  const controller = new AbortController();
  const timeout = window.setTimeout(() => controller.abort(), 12_000);
  try {
    const response = await fetch("/api/portfolio", { cache: "no-store", signal: controller.signal });
    if (response.ok) data = { ...emptyData, ...(await response.json()) };
  } catch { /* 读不到就保持空状态，各个应用显示空提示 */ } finally {
    window.clearTimeout(timeout);
  }
  return data ? visibleData(data) : null;
}

/* ======================================================================
 * 设备外壳：FLIP 动画，从物件屏幕的位置平滑放大到屏幕中央，关闭时缩回去。
 * ==================================================================== */

const CloseContext = createContext<() => void>(() => {});
/** 手机竖屏放不下电脑和平板的横屏界面：这两样改成竖屏排版的整页面板。 */
const SheetContext = createContext(false);
const narrowPortrait = "(max-width: 720px) and (orientation: portrait)";
function useNarrowPortrait() {
  const [narrow, setNarrow] = useState(() => window.matchMedia(narrowPortrait).matches);
  useEffect(() => {
    const query = window.matchMedia(narrowPortrait);
    const sync = () => setNarrow(query.matches);
    query.addEventListener("change", sync);
    return () => query.removeEventListener("change", sync);
  }, []);
  return narrow;
}
const useCloseDevice = () => useContext(CloseContext);

function flipFrom(origin: DOMRect | null, box: DOMRect) {
  if (!origin || !box.width || !box.height) return "translate3d(0, 48px, 0) scale(.9)";
  const dx = origin.left + origin.width / 2 - (box.left + box.width / 2);
  const dy = origin.top + origin.height / 2 - (box.top + box.height / 2);
  const sx = Math.max(0.03, origin.width / box.width);
  const sy = Math.max(0.03, origin.height / box.height);
  return `translate3d(${dx}px, ${dy}px, 0) scale(${sx}, ${sy})`;
}

function DeviceShell({ kind, origin, onClosed, children, label, scene }: { kind: Device; origin: DOMRect | null; onClosed(): void; children: ReactNode; label: string; scene?: DeskScene | null }) {
  const ref = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<"measure" | "from" | "open" | "leave">("measure");
  const [from, setFrom] = useState("");
  const closedRef = useRef(false);
  const stageRef = useRef<HTMLDivElement>(null);
  const [fullscreen, setFullscreen] = useState(false);
  const [fullscreenError, setFullscreenError] = useState("");
  const narrow = useNarrowPortrait();
  const sheet = narrow && (kind === "laptop" || kind === "tablet");
  // 界面贴在 3D 屏幕上显示；竖屏面板和其他物品走普通的放大动画。
  const isScreen = (kind === "laptop" || kind === "tablet" || kind === "phone") && !sheet;
  useEffect(() => {
    const sync = () => setFullscreen(document.fullscreenElement === stageRef.current);
    document.addEventListener("fullscreenchange", sync);
    return () => { document.removeEventListener("fullscreenchange", sync); };
  }, []);
  const toggleFullscreen = async () => {
    try {
      if (document.fullscreenElement) await document.exitFullscreen();
      else await stageRef.current?.requestFullscreen();
      setFullscreenError("");
    } catch { setFullscreenError("浏览器未允许全屏，请使用浏览器的全屏功能。"); }
  };

  useLayoutEffect(() => {
    if (!ref.current) return;
    if (isScreen && scene) { setPhase("open"); return; }
    setFrom(flipFrom(origin || (sheet && scene ? scene.screenRect(kind as DeskHotspot) : null), ref.current.getBoundingClientRect()));
    setPhase("from");
  }, []);
  useEffect(() => {
    if (phase !== "from") return;
    let second = 0;
    const first = requestAnimationFrame(() => { second = requestAnimationFrame(() => setPhase("open")); });
    return () => { cancelAnimationFrame(first); cancelAnimationFrame(second); };
  }, [phase]);

  useLayoutEffect(() => {
    if (!isScreen || !scene) return;
    if (fullscreen) { if(ref.current) Object.assign(ref.current.style,{width:'',height:'',transform:''}); return; }
    let frame = 0;
    const sync = () => {
      const [width,height] = homeSize[kind as HomeDevice];
      const transform = scene.screenTransform(kind, width, height);
      if (ref.current && transform) {
        Object.assign(ref.current.style,{width:width+'px',height:height+'px',transform});
      }
      frame = requestAnimationFrame(sync);
    };
    sync(); return () => cancelAnimationFrame(frame);
  }, [isScreen, scene, kind, fullscreen]);
  const finish = useCallback(() => {
    if (closedRef.current) return;
    closedRef.current = true;
    onClosed();
  }, [onClosed]);
  const close = useCallback(() => {
    if (document.fullscreenElement === stageRef.current) void document.exitFullscreen().catch(() => {});
    if (isScreen && scene) { finish(); return; }
    setPhase("leave");
  }, [isScreen, scene, finish]);
  useEffect(() => {
    if (phase !== "leave") return;
    const timer = window.setTimeout(finish, 650);
    return () => window.clearTimeout(timer);
  }, [phase, finish]);
  useEffect(() => {
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") close(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [close]);

  const style: CSSProperties = { transform: phase === "open" || phase === "measure" ? undefined : from };
  return (
    <CloseContext.Provider value={close}>
      {!(isScreen && scene) && <div className="desk-backdrop" data-phase={phase} onClick={close} />}
      <div ref={stageRef} className={`desk-stage${isScreen && scene && !fullscreen ? " desk-stage--in-screen" : ""}${sheet ? " desk-stage--sheet" : ""}`} data-phase={phase}>
        <div className="desk-device-tools">
          {isScreen && <button type="button" onClick={toggleFullscreen} aria-label={fullscreen ? "退出全屏" : "全屏显示"} title={fullscreen ? "退出全屏" : "全屏显示"}>{fullscreen ? <Minimize size={18}/> : <Maximize size={18}/>}</button>}
          {fullscreenError && <span role="status">{fullscreenError}</span>}
          <button type="button" onClick={close} aria-label="返回书桌"><X size={20}/></button>
        </div>
        <div
          ref={ref}
          role="dialog"
          aria-modal="true"
          aria-label={label}
          className={`desk-device desk-device--${kind}`}
          data-phase={phase}
          style={style}
          onTransitionEnd={event => { if (event.target === event.currentTarget && event.propertyName === "transform" && phase === "leave") finish(); }}
        >
          <div className="desk-device__content"><SheetContext.Provider value={sheet}>{children}</SheetContext.Provider></div>
        </div>
      </div>
    </CloseContext.Provider>
  );
}

/* ======================================================================
 * 设备里的「应用」：从图标的位置放大打开。
 * ==================================================================== */

type AppIcon = { id: string; label: string; color: string; glyph: string };

function useAppNavigator<T extends string>() {
  const [app, setApp] = useState<T | null>(null);
  const [origin, setOrigin] = useState("50% 50%");
  const open = (id: T, event: ReactMouseEvent<HTMLElement>) => {
    const screen = (event.currentTarget.closest("[data-screen]") as HTMLElement | null)?.getBoundingClientRect();
    const icon = event.currentTarget.getBoundingClientRect();
    if (screen) setOrigin(`${icon.left + icon.width / 2 - screen.left}px ${icon.top + icon.height / 2 - screen.top}px`);
    setApp(id);
  };
  return { app, origin, open, home: () => setApp(null) };
}

function AppGrid({ icons, onOpen }: { icons: AppIcon[]; onOpen(id: string, event: ReactMouseEvent<HTMLElement>): void }) {
  return (
    <div className="desk-appgrid">
      {icons.map(icon => (
        <button key={icon.id} type="button" className="desk-appicon" onClick={event => onOpen(icon.id, event)}>
          <span className="desk-appicon__tile" style={{ background: icon.color }} aria-hidden="true">{icon.glyph}</span>
          <span className="desk-appicon__label">{icon.label}</span>
        </button>
      ))}
    </div>
  );
}

function AppView({ title, origin, onBack, children, tone = "light", action }: { title: string; origin: string; onBack(): void; children: ReactNode; tone?: "light" | "dark"; action?: ReactNode }) {
  return (
    <section className={`desk-app desk-app--${tone}`} style={{ transformOrigin: origin }}>
      <header className="desk-app__bar">
        <button type="button" onClick={onBack} aria-label="返回"><ChevronLeft size={20} />返回</button>
        <strong>{title}</strong>
        <span className="desk-app__action">{action}</span>
      </header>
      <div className="desk-app__body">{children}</div>
    </section>
  );
}

const Img = (props: { src: string; alt: string; className?: string }) => <img {...props} loading="lazy" referrerPolicy="no-referrer" />;

function Empty({ children }: { children: ReactNode }) {
  return <p className="desk-empty">{children}</p>;
}

/* ======================================================================
 * 作品详情（电脑和平板共用）
 * ==================================================================== */

function WorkCards({ works, onPick }: { works: Work[]; onPick(work: Work): void }) {
  if (!works.length) return <Empty>作品还在整理中。</Empty>;
  return (
    <div className="desk-cards">
      {works.map(work => (
        <button key={work.id} type="button" className="desk-card" onClick={() => onPick(work)}>
          <span className="desk-card__cover">
            {work.images?.[0] ? <Img src={work.images[0]} alt="" /> : <span className="desk-card__placeholder">{work.title.slice(0, 2)}</span>}
            {isVideo(work) && <span className="desk-card__play"><Play size={16} /></span>}
          </span>
          <span className="desk-card__title">{work.title}</span>
          {work.tags?.length ? <span className="desk-card__tags">{work.tags.slice(0, 3).join(" · ")}</span> : null}
        </button>
      ))}
    </div>
  );
}

function WorkDetail({ work }: { work: Work }) {
  const [index, setIndex] = useState(0);
  const images = work.images?.filter(Boolean) || [];
  // 后台内容每 30 秒同步一次，COS 签名地址每次都不同；播放中换 src 会从头加载，所以只在换了文件或加载失败后才换新地址。外链视频的查询参数可能就是视频本身，只忽略 COS 签名。
  const videoFile = `${work.id}|${/[?&]q-signature=/.test(work.videoUrl || "") ? work.videoUrl?.split("?")[0] : work.videoUrl}`;
  const video = useRef({ file: videoFile, url: work.videoUrl, failed: false });
  if (video.current.file !== videoFile || (video.current.failed && video.current.url !== work.videoUrl)) video.current = { file: videoFile, url: work.videoUrl, failed: false };
  return (
    <article className="desk-work">
      {isVideo(work) ? (
        <video className="desk-work__media" src={video.current.url} poster={images[0]} controls playsInline onError={() => { video.current.failed = true; }} />
      ) : images.length ? (
        <div className="desk-work__gallery">
          <Img className="desk-work__media" src={images[index]} alt={work.title} />
          {images.length > 1 && <>
            <button type="button" className="desk-work__nav desk-work__nav--prev" aria-label="上一张" onClick={() => setIndex((index + images.length - 1) % images.length)}><ChevronLeft size={18} /></button>
            <button type="button" className="desk-work__nav desk-work__nav--next" aria-label="下一张" onClick={() => setIndex((index + 1) % images.length)}><ChevronRight size={18} /></button>
            <span className="desk-work__count">{index + 1} / {images.length}</span>
          </>}
        </div>
      ) : null}
      <h3>{work.title}</h3>
      {work.tags?.length ? <p className="desk-work__tags">{work.tags.map(tag => <span key={tag}>{tag}</span>)}</p> : null}
      {paragraphs(work.description).map((line, i) => <p key={i}>{line}</p>)}
      {(work.links?.length || work.pageUrl) ? (
        <p className="desk-work__links">
          {work.pageUrl && <a href={work.pageUrl} target="_blank" rel="noreferrer">查看案例 <ExternalLink size={13} /></a>}
          {work.links?.map(link => <a key={link.url} href={link.url} target="_blank" rel="noreferrer">{link.label || "打开链接"} <ExternalLink size={13} /></a>)}
        </p>
      ) : null}
    </article>
  );
}

/* ======================================================================
 * 笔记本电脑：一个桌面窗口，侧栏切换个人信息各部分。
 * ==================================================================== */

function DeviceHome({device,onOpen}: {device:HomeDevice;onOpen(id:string,event:ReactMouseEvent<HTMLElement>):void}) {
  const [time,setTime]=useState(clock);
  useEffect(()=>{const timer=window.setInterval(()=>setTime(clock()),1000);return ()=>window.clearInterval(timer);},[]);
  const [w,h]=homeSize[device];
  const items=[...homeApps[device],...(device==='laptop'?homeApps.laptop.map((a,i)=>({...a,x:920,y:58+i*88,size:46})):[])];
  const sheet=useContext(SheetContext);
  if(sheet) return <div className="desk-sheet-home" style={{backgroundImage:`url("${wallpaperUrl}")`}}>
    <p className="desk-sheet-home__time">{time}</p>
    <p className="desk-sheet-home__hint">点开一个应用看看</p>
    <div className="desk-sheet-home__apps">
      {homeApps[device].map(a=><button key={a.id} type="button" onClick={e=>onOpen(a.id,e)}><img src={appIconUrl(a.id)} alt="" /><span>{a.label}</span></button>)}
    </div>
  </div>;
  return <div className="desk-shared-home" style={{backgroundImage:`url("${homeScreenUrl(device,time)}")`}}>
    {items.map((a,i)=><button key={i} className="desk-home-target" aria-label={a.label} title={a.label} style={{left:`${a.x/w*100}%`,top:`${a.y/h*100}%`,width:`${a.size/w*100}%`,height:`${(a.size+24)/h*100}%`}} onClick={e=>onOpen(a.id,e)}/>)}
    {device==='phone'&&<button className="desk-home-target" aria-label="打开微信聊天" style={{left:'6%',top:'29.77%',width:'88%',height:'10.93%'}} onClick={e=>onOpen('wechat',e)}/>}
  </div>;
}

type LaptopTab = "about" | "experience" | "plan" | "works" | "resume";

function LaptopWindow({ data }: { data: PortfolioData }) {
  const close = useCloseDevice();
  const [tab, setTab] = useState<LaptopTab>("about");
  const [appOpen, setAppOpen] = useState(false);
  const [work, setWork] = useState<Work | null>(null);
  const { profile, experiences, prospects, contact } = data;
  const pageCopy = profile.pageCopy || {};
  const works = useMemo(() => [...data.works, ...(pageCopy.caseWorks || []), ...(pageCopy.aiWorks || [])], [data]);
  const resumes = (pageCopy.resumeProfiles || []).map(item => ({ label: item.position, sub: item.name || "PDF 简历", url: item.url }));
  // 内容续签后，已经点开的作品也换成新地址
  const openWork = work && (works.find(item => item.id === work.id) || work);
  const tabs: [LaptopTab, string][] = [["about", "关于我"], ["experience", "经历"], ["plan", "规划"], ["works", "作品"], ["resume", "简历"]];
  return (
    <div className="desk-desktop" data-screen>
      <DeviceHome device="laptop" onOpen={id=>{setTab(id as LaptopTab);setWork(null);setAppOpen(true);}} />
      {appOpen && <div className="desk-mac">
      <header className="desk-mac__titlebar">
        <span className="desk-mac__lights">
          <button type="button" aria-label="关闭窗口" onClick={() => setAppOpen(false)} className="desk-mac__light desk-mac__light--red" />
          <span className="desk-mac__light desk-mac__light--yellow" />
          <span className="desk-mac__light desk-mac__light--green" />
        </span>
        <strong>{profile.name ? `${profile.name} · 个人档案` : "个人档案"}</strong>
      </header>
      <div className="desk-mac__body">
        <nav className="desk-mac__side" aria-label="个人档案">
          {tabs.map(([id, label]) => (
            <button key={id} type="button" aria-current={tab === id} onClick={() => { setTab(id); setWork(null); }}>{label}</button>
          ))}
        </nav>
        <main className="desk-mac__main" key={`${tab}-${openWork?.id || ""}`}>
          {tab === "about" && (
            <section className="desk-about">
              <div className="desk-about__head">
                {profile.avatar && !pageCopy.hideAvatar ? <Img className="desk-about__avatar" src={profile.avatar} alt={profile.name} /> : null}
                <div>
                  <h2>{profile.name || "你好"}</h2>
                  {profile.tagline && <p className="desk-about__tagline">{profile.tagline}</p>}
                </div>
              </div>
              {paragraphs(profile.intro).map((line, i) => <p key={i}>{line}</p>)}
              {profile.quote && <blockquote>{profile.quote}</blockquote>}
              <ContactList contact={contact} />
            </section>
          )}
          {tab === "experience" && (
            experiences.length ? (
              <ol className="desk-timeline">
                {experiences.map(item => (
                  <li key={item.id}>
                    <span className="desk-timeline__period">{item.period}</span>
                    <strong>{item.role}{item.company ? ` · ${item.company}` : ""}</strong>
                    {paragraphs(item.desc).map((line, i) => <p key={i}>{line}</p>)}
                  </li>
                ))}
              </ol>
            ) : <Empty>经历还没填写。</Empty>
          )}
          {tab === "plan" && (
            prospects.title || prospects.content || prospects.points.length ? (
              <section className="desk-plan">
                {prospects.title && <h2>{prospects.title}</h2>}
                {paragraphs(prospects.content).map((line, i) => <p key={i}>{line}</p>)}
                {prospects.points.length ? <ul>{prospects.points.map(point => <li key={point}>{point}</li>)}</ul> : null}
              </section>
            ) : <Empty>规划还没填写。</Empty>
          )}
          {tab === "works" && (openWork ? (
            <>
              <button type="button" className="desk-back" onClick={() => setWork(null)}><ArrowLeft size={15} />全部作品</button>
              <WorkDetail work={openWork} />
            </>
          ) : <WorkCards works={works} onPick={setWork} />)}
          {tab === "resume" && (
            resumes.length ? (
              <div className="desk-resumes">
                {resumes.map(item => (
                  <a key={item.url} href={item.url} target="_blank" rel="noreferrer" className="desk-resume">
                    <strong>{item.label}</strong><span>{item.sub}</span><ExternalLink size={15} />
                  </a>
                ))}
              </div>
            ) : <Empty>简历还没上传。</Empty>
          )}
        </main>
      </div>
    </div>}
    </div>
  );
}

function ContactList({ contact }: { contact?: PortfolioData["contact"] }) {
  if (!contact) return null;
  const rows = [
    ["微信", contact.wechat, ""],
    ["QQ", contact.qq, ""],
    ["邮箱", contact.email, contact.email ? `mailto:${contact.email}` : ""],
    ["电话", contact.phone || "", contact.phone ? `tel:${contact.phone}` : ""],
    ["GitHub", contact.github || "", contact.github || ""],
  ].filter(([, value]) => value);
  if (!rows.length) return null;
  return (
    <dl className="desk-contact">
      {rows.map(([label, value, href]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{href ? <a href={href} target={href.startsWith("http") ? "_blank" : undefined} rel="noreferrer">{value}</a> : value}</dd>
        </div>
      ))}
    </dl>
  );
}

/* ======================================================================
 * 平板：主屏 + 相册 / 视频 / 作品 / 图文 / 演示。
 * ==================================================================== */

type TabletApp = "photos" | "videos" | "works" | "posts" | "slides";

function TabletScreen({ data }: { data: PortfolioData }) {
  const close = useCloseDevice();
  const nav = useAppNavigator<TabletApp>();
  const [work, setWork] = useState<Work | null>(null);
  const [photo, setPhoto] = useState<number | null>(null);
  const [post, setPost] = useState<number | null>(null);
  const [deck, setDeck] = useState<SlideDeck | null>(null);
  const [time, setTime] = useState(clock);
  useEffect(() => { const timer = window.setInterval(() => setTime(clock()), 20_000); return () => window.clearInterval(timer); }, []);
  const pageCopy = data.profile.pageCopy || {};
  const allWorks = useMemo(() => [...data.works, ...(pageCopy.caseWorks || []), ...(pageCopy.aiWorks || [])], [data]);
  const photos = (pageCopy.albumPhotos || []).filter(item => item.imageUrl).map(item => ({url: item.imageUrl, title: item.title}));
  const videos = (pageCopy.albumVideos || []).filter(isVideo);
  useEffect(() => {
    setPhoto(index => index !== null && index >= photos.length ? null : index);
    setPost(index => index !== null && index >= (pageCopy.postList || []).length ? null : index);
  }, [photos.length, pageCopy.postList?.length]);
  // 内容续签后，已经点开的作品也换成新地址
  const openWork = work && ([...allWorks, ...videos].find(item => item.id === work.id) || null);
  const posts = pageCopy.postList || [];
  const slides = pageCopy.slideList || [];
  const icons: AppIcon[] = [
    { id: "photos", label: "相册", color: "linear-gradient(145deg,#ffd36b,#ff8f3d)", glyph: "✿" },
    { id: "videos", label: "视频", color: "linear-gradient(145deg,#ff7a8a,#e8304f)", glyph: "▶" },
    { id: "works", label: "作品", color: "linear-gradient(145deg,#5fb6ff,#1f6fe5)", glyph: "◆" },
    { id: "posts", label: "图文", color: "linear-gradient(145deg,#6fe39a,#20a85a)", glyph: "❏" },
    { id: "slides", label: "演示", color: "linear-gradient(145deg,#d29bff,#8a3ee6)", glyph: "▤" },
  ];
  const back = () => {
    if (openWork) return setWork(null);
    if (photo !== null) return setPhoto(null);
    if (post !== null) return setPost(null);
    nav.home();
  };
  const titles: Record<TabletApp, string> = { photos: "相册", videos: "视频", works: "作品", posts: "图文", slides: "演示" };
  return (
    <div className="desk-tablet" data-screen>
      {nav.app && <div className="desk-tablet__status"><span>{time}</span><span>Wi-Fi · 86%</span></div>}
      {!nav.app && <DeviceHome device="tablet" onOpen={(id,event)=>nav.open(id as TabletApp,event)} />}
      {nav.app && (
        <AppView title={openWork?.title || titles[nav.app]} origin={nav.origin} onBack={back}>
          {nav.app === "photos" && (photo === null ? (
            photos.length ? (
              <div className="desk-photos">
                {photos.map((item, i) => <button key={item.url} type="button" onClick={() => setPhoto(i)}><Img src={item.url} alt={item.title} /></button>)}
              </div>
            ) : <Empty>相册是空的。</Empty>
          ) : (
            <figure className="desk-lightbox">
              <Img src={photos[photo].url} alt={photos[photo].title} />
              <figcaption>{photos[photo].title}</figcaption>
              <button type="button" className="desk-work__nav desk-work__nav--prev" aria-label="上一张" onClick={() => setPhoto((photo + photos.length - 1) % photos.length)}><ChevronLeft size={18} /></button>
              <button type="button" className="desk-work__nav desk-work__nav--next" aria-label="下一张" onClick={() => setPhoto((photo + 1) % photos.length)}><ChevronRight size={18} /></button>
            </figure>
          ))}
          {nav.app === "videos" && (openWork ? <WorkDetail work={openWork} /> : videos.length ? <WorkCards works={videos} onPick={setWork} /> : <Empty>还没有视频作品。</Empty>)}
          {nav.app === "works" && (openWork ? <WorkDetail work={openWork} /> : <WorkCards works={allWorks} onPick={setWork} />)}
          {nav.app === "posts" && (post === null ? (
            posts.length ? (
              <div className="desk-cards">
                {posts.map((item, i) => (
                  <button key={item.id} type="button" className="desk-card" onClick={() => setPost(i)}>
                    <span className="desk-card__cover">{(item.coverUrl || item.images[0]) ? <Img src={item.coverUrl || item.images[0]} alt="" /> : <span className="desk-card__placeholder">{item.title.slice(0, 2)}</span>}</span>
                    <span className="desk-card__title">{item.title}</span>
                    {item.date && <span className="desk-card__tags">{item.date}</span>}
                  </button>
                ))}
              </div>
            ) : <Empty>还没有图文。</Empty>
          ) : (
            <article className="desk-work">
              {posts[post].images.map(url => <Fragment key={url}><Img className="desk-work__media" src={url} alt="" /></Fragment>)}
              <h3>{posts[post].title}</h3>
              {paragraphs(posts[post].text).map((line, i) => <p key={i}>{line}</p>)}
            </article>
          ))}
          {nav.app === "slides" && (slides.length ? (
            <div className="desk-resumes">
              {slides.map(item => (
                <button key={item.id} type="button" className="desk-resume" onClick={() => setDeck(item)}>
                  <strong>{item.title}</strong><span>{item.description || item.date || "演示文稿"}</span><Play size={15} />
                </button>
              ))}
            </div>
          ) : <Empty>还没有演示文稿。</Empty>)}
        </AppView>
      )}
      {deck && <SlidePlayer deck={slides.find(item => item.id === deck.id) || deck} onClose={() => setDeck(null)} />}
      <button type="button" className="desk-homebar" aria-label="回到主屏" onClick={() => { setWork(null); setPhoto(null); setPost(null); nav.home(); }} />
    </div>
  );
}

/* ======================================================================
 * 手机：主屏 + 微信（和小柴聊天）+ 名片 + 音乐。
 * ==================================================================== */

type PhoneApp = "wechat" | "music";
type ChatMessage = { role: "user" | "assistant"; content: string; error?: boolean };

const CONVERSATION_STORAGE = "myspace_assistant_conversation";
const SHIBA_AVATAR = "/assistant-shiba.webp";
const stripThinking = (text: string) => text.replace(/<think>[\s\S]*?(<\/think>|$)/g, "").replace(/^\s+/, "");
const readConversation = () => { try { return window.localStorage.getItem(CONVERSATION_STORAGE) || ""; } catch { return ""; } };
const writeConversation = (id: string) => {
  try { if (id) window.localStorage.setItem(CONVERSATION_STORAGE, id); else window.localStorage.removeItem(CONVERSATION_STORAGE); } catch { /* 隐私模式下只在内存里续聊 */ }
};

function useShibaChat(active: boolean) {
  const [config, setConfig] = useState<{ enabled: boolean; opening?: string; suggestions?: string[] } | null>(null);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [streaming, setStreaming] = useState(false);
  const conversation = useRef(readConversation());
  const abort = useRef<AbortController | null>(null);
  const loaded = useRef(false);

  useEffect(() => {
    if (!active || loaded.current) return;
    loaded.current = true;
    fetch("/api/assistant/config").then(r => r.json()).then(setConfig).catch(() => setConfig({ enabled: false }));
    const id = conversation.current;
    if (!id) return;
    const params = new URLSearchParams({ conversationId: id, visitorKey: getVisitorKey() });
    fetch(`/api/assistant/messages?${params}`).then(r => r.json()).then((data: { messages?: ChatMessage[]; expired?: boolean }) => {
      if (data.expired) { conversation.current = ""; writeConversation(""); return; }
      if (data.messages?.length) setMessages(current => current.length ? current : data.messages!.filter(m => stripThinking(m.content)));
    }).catch(() => {});
  }, [active]);
  useEffect(() => () => abort.current?.abort(), []);

  const patchLast = (update: (message: ChatMessage) => ChatMessage) =>
    setMessages(current => current.length ? [...current.slice(0, -1), update(current[current.length - 1])] : current);

  const send = async (text: string, retried = false): Promise<void> => {
    const query = text.trim().slice(0, 800);
    if (!query || streaming) return;
    if (!retried) setMessages(current => [...current, { role: "user", content: query }, { role: "assistant", content: "" }]);
    setStreaming(true);
    const controller = new AbortController();
    abort.current = controller;
    try {
      const response = await fetch("/api/assistant/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ query, conversationId: conversation.current, visitorKey: getVisitorKey() }),
        signal: controller.signal,
      });
      if (!response.ok || !response.body) {
        const data = await response.json().catch(() => ({}));
        if (data.expired && !retried) {
          conversation.current = "";
          writeConversation("");
          setStreaming(false);
          return send(query, true);
        }
        patchLast(m => ({ ...m, content: data.error || "小柴暂时开小差了，稍后再试。", error: true }));
        return;
      }
      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      while (true) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const events = buffer.split("\n\n");
        buffer = events.pop() || "";
        for (const block of events) {
          const line = block.split("\n").find(l => l.startsWith("data:"));
          if (!line) continue;
          let event: Record<string, any>;
          try { event = JSON.parse(line.slice(5).trim()); } catch { continue; }
          if (event.conversation_id && event.conversation_id !== conversation.current) {
            conversation.current = event.conversation_id;
            writeConversation(event.conversation_id);
          }
          if ((event.event === "message" || event.event === "agent_message") && event.answer) patchLast(m => ({ ...m, content: m.content + event.answer }));
          else if (event.event === "message_replace") patchLast(m => ({ ...m, content: String(event.answer || "") }));
          else if (event.event === "error") patchLast(m => stripThinking(m.content) ? m : { ...m, content: "小柴暂时开小差了，稍后再试。", error: true });
        }
      }
      patchLast(m => stripThinking(m.content) ? m : { ...m, content: "这个问题我暂时答不上来，换个问法试试？", error: true });
    } catch {
      patchLast(m => stripThinking(m.content) ? m : { ...m, content: controller.signal.aborted ? "已停止回答。" : "网络好像断了，稍后再试。", error: true });
    } finally {
      abort.current = null;
      setStreaming(false);
    }
  };
  return { config, messages, streaming, send };
}

type WxPage = "chat" | "shiba" | "owner" | "ownerChat" | "call" | "moments" | "chatInfo" | "searchChat" | "settings";
type WxTab = "chats" | "contacts" | "discover" | "me";

// Independently drawn icons: distinct filled and outline states for each tab.
function WxTabIcon({ tab, active }: { tab: WxTab; active: boolean }) {
  const fill = active ? "currentColor" : "none";
  return <svg width="28" height="28" viewBox="0 0 28 28" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" aria-hidden="true">
    {tab === "chats" && <><path fill={fill} d="M14 4C7.7 4 3 7.8 3 12.7c0 2.7 1.5 5 4 6.6L6 23l4.5-2.1c1.1.3 2.3.5 3.5.5 6.3 0 11-3.8 11-8.7S20.3 4 14 4Z"/><g stroke="none" fill={active ? "#fff" : "currentColor"}><circle cx="10" cy="12" r="1.25"/><circle cx="18" cy="12" r="1.25"/></g></>}
    {tab === "contacts" && <><rect x="5" y="3.5" width="19" height="21" rx="2" fill={fill}/><path d="M2 8h5M2 14h5M2 20h5"/><g stroke={active ? "#fff" : "currentColor"}><circle cx="14.5" cy="10.5" r="3"/><path d="M9 20c0-6 11-6 11 0"/></g></>}
    {tab === "discover" && <><circle cx="14" cy="14" r="10.5" fill={fill}/><path d="m18.5 9.5-3 6-6 3 3-6Z" stroke={active ? "#fff" : "currentColor"} fill={active ? "#fff" : "none"}/></>}
    {tab === "me" && <><circle cx="14" cy="8.5" r="4.5" fill={fill}/><path d="M4.5 24v-2.5a9.5 7.5 0 0 1 19 0V24Z" fill={fill}/></>}
  </svg>;
}

function WxNav({ title, onBack, tone = "gray", right }: { title?: string; onBack?(): void; tone?: "gray" | "white" | "clear"; right?: ReactNode }) {
  return (
    <header className={`desk-wx__nav desk-wx__nav--${tone}`}>
      <span className="desk-wx__nav-side">{onBack && <button type="button" aria-label="返回" onClick={onBack}><ChevronLeft size={26} strokeWidth={2} /></button>}</span>
      <strong>{title}</strong>
      <span className="desk-wx__nav-side desk-wx__nav-side--right">{right}</span>
    </header>
  );
}

function WxAvatar({ src, name, size = 40 }: { src?: string; name: string; size?: number }) {
  const style = { width: size, height: size };
  return src ? <img className="desk-wx__avatar" style={style} src={src} alt="" loading="lazy" referrerPolicy="no-referrer" />
    : <span className="desk-wx__avatar desk-wx__avatar--text" style={style}>{name.slice(-2)}</span>;
}

function WeChat({ data, origin }: { data: PortfolioData; onBack(): void; origin: string }) {
  const [tab, setTab] = useState<WxTab>("chats");
  const [stack, setStack] = useState<WxPage[]>([]);
  const [direction, setDirection] = useState<"push" | "pop">("push");
  const chat = useShibaChat(true);
  const [ownerMessages, setOwnerMessages] = useState<LocalMessage[]>([]);
  const messageUrls = useRef<string[]>([]);
  useEffect(() => () => messageUrls.current.forEach(url => URL.revokeObjectURL(url)), []);
  const addOwnerMessage = (message: LocalMessage) => { if (message.kind !== "text") messageUrls.current.push(message.content); setOwnerMessages(items => [...items, message]); };
  const [infoOwner, setInfoOwner] = useState(true);
  const [muted, setMuted] = useState(false);
  const [pinned, setPinned] = useState(false);
  const [query, setQuery] = useState("");
  const [showCallMenu, setShowCallMenu] = useState(false);
  const [status, setStatus] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  const top = stack[stack.length - 1];
  useEffect(() => { const list = listRef.current; if (list) list.scrollTop = list.scrollHeight; }, [chat.messages, ownerMessages, top]);
  const owner = data.profile.name?.trim() && data.profile.name.trim() !== "主人" ? data.profile.name.trim() : "张正宝";
  const ownerAvatar = wechatOwnerAvatar;
  const pageCopy = data.profile.pageCopy || {};
  const offline = Boolean(chat.config && !chat.config.enabled);
  const lastMessage = [...chat.messages].reverse().find(m => stripThinking(m.content));
  const preview = lastMessage ? stripThinking(lastMessage.content) : chat.config?.opening || "来聊聊吧～";
  const [contactQuery, setContactQuery] = useState("");
  const matches = (name: string) => name.toLowerCase().includes(contactQuery.trim().toLowerCase());
  const moments = [
    ...(pageCopy.postList || []).map(post => ({ id: post.id, text: post.text || post.title, images: post.images, date: post.date || "" })),
  ];
  const push = (page: WxPage) => { setDirection("push"); setStack(current => [...current, page]); };
  const pop = () => { setDirection("pop"); setStack(current => current.slice(0, -1)); };
  const now = clock();
  const chatMenu = (isOwner: boolean) => <button aria-label="聊天信息" onClick={() => { setInfoOwner(isOwner); push("chatInfo"); }}><Ellipsis size={25} /></button>;
  const chevron = <span className="desk-wx__chev"><ChevronRight size={18} /></span>;
  const settingRow = (label: string, action: () => void, trailing: ReactNode = chevron) => <button className="desk-wx__setting" onClick={action}><span>{label}</span>{trailing}</button>;

  const tabs: [WxTab, string][] = [["chats", "微信"], ["contacts", "通讯录"], ["discover", "发现"], ["me", "我"]];
  const row = (key: string, avatar: ReactNode, title: string, sub?: string, extra?: ReactNode, onClick?: () => void, pinned = false) => (
    <li key={key}><button type="button" className={`desk-wx__row${sub !== undefined ? " desk-wx__row--conversation" : ""}${pinned ? " is-pinned" : ""}`} onClick={onClick}>
      {avatar}
      <span className="desk-wx__row-main"><strong>{title}</strong>{sub !== undefined && <small>{sub}</small>}</span>
      {extra}
    </button></li>
  );
  const icon = (color: string, glyph: ReactNode) => <span className="desk-wx__icon" style={{ background: color }}>{glyph}</span>;

  const main = (
    <div className="desk-wx__main">
      {(tab === "chats" || tab === "contacts") && <>
        <WxNav title={tab === "chats" ? "微信" : "通讯录"} />
        <div className={tab === "contacts" ? "desk-wx__contacts" : "desk-wx__conversations desk-wx__scroll"}>
        <div className={tab === "contacts" ? "desk-wx__scroll" : undefined}>
          <label className="desk-wx__search"><Search size={16} /><input aria-label="搜索联系人" placeholder="搜索" value={contactQuery} onChange={e => setContactQuery(e.target.value)} /></label>
          <ul className="desk-wx__list">
            {matches("小柴") && row("shiba", <WxAvatar src={SHIBA_AVATAR} name="小柴" size={tab === "contacts" ? 36 : 44} />, "小柴", tab === "chats" ? preview : undefined, undefined, () => push(tab === "chats" ? "chat" : "shiba"))}
            {matches(owner) && row("owner", <WxAvatar src={ownerAvatar} name={owner} size={tab === "contacts" ? 36 : 44} />, owner, tab === "chats" ? "" : undefined, undefined, () => push(tab === "chats" ? "ownerChat" : "owner"), tab === "chats" && pinned)}
          </ul>
          {tab === "contacts" && <p className="desk-wx__count">{["小柴", owner].filter(matches).length}个联系人</p>}
        </div>
        </div>
      </>}
      {tab === "discover" && <>
        <WxNav title="发现" />
        <div className="desk-wx__scroll">
          <ul className="desk-wx__list desk-wx__list--gap">
            {row("moments", icon("linear-gradient(135deg,#f5b33f,#e8554e 45%,#4d8af0 75%,#47c66a)", <Aperture size={18} />), "朋友圈", undefined, <span className="desk-wx__chev"><ChevronRight size={18} /></span>, () => push("moments"))}
          </ul>
        </div>
      </>}
      {tab === "me" && <>
        <div className="desk-wx__scroll desk-wx__scroll--white-top">
          <div className="desk-wx__me">
            <WxAvatar src={ownerAvatar} name={owner} size={64} />
            <div><strong>{owner}</strong><button className="desk-wx__status-pill" onClick={() => setStatus(!status)}>{status ? "◉ 专注中" : "+ 状态"}</button></div>
          </div>
          <ul className="desk-wx__list desk-wx__list--gap desk-wx__me-links">
            {row("me-moments", icon("linear-gradient(135deg,#f5b33f,#e8554e 45%,#4d8af0 75%,#47c66a)", <Aperture size={18} />), "朋友圈", undefined, <span className="desk-wx__chev"><ChevronRight size={18} /></span>, () => push("moments"))}
          </ul>
          <ul className="desk-wx__list desk-wx__list--gap desk-wx__me-links">
            {row("me-settings", icon("#4088de", <Settings size={22} />), "设置", undefined, chevron, () => push("settings"))}
          </ul>
        </div>
      </>}
      <nav className="desk-wx__tabs">
        {tabs.map(([id, label]) => (
          <button key={id} type="button" aria-current={tab === id} onClick={() => { setTab(id); setContactQuery(""); }}>
            <WxTabIcon tab={id} active={tab === id} />
            {label}
          </button>
        ))}
      </nav>
    </div>
  );

  const profile = (who: "shiba" | "owner") => (
    <div className="desk-wx__page-inner desk-wx__page-inner--profile">
      <WxNav onBack={pop} tone="white" right={<Ellipsis size={22} />} />
      <div className="desk-wx__scroll">
        <div className="desk-wx__profile">
          <WxAvatar src={who === "shiba" ? SHIBA_AVATAR : ownerAvatar} name={who === "shiba" ? "小柴" : owner} size={62} />
          <div>
            <strong>{who === "shiba" ? "小柴" : owner}</strong>
            {who === "shiba" ? <small>AI 数字分身 · {owner}的助理</small> : null}
            {who === "owner" && data.profile.tagline && <small>{data.profile.tagline}</small>}
          </div>
        </div>
        <ul className="desk-wx__list desk-wx__list--gap">
          {who === "shiba"
            ? row("sign", <span />, "个性签名", "熟悉他的作品、经历和想法，有问题随时问我。")
            : row("p-moments", <span />, "朋友圈", undefined, <span className="desk-wx__thumbs">{moments.flatMap(m => m.images).slice(0, 4).map(url => <img key={url} src={url} alt="" referrerPolicy="no-referrer" />)}</span>, () => push("moments"))}
        </ul>
        <ul className="desk-wx__list desk-wx__list--gap">
          <li><button type="button" className="desk-wx__action" onClick={() => push(who === "shiba" ? "chat" : "ownerChat")}><MessageCircle size={18} />发消息</button></li>
        </ul>
      </div>
    </div>
  );

  const pages: Record<WxPage, ReactNode> = {
    chat: (
      <div className="desk-wx__page-inner desk-wx__page-inner--chat">
        <WxNav title="小柴" onBack={pop} right={chatMenu(false)} />
        <div className="desk-wx__messages" ref={listRef}>

          {offline && <p className="desk-wx__system">小柴暂时不在线，晚点再来找她吧。</p>}
          {!chat.messages.length && !offline && (
            <div className="desk-wx__msg desk-wx__msg--assistant"><WxAvatar src={SHIBA_AVATAR} name="小柴" size={40} /><p className="desk-wx__bubble">{chat.config?.opening || `你好，我是小柴，${owner}的 AI 助理。想了解他的什么？`}</p></div>
          )}
          {chat.messages.map((message, i) => {
            const content = stripThinking(message.content);
            const pending = message.role === "assistant" && !content && chat.streaming && i === chat.messages.length - 1;
            return (
              <div key={i} className={`desk-wx__msg desk-wx__msg--${message.role}`}>
                {message.role === "assistant" && <WxAvatar src={SHIBA_AVATAR} name="小柴" size={40} />}
                <p className={`desk-wx__bubble${message.error ? " is-error" : ""}`}>{pending ? <span className="desk-typing"><i /><i /><i /></span> : content}</p>
                {message.role === "user" && <span className="desk-wx__me-avatar" aria-hidden="true"><User size={22} /></span>}
              </div>
            );
          })}

        </div>
        <WeChatComposer media={false} disabled={offline || chat.streaming} onMessage={message => { void chat.send(message.content); }} />
      </div>
    ),
    ownerChat: <div className="desk-wx__page-inner desk-wx__page-inner--chat">
      <WxNav title={owner} onBack={pop} right={chatMenu(true)} />
      <div className="desk-wx__messages" ref={listRef}>
        {ownerMessages.length > 0 && <p className="desk-wx__system">仅本次会话可见，尚未发送给对方</p>}
        {ownerMessages.map((message, i) => <div key={i} className="desk-wx__msg desk-wx__msg--user"><div className="desk-wx__bubble">{message.kind === "voice" ? <audio controls src={message.content} aria-label="语音消息" /> : message.kind === "image" ? <img className="wx-message-image" src={message.content} alt="表情图片" /> : message.content}</div><span className="desk-wx__me-avatar"><User size={22}/></span></div>)}
      </div>
      <WeChatComposer onMessage={addOwnerMessage} onMore={() => setShowCallMenu(!showCallMenu)} />
      {showCallMenu && <div className="desk-wx__more"><button onClick={() => push("call")}><span className="desk-wx__more-icon"><Video size={28} /></span><span>视频通话</span></button></div>}
    </div>,
    chatInfo: <div className="desk-wx__page-inner"><WxNav title="聊天信息" onBack={pop} /><div className="desk-wx__scroll">
      <div className="desk-wx__members"><button onClick={() => push(infoOwner ? "owner" : "shiba")}><WxAvatar src={infoOwner ? ownerAvatar : SHIBA_AVATAR} name={infoOwner ? owner : "小柴"} size={52}/><span>{infoOwner ? owner : "小柴"}</span></button></div>
      <div className="desk-wx__settings-group">{settingRow("查找聊天记录", () => { setQuery(""); push("searchChat"); })}</div>
      <div className="desk-wx__settings-group"><div className="desk-wx__setting"><span>消息免打扰</span><button className="desk-wx__switch" role="switch" aria-label="消息免打扰" aria-checked={muted} onClick={() => setMuted(!muted)} /></div>{infoOwner && <div className="desk-wx__setting"><span>置顶聊天</span><button className="desk-wx__switch" role="switch" aria-label="置顶聊天" aria-checked={pinned} onClick={() => setPinned(!pinned)} /></div>}</div>

    </div></div>,
    searchChat: <div className="desk-wx__page-inner"><WxNav title="查找聊天记录" onBack={pop}/><div className="desk-wx__scroll"><label className="desk-wx__search"><Search size={17}/><input autoFocus placeholder="搜索聊天内容" value={query} onChange={e => setQuery(e.target.value)}/></label>{query.trim() && <div className="desk-wx__search-results">{!infoOwner && chat.messages.some(m => stripThinking(m.content).includes(query)) ? chat.messages.filter(m => stripThinking(m.content).includes(query)).map((m,i) => <p key={i}>{stripThinking(m.content)}</p>) : <p>没有找到相关聊天记录</p>}</div>}</div></div>,
    settings: <div className="desk-wx__page-inner"><WxNav title="设置" onBack={pop}/><div className="desk-wx__scroll"><div className="desk-wx__settings-group"><div className="desk-wx__setting"><span>消息免打扰</span><button className="desk-wx__switch" role="switch" aria-label="消息免打扰" aria-checked={muted} onClick={() => setMuted(!muted)}/></div></div></div></div>,
    call: <div className="desk-wx__page-inner desk-owner-call"><WxNav title={owner} onBack={pop} /><AssistantVideoCall close={pop} identityName={owner} identityAvatar={ownerAvatar} /></div>,
    shiba: profile("shiba"),
    owner: profile("owner"),
    moments: (
      <div className="desk-wx__page-inner desk-wx__page-inner--moments">
        <WxNav onBack={pop} tone="clear" right={<Aperture size={20} />} />
        <div className="desk-wx__scroll desk-wx__scroll--flush">
          <div className="desk-wx__cover" style={{ backgroundImage: moments[0]?.images[0] ? `url("${moments[0].images[0]}")` : undefined }}>
            <span>{owner}</span>
            <WxAvatar src={ownerAvatar} name={owner} size={64} />
          </div>
          {moments.length ? moments.map(item => (
            <article key={item.id} className="desk-wx__moment">
              <WxAvatar src={ownerAvatar} name={owner} size={42} />
              <div>
                <strong>{owner}</strong>
                {paragraphs(item.text).slice(0, 4).map((line, i) => <p key={i}>{line}</p>)}
                {item.images.length ? <div className={`desk-wx__grid desk-wx__grid--${Math.min(item.images.length, 3)}`}>{item.images.slice(0, 9).map(url => <img key={url} src={url} alt="" loading="lazy" referrerPolicy="no-referrer" />)}</div> : null}
                {item.date && <time>{item.date}</time>}
              </div>
            </article>
          )) : <Empty>朋友圈还没有内容。</Empty>}
        </div>
      </div>
    ),
  };

  return (
    <section className="desk-app desk-wx" style={{ transformOrigin: origin }}>
      {main}
      {top && <div key={stack.length} className={`desk-wx__page desk-wx__page--${direction}`}>{pages[top]}</div>}
    </section>
  );
}

function PhoneScreen({ data, music }: { data: PortfolioData; music: MusicControls }) {
  const close = useCloseDevice();
  const nav = useAppNavigator<PhoneApp>();
  const [time, setTime] = useState(clock);
  useEffect(() => { const timer = window.setInterval(() => setTime(clock()), 20_000); return () => window.clearInterval(timer); }, []);
  const contact = data.contact;
  const icons: AppIcon[] = [
    { id: "wechat", label: "微信", color: "linear-gradient(145deg,#3ee07f,#07c160)", glyph: "◍" },
    { id: "music", label: "音乐", color: "linear-gradient(145deg,#ff6b8b,#d6305a)", glyph: "♪" },
  ];
  const openApp = (id: string, event: ReactMouseEvent<HTMLElement>) => {
    if (id === "mail" && contact?.email) { window.location.href = `mailto:${contact.email}`; return; }
    if (id === "tel" && contact?.phone) { window.location.href = `tel:${contact.phone}`; return; }
    nav.open(id as PhoneApp, event);
  };
  return (
    <div className="desk-phone" data-screen>
      {nav.app && <div className="desk-phone__island" aria-hidden="true" />}
      {nav.app && <div className="desk-phone__status"><span>{time}</span><span>5G · 86%</span></div>}
      {!nav.app && <DeviceHome device="phone" onOpen={(id,event)=>nav.open(id as PhoneApp,event)} />}
      {nav.app === "wechat" && <WeChat data={data} onBack={nav.home} origin={nav.origin} />}
      {nav.app === "music" && (
        <AppView title="音乐" origin={nav.origin} onBack={nav.home} tone="dark">
          <MusicPanel music={music} />
        </AppView>
      )}
      <button type="button" className="desk-homebar" aria-label="回到主屏" onClick={() => nav.home()} />
    </div>
  );
}

/* ======================================================================
 * 纸质笔记本：诗集，左右两页，翻页有动画。
 * ==================================================================== */

function UniversitySpread({ index, data }: { index: number; data: PortfolioData }) {
  const close = useContext(CloseContext);
  const book = readUniversityBooks(data.profile.pageCopy)[index];
  const [spread, setSpread] = useState(0);
  const count = Math.max(1, Math.ceil(book.pages.length / 2));
  useEffect(() => setSpread(s => Math.min(s, count - 1)), [count]);
  return <div className="university-book" data-book-id={book.id}>
    <header className="university-book__header"><span>{book.title}</span></header>
    <div className="university-book__spread" key={spread}>
      {[0, 1].map(side => {
        const number = spread * 2 + side;
        const page = book.pages[number];
        return <article className="university-book__page" key={side} aria-label={`第 ${number + 1} 页`}>
          <div className="university-book__body">
            {number === 0 && <p className="university-book__eyebrow">{book.title}</p>}
            {page?.title && <h2>{page.title}</h2>}
            {page?.imageUrl && <figure><Img src={page.imageUrl} alt={page.caption || ""} />{page.caption && <figcaption>{page.caption}</figcaption>}</figure>}
            {page?.text?.split(/\n\s*\n/).map((paragraph, i) => <p key={i}>{paragraph}</p>)}
            {!page?.title && !page?.text && !page?.imageUrl && <p className="university-book__empty">尚未写下的故事</p>}
          </div>
          <footer>{String(number + 1).padStart(2, "0")}</footer>
        </article>;
      })}
    </div>
    <nav className="university-book__navigation" aria-label="书页导航">
      <button disabled={spread === 0} onClick={() => setSpread(s => s - 1)}><ChevronLeft size={18} />上一页</button>
      <span>{spread * 2 + 1}–{Math.min(spread * 2 + 2, Math.max(2, book.pages.length))} / {Math.max(2, book.pages.length)}</span>
      <button disabled={spread + 1 >= count} onClick={() => setSpread(s => s + 1)}>下一页<ChevronRight size={18} /></button>
    </nav>
  </div>;
}

function NotebookSpread({ data }: { data: PortfolioData }) {
  const close = useCloseDevice();
  const pageCopy = data.profile.pageCopy || {};
  const poems = (pageCopy.poemList || []).filter(poem => poem.text?.trim());
  const [index, setIndex] = useState(0);
  const [turn, setTurn] = useState<"next" | "prev" | "">("");
  const go = (step: number) => {
    if (!poems.length) return;
    setTurn(step > 0 ? "next" : "prev");
    setIndex((index + step + poems.length) % poems.length);
  };
  useEffect(() => setIndex(i => Math.min(i, Math.max(0, poems.length - 1))), [poems.length]);
  const poem = poems[index];
  return (
    <div className="desk-book">

      <div className="desk-book__page desk-book__page--left">
        <p className="desk-book__kicker">诗与随笔</p>
        {poem ? <>
          <h2>{poem.title || "无题"}</h2>
          {poem.imageUrl && <Img className="desk-book__image" src={poem.imageUrl} alt="" />}
          {poem.note && <p className="desk-book__note">{poem.note}</p>}
          <p className="desk-book__count">第 {index + 1} 篇 / 共 {poems.length} 篇</p>
        </> : <>
          <h2>暂无诗与随笔</h2>

        </>}
      </div>
      <div className="desk-book__page desk-book__page--right" key={index} data-turn={turn}>
        <div className="desk-book__writing">{poem ? poem.text.split("\n").map((line, i) => <p key={i} className="desk-book__line">{line || "\u00a0"}</p>) : <p className="desk-book__line">{"这一本还没写下内容。"}</p>}</div>
      </div>
      {poems.length > 1 && <>
        <button type="button" className="desk-book__turn desk-book__turn--prev" aria-label="上一篇" onClick={() => go(-1)}><ChevronLeft size={22} /></button>
        <button type="button" className="desk-book__turn desk-book__turn--next" aria-label="下一篇" onClick={() => go(1)}><ChevronRight size={22} /></button>
      </>}
    </div>
  );
}

/* ======================================================================
 * 音乐：音箱和手机共用同一个播放器。
 * ==================================================================== */

type MusicControls = {
  tracks: NonNullable<PortfolioData["musicTracks"]>;
  index: number;
  playing: boolean;
  play(index?: number): void;
  toggle(): void;
  next(): void;
};

function useMusic(tracks: NonNullable<PortfolioData["musicTracks"]>): MusicControls {
  const audio = useRef<HTMLAudioElement | null>(null);
  const [index, setIndex] = useState(0);
  const [playing, setPlaying] = useState(false);
  const live = useRef({ tracks, index });
  live.current = { tracks, index };
  const retried = useRef(false);
  useEffect(() => {
    const element = new Audio();
    element.preload = "none";
    element.addEventListener("play", () => setPlaying(true));
    element.addEventListener("pause", () => setPlaying(false));
    element.addEventListener("playing", () => { retried.current = false; });
    audio.current = element;
    // 挂到文档里，加载失败的 error 事件才能被页面的续签监听捕获到
    document.body.appendChild(element);
    return () => { element.pause(); element.removeAttribute("src"); element.remove(); };
  }, []);
  useEffect(() => {
    const element = audio.current;
    if (!element) return;
    // 播完时浏览器会先触发 pause，这里要自己接着放下一首（只有一首就循环）。
    const onEnded = () => {
      const { tracks: list, index: current } = live.current;
      if (!list.length) return;
      const next = (current + 1) % list.length;
      setIndex(next);
      start(next);
    };
    element.addEventListener("ended", onEnded);
    return () => element.removeEventListener("ended", onEnded);
  }, []);
  const start = (next: number) => {
    const element = audio.current;
    const track = live.current.tracks[next];
    if (!element || !track?.audioUrl) return;
    // 地址过期导致加载失败时，换上续签后的新地址
    if (element.dataset.track !== track.id || element.error) {
      element.src = track.audioUrl;
      element.dataset.track = track.id;
      element.dataset.url = track.audioUrl;
    }
    void element.play().catch(() => setPlaying(false));
  };
  useEffect(() => { if (playing) start(index); }, [index]);
  // 放到一半地址过期：续签拿到新地址后自动重试一次
  useEffect(() => {
    const element = audio.current;
    const track = tracks[index];
    if (!element?.error || retried.current || !track?.audioUrl || element.dataset.track !== track.id || element.dataset.url === track.audioUrl) return;
    retried.current = true;
    start(index);
  }, [tracks]);
  return {
    tracks,
    index,
    playing,
    play(next = index) { setIndex(next); start(next); },
    toggle() { const element = audio.current; if (!element) return; if (element.paused) start(index); else element.pause(); },
    next() { if (tracks.length) { const next = (index + 1) % tracks.length; setIndex(next); start(next); } },
  };
}

function MusicPanel({ music }: { music: MusicControls }) {
  const track = music.tracks[music.index];
  if (!music.tracks.length) return <Empty>歌单是空的。</Empty>;
  return (
    <div className="desk-music">
      <div className={`desk-music__cover${music.playing ? " is-playing" : ""}`}>
        {track?.coverUrl ? <Img src={track.coverUrl} alt="" /> : <span>♪</span>}
      </div>
      <strong className="desk-music__title">{track?.title}</strong>
      <span className="desk-music__artist">{track?.artist}</span>
      <div className="desk-music__controls">
        <button type="button" onClick={music.toggle} aria-label={music.playing ? "暂停" : "播放"}>{music.playing ? <Pause size={22} /> : <Play size={22} />}</button>
        {music.tracks.length > 1 && <button type="button" onClick={music.next} aria-label="下一首"><SkipForward size={20} /></button>}
      </div>
      <ol className="desk-music__list">
        {music.tracks.map((item, i) => (
          <li key={item.id}><button type="button" aria-current={i === music.index} onClick={() => music.play(i)}>{item.title}<small>{item.artist}</small></button></li>
        ))}
      </ol>
    </div>
  );
}

function SpeakerPanel({ music }: { music: MusicControls }) {
  const close = useCloseDevice();
  return (
    <div className="desk-speaker">
      <header><strong>小音箱</strong></header>
      <MusicPanel music={music} />
    </div>
  );
}

/* ======================================================================
 * 页面
 * ==================================================================== */

export default function DeskApp() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const sceneRef = useRef<DeskScene | null>(null);
  const focusedDeviceRef = useRef<Device | "scissors" | "lamp" | "poster" | "keyboard" | "mouse" | null>(null);
  const [focusedDevice, setFocusedDevice] = useState<Device | "scissors" | "lamp" | "poster" | "keyboard" | "mouse" | null>(null);
  const deviceOpenTimer = useRef<number | undefined>(undefined);
  useEffect(() => () => window.clearTimeout(deviceOpenTimer.current), []);
  const [data, setData] = useState<PortfolioData>(emptyData);
  const [ready, setReady] = useState(false);
  const [webglFailed, setWebglFailed] = useState(false);
  const [open, setOpen] = useState<{ kind: Device; origin: DOMRect | null } | null>(null);
  const [lampOn, setLampOn] = useState(true);
  const [shelfFocused, setShelfFocused] = useState(false);
  const [selectedBook, setSelectedBook] = useState<number | null>(null);
  const closeShelf = useCallback(() => {
    window.clearTimeout(deviceOpenTimer.current);
    sceneRef.current?.focus(null);
    setShelfFocused(false);
    focusedDeviceRef.current = null;
    setFocusedDevice(null);
  }, []);
  useEffect(() => {
    if ((!shelfFocused && !focusedDevice) || selectedBook !== null || open) return;
    const onKey = (event: KeyboardEvent) => { if (event.key === "Escape") closeShelf(); };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [shelfFocused, focusedDevice, selectedBook, open, closeShelf]);
  const [context,setContext]=useState<{id:string;plugKind?:'lamp'|'speaker'|'laptop';x:number;y:number}|null>(null);
  useEffect(()=>{if(!context)return;const close=(e:KeyboardEvent)=>{if(e.key==='Escape')setContext(null);};window.addEventListener('keydown',close);return ()=>window.removeEventListener('keydown',close);},[context]);
  const [plugs, setPlugs] = useState({ lamp: true, speaker: true, laptop: true });
  const [powerOn, setPowerOn] = useState(true);
  const [toast, setToast] = useState("");
  const music = useMusic(data.musicTracks || []);
  const stateRef = useRef({ powerOn, data });
  stateRef.current = { powerOn, data };

  const showToast = useCallback((text: string) => setToast(text), []);
  useEffect(() => {
    if (!toast) return;
    const timer = window.setTimeout(() => setToast(""), 3200);
    return () => window.clearTimeout(timer);
  }, [toast]);

  const openDevice = useCallback((kind: Device) => {
    setShelfFocused(false);
    const scene = sceneRef.current;
    const hotspot: DeskHotspot = kind;
    window.clearTimeout(deviceOpenTimer.current);
    scene?.focus(hotspot);
    if (scene && kind === "notebook" && focusedDeviceRef.current !== kind) {
      focusedDeviceRef.current = kind;
      setFocusedDevice(kind);
      return;
    }
    if (scene && (kind === "laptop" || kind === "tablet" || kind === "phone")) {
      focusedDeviceRef.current = kind;
      setFocusedDevice(kind);
      // Open when the camera reaches the screen.
      return;
    }
    setOpen({ kind, origin: scene?.screenRect(hotspot) || null });
  }, []);

  const select = useCallback((hotspot: DeskHotspot) => {
    const { data: current, powerOn: power } = stateRef.current;
    switch (hotspot) {
      case "keyboard":
      case "mouse":
      case "poster":
        window.clearTimeout(deviceOpenTimer.current);
        focusedDeviceRef.current = hotspot;
        setFocusedDevice(hotspot);
        setShelfFocused(false);
        sceneRef.current?.focus(hotspot);
        return;
      case "scissors":
        window.clearTimeout(deviceOpenTimer.current);
        if (focusedDeviceRef.current === "scissors") {
          window.location.assign(toolUrl("/tools/wanchuang/index.html"));
          return;
        }
        focusedDeviceRef.current = "scissors";
        setFocusedDevice("scissors");
        setShelfFocused(false);
        sceneRef.current?.focus("scissors");
        return;
      case "bookshelf":
        window.clearTimeout(deviceOpenTimer.current);
        focusedDeviceRef.current = null;
        setFocusedDevice(null);
        sceneRef.current?.focus("bookshelf");
        setShelfFocused(true);
        return;
      case "lamp":
        window.clearTimeout(deviceOpenTimer.current);
        focusedDeviceRef.current = "lamp";
        setFocusedDevice("lamp");
        setShelfFocused(false);
        sceneRef.current?.focus("lamp");
        return;
      case "socket":
        setPowerOn(on => !on);
        return;
      case "mug":
        showToast(current.profile.quote || "先喝口咖啡，慢慢看。");
        return;
      case "plant":
        showToast("看累了就看看绿植，让眼睛歇一会儿。");
        return;
      case "laptop":
      case "speaker":
        if (!power) { showToast("插线板关着，先点一下插线板开电。"); return; }
        openDevice(hotspot);
        return;
      default:
        openDevice(hotspot);
    }
  }, [openDevice, showToast]);

  useEffect(() => {
    let alive = true;
    let busy = false;
    let lastAttempt = Date.now();
    // 定期同步后台内容，返回页面时立即刷新，同时续签媒体地址。
    const refresh = async (force = false) => {
      if (!alive || busy || document.hidden) return;
      const now = Date.now();
      if (now - lastAttempt < (force ? 1_000 : 30_000)) return;
      busy = true;
      lastAttempt = now;
      try {
        const next = await loadPortfolio();
        if (alive && next) setData(next);
      } finally {
        busy = false;
      }
    };
    const visible = () => { void refresh(true); };
    const mediaError = (event: Event) => {
      if (event.target instanceof HTMLImageElement || event.target instanceof HTMLMediaElement) void refresh(true);
    };
    void loadPortfolio().then(next => { if (alive && next) setData(next); });
    const timer = window.setInterval(() => { void refresh(); }, 30_000);
    document.addEventListener("visibilitychange", visible);
    window.addEventListener("focus", visible);
    document.addEventListener("error", mediaError, true);
    return () => {
      alive = false;
      window.clearInterval(timer);
      document.removeEventListener("visibilitychange", visible);
      window.removeEventListener("focus", visible);
      document.removeEventListener("error", mediaError, true);
    };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let scene: DeskScene;
    try {
      scene = createDeskScene({
        onContext: setContext,
        onLampChange: setLampOn,
        onFocusReady: kind => {
          if (focusedDeviceRef.current === kind && (kind === "laptop" || kind === "tablet" || kind === "phone")) setOpen({kind,origin:null});
        },
        onBookSelect: setSelectedBook,
        canvas,
        onHover: () => {},
        onSelect: kind => select(kind),
        onReady: () => {
          setReady(true);
          dismissBootLoader();
        },
      });
    } catch {
      setWebglFailed(true);
      document.getElementById("boot-loader")?.remove();
      return;
    }
    sceneRef.current = scene;
    return () => { scene.dispose(); sceneRef.current = null; };
  }, [select]);

  useEffect(() => { sceneRef.current?.setIdentity(data.profile.name, data.profile.tagline, data.profile.avatar); }, [data, ready]);
  useEffect(() => { sceneRef.current?.setLamp(lampOn); }, [lampOn, ready]);
  useEffect(() => {
    for (const kind of ["lamp", "speaker", "laptop"] as const) sceneRef.current?.setPlugConnected(kind, plugs[kind]);
  }, [plugs, ready]);
  useEffect(() => {
    if (!plugs.speaker && music.playing) music.toggle();
  }, [plugs.speaker, music.playing]);
  useEffect(() => {
    sceneRef.current?.setPower(powerOn);
    if (!powerOn && music.playing) music.toggle();
  }, [powerOn, ready]);
  useEffect(() => { sceneRef.current?.setMusic(music.playing); }, [music.playing, ready]);
  useEffect(() => { document.title = data.profile.name ? `${data.profile.name}的书桌` : "我的书桌"; }, [data.profile.name]);

  const closeDevice = useCallback(() => {
    window.clearTimeout(deviceOpenTimer.current);
    sceneRef.current?.focus(null);
    focusedDeviceRef.current = null;
    setFocusedDevice(null);
    setOpen(null);
  }, []);

  const narrow = useNarrowPortrait();
  const dock: [DeskHotspot, string][] = [["poster", "相框"],["laptop", "电脑"], ["tablet", "平板"], ["phone", "手机"], ["notebook", "笔记本"], ["speaker", "音箱"], ["lamp", "台灯"]];

  return (
    <div className={`desk-page${ready ? " is-ready" : ""}${open ? " has-device" : ""}${open && (open.kind === "phone" || (!narrow && (open.kind === "laptop" || open.kind === "tablet"))) ? " has-screen" : ""}`}>
      <canvas ref={canvasRef} className="desk-canvas" aria-label="三维书桌场景，可以点击桌上的物品" />
      {webglFailed && <div className="desk-fallback">你的浏览器不支持 3D 画面，可以用下方按钮打开各个物品。</div>}

      {(shelfFocused || focusedDevice) && !open && selectedBook === null && <button className="desk-focus-close" type="button" aria-label="返回书桌" onClick={closeShelf}><X size={20}/></button>}
      {!focusedDevice && !shelfFocused && <header className="desk-hud">
        <ThemePicker current="desk" />
      </header>}

      {context && <div className="desk-context-backdrop" onClick={()=>setContext(null)}>
        <div className="desk-radial" role="dialog" aria-label="物品操作" style={{left:Math.max(126,Math.min(window.innerWidth-126,context.x)),top:Math.max(126,Math.min(window.innerHeight-126,context.y))}} onClick={e=>e.stopPropagation()}>
          {(context.plugKind ? [plugs[context.plugKind]?'拔下':'插上'] : ['移动','旋转','固定位置']).map((label,i)=> <button key={label} className="desk-radial__action" style={{transform:`translate(-50%,-50%) translate(${Math.cos((-90+i*120)*Math.PI/180)*82}px,${Math.sin((-90+i*120)*Math.PI/180)*82}px)`}} onClick={()=>{
            if(context.plugKind){const kind=context.plugKind;setPlugs(p=>({...p,[kind]:!p[kind]}));}
            else if(i===2){if(!sceneRef.current?.saveLayout()){showToast('保存失败，请重试');return;}showToast('位置已固定');}
            else {sceneRef.current?.editObject(context.id,i===0?'move':'rotate');showToast(i===0?'拖动物品移动，再次长按可固定':'左右拖动物品旋转，再次长按可固定');}
            setContext(null);
          }}><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.6"><path d={context.plugKind?'M8 3v6m8-6v6M6 9h12v4a6 6 0 0 1-12 0Zm6 10v4':i===0?'M12 2v20M2 12h20M8 6l4-4 4 4M6 8l-4 4 4 4M18 8l4 4-4 4M8 18l4 4 4-4':i===1?'M20 10a8 8 0 1 0-2 8M20 3v7h-7':'M7 10V7a5 5 0 0 1 10 0v3M5 10h14v12H5Z'}/></svg>{label}</button>)}
          <button className="desk-radial__close" aria-label="关闭操作菜单" onClick={()=>setContext(null)}><X size={20}/></button>
        </div>
      </div>}
      {toast && <div className="desk-toast" role="status">{toast}</div>}

      {!shelfFocused && !focusedDevice && <nav className="desk-dock" aria-label="桌上的物品">
        {dock.map(([kind, label]) => (
          <button key={kind} type="button" onClick={() => select(kind)}>{label}</button>
        ))}
      </nav>}

      {selectedBook !== null && <DeviceShell kind="notebook" origin={sceneRef.current?.screenRect("bookshelf") || null} onClosed={() => setSelectedBook(null)} label={universityBooks[selectedBook].title}>
        <UniversitySpread index={selectedBook} data={data} />
      </DeviceShell>}
      {open && (
        <DeviceShell scene={sceneRef.current} kind={open.kind} origin={open.origin} onClosed={closeDevice} label={LABELS[open.kind]}>
          {open.kind === "laptop" && <LaptopWindow data={data} />}
          {open.kind === "tablet" && <TabletScreen data={data} />}
          {open.kind === "phone" && <PhoneScreen data={data} music={music} />}
          {open.kind === "notebook" && <NotebookSpread data={data} />}
          {open.kind === "speaker" && <SpeakerPanel music={music} />}
        </DeviceShell>
      )}
    </div>
  );
}
