import { useCallback, useEffect, useRef, useState } from "react";
import { Volume2, VolumeX } from "lucide-react";
import HoldToSkip from "./HoldToSkip";

type Phase = "door" | "playing" | "black" | "reveal" | "done";

export default function EntranceCinematic({ ready, soundReady, musicLeadSeconds = 3, onMusicEntry, onEntered }: { ready: boolean; soundReady: boolean; musicLeadSeconds?: number; onMusicEntry: () => void; onEntered: () => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const musicEntryStarted = useRef(false);
  const doorOpened = useRef(false);
  const [phase, setPhase] = useState<Phase>("door");
  const [muted, setMuted] = useState(false);
  const [reduced, setReduced] = useState(() => window.matchMedia("(prefers-reduced-motion: reduce)").matches);
  const finish = () => setPhase(current => current === "door" || current === "playing" ? "black" : current);
  const openDoor = useCallback(() => {
    const video = videoRef.current;
    if (!video || doorOpened.current) return;
    doorOpened.current = true;
    setPhase("playing");
    void video.play().catch(() => setPhase(current => current === "playing" ? "black" : current));
  }, []);
  useEffect(() => {
    if (phase !== "door" || reduced) return;
    const handleKey = (event: KeyboardEvent) => {
      if (event.repeat || event.isComposing) return;
      event.preventDefault();
      openDoor();
    };
    window.addEventListener("keydown", handleKey);
    return () => window.removeEventListener("keydown", handleKey);
  }, [phase, reduced, openDoor]);
  const startMusic = () => {
    if (musicEntryStarted.current) return;
    musicEntryStarted.current = true;
    onMusicEntry();
  };
  const checkMusicEntry = (video: HTMLVideoElement) => {
    const lead = Number.isFinite(musicLeadSeconds) ? Math.min(15, Math.max(0, musicLeadSeconds)) : 3;
    if (ready && lead > 0 && Number.isFinite(video.duration) && video.currentTime >= Math.max(0, video.duration - lead)) startMusic();
  };

  useEffect(() => {
    const preference = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => setReduced(preference.matches);
    preference.addEventListener("change", update);
    return () => preference.removeEventListener("change", update);
  }, []);

  useEffect(() => {
    if (!reduced) return;
    if (phase === "door") {
      if (!musicEntryStarted.current) {
        musicEntryStarted.current = true;
        onMusicEntry();
      }
      setPhase("done");
      onEntered();
    } else {
      finish();
    }
  }, [reduced, phase, onMusicEntry, onEntered]);

  useEffect(() => {
    const video = videoRef.current;
    if (phase !== "playing" || !video || reduced) return;
    let cancelled = false;
    let waitingForGesture = false;
    const attemptPlay = () => {
      waitingForGesture = false;
      void video.play().catch((error: unknown) => {
        if (cancelled) return;
        if (error instanceof DOMException && error.name === "NotAllowedError") {
          waitingForGesture = true;
        } else {
          finish();
        }
      });
    };
    const retryPlayback = () => {
      if (waitingForGesture && !cancelled) attemptPlay();
    };
    // The click on the door already starts playback. This retry is only a
    // fallback for keyboard activation or a browser race during mounting.
    if (video.paused) attemptPlay();
    window.addEventListener("pointerdown", retryPlayback);
    window.addEventListener("keydown", retryPlayback);
    // A failed or stalled download must not trap visitors in the intro.
    let lastTime = video.currentTime;
    let stalledSince = performance.now();
    const watchdog = window.setInterval(() => {
      if (document.hidden) { stalledSince = performance.now(); return; }
      if (video.currentTime !== lastTime) {
        lastTime = video.currentTime;
        stalledSince = performance.now();
      } else if (performance.now() - stalledSince > 15000) finish();
    }, 1000);
    return () => {
      cancelled = true;
      window.clearInterval(watchdog);
      window.removeEventListener("pointerdown", retryPlayback);
      window.removeEventListener("keydown", retryPlayback);
    };
  }, [phase, reduced]);

  useEffect(() => {
    if (phase !== "black") return;
    videoRef.current?.pause();
    if (!musicEntryStarted.current) {
      musicEntryStarted.current = true;
      onMusicEntry();
    }
  }, [phase, onMusicEntry]);

  useEffect(() => {
    if (phase !== "black") return;
    if (!ready) return;
    // Music starts in black. A remote audio failure must not block entry.
    const timer = window.setTimeout(() => setPhase("reveal"), reduced ? 0 : soundReady ? 300 : 1200);
    return () => window.clearTimeout(timer);
  }, [phase, ready, soundReady, reduced]);

  useEffect(() => {
    if (phase !== "reveal") return;
    const timer = window.setTimeout(() => { setPhase("done"); onEntered(); }, reduced ? 0 : 1000);
    return () => window.clearTimeout(timer);
  }, [phase, reduced, onEntered]);

  useEffect(() => {
    if (phase === "done") return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => { document.body.style.overflow = previous; };
  }, [phase]);

  if (phase === "done") return null;
  return (
    <div className="entrance-cinematic" data-phase={phase} role="dialog" aria-modal="true" aria-label="入场动画" onClick={phase === "door" ? openDoor : undefined}>
      <video ref={videoRef} className="entrance-cinematic__video" src="/entrance-cinematic.mp4" muted={muted} playsInline preload="auto" disablePictureInPicture onTimeUpdate={event => checkMusicEntry(event.currentTarget)} onEnded={finish} onError={finish} />
      {phase === "door" && <button type="button" className="entrance-cinematic__door" onClick={openDoor} aria-label="按任意键开门，也可点击进入">
        <span className="entrance-cinematic__door-label">
          <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
            <path d="M4 21V3h16v18" />
            <path d="M7 5l9 2v14l-9-2Z" />
            <path d="M13 13v1" />
          </svg>
          <span>按任意键开门</span>
        </span>
        <svg className="entrance-cinematic__door-guide" viewBox="0 0 224 100" preserveAspectRatio="none" aria-hidden="true">
          <path d="M0 92 L64 28 H224" />
        </svg>
        <span className="entrance-cinematic__door-point" aria-hidden="true" />
      </button>}
      {phase === "playing" && <>
        <div className="entrance-cinematic__controls">
          <button type="button" className="entrance-cinematic__sound" aria-label={muted ? "开启动画声音" : "关闭动画声音"} title={muted ? "开启动画声音" : "关闭动画声音"} onClick={() => setMuted(value => !value)}>{muted ? <VolumeX size={18} /> : <Volume2 size={18} />}</button>
          <HoldToSkip onComplete={finish} />
        </div>
      </>}
      {phase === "black" && !ready && <span className="entrance-cinematic__loading" role="status">正在进入</span>}
    </div>
  );
}
