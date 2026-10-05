import { useEffect, useRef, useState } from "react";
import { SkipForward } from "lucide-react";

const HOLD_DURATION = 1400;

export default function HoldToSkip({ onComplete }: { onComplete: () => void }) {
  const progressRef = useRef<SVGPathElement>(null);
  const frameRef = useRef(0);
  const startedRef = useRef<number | null>(null);
  const [holding, setHolding] = useState(false);

  const cancel = () => {
    cancelAnimationFrame(frameRef.current);
    startedRef.current = null;
    progressRef.current?.style.setProperty("stroke-dashoffset", "100");
    setHolding(false);
  };

  const start = () => {
    if (startedRef.current !== null) return;
    startedRef.current = performance.now();
    setHolding(true);
    const tick = (now: number) => {
      if (startedRef.current === null) return;
      const progress = Math.min(1, (now - startedRef.current) / HOLD_DURATION);
      progressRef.current?.style.setProperty("stroke-dashoffset", String(100 * (1 - progress)));
      if (progress === 1) {
        startedRef.current = null;
        onComplete();
      } else frameRef.current = requestAnimationFrame(tick);
    };
    frameRef.current = requestAnimationFrame(tick);
  };

  // 每次渲染拿到的是新的 start/cancel，监听器只挂一次，通过 ref 调最新的。
  const actionsRef = useRef({ start, cancel });
  actionsRef.current = { start, cancel };

  useEffect(() => {
    const cancelHold = () => actionsRef.current.cancel();
    const hidden = () => { if (document.hidden) cancelHold(); };
    // 长按画面任意位置都能跳过，进度仍显示在按钮的描边上。
    // 按在其他按钮（如声音开关）上不算，免得点一下声音也开始计时。
    let pointerId: number | null = null;
    let originX = 0;
    let originY = 0;
    const down = (event: PointerEvent) => {
      if (event.button !== 0 || !event.isPrimary) return;
      const target = event.target as Element | null;
      const button = target?.closest("button");
      if (button && !button.classList.contains("entrance-cinematic__skip")) return;
      event.preventDefault();
      pointerId = event.pointerId;
      originX = event.clientX;
      originY = event.clientY;
      actionsRef.current.start();
    };
    const move = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return;
      // 手指/鼠标明显拖动就当作不是长按。
      if (Math.hypot(event.clientX - originX, event.clientY - originY) > 32) { pointerId = null; cancelHold(); }
    };
    const up = (event: PointerEvent) => {
      if (event.pointerId !== pointerId) return;
      pointerId = null;
      cancelHold();
    };
    const blockMenu = (event: Event) => event.preventDefault();
    window.addEventListener("pointerdown", down);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    window.addEventListener("contextmenu", blockMenu);
    window.addEventListener("blur", cancelHold);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      cancelAnimationFrame(frameRef.current);
      window.removeEventListener("pointerdown", down);
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      window.removeEventListener("contextmenu", blockMenu);
      window.removeEventListener("blur", cancelHold);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, []);

  return (
    <button type="button" data-track="entrance:skip" className="entrance-cinematic__skip" data-holding={holding || undefined}
      aria-label="长按画面任意位置跳过动画，或按 Esc 键" aria-keyshortcuts="Escape" title="长按任意位置跳过，或按 Esc"
      onBlur={cancel}
      onClick={event => event.preventDefault()}
      onKeyDown={event => {
        if (event.key !== " " && event.key !== "Enter") return;
        event.preventDefault();
        if (!event.repeat) start();
      }}
      onKeyUp={event => {
        if (event.key === " " || event.key === "Enter") { event.preventDefault(); cancel(); }
      }}>
      <svg className="entrance-cinematic__outline" viewBox="0 0 120 36" aria-hidden="true">
        <path ref={progressRef} pathLength="100" d="M60 1 H102 A17 17 0 0 1 119 18 A17 17 0 0 1 102 35 H18 A17 17 0 0 1 1 18 A17 17 0 0 1 18 1 H60" />
      </svg>
      <span>长按跳过</span><SkipForward size={14} />
    </button>
  );
}
