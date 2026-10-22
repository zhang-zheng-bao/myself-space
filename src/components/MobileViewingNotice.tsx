import { useState } from "react";
export default function MobileViewingNotice() {
  const [dismissed, setDismissed] = useState(false);
  if (dismissed) return null;
  return <aside className="mobile-viewing-notice"><span>电脑端观看体验更佳，手机版仅展示部分内容。</span><button type="button" aria-label="关闭观看提示" onClick={() => setDismissed(true)}>×</button><style>{`.mobile-viewing-notice{display:none}@media(max-width:767px){.mobile-viewing-notice{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:10px 16px;background:#182b2b;color:#c5e5df;font-size:12px;line-height:1.7}.mobile-viewing-notice button{min-width:36px;min-height:36px;font-size:22px;color:inherit;background:none;border:0}}`}</style></aside>;
}
