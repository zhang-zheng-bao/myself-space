import { ArrowUpRight, BookOpen, Film } from "lucide-react";
import "./toolbox.css";

export const caseStudies = [{
  id: "jiuyang-storyboard",
  title: "九阳豆浆｜视频分镜与 Prompt 分析",
  description: "从画面、对白到人物与道具资产，解析提示词从初稿到终稿的设计过程。",
  href: "/cases/jiuyang/index.html",
  tags: "27 个分镜单元 · 40 张原片截图 · Prompt 设计",
}];

export default function CaseStudies({ description }: { description: string }) {
  return <div className="toolbox">
    <header className="tb-heading">
      <div className="tb-heading-copy">
        <BookOpen className="tb-title-icon" size={27} />
        <h2>案例分析<span>。</span></h2>
        <p>{description}</p>
        <span className="tb-update">学习 · 拆解 · 思考</span>
      </div>
    </header>
    <div className="tb-section-title"><h3><Film size={18} />视频案例</h3><p>{caseStudies.length} 个案例</p></div>
    <div style={{ display: "grid", gap: 14 }}>
      {caseStudies.map(item => <a key={item.id} href={item.href} className="tb-card" data-track={`case-study:${item.id}`}>
        <span className="tb-app-logo" aria-hidden="true"><Film size={28} /></span>
        <span className="tb-card-copy">
          <span className="tb-card-name">{item.title}</span>
          <span className="tb-card-meta" style={{ whiteSpace: "normal", lineHeight: 1.8 }}>{item.description}</span>
          <span className="tb-card-meta" style={{ whiteSpace: "normal" }}>{item.tags}</span>
        </span>
        <ArrowUpRight size={18} className="tb-card-arrow" />
      </a>)}
    </div>
    <footer className="tb-footnote"><span><BookOpen size={16} />仅用于参考学习优秀的视频案例</span></footer>
    <p className="tb-card-meta">分镜资产和提示词均为二创，非官方原版，无任何商用行为。</p>
  </div>;
}
