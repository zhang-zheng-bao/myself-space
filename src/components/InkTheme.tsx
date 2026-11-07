import React from 'react';

/**
 * 染墨主题的场景层：纸角、左上角红梅、两位守护者、落雪。
 *
 * 底子保持干净的纯色暗底，不铺大面积笔刷涂抹 —— 墨意只落在纸角、
 * 描边和人物边缘的墨晕上。人物插画边缘用 mask 做羽化，融进暗底。
 * 所有图层 pointer-events:none，不挡交互。
 */
export function InkScenery() {
  return <>
    <div className="ink-scenery" aria-hidden="true">
    <img className="ink-paper ink-paper--top" src="/themes/ink/paper.webp" alt="" />
    <img className="ink-plum" src="/themes/ink/plum-corner.png" alt="" />
    <img className="ink-guardian ink-guardian--light" src="/themes/ink/guardian-light.webp" alt="" />
    <img className="ink-guardian ink-guardian--dark" src="/themes/ink/guardian-dark.webp" alt="" />
    {Array.from({length:26},(_,i)=><i className="ink-mote" key={i} style={{left:`${i%2 ? 84+(i*7%15) : (i*13%31)}%`,top:`${(i*23)%99}%`,animationDelay:`-${i*.63}s`,animationDuration:`${7+i%5}s`}} />)}
  </div>
    {/* 纸角独立于背景层，覆盖普通页面内容，但不遮挡弹窗和交互。 */}
    <div className="ink-foreground" aria-hidden="true">
      <img className="ink-paper ink-paper--bottom" src="/themes/ink/paper.webp" alt="" />
    </div>
  </>;
}

export function InkCharacter({section}:{section:string}) {
  return <div className="ink-character" data-section={section}>
    <img src="/themes/ink/personal-character.webp" alt="黑发眼镜、白金长袍的全身个人角色插画" />
  </div>;
}
