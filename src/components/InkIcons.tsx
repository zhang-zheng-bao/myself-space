import React from "react";

/**
 * 染墨主题的手绘线稿图标。
 *
 * 照着设计稿逐个描出来：线条略带抖动、端点圆头，颜色走 currentColor，
 * 这样同一套图标放在不同深浅的底上都能跟着文字色走。比例都是 24×24，
 * 尺寸由调用处的 size 决定，和 lucide 的接口保持一致，替换时调用点不用改。
 */
type IconProps = { size?: number; className?: string };

const base = (size: number) => ({
  width: size,
  height: size,
  viewBox: "0 0 24 24",
  fill: "none",
  stroke: "currentColor",
  strokeLinecap: "round" as const,
  strokeLinejoin: "round" as const,
  "aria-hidden": true,
});

/** 场记板：作品数。 */
export function InkFilmIcon({ size = 32, className }: IconProps) {
  return (
    <svg {...base(size)} className={className} strokeWidth={1.35}>
      <path d="M4.2 10.6 19.6 8.1c.9-.1 1.5.5 1.6 1.4l.6 6.6c.1 1-.6 1.7-1.5 1.8l-13.6 1.6c-.9.1-1.6-.5-1.7-1.4L4 12c-.1-.8.4-1.4 1.2-1.5Z" />
      <path d="M10.4 12.7 14.2 14.8 10.7 16.9Z" />
      <path d="M3.6 8.4c.3-1.1 1.6-1.4 2.3-.5" />
      <path d="M6.6 7.6 19.4 4.4" />
      <path d="M8.4 6.4c.2-.9 1.3-1 1.8-.4M12 5.5c.2-.9 1.3-1 1.8-.4M15.6 4.6c.2-.9 1.3-1 1.8-.4" />
      <circle cx="4.6" cy="9" r=".9" />
    </svg>
  );
}

/** 柱状图：播放量。底部一道干笔托底。 */
export function InkChartIcon({ size = 32, className }: IconProps) {
  return (
    <svg {...base(size)} className={className} strokeWidth={1.5}>
      <path d="M6.6 17.2v-2.6M10.4 17.4V9.8M14.2 17.3V5.4M17.8 17.4v-6.6" />
      <path d="M3.4 20c3.6-.5 9.4-.7 17.4-.4" strokeWidth={1.9} />
      <path d="M5.2 20.7c4.2-.3 8.6-.3 13.2-.1" strokeWidth={.6} opacity={.6} />
    </svg>
  );
}

/** 四角星芒：AI 技能。 */
export function InkSparkIcon({ size = 32, className }: IconProps) {
  return (
    <svg {...base(size)} className={className} strokeWidth={1.3}>
      <path d="M12 3.6c.5 4.6 2.3 6.9 7.2 8.1-4.9 1-6.7 3.2-7.2 8.3-.5-5.1-2.3-7.3-7.2-8.3 4.9-1.2 6.7-3.5 7.2-8.1Z" />
      <path d="M19.4 4.2v1.8M18.5 5.1h1.8M4.6 17.4v1.6M3.8 18.2h1.6M18.7 17.6v1.5M17.9 18.3h1.5" strokeWidth={1.1} />
    </svg>
  );
}

/** 摊开的书：查看作品集。 */
export function InkBookIcon({ size = 30, className }: IconProps) {
  return (
    <svg {...base(size)} className={className} strokeWidth={1.4}>
      <path d="M2.6 18.6 5.2 7.4c2.6-.9 4.9-.6 6.8.9l-2.4 11.2c-2-1.2-4.3-1.5-7-.9Z" />
      <path d="M12 8.3c2-1.6 4.4-2.1 7.2-1.4l-1.9 11.3c-2.9-.5-5.4-.1-7.7 1.3" />
      <path d="M19.2 6.9 21.6 7.5 19.6 18.8 17.3 18.2" />
      <path d="M2.6 18.6c2.4.6 4.6.9 7 .9" />
      <path d="M6.4 10.6l2.4.2M6 12.6l2.4.2M5.6 14.6l2.4.2M13.6 10.4l2.4-.3M13.2 12.4l2.4-.3M12.8 14.4l2.4-.3" strokeWidth={.9} />
    </svg>
  );
}

