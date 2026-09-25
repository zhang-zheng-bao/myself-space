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

  useEffect(() => {
    const hidden = () => { if (document.hidden) cancel(); };
    window.addEventListener("blur", cancel);
    document.addEventListener("visibilitychange", hidden);
    return () => {
      cancelAnimationFrame(frameRef.current);
      window.removeEventListener("blur", cancel);
      document.removeEventListener("visibilitychange", hidden);
    };
  }, []);

  return (
    <button type="button" data-track="entrance:skip" className="entrance-cinematic__skip" data-holding={holding || undefined}
      aria-label="长按跳过动画"
      onPointerDown={event => {
        if (event.button !== 0 || !event.isPrimary) return;
        event.currentTarget.setPointerCapture(event.pointerId);
        start();
      }}
      onPointerMove={event => {
        if (startedRef.current === null) return;
        const box = event.currentTarget.getBoundingClientRect();
        if (event.clientX < box.left - 4 || event.clientX > box.right + 4 || event.clientY < box.top - 4 || event.clientY > box.bottom + 4) cancel();
      }}
      onPointerUp={cancel} onPointerCancel={cancel} onLostPointerCapture={cancel} onBlur={cancel}
      onContextMenu={event => event.preventDefault()}
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
