import React, { useRef, useState, useEffect } from "react";
import { Play, Pause, Volume2, VolumeX } from "lucide-react";

interface VideoPlayerProps {
  src: string;
  poster?: string;
}

export default function VideoPlayer({ src, poster }: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [progress, setProgress] = useState(0);

  const togglePlay = () => {
    if (!videoRef.current) return;
    if (isPlaying) {
      videoRef.current.pause();
      setIsPlaying(false);
    } else {
      videoRef.current.play().catch((err) => console.log("Video play interrupted:", err));
      setIsPlaying(true);
    }
  };

  const toggleMute = () => {
    if (!videoRef.current) return;
    videoRef.current.muted = !isMuted;
    setIsMuted(!isMuted);
  };

  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const current = videoRef.current.currentTime;
    const duration = videoRef.current.duration;
    if (duration > 0) {
      setProgress((current / duration) * 100);
    }
  };

  const handleVideoEnded = () => {
    setIsPlaying(false);
    setProgress(0);
  };

  useEffect(() => {
    // Reset state if video src changes
    setIsPlaying(false);
    setProgress(0);
    if (videoRef.current) {
      videoRef.current.load();
    }
  }, [src]);

  return (
    <div className="relative group overflow-hidden bg-black rounded-lg border border-zinc-850 aspect-video w-full transition-all duration-500 hover:border-zinc-700 select-none">
      <video
        ref={videoRef}
        src={src}
        poster={poster}
        onTimeUpdate={handleTimeUpdate}
        onEnded={handleVideoEnded}
        onClick={togglePlay}
        className="w-full h-full object-cover cursor-pointer"
        playsInline
      />

      {/* Control Overlay */}
      <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-transparent opacity-0 group-hover:opacity-100 transition-opacity duration-300 flex flex-col justify-end p-4">
        {/* Progress Bar */}
        <div className="w-full h-1 bg-zinc-800 rounded-full mb-4 cursor-pointer relative" onClick={(e) => {
          if (!videoRef.current) return;
          const rect = e.currentTarget.getBoundingClientRect();
          const clickX = e.clientX - rect.left;
          const percentage = clickX / rect.width;
          videoRef.current.currentTime = percentage * videoRef.current.duration;
          setProgress(percentage * 100);
        }}>
          <div
            className="h-full bg-zinc-400 rounded-full transition-all"
            style={{ width: `${progress}%` }}
          />
        </div>

        {/* Action Controls */}
        <div className="flex items-center justify-between">
          <div className="flex items-center space-x-4">
            <button
              onClick={togglePlay}
              className="p-1 px-2.5 rounded-md hover:bg-zinc-800/80 text-zinc-300 transition-colors flex items-center gap-1.5 text-xs"
            >
              {isPlaying ? (
                <>
                  <Pause size={13} className="text-zinc-400" /> 暂停
                </>
              ) : (
                <>
                  <Play size={13} className="text-zinc-100 fill-zinc-100" /> 播放
                </>
              )}
            </button>
          </div>

          <button
            onClick={toggleMute}
            className="p-1 px-2 text-zinc-400 hover:text-zinc-200 transition-colors flex items-center gap-1"
          >
            {isMuted ? <VolumeX size={14} /> : <Volume2 size={14} />}
            <span className="text-[10px] font-mono tracking-wider">MUTE</span>
          </button>
        </div>
      </div>

      {/* Big Play Banner when not playing */}
      {!isPlaying && (
        <div
          onClick={togglePlay}
          className="absolute inset-0 flex items-center justify-center bg-black/30 cursor-pointer group-hover:bg-black/50 transition-colors duration-300"
        >
          <div className="p-4 rounded-full bg-zinc-950/90 border border-zinc-800 text-zinc-200 group-hover:scale-110 group-hover:text-white transition-all duration-300 shadow-2xl">
            <Play size={20} className="fill-zinc-100 text-zinc-100 translate-x-[1px]" />
          </div>
        </div>
      )}
    </div>
  );
}