/** 信封：联系我。 */
export function InkMailIcon({ size = 30, className }: IconProps) {
  return (
    <svg {...base(size)} className={className} strokeWidth={1.4}>
      <path d="M2.8 7.2c6.2-.8 12.4-1.2 18.6-1.3l.2 11.6c-6.2.4-12.3.8-18.4.9Z" />
      <path d="M3.2 7.6 12.3 13.6 21.2 6.4" />
      <path d="M3.4 18 9.6 12.2M20.9 17.2 15 11.8" strokeWidth={1.1} />
    </svg>
  );
}

/** 夹板清单：时间线第一类条目。 */
export function InkClipboardIcon({ size = 24, className }: IconProps) {
  return (
    <svg {...base(size)} className={className} strokeWidth={1.35}>
      <path d="M6.2 5.4h11.4c.8 0 1.4.6 1.4 1.4v12.4c0 .8-.6 1.4-1.4 1.4H6.4c-.8 0-1.4-.6-1.4-1.4V6.8c0-.8.5-1.4 1.2-1.4Z" />
      <path d="M9.4 5.4c0-1.2.6-2 1.4-2 .9 0 1.3.8 1.3 1.7M12.2 5.1c0-1 .6-1.7 1.4-1.7.9 0 1.3.7 1.2 1.9" />
      <path d="M8.4 10.4h7.2M8.4 13.2h7.2M8.4 16h7.2" />
    </svg>
  );
}

/** 层叠：时间线第二类条目。 */
export function InkLayersIcon({ size = 24, className }: IconProps) {
  return (
    <svg {...base(size)} className={className} strokeWidth={1.35}>
      <path d="M12 4.2 20.4 8.6 12 13 3.6 8.6Z" />
      <path d="M3.6 12.4 12 16.8 20.4 12.4" />
      <path d="M3.6 16 12 20.4 20.4 16" />
    </svg>
  );
}

/** 方框箭头：查看项目。 */
export function InkExternalIcon({ size = 18, className }: IconProps) {
  return (
    <svg {...base(size)} className={className} strokeWidth={1.5}>
      <path d="M10.4 5.2H6c-.9 0-1.6.7-1.6 1.6V18c0 .9.7 1.6 1.6 1.6h11.2c.9 0 1.6-.7 1.6-1.6v-4.4" />
      <path d="M13.4 4.6h6v6M19.2 4.8 11 13" />
    </svg>
  );
}

/** 空心播放三角：播放视频。 */
export function InkPlayIcon({ size = 18, className }: IconProps) {
  return (
    <svg {...base(size)} className={className} strokeWidth={1.5}>
      <path d="M6.6 4.6c0-.6.6-.9 1.1-.6l11 7.1c.5.3.5 1 0 1.3l-11 7.1c-.5.3-1.1 0-1.1-.6Z" />
    </svg>
  );
}

/** 细长箭头：行内「→」。 */
export function InkArrowIcon({ size = 18, className }: IconProps) {
  return (
    <svg {...base(size)} className={className} strokeWidth={1.5}>
      <path d="M3.6 12h16.4M14.2 6.4 20 12l-5.8 5.6" />
    </svg>
  );
}

/** 播放队列：三横 + 音符。 */
export function InkQueueIcon({ size = 20, className }: IconProps) {
  return (
    <svg {...base(size)} className={className} strokeWidth={1.6}>
      <path d="M4 7h10M4 12h10M4 17h7" />
      <path d="M18.4 5v8.6" />
      <circle cx="17.2" cy="15.6" r="1.8" />
    </svg>
  );
}
