import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown, Layers, Feather, Monitor } from "lucide-react";
import "./theme-picker.css";

export type SiteTheme = "original" | "ink" | "desk";
const choices = [
  { id: "original", label: "原主题", Icon: Layers },
  { id: "ink", label: "染墨", Icon: Feather },
  { id: "desk", label: "3D 桌面", Icon: Monitor },
] as const;

export default function ThemePicker({ current, onChange }: { current: SiteTheme; onChange?: (theme: "original" | "ink") => void }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  const selected = choices.find(choice => choice.id === current)!;
  useEffect(() => {
    if (!open) return;
    const outside = (event: PointerEvent) => { if (!root.current?.contains(event.target as Node)) setOpen(false); };
    const escape = (event: KeyboardEvent) => { if (event.key === "Escape") { event.stopPropagation(); setOpen(false); trigger.current?.focus(); } };
    document.addEventListener("pointerdown", outside);
    document.addEventListener("keydown", escape, true);
    return () => { document.removeEventListener("pointerdown", outside); document.removeEventListener("keydown", escape, true); };
  }, [open]);
  function select(next: SiteTheme) {
    setOpen(false);
    trigger.current?.focus();
    if (next === current) return;
    if (next !== "desk" && onChange) { onChange(next); return; }
    const target = next === "desk" ? "/desk" : next === "ink" ? "/?theme=ink" : "/";
    try { sessionStorage.setItem("tool-return-to", target); } catch {}
    window.location.assign(target);
  }
  return <div className="theme-picker" ref={root}>
    <button className="theme-picker__trigger" ref={trigger} type="button" aria-label={"切换主题，当前：" + selected.label} aria-expanded={open} aria-controls={id} onClick={() => setOpen(!open)}>
      <selected.Icon size={15} aria-hidden="true" /><span>{selected.label}</span><ChevronDown size={13} className={open ? "is-open" : ""} aria-hidden="true" />
    </button>
    {open && <div className="theme-picker__panel" id={id} role="group" aria-label="选择主题">
      {choices.map(({ id, label, Icon }) => <button type="button" key={id} aria-pressed={current === id} onClick={() => select(id)}>
        <Icon size={17} aria-hidden="true" /><span>{label}</span>{current === id && <Check size={15} aria-hidden="true" />}
      </button>)}
    </div>}
  </div>;
}
