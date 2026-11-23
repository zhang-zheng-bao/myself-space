import { useEffect, useId, useRef, useState } from "react";
import { Check, ChevronDown, Layers, Feather, Monitor } from "lucide-react";
import { coverThenSwitch } from "../themeTransition";
import "./theme-picker.css";

export type SiteTheme = "original" | "ink" | "desk";
const allChoices = [
  { id: "original", label: "原主题", Icon: Layers, hidden: false },
  // 染墨主题暂时不开放：只从菜单里隐藏，主题本身的代码保留。
  { id: "ink", label: "染墨", Icon: Feather, hidden: true },
  { id: "desk", label: "3D 桌面", Icon: Monitor, hidden: false },
] as const;

export default function ThemePicker({ current, onChange }: { current: SiteTheme; onChange?: (theme: "original" | "ink") => void }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const id = useId();
  const selected = allChoices.find(choice => choice.id === current)!;
  const choices = allChoices.filter(choice => !choice.hidden || choice.id === current);
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
    const origin = trigger.current?.getBoundingClientRect() ?? null;
    if (next !== "desk" && onChange) { coverThenSwitch(next, origin, () => onChange(next), false); return; }
    const target = next === "desk" ? "/desk" : next === "ink" ? "/?theme=ink" : "/";
    coverThenSwitch(next, origin, () => {
      try { sessionStorage.setItem("tool-return-to", target); } catch {}
      window.location.assign(target);
    }, true);
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
