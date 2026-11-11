import { Fragment, createContext, useCallback, useContext, useEffect, useLayoutEffect, useMemo, useRef, useState, type CSSProperties, type MouseEvent as ReactMouseEvent, type ReactNode } from "react";
import { Aperture, ArrowLeft, ChevronLeft, ChevronRight, CirclePlus, Compass, Ellipsis, ExternalLink, MessageCircle, Mic, Newspaper, Pause, Play, Search, SkipForward, Smile, Tag, User, UserPlus, Users, X } from "lucide-react";
import type { PortfolioData, Work } from "../types";
import { getVisitorKey } from "../tracking";
import { createDeskScene, type DeskHotspot, type DeskScene } from "./deskScene";
import "./desk.css";

/**
 * 3D 书桌版主页。场景本身见 deskScene.ts；这里负责数据、悬停提示、
 * 以及点开物件后从它在屏幕上的位置「放大」出来的设备界面。
 */

type Device = "laptop" | "tablet" | "phone" | "notebook" | "speaker";

const LABELS: Record<DeskHotspot, string> = {
  laptop: "笔记本电脑 · 关于我",
  tablet: "平板 · 相册、视频、作品",
  phone: "手机 · 微信和联系方式",
  notebook: "笔记本 · 诗与随笔",
  lamp: "台灯 · 点一下开关",
  mug: "咖啡",
  speaker: "小音箱 · 听歌",
  socket: "插线板 · 总电源",
  keyboard: "键盘 · 唤醒电脑",
  mouse: "鼠标 · 唤醒电脑",
  plant: "绿植",
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

async function loadPortfolio(): Promise<PortfolioData> {
  let data: PortfolioData = emptyData;
  try {
    const response = await fetch("/api/portfolio", { cache: "no-store" });
    if (response.ok) data = { ...emptyData, ...(await response.json()) };
  } catch { /* 读不到就用空数据，各个应用显示空状态 */ }
  // 本地开发时数据库常常是空的，用仓库里的示例数据把桌面铺起来；线上永远以接口为准。
  if (import.meta.env.DEV && !data.profile?.name && !data.works?.length) {
    const sample = (await import("../data/portfolio.json")).default as unknown as PortfolioData;
    data = { ...emptyData, ...sample };
  }
  return data;
}

/* ======================================================================
 * 设备外壳：FLIP 动画，从物件屏幕的位置平滑放大到屏幕中央，关闭时缩回去。
 * ==================================================================== */

const CloseContext = createContext<() => void>(() => {});
const useCloseDevice = () => useContext(CloseContext);

function flipFrom(origin: DOMRect | null, box: DOMRect) {
  if (!origin || !box.width || !box.height) return "translate3d(0, 48px, 0) scale(.9)";
  const dx = origin.left + origin.width / 2 - (box.left + box.width / 2);
  const dy = origin.top + origin.height / 2 - (box.top + box.height / 2);
  const sx = Math.max(0.03, origin.width / box.width);
  const sy = Math.max(0.03, origin.height / box.height);
  return `translate3d(${dx}px, ${dy}px, 0) scale(${sx}, ${sy})`;
}

function DeviceShell({ kind, origin, onClosed, children, label }: { kind: Device; origin: DOMRect | null; onClosed(): void; children: ReactNode; label: string }) {
  const ref = useRef<HTMLDivElement>(null);
  const [phase, setPhase] = useState<"measure" | "from" | "open" | "leave">("measure");
  const [from, setFrom] = useState("");
  const closedRef = useRef(false);

  useLayoutEffect(() => {
    if (!ref.current) return;
    setFrom(flipFrom(origin, ref.current.getBoundingClientRect()));
    setPhase("from");
  }, []);
  useEffect(() => {
    if (phase !== "from") return;
    let second = 0;
    const first = requestAnimationFrame(() => { second = requestAnimationFrame(() => setPhase("open")); });
    return () => { cancelAnimationFrame(first); cancelAnimationFrame(second); };
  }, [phase]);

  const finish = useCallback(() => {
    if (closedRef.current) return;
    closedRef.current = true;
    onClosed();
  }, [onClosed]);
  const close = useCallback(() => setPhase("leave"), []);
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
      <div className="desk-backdrop" data-phase={phase} onClick={close} />
      <div className="desk-stage" data-phase={phase}>
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
          <div className="desk-device__content">{children}</div>
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
  return (
    <article className="desk-work">
      {isVideo(work) ? (
        <video className="desk-work__media" src={work.videoUrl} poster={images[0]} controls playsInline />
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

type LaptopTab = "about" | "experience" | "plan" | "works" | "resume";

function LaptopWindow({ data }: { data: PortfolioData }) {
  const close = useCloseDevice();
  const [tab, setTab] = useState<LaptopTab>("about");
  const [work, setWork] = useState<Work | null>(null);
  const { profile, experiences, prospects, contact } = data;
  const pageCopy = profile.pageCopy || {};
  const works = useMemo(() => [...data.works, ...(pageCopy.caseWorks || []), ...(pageCopy.aiWorks || [])], [data]);
  const resumes = [
    ...(pageCopy.resumeProfiles || []).filter(item => item.visible !== false && item.url).map(item => ({ label: item.position, sub: item.name || "PDF 简历", url: item.url })),
    ...(profile.resumePdfUrl ? [{ label: "简历", sub: "PDF", url: profile.resumePdfUrl }] : []),
  ];
  const tabs: [LaptopTab, string][] = [["about", "关于我"], ["experience", "经历"], ["plan", "规划"], ["works", "作品"], ["resume", "简历"]];
  return (
    <div className="desk-mac" data-screen>
      <header className="desk-mac__titlebar">
        <span className="desk-mac__lights">
          <button type="button" aria-label="关闭" onClick={close} className="desk-mac__light desk-mac__light--red" />
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
        <main className="desk-mac__main" key={`${tab}-${work?.id || ""}`}>
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
          {tab === "works" && (work ? (
            <>
              <button type="button" className="desk-back" onClick={() => setWork(null)}><ArrowLeft size={15} />全部作品</button>
              <WorkDetail work={work} />
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
  const [time, setTime] = useState(clock);
  useEffect(() => { const timer = window.setInterval(() => setTime(clock()), 20_000); return () => window.clearInterval(timer); }, []);
  const pageCopy = data.profile.pageCopy || {};
  const allWorks = useMemo(() => [...data.works, ...(pageCopy.caseWorks || []), ...(pageCopy.aiWorks || [])], [data]);
  const photos = useMemo(() => {
    const list = [
      ...(data.gallery || []).map(item => ({ url: item.imageUrl, title: item.title })),
      ...(data.treasures || []).map(item => ({ url: item.imageUrl, title: "珍藏" })),
      ...(pageCopy.postList || []).flatMap(item => item.images.map(url => ({ url, title: item.title }))),
      ...allWorks.flatMap(item => (item.images || []).map(url => ({ url, title: item.title }))),
    ].filter(item => item.url);
    const seen = new Set<string>();
    return list.filter(item => (seen.has(item.url) ? false : (seen.add(item.url), true)));
  }, [data, allWorks]);
  const videos = allWorks.filter(isVideo);
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
    if (work) return setWork(null);
    if (photo !== null) return setPhoto(null);
    if (post !== null) return setPost(null);
    nav.home();
  };
  const titles: Record<TabletApp, string> = { photos: "相册", videos: "视频", works: "作品", posts: "图文", slides: "演示" };
  return (
    <div className="desk-tablet" data-screen>
      <div className="desk-tablet__status"><span>{time}</span><span>Wi-Fi · 86%</span></div>
      {!nav.app && (
        <div className="desk-home">
          <div className="desk-home__clock">{time}</div>
          <p className="desk-home__hint">点开一个应用看看</p>
          <AppGrid icons={icons} onOpen={(id, event) => nav.open(id as TabletApp, event)} />
        </div>
      )}
      {nav.app && (
        <AppView title={work?.title || titles[nav.app]} origin={nav.origin} onBack={back}>
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
          {nav.app === "videos" && (work ? <WorkDetail work={work} /> : videos.length ? <WorkCards works={videos} onPick={setWork} /> : <Empty>还没有视频作品。</Empty>)}
          {nav.app === "works" && (work ? <WorkDetail work={work} /> : <WorkCards works={allWorks} onPick={setWork} />)}
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
              {slides.map(deck => (
                <a key={deck.id} className="desk-resume" href={deck.pdfUrl || deck.fileUrl} target="_blank" rel="noreferrer">
                  <strong>{deck.title}</strong><span>{deck.description || deck.date || "演示文稿"}</span><ExternalLink size={15} />
                </a>
              ))}
            </div>
          ) : <Empty>还没有演示文稿。</Empty>)}
        </AppView>
      )}
      <button type="button" className="desk-homebar" aria-label={nav.app ? "回到主屏" : "收起平板"} onClick={() => (nav.app ? (setWork(null), setPhoto(null), setPost(null), nav.home()) : close())} />
    </div>
  );
}

/* ======================================================================
 * 手机：主屏 + 微信（和小柴聊天）+ 名片 + 音乐。
 * ==================================================================== */

type PhoneApp = "wechat" | "card" | "music";
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

type WxPage = "chat" | "shiba" | "owner" | "moments";
type WxTab = "chats" | "contacts" | "discover" | "me";

function WxNav({ title, onBack, tone = "gray", right }: { title?: string; onBack?(): void; tone?: "gray" | "white" | "clear"; right?: ReactNode }) {
  return (
    <header className={`desk-wx__nav desk-wx__nav--${tone}`}>
      <span className="desk-wx__nav-side">{onBack && <button type="button" aria-label="返回" onClick={onBack}><ChevronLeft size={26} strokeWidth={2} /></button>}</span>
      <strong>{title}</strong>
      <span className="desk-wx__nav-side desk-wx__nav-side--right">{right}</span>
    </header>
  );
}

function WxAvatar({ src, name, size = 48 }: { src?: string; name: string; size?: number }) {
  const style = { width: size, height: size };
  return src ? <img className="desk-wx__avatar" style={style} src={src} alt="" loading="lazy" referrerPolicy="no-referrer" />
    : <span className="desk-wx__avatar desk-wx__avatar--text" style={style}>{name.slice(-2)}</span>;
}

function WeChat({ data, origin }: { data: PortfolioData; onBack(): void; origin: string }) {
  const [tab, setTab] = useState<WxTab>("chats");
  const [stack, setStack] = useState<WxPage[]>([]);
  const [direction, setDirection] = useState<"push" | "pop">("push");
  const chat = useShibaChat(true);
  const [input, setInput] = useState("");
  const listRef = useRef<HTMLDivElement>(null);
  const top = stack[stack.length - 1];
  useEffect(() => { const list = listRef.current; if (list) list.scrollTop = list.scrollHeight; }, [chat.messages, top]);
  const owner = data.profile.name || "主人";
  const ownerAvatar = data.profile.avatar;
  const pageCopy = data.profile.pageCopy || {};
  const offline = Boolean(chat.config && !chat.config.enabled);
  const lastMessage = [...chat.messages].reverse().find(m => stripThinking(m.content));
  const preview = lastMessage ? stripThinking(lastMessage.content) : chat.config?.opening || "来聊聊吧～";
  const unread = !chat.messages.length;
  const moments = [
    ...(pageCopy.postList || []).map(post => ({ id: post.id, text: post.text || post.title, images: post.images, date: post.date || "" })),
    ...(!(pageCopy.postList || []).length ? data.works.map(work => ({ id: work.id, text: `${work.title}\n${work.description || ""}`.trim(), images: work.images || [], date: work.tags?.join(" · ") || "" })) : []),
  ];
  const push = (page: WxPage) => { setDirection("push"); setStack(current => [...current, page]); };
  const pop = () => { setDirection("pop"); setStack(current => current.slice(0, -1)); };
  const submit = () => { if (!input.trim() || offline) return; void chat.send(input); setInput(""); };
  const now = clock();

  const tabs: [WxTab, string, typeof MessageCircle][] = [["chats", "微信", MessageCircle], ["contacts", "通讯录", Users], ["discover", "发现", Compass], ["me", "我", User]];
  const row = (key: string, avatar: ReactNode, title: string, sub?: string, extra?: ReactNode, onClick?: () => void, pinned = false) => (
    <li key={key}><button type="button" className={`desk-wx__row${pinned ? " is-pinned" : ""}`} onClick={onClick}>
      {avatar}
      <span className="desk-wx__row-main"><strong>{title}</strong>{sub !== undefined && <small>{sub}</small>}</span>
      {extra}
    </button></li>
  );
  const icon = (color: string, glyph: ReactNode) => <span className="desk-wx__icon" style={{ background: color }}>{glyph}</span>;

  const main = (
    <div className="desk-wx__main">
      {tab === "chats" && <>
        <WxNav title={unread ? "微信(1)" : "微信"} right={<CirclePlus size={22} strokeWidth={1.6} />} />
        <div className="desk-wx__scroll">
          <div className="desk-wx__search"><Search size={15} />搜索</div>
          <ul className="desk-wx__list">
            {row("shiba", <span className="desk-wx__badge-wrap"><WxAvatar src={SHIBA_AVATAR} name="小柴" />{unread && <i className="desk-wx__badge">1</i>}</span>, "小柴", preview, <time>{now}</time>, () => push("chat"), true)}
            {row("owner", <WxAvatar src={ownerAvatar} name={owner} />, owner, "[名片] 想认识我，可以先看看这里", <time>昨天</time>, () => push("owner"))}
          </ul>
        </div>
      </>}
      {tab === "contacts" && <>
        <WxNav title="通讯录" right={<UserPlus size={21} strokeWidth={1.6} />} />
        <div className="desk-wx__scroll">
          <div className="desk-wx__search"><Search size={15} />搜索</div>
          <ul className="desk-wx__list">
            {row("new", icon("#fa9d3b", <UserPlus size={20} />), "新的朋友")}
            {row("tag", icon("#2782d7", <Tag size={18} />), "标签")}
            {row("oa", icon("#2782d7", <Newspaper size={18} />), "公众号")}
          </ul>
          <p className="desk-wx__section">星标朋友</p>
          <ul className="desk-wx__list">
            {row("c-shiba", <WxAvatar src={SHIBA_AVATAR} name="小柴" size={40} />, "小柴", undefined, undefined, () => push("shiba"))}
            {row("c-owner", <WxAvatar src={ownerAvatar} name={owner} size={40} />, owner, undefined, undefined, () => push("owner"))}
          </ul>
          <p className="desk-wx__count">2个朋友</p>
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
            <div><strong>{owner}</strong>{data.contact?.wechat && <small>微信号：{data.contact.wechat}</small>}</div>
          </div>
          <ul className="desk-wx__list desk-wx__list--gap">
            {row("me-moments", icon("linear-gradient(135deg,#f5b33f,#e8554e 45%,#4d8af0 75%,#47c66a)", <Aperture size={18} />), "朋友圈", undefined, <span className="desk-wx__chev"><ChevronRight size={18} /></span>, () => push("moments"))}
          </ul>
        </div>
      </>}
      <nav className="desk-wx__tabs">
        {tabs.map(([id, label, Icon]) => (
          <button key={id} type="button" aria-current={tab === id} onClick={() => setTab(id)}>
            <span className="desk-wx__badge-wrap"><Icon size={24} strokeWidth={1.6} fill={tab === id ? "currentColor" : "none"} />{id === "chats" && unread && <i className="desk-wx__badge desk-wx__badge--tab">1</i>}</span>
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
            {who === "shiba" ? <small>AI 数字分身 · {owner}的助理</small> : data.contact?.wechat ? <small>微信号：{data.contact.wechat}</small> : null}
            {who === "owner" && data.profile.tagline && <small>{data.profile.tagline}</small>}
          </div>
        </div>
        <ul className="desk-wx__list desk-wx__list--gap">
          {who === "shiba"
            ? row("sign", <span />, "个性签名", "熟悉他的作品、经历和想法，有问题随时问我。")
            : row("p-moments", <span />, "朋友圈", undefined, <span className="desk-wx__thumbs">{moments.flatMap(m => m.images).slice(0, 4).map(url => <img key={url} src={url} alt="" referrerPolicy="no-referrer" />)}</span>, () => push("moments"))}
        </ul>
        {who === "owner" && <ContactList contact={data.contact} />}
        <ul className="desk-wx__list desk-wx__list--gap">
          <li><button type="button" className="desk-wx__action" onClick={() => push("chat")}><MessageCircle size={18} />{who === "shiba" ? "发消息" : "先和小柴聊聊"}</button></li>
        </ul>
      </div>
    </div>
  );

  const pages: Record<WxPage, ReactNode> = {
    chat: (
      <div className="desk-wx__page-inner desk-wx__page-inner--chat">
        <WxNav title="小柴" onBack={pop} right={<Ellipsis size={22} />} />
        <div className="desk-wx__messages" ref={listRef}>
          <p className="desk-wx__time">{now}</p>
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
          {!chat.messages.length && !offline && chat.config?.suggestions?.length ? (
            <div className="desk-chat__suggest">{chat.config.suggestions.map(item => <button key={item} type="button" onClick={() => void chat.send(item)}>{item}</button>)}</div>
          ) : null}
        </div>
        <form className="desk-wx__input" onSubmit={event => { event.preventDefault(); submit(); }}>
          <span className="desk-wx__round" aria-hidden="true"><Mic size={17} /></span>
          <input value={input} onChange={event => setInput(event.target.value)} disabled={offline} maxLength={800} aria-label="给小柴发消息" />
          <Smile size={27} strokeWidth={1.4} aria-hidden="true" />
          {input.trim() ? <button type="submit" className="desk-wx__send" disabled={chat.streaming}>发送</button> : <CirclePlus size={27} strokeWidth={1.4} aria-hidden="true" />}
        </form>
      </div>
    ),
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
    { id: "card", label: "名片", color: "linear-gradient(145deg,#ffb36b,#f0743b)", glyph: "☺" },
    { id: "music", label: "音乐", color: "linear-gradient(145deg,#ff6b8b,#d6305a)", glyph: "♪" },
    ...(contact?.email ? [{ id: "mail", label: "邮件", color: "linear-gradient(145deg,#6bbcff,#2b7ae8)", glyph: "✉" }] : []),
    ...(contact?.phone ? [{ id: "tel", label: "电话", color: "linear-gradient(145deg,#6fe39a,#20a85a)", glyph: "✆" }] : []),
  ];
  const openApp = (id: string, event: ReactMouseEvent<HTMLElement>) => {
    if (id === "mail" && contact?.email) { window.location.href = `mailto:${contact.email}`; return; }
    if (id === "tel" && contact?.phone) { window.location.href = `tel:${contact.phone}`; return; }
    nav.open(id as PhoneApp, event);
  };
  return (
    <div className="desk-phone" data-screen>
      <div className="desk-phone__island" aria-hidden="true" />
      <div className="desk-phone__status"><span>{time}</span><span>5G · 86%</span></div>
      {!nav.app && (
        <div className="desk-home desk-home--phone">
          <div className="desk-home__clock">{time}</div>
          <button type="button" className="desk-notify" onClick={event => nav.open("wechat", event)}>
            <span className="desk-notify__icon" aria-hidden="true">◍</span>
            <span><strong>微信 · 小柴</strong><small>来聊聊吧～</small></span>
          </button>
          <AppGrid icons={icons} onOpen={openApp} />
        </div>
      )}
      {nav.app === "wechat" && <WeChat data={data} onBack={nav.home} origin={nav.origin} />}
      {nav.app === "card" && (
        <AppView title="名片" origin={nav.origin} onBack={nav.home}>
          <div className="desk-wechat__card">
            {data.profile.avatar ? <Img className="desk-wechat__card-avatar" src={data.profile.avatar} alt="" /> : null}
            <h3>{data.profile.name || "你好"}</h3>
            {data.profile.tagline && <p>{data.profile.tagline}</p>}
            <ContactList contact={contact} />
          </div>
        </AppView>
      )}
      {nav.app === "music" && (
        <AppView title="音乐" origin={nav.origin} onBack={nav.home} tone="dark">
          <MusicPanel music={music} />
        </AppView>
      )}
      <button type="button" className="desk-homebar" aria-label={nav.app ? "回到主屏" : "收起手机"} onClick={() => (nav.app ? nav.home() : close())} />
    </div>
  );
}

/* ======================================================================
 * 纸质笔记本：诗集，左右两页，翻页有动画。
 * ==================================================================== */

function NotebookSpread({ data }: { data: PortfolioData }) {
  const close = useCloseDevice();
  const pageCopy = data.profile.pageCopy || {};
  const poems = (pageCopy.poemList?.length ? pageCopy.poemList : data.poems || []).filter(poem => poem.text?.trim());
  const [index, setIndex] = useState(0);
  const [turn, setTurn] = useState<"next" | "prev" | "">("");
  const go = (step: number) => {
    if (!poems.length) return;
    setTurn(step > 0 ? "next" : "prev");
    setIndex((index + step + poems.length) % poems.length);
  };
  const poem = poems[index];
  return (
    <div className="desk-book">
      <button type="button" className="desk-book__close" aria-label="合上笔记本" onClick={close}><X size={18} /></button>
      <div className="desk-book__page desk-book__page--left">
        <p className="desk-book__kicker">诗与随笔</p>
        {poem ? <>
          <h2>{poem.title || "无题"}</h2>
          {poem.imageUrl && <Img className="desk-book__image" src={poem.imageUrl} alt="" />}
          {poem.note && <p className="desk-book__note">{poem.note}</p>}
          <p className="desk-book__count">第 {index + 1} 篇 / 共 {poems.length} 篇</p>
        </> : <>
          <h2>{data.profile.name || "随笔"}</h2>
          {paragraphs(data.profile.intro).slice(0, 3).map((line, i) => <p key={i}>{line}</p>)}
        </>}
      </div>
      <div className="desk-book__page desk-book__page--right" key={index} data-turn={turn}>
        {poem ? poem.text.split("\n").map((line, i) => <p key={i} className="desk-book__line">{line || "\u00a0"}</p>) : <p className="desk-book__line">{data.profile.quote || "这一本还没写满。"}</p>}
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
  useEffect(() => {
    const element = new Audio();
    element.preload = "none";
    element.addEventListener("play", () => setPlaying(true));
    element.addEventListener("pause", () => setPlaying(false));
    audio.current = element;
    return () => { element.pause(); element.src = ""; };
  }, []);
  useEffect(() => {
    const element = audio.current;
    if (!element) return;
    const onEnded = () => setIndex(current => (tracks.length ? (current + 1) % tracks.length : 0));
    element.addEventListener("ended", onEnded);
    return () => element.removeEventListener("ended", onEnded);
  }, [tracks.length]);
  const start = (next: number) => {
    const element = audio.current;
    const track = tracks[next];
    if (!element || !track?.audioUrl) return;
    if (element.dataset.track !== track.id) {
      element.src = track.audioUrl;
      element.dataset.track = track.id;
    }
    void element.play().catch(() => setPlaying(false));
  };
  useEffect(() => { if (playing) start(index); }, [index]);
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
      <header><strong>小音箱</strong><button type="button" aria-label="关闭" onClick={close}><X size={16} /></button></header>
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
  const [data, setData] = useState<PortfolioData>(emptyData);
  const [ready, setReady] = useState(false);
  const [webglFailed, setWebglFailed] = useState(false);
  const [open, setOpen] = useState<{ kind: Device; origin: DOMRect | null } | null>(null);
  const [hover, setHover] = useState<{ kind: DeskHotspot; x: number; y: number } | null>(null);
  const [lampOn, setLampOn] = useState(true);
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
    const scene = sceneRef.current;
    const hotspot: DeskHotspot = kind;
    const origin = scene?.screenRect(hotspot) || null;
    scene?.focus(hotspot);
    setHover(null);
    setOpen({ kind, origin });
  }, []);

  const select = useCallback((hotspot: DeskHotspot) => {
    const { powerOn: power, data: current } = stateRef.current;
    switch (hotspot) {
      case "lamp":
        if (!power) { showToast("插线板关着，台灯没电。"); return; }
        setLampOn(on => !on);
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
      case "keyboard":
      case "mouse":
        sceneRef.current?.pressKeys();
        if (!power) { showToast("电脑没电了，先打开插线板。"); return; }
        openDevice("laptop");
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
    void loadPortfolio().then(next => { if (alive) setData(next); });
    return () => { alive = false; };
  }, []);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let scene: DeskScene;
    try {
      scene = createDeskScene({
        canvas,
        onHover: (kind, x, y) => setHover(kind ? { kind, x, y } : null),
        onSelect: kind => select(kind),
        onReady: () => {
          setReady(true);
          document.getElementById("boot-loader")?.remove();
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
    sceneRef.current?.setPower(powerOn);
    if (!powerOn && music.playing) music.toggle();
  }, [powerOn, ready]);
  useEffect(() => { sceneRef.current?.setMusic(music.playing); }, [music.playing, ready]);
  useEffect(() => { document.title = data.profile.name ? `${data.profile.name}的书桌` : "我的书桌"; }, [data.profile.name]);

  const closeDevice = useCallback(() => {
    sceneRef.current?.focus(null);
    setOpen(null);
  }, []);

  const dock: [DeskHotspot, string][] = [["laptop", "电脑"], ["tablet", "平板"], ["phone", "手机"], ["notebook", "笔记本"], ["speaker", "音箱"], ["lamp", lampOn && powerOn ? "关灯" : "开灯"]];

  return (
    <div className={`desk-page${ready ? " is-ready" : ""}${open ? " has-device" : ""}`}>
      <canvas ref={canvasRef} className="desk-canvas" aria-label="三维书桌场景，可以点击桌上的物品" />
      {webglFailed && <div className="desk-fallback">你的浏览器不支持 3D 画面，可以用下方按钮打开各个物品。</div>}

      <header className="desk-hud">
        <div>
          <h1>{data.profile.name ? `${data.profile.name}的书桌` : "我的书桌"}</h1>
          <p className="desk-hud__hint-desktop">点一点桌上的东西：电脑、平板、手机、笔记本都能打开。</p>
          <p className="desk-hud__hint-mobile">左右拖动看看桌面，点物品打开。</p>
        </div>
        <a className="desk-hud__link" href="/">经典版主页</a>
      </header>

      {hover && !open && (
        <div className="desk-tip" style={{ left: hover.x, top: hover.y }}>{LABELS[hover.kind]}</div>
      )}
      {toast && <div className="desk-toast" role="status">{toast}</div>}

      <nav className="desk-dock" aria-label="桌上的物品">
        {dock.map(([kind, label]) => (
          <button key={kind} type="button" onClick={() => select(kind)}>{label}</button>
        ))}
      </nav>

      {open && (
        <DeviceShell kind={open.kind} origin={open.origin} onClosed={closeDevice} label={LABELS[open.kind]}>
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
