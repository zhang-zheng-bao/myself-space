import React from 'react';

export function InkScenery() {
  return <div className="ink-scenery" aria-hidden="true">
    <img className="ink-paper ink-paper--top" src="/themes/ink/paper-generated.png" alt="" />
    <img className="ink-paper ink-paper--bottom" src="/themes/ink/paper-generated.png" alt="" />
    <img className="ink-guardian ink-guardian--light" src="/themes/ink/guardian-light-v2.png" alt="" />
    <img className="ink-guardian ink-guardian--dark" src="/themes/ink/guardian-dark-v2.png" alt="" />
    <img className="ink-flow" src="/themes/ink/flow-generated.png" alt="" />
    {Array.from({length:26},(_,i)=><i className="ink-mote" key={i} style={{left:`${i%2 ? 84+(i*7%15) : (i*13%31)}%`,top:`${(i*23)%99}%`,animationDelay:`-${i*.63}s`,animationDuration:`${7+i%5}s`}} />)}
  </div>;
}

export function InkCharacter({section}:{section:string}) {
  return <div className="ink-character" data-section={section}>
    <img src="/themes/ink/personal-character.png" alt="黑发眼镜、白金长袍的全身个人角色插画" />
  </div>;
}
