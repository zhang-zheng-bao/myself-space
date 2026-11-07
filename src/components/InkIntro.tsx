import React, { useEffect, useRef } from "react";
import type { PortfolioData, Work } from "../types";
import { defaultHomeStats } from "../types";
import {
  InkArrowIcon, InkChartIcon, InkClipboardIcon, InkExternalIcon,
  InkFilmIcon, InkLayersIcon, InkPlayIcon, InkSparkIcon,
} from "./InkIcons";

/**
 * 染墨主题的「自我介绍」右栏。
 *
 * 照设计稿 1:1 排的，所以结构跟原主题的 IntroDashboard 不一样（时间线是
 * 「日期 | 标题 …… @身份」一行 + 正文）。作品保留自动轮播，经历保留自动滚动。
 * 数据来源与原主题完全相同：后台改了什么，两套主题都跟着变。
 */
type Props = {
  data: PortfolioData;
  works: Work[];
  onSelectWork: (work: Work) => void;
  onAllWorks: () => void;
  zhText: (value?: string) => string;
  categoryLabel: (category: string) => string;
  isVideoWork: (work: Work) => boolean;
};

const timelineIcons = [InkClipboardIcon, InkLayersIcon];

function Heading({ cn, en, children }: { cn: string; en: string; children?: React.ReactNode }) {
  return (
    <div className="ink-heading">
      <h2>
        <span className="ink-heading__ring" aria-hidden="true" />
        <span className="ink-heading__cn">{cn}</span>
        <span className="ink-heading__slash" aria-hidden="true">/</span>
        <span className="ink-heading__en">{en}</span>
      </h2>
      <span className="ink-heading__stroke" aria-hidden="true" />
      {children}
    </div>
  );
}

export default function InkIntro({ data, works, onSelectWork, onAllWorks, zhText, categoryLabel, isVideoWork }: Props) {
  const statCopy = data.profile.pageCopy?.homeStats;
  const stats = [
    { Icon: InkFilmIcon, ...defaultHomeStats.works, value: statCopy?.works?.value || `${Math.max(10, data.works.length)}+`, ...statCopy?.works },
    { Icon: InkChartIcon, ...defaultHomeStats.plays, ...statCopy?.plays },
    { Icon: InkSparkIcon, ...defaultHomeStats.ai, ...statCopy?.ai },
  ];
  const homeWorks = works;
  const timelineRef = useRef<HTMLDivElement | null>(null);
  const timelinePaused = useRef(false);
  const resumeTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    const viewport = timelineRef.current;
    if (!viewport || data.experiences.length < 2) return;
    const reduced = window.matchMedia("(prefers-reduced-motion: reduce)");
    const timer = window.setInterval(() => {
      if (document.hidden || reduced.matches || timelinePaused.current) return;
      if (viewport.matches(":hover, :focus-within") || viewport.scrollHeight <= viewport.clientHeight + 2) return;
      const entries = Array.from(viewport.querySelectorAll(".ink-entry")) as HTMLElement[];
      const top = viewport.getBoundingClientRect().top;
      const positions = entries.map(entry => entry.getBoundingClientRect().top - top + viewport.scrollTop);
      const max = viewport.scrollHeight - viewport.clientHeight;
      const next = positions.find(position => position > viewport.scrollTop + 3);
      viewport.scrollTo({ top: viewport.scrollTop >= max - 3 ? 0 : Math.min(next ?? max, max), behavior: "smooth" });
    }, 4200);
    return () => { window.clearInterval(timer); if (resumeTimer.current) clearTimeout(resumeTimer.current); };
  }, [data.experiences]);

  const pauseTimeline = () => {
    timelinePaused.current = true;
    if (resumeTimer.current) clearTimeout(resumeTimer.current);
    resumeTimer.current = setTimeout(() => { timelinePaused.current = false; }, 5000);
  };

  return (
    <div className="ink-intro">
      <p className="ink-intro__note" aria-hidden="true">Content Creates<br />More Possibilities</p>

      <section className="ink-about" aria-labelledby="ink-about-title">
        <Heading cn="关于我" en="ABOUT ME" />
        <p className="ink-about__lead" id="ink-about-title">{zhText(data.profile.intro)}</p>
        <div className="ink-stats">
          {stats.map(({ Icon, value, label, detail }) => (
            <article key={label} className="ink-stat">
              <Icon size={42} className="ink-stat__icon" />
              <div>
                <p className="ink-stat__value"><strong>{value}</strong><span>{label}</span></p>
                <p className="ink-stat__detail">{detail}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="ink-career">
        <Heading cn="人生旅途" en="LIFE JOURNEY" />
        <div ref={timelineRef} className="ink-timeline" onWheel={pauseTimeline} onTouchStart={pauseTimeline} onKeyDown={pauseTimeline} tabIndex={0} aria-label="人生经历时间线，可滚动查看全部经历">
          <ol>
            {data.experiences.map((exp, index) => {
              const Icon = timelineIcons[index % timelineIcons.length];
              return (
                <li key={exp.id} className="ink-entry">
                  <i className="ink-entry__dot" aria-hidden="true" />
                  <Icon size={28} className="ink-entry__icon" />
                  <div className="ink-entry__body">
                    <div className="ink-entry__head">
                      <time>{zhText(exp.period)}</time>
                      <span className="ink-entry__bar" aria-hidden="true">|</span>
                      <h3>{zhText(exp.role)}</h3>
                      <span className="ink-entry__who">@ {zhText(exp.company)}</span>
                    </div>
                    <p>{zhText(exp.desc)}</p>
                  </div>
                </li>
              );
            })}
          </ol>
        </div>
      </section>

      <section className="ink-works">
        <Heading cn="我的作品" en="MY WORKS">
          <button type="button" className="ink-works__all" data-track="home:all-works" onClick={onAllWorks}>
            查看全部作品 <InkArrowIcon size={22} />
          </button>
        </Heading>
        <div className="ink-works__viewport" tabIndex={0} role="region" aria-label="作品自动轮播，悬停或聚焦暂停，可左右滚动">
          <div className="ink-works__track" style={{ "--ink-carousel-duration": `${Math.max(24, homeWorks.length * 6)}s` } as React.CSSProperties}>
            {[0, 1].map(copy => (
              <div key={copy} className="ink-works__grid" aria-hidden={copy === 1 || undefined}>
          {homeWorks.map((work) => {
            const video = isVideoWork(work);
            const Meta = video ? InkPlayIcon : InkExternalIcon;
            return (
              <button type="button" key={work.id} tabIndex={copy === 1 ? -1 : 0} className="ink-card" data-track={`home:work:${work.id}`} onClick={() => onSelectWork(work)}>
                <span className="ink-card__media">
                  {work.images?.[0]
                    ? <img src={work.images[0]} alt="" loading="lazy" referrerPolicy="no-referrer" />
                    : <span className="ink-card__empty">NO IMAGE</span>}
                  <span className="ink-card__tag">{categoryLabel(work.category)}</span>
                </span>
                <strong className="ink-card__title">{zhText(work.title)}</strong>
                <span className="ink-card__meta">
                  <Meta size={20} />{video ? "播放视频" : "查看项目"}<InkArrowIcon size={18} />
                </span>
              </button>
            );
          })}
              </div>
            ))}
          </div>
        </div>
      </section>
    </div>
  );
}
