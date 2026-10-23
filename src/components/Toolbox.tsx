import { useState } from "react";
import { ArrowLeft, ArrowUpRight, AudioLines, Bookmark, BriefcaseBusiness, Check, ChevronRight, Download, Film, Folder, Grid2X2, Layers3, Link2, Pencil, Plus, Search, ShieldCheck, X } from "lucide-react";
import "./toolbox.css";

const categories = ["全部工具", "媒体处理", "创作辅助"];
const apps = [{ id: "wanchuang", name: "万创核心", href: "/tools/wanchuang/index.html", category: "媒体处理", description: "从一条链接开始，收集视频与封面、提取文稿，让灵感成为随手可用的创作素材。", tags: ["视频下载", "语音转写", "素材收集"] }];

function ToolboxIllustration() {
  return <svg className="tb-illustration" viewBox="0 0 240 170" fill="none" aria-hidden="true">
    <g stroke="#334947" strokeDasharray="3 5"><path d="M41 37v39q0 12 17 12h25" /><path d="M33 112v20h65" /><path d="M192 40v35" /></g>
    <g stroke="#6b8580" strokeWidth="1.2" strokeLinejoin="round"><path fill="#0c1618" d="m80 95 64-30 68 36-64 33z" /><path fill="#111d1e" d="m80 95 68 39v42l-68-39z" transform="translate(0 -12)" /><path fill="#0a1215" d="m148 122 64-33v42l-64 33z" /><path d="m80 83 64-30 68 36M94 89V65l17-8 63 34v18M106 95V72l6-3 50 27v19M94 65l12 7M112 57V46l12-6 61 33v30M124 40v12l49 27v30M112 46l61 33 12-6M98 119l25 14v6l-25-14z" /></g>
    <rect x="20" y="12" width="30" height="30" rx="8" fill="#102d36" stroke="#6ed4ee" /><path d="M28 22h14v11H28z" stroke="#6ed4ee" /><path d="m33 24 5 3.5-5 3.5z" fill="#6ed4ee" />
    <rect x="8" y="95" width="31" height="31" rx="8" fill="#27213b" stroke="#ae91e0" /><path d="M16 108v6m4-11v16m4-20v24m4-18v12m4-9v6" stroke="#be9cf4" strokeWidth="2" strokeLinecap="round" />
    <rect x="177" y="17" width="30" height="30" rx="8" fill="#322b1c" stroke="#d7b66d" /><path d="M185 26h6l2 3h7v11h-15z" stroke="#e2bb68" strokeLinejoin="round" />
    <path d="M219 54h12" stroke="#62f5ce" strokeWidth="2" />
  </svg>;
}

export default function Toolbox({ description }: { description: string }) {
  const [category, setCategory] = useState("全部工具");
  const [query, setQuery] = useState("");
  const filtered = apps.filter(app => (category === "全部工具" || app.category === category) && `${app.name}${app.description}${app.tags.join("")}`.includes(query.trim()));

  return <div className="toolbox">
    <header className="tb-heading">
      <svg className="tb-dot-field" width="100%" height="100%" aria-hidden="true"><defs><pattern id="tb-dots" width="14" height="14" patternUnits="userSpaceOnUse"><circle cx="2" cy="2" r=".7" fill="#29413d" /></pattern></defs><rect width="100%" height="100%" fill="url(#tb-dots)" /></svg>
      <div className="tb-heading-copy"><BriefcaseBusiness className="tb-title-icon" size={27} /><h2>我的工具箱<span>。</span></h2><p>{description}</p><span className="tb-update">持续更新</span></div>
      <ToolboxIllustration />
    </header>

    <>
      <div className="tb-toolbar"><div className="tb-tabs" aria-label="工具分类">{categories.map(item => <button key={item} aria-pressed={category === item} onClick={() => setCategory(item)}>{item}{item === "全部工具" && <span>{apps.length}</span>}</button>)}</div><label className="tb-search"><Search size={16} /><input aria-label="搜索工具" placeholder="搜索工具…" value={query} onChange={e => setQuery(e.target.value)} /></label></div>
      <div className="tb-section-title"><h3><Bookmark size={18} />精选应用<span className="tb-amber-label">推荐</span></h3><p>把常用的工具放在这里</p></div>
      <div className="tb-grid">
        {filtered.map(app => <a className="tb-card" key={app.id} href={app.href} aria-label={`打开${app.name}网页版`}>
          <span className="tb-app-logo" aria-hidden="true"><img src="/tools/wanchuang/assets/clipharbor-logo.png" alt="" width="48" height="48" /></span>
          <span className="tb-card-copy"><span className="tb-card-name">{app.name}<span className="tb-amber-label">预览版</span></span><span className="tb-card-meta">视频下载 · 语音转写</span></span><ChevronRight size={16} className="tb-card-arrow" />
        </a>)}
        {!query && category === "全部工具" && <div className="tb-card tb-coming"><span className="tb-coming-icon"><Plus size={25} /></span><span className="tb-card-copy"><span className="tb-card-name">更多工具</span><span className="tb-card-meta">陆续加入</span></span></div>}
      </div>
      {filtered.length === 0 && <div className="tb-no-results"><Search size={26} /><h3>这里还没有匹配的工具</h3><p>换个关键词，或回到全部工具看看。</p><button onClick={() => { setQuery(""); setCategory("全部工具"); }}>查看全部工具<ChevronRight size={15} /></button></div>}
      {filtered.length > 0 && <section className="tb-capabilities" aria-labelledby="tb-capabilities-title">
        <div className="tb-section-title"><h3 id="tb-capabilities-title"><Grid2X2 size={18} />探索工具能力</h3><p>一个工具，多种可能</p></div>
        <div className="tb-capability-grid">{[
          { name: "视频下载", detail: "保存画面，收集灵感", icon: Film, tone: "cyan", target: "view=download&mode=video" },
          { name: "语音转写", detail: "从音视频中提取文稿", icon: AudioLines, tone: "violet", target: "view=speech" },
          { name: "素材收集", detail: "一并收集视频与封面", icon: Folder, tone: "amber", target: "view=download&mode=both" },
        ].map(item => <a className="tb-capability" key={item.name} href={`/tools/wanchuang/index.html?${item.target}`} aria-label={`打开万创核心${item.name}`}><span className={`tb-capability-icon tb-capability-icon--${item.tone}`}><item.icon size={24} /></span><span><strong>{item.name}</strong><small>{item.detail}</small></span><ArrowUpRight size={16} className="tb-capability-arrow" aria-hidden="true" /></a>)}</div>
      </section>}
      <ol className="tb-journey">{[
        { title: "发现工具", description: "找到适合的创作工具", icon: Search },
        { title: "打开应用", description: "进入工作台预览", icon: ArrowUpRight },
        { title: "开始创作", description: "把灵感变成作品", icon: Pencil },
      ].map((step, index) => <li key={step.title}><span className="tb-step-icon"><step.icon size={20} /></span><span><strong><em>0{index + 1}</em>{step.title}</strong><small>{step.description}</small></span>{index < 2 && <ChevronRight className="tb-step-arrow" size={16} />}</li>)}</ol>
      <footer className="tb-footnote"><span><ShieldCheck size={16} />独立开发，持续打磨</span><span>好用的工具，让想法走得更远。</span></footer>
    </>
  </div>;
}
