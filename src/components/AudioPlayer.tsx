import React, { useState, useRef, useEffect } from "react";
import { motion, AnimatePresence } from "motion/react";
import {
  Play,
  Pause,
  SkipForward,
  SkipBack,
  Volume2,
  VolumeX,
  List,
  Music,
  Disc,
  Maximize2,
  Minimize2,
  Repeat,
  Shuffle,
  Compass
} from "lucide-react";

interface Track {
  id: string;
  title: string;
  artist: string;
  url: string;
  cover: string;
  lyrics: { time: number; text: string }[];
}

const PLAYLIST: Track[] = [
  {
    id: "track-1",
    title: "三年之约 (云岚破晓篇)",
    artist: "Dear970 (自制国风吟唱)",
    url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-1.mp3",
    cover: "https://images.unsplash.com/photo-1518609878373-06d740f60d8b?w=400&fit=crop",
    lyrics: [
      { time: 0, text: "【莫欺少年穷 • 斗破叙事诗琴】" },
      { time: 5, text: "手握玄重，背负滔天之恨" },
      { time: 15, text: "沦落废柴，尝尽冷眼嘲讽" },
      { time: 30, text: "这三年最大的收获，是遇到了那些形形色色的人" },
      { time: 45, text: "有的把我推入深渊，有的拉我逃出泥沼" },
      { time: 60, text: "但就是这样，才让我清醒了许多" },
      { time: 75, text: "现在的内心已无比强大，胜过一切年少轻狂" },
      { time: 90, text: "三年之约，不过是给成长画上一个句号" },
      { time: 110, text: "苍穹之上，万火归一，永恒不灭" }
    ]
  },
  {
    id: "track-2",
    title: "陨落心炎 (岩浆红莲)",
    artist: "Dear970 (暗曜日系节奏)",
    url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-2.mp3",
    cover: "https://images.unsplash.com/photo-1470225620780-dba8ba36b745?w=400&fit=crop",
    lyrics: [
      { time: 0, text: "【深渊岩浆之下，烈火正在复苏】" },
      { time: 10, text: "地底的心跳，在压抑中轰鸣" },
      { time: 25, text: "他们说我是无用的余烬" },
      { time: 40, text: "但我将在废墟原野上，重塑金色的神殿" },
      { time: 55, text: "无火不生，无焰不热，心之所向皆为光明" }
    ]
  },
  {
    id: "track-3",
    title: "形形色色 (行路挽歌)",
    artist: "Dear970 (极简古典吉他)",
    url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-4.mp3",
    cover: "https://images.unsplash.com/photo-1511671782779-c97d3d27a1d4?w=400&fit=crop",
    lyrics: [
      { time: 0, text: "【致谢泥沼中给予提灯的行僧】" },
      { time: 8, text: "风沙漫过，那几张冰冷或温暖的脸" },
      { time: 20, text: "身处危难之中，有人舍身相救" },
      { time: 35, text: "尘曲散去，孤身负剑乘风而去" },
      { time: 50, text: "不再解释，也不再回头张望" }
    ]
  },
  {
    id: "track-4",
    title: "万火归一 (完结宿命)",
    artist: "Dear970 (史诗重低音)",
    url: "https://www.soundhelix.com/examples/mp3/SoundHelix-Song-8.mp3",
    cover: "https://images.unsplash.com/photo-1514525253161-7a46d19cd819?w=400&fit=crop",
    lyrics: [
      { time: 0, text: "【终局终章：苍穹画卷】" },
      { time: 12, text: "所有的火焰，在掌心中臣服" },
      { time: 26, text: "给年少誓言画上的绝美句点" },
      { time: 40, text: "走过低谷的人，终会来到星河流转的最高处" }
    ]
  }
];

export default function AudioPlayer() {
  const [currentTrackIndex, setCurrentTrackIndex] = useState(0);
  const [isPlaying, setIsPlaying] = useState(false);
  const [isMuted, setIsMuted] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolume] = useState(0.8);
  const [showPlaylist, setShowPlaylist] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);
  const [isShuffle, setIsShuffle] = useState(false);
  const [isRepeat, setIsRepeat] = useState(false);
  const [activeExpandedTab, setActiveExpandedTab] = useState<"player" | "lyrics" | "playlist">("player");

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const track = PLAYLIST[currentTrackIndex];

  // Sync audio play state
  useEffect(() => {
    if (!audioRef.current) return;
    if (isPlaying) {
      audioRef.current.play().catch(() => {
        setIsPlaying(false);
      });
    } else {
      audioRef.current.pause();
    }
  }, [isPlaying, currentTrackIndex]);

  // Load stream
  useEffect(() => {
    if (audioRef.current) {
      audioRef.current.src = track.url;
      audioRef.current.load();
      if (isPlaying) {
        audioRef.current.play().catch(() => setIsPlaying(false));
      }
    }
  }, [currentTrackIndex]);

  const handleTimeUpdate = () => {
    if (audioRef.current) {
      setCurrentTime(audioRef.current.currentTime);
    }
  };

  const handleLoadedMetadata = () => {
    if (audioRef.current) {
      setDuration(audioRef.current.duration);
    }
  };

  const handleAudioEnded = () => {
    if (isRepeat) {
      if (audioRef.current) {
        audioRef.current.currentTime = 0;
        audioRef.current.play().catch(() => {});
      }
    } else {
      handleNext();
    }
  };

  const togglePlay = () => {
    setIsPlaying(!isPlaying);
  };

  const handlePrev = () => {
    let prevIndex = currentTrackIndex - 1;
    if (isShuffle) {
      prevIndex = Math.floor(Math.random() * PLAYLIST.length);
    } else if (prevIndex < 0) {
      prevIndex = PLAYLIST.length - 1;
    }
    setCurrentTrackIndex(prevIndex);
  };

  const handleNext = () => {
    let nextIndex = currentTrackIndex + 1;
    if (isShuffle) {
      nextIndex = Math.floor(Math.random() * PLAYLIST.length);
    } else if (nextIndex >= PLAYLIST.length) {
      nextIndex = 0;
    }
    setCurrentTrackIndex(nextIndex);
  };

  const handleTrackClick = (idx: number) => {
    if (currentTrackIndex === idx) {
      togglePlay();
    } else {
      setCurrentTrackIndex(idx);
      setIsPlaying(true);
    }
  };

  const handleSeek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    if (audioRef.current) {
      audioRef.current.currentTime = val;
      setCurrentTime(val);
    }
  };

  const toggleMute = () => {
    if (audioRef.current) {
      audioRef.current.muted = !isMuted;
      setIsMuted(!isMuted);
    }
  };

  const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const val = parseFloat(e.target.value);
    setVolume(val);
    if (audioRef.current) {
      audioRef.current.volume = val;
      audioRef.current.muted = val === 0;
      setIsMuted(val === 0);
    }
  };

  // Find the exact line in lyrics
  const currentLyric = track.lyrics.reduce((acc, curr) => {
    if (currentTime >= curr.time) {
      return curr.text;
    }
    return acc;
  }, "琴声袅袅...");

  const formatTime = (seconds: number) => {
    const mins = Math.floor(seconds / 60);
    const secs = Math.floor(seconds % 60);
    return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
  };

  return (
    <div id="aesthetic-audio-wrapper" className={`w-full select-none ${isExpanded ? "static" : "relative z-40"}`}>
      <audio
        ref={audioRef}
        onTimeUpdate={handleTimeUpdate}
        onLoadedMetadata={handleLoadedMetadata}
        onEnded={handleAudioEnded}
      />

      {/* Unified Premium Music Deck - High Density Typography & Seamless Space Optimization */}
      <div className="bg-zinc-950/85 border border-zinc-900 rounded-2xl p-4.5 space-y-4 shadow-2xl hover:border-zinc-800 transition-all duration-300">
        
        {/* Track header & Info row */}
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center space-x-3.5 flex-1 min-w-0" onClick={() => setIsExpanded(true)}>
            <div className="relative cursor-pointer shrink-0">
              <img
                src={track.cover}
                alt={track.title}
                className={`w-11 h-11 rounded-xl object-cover border border-zinc-850 shadow-md ${isPlaying ? "animate-[spin_16s_linear_infinite]" : ""}`}
              />
              {isPlaying && (
                <span className="absolute inset-0 flex items-center justify-center bg-black/40 rounded-xl">
                  <Disc size={14} className="text-emerald-400 animate-spin" />
                </span>
              )}
            </div>
            <div className="min-w-0 cursor-pointer flex-1">
              <h4 className="text-xs md:text-sm font-serif font-bold text-white line-clamp-1 flex items-center gap-1.5">
                {isPlaying && <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse shrink-0 inline-block" />}
                {track.title}
              </h4>
              <p className="text-[10px] text-zinc-400 line-clamp-1 mt-0.5">{track.artist}</p>
            </div>
          </div>

          {/* Quick deck switches */}
          <div className="flex items-center space-x-1.5 shrink-0">
            <button
              onClick={handlePrev}
              className="p-1.5 rounded-lg hover:bg-zinc-900 text-zinc-500 hover:text-zinc-300 cursor-pointer transition-colors"
              title="上一首"
            >
              <SkipBack size={13} />
            </button>
            <button
              onClick={togglePlay}
              className="p-2 rounded-full bg-emerald-400 hover:bg-emerald-300 text-zinc-950 flex items-center justify-center transition-all cursor-pointer shadow-md hover:scale-105"
            >
              {isPlaying ? <Pause size={12} className="fill-zinc-950 text-zinc-950" /> : <Play size={12} className="fill-zinc-950 text-zinc-950 translate-x-[0.5px]" />}
            </button>
            <button
              onClick={handleNext}
              className="p-1.5 rounded-lg hover:bg-zinc-900 text-zinc-500 hover:text-zinc-300 cursor-pointer transition-colors"
              title="下一首"
            >
              <SkipForward size={13} />
            </button>
            <button
              onClick={() => {
                setIsExpanded(true);
                setActiveExpandedTab("player");
              }}
              className="p-1.5 rounded-lg hover:bg-zinc-900 text-zinc-500 hover:text-zinc-300 cursor-pointer transition-colors"
              title="展屏"
            >
              <Maximize2 size={12} />
            </button>
          </div>
        </div>

        {/* Dynamic Compact Timeline Progress Slider (Solves the "太空了" empty inputs issue) */}
        <div className="bg-zinc-900/40 border border-zinc-900/60 rounded-xl p-2.5 space-y-2">
          <div className="flex items-center space-x-2.5 text-[9px] font-mono text-zinc-550">
            <span className="w-6 text-left shrink-0">{formatTime(currentTime)}</span>
            <input
              type="range"
              min={0}
              max={duration || 100}
              value={currentTime}
              onChange={handleSeek}
              className="flex-1 cursor-pointer"
            />
            <span className="w-6 text-right shrink-0">{formatTime(duration)}</span>
          </div>

          {/* Subtitle Scrolling Current Lyric (Gives high interactive density!) */}
          <div className="h-4 flex items-center justify-center overflow-hidden border-t border-zinc-900/10 pt-1.5">
            <p className="text-[10px] font-serif text-emerald-400/90 italic text-center truncate w-full">
              {currentLyric}
            </p>
          </div>
        </div>

        {/* Integrated Inline Playlist Section */}
        <div className="border-t border-zinc-900/60 pt-3.5 space-y-2">
          <div className="flex justify-between items-center px-0.5">
            <span className="text-[10px] font-mono tracking-wider text-zinc-500 uppercase">
              听风歌单 / INK PLAYLIST ({PLAYLIST.length})
            </span>
            <span className="text-[9px] text-zinc-600 font-normal">点击即刻切歌</span>
          </div>

          <div className="space-y-1 max-h-[145px] overflow-y-auto pr-0.5 scrollbar-none">
            {PLAYLIST.map((t, idx) => {
              const isActive = currentTrackIndex === idx;
              return (
                <div
                  key={t.id}
                  onClick={() => handleTrackClick(idx)}
                  className={`group flex items-center justify-between p-1.5 px-2.5 rounded-lg cursor-pointer transition-all duration-300 border ${
                    isActive
                      ? "bg-zinc-900/90 border-zinc-800 text-white shadow-sm"
                      : "border-transparent hover:bg-zinc-900/30 text-zinc-400 hover:text-zinc-200"
                  }`}
                >
                  <div className="flex items-center space-x-2.5 min-w-0">
                    <span className={`text-[10px] font-mono ${isActive ? "text-emerald-400 font-bold" : "text-zinc-600 group-hover:text-zinc-500"}`}>
                      0{idx + 1}
                    </span>
                    <div className="min-w-0">
                      <p className={`text-xs font-serif font-bold ${isActive ? "text-emerald-400" : "text-zinc-300"} truncate`}>
                        {t.title}
                      </p>
                    </div>
                  </div>

                  <div className="flex items-center space-x-2 shrink-0 pl-1">
                    {isActive && isPlaying ? (
                      <span className="flex gap-[2px] h-2 pb-0.5 items-end justify-center shrink-0">
                        <span className="w-[1.2px] h-2 bg-emerald-400 animate-[soundWave_0.8s_ease-in-out_infinite]" />
                        <span className="w-[1.2px] h-2 bg-emerald-400 animate-[soundWave_1.2s_ease-in-out_infinite]" />
                        <span className="w-[1.2px] h-2 bg-emerald-400 animate-[soundWave_0.9s_ease-in-out_infinite]" />
                      </span>
                    ) : isActive ? (
                      <Pause size={9} className="text-zinc-500 font-bold" />
                    ) : (
                      <Play size={9} className="opacity-0 group-hover:opacity-60 text-zinc-400 transition-opacity" />
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {/* Expanded Premium Music App Deck Overlay within Left Sidebar (Mo Space Column) */}
      <AnimatePresence>
        {isExpanded && (
          <motion.div
            initial={{ opacity: 0, scale: 0.98 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.98 }}
            transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
            className="absolute inset-0 z-50 bg-[#070709] rounded-2xl flex flex-col overflow-hidden border border-zinc-900 shadow-3xl text-zinc-350"
          >
            {/* Ambient Background Glow matching the Track Cover */}
            <div
              className="absolute inset-0 opacity-[0.06] bg-cover bg-center filter blur-3xl pointer-events-none scale-105"
              style={{ backgroundImage: `url(${track.cover})` }}
            />
              
              {/* Header */}
              <div className="flex items-center justify-between p-5 pb-3 border-b border-zinc-900/60 shrink-0 select-none">
                <div className="flex items-center space-x-2">
                  <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse" />
                  <span className="text-[10px] font-mono tracking-widest text-zinc-500 uppercase">Dear970听风馆 / MONO PLAYER</span>
                </div>
                <button
                  onClick={() => setIsExpanded(false)}
                  className="p-1 px-1.5 rounded hover:bg-zinc-900 text-zinc-400 hover:text-white cursor-pointer transition-colors"
                >
                  <Minimize2 size={13} />
                </button>
              </div>

              {/* Segmented Tab Controls */}
              <div className="bg-zinc-950 px-5 py-2 border-b border-zinc-900/40 shrink-0 select-none">
                <div className="flex bg-zinc-900 p-1 rounded-xl border border-zinc-850/60 w-full">
                  <button
                    onClick={() => setActiveExpandedTab("player")}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-serif font-bold tracking-wider transition-all cursor-pointer flex items-center justify-center space-x-1.5 ${
                      activeExpandedTab === "player"
                        ? "bg-zinc-800 text-white shadow-md border border-zinc-700/40"
                        : "text-zinc-500 hover:text-zinc-300"
                    }`}
                  >
                    <Disc size={11} className={activeExpandedTab === "player" && isPlaying ? "animate-spin" : ""} />
                    <span>唱片</span>
                  </button>
                  <button
                    onClick={() => setActiveExpandedTab("lyrics")}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-serif font-bold tracking-wider transition-all cursor-pointer flex items-center justify-center space-x-1.5 ${
                      activeExpandedTab === "lyrics"
                        ? "bg-zinc-800 text-white shadow-md border border-zinc-700/40"
                        : "text-zinc-500 hover:text-zinc-300"
                    }`}
                  >
                    <Music size={11} />
                    <span>歌词</span>
                  </button>
                  <button
                    onClick={() => setActiveExpandedTab("playlist")}
                    className={`flex-1 py-1.5 rounded-lg text-xs font-serif font-bold tracking-wider transition-all cursor-pointer flex items-center justify-center space-x-1.5 ${
                      activeExpandedTab === "playlist"
                        ? "bg-zinc-800 text-white shadow-md border border-zinc-700/40"
                        : "text-zinc-500 hover:text-zinc-300"
                    }`}
                  >
                    <List size={11} />
                    <span>歌单</span>
                  </button>
                </div>
              </div>

              {/* Main Content Area */}
              <div className="flex-1 overflow-y-auto p-5 pb-3 min-h-0 flex flex-col justify-between select-none">
                
                {activeExpandedTab === "player" && (
                  <div className="flex-1 flex flex-col justify-between min-h-0">
                    
                    {/* Vinyl core */}
                    <div className="flex flex-col items-center justify-center flex-1 relative min-h-0 py-2">
                      <div className="absolute w-44 h-44 rounded-full bg-red-950/10 blur-3xl pointer-events-none" />
                      
                      {/* Stylus arm */}
                      <div
                        className={`absolute top-0 right-[25%] w-16 h-18 origin-top-left z-20 transition-transform duration-700 pointer-events-none ${
                          isPlaying ? "rotate-12" : "-rotate-6"
                        }`}
                      >
                        <div className="w-[1px] h-14 bg-zinc-600 shadow-lg relative ml-5">
                          <div className="absolute bottom-0 right-0 w-2 h-3.5 bg-zinc-500 rounded border border-zinc-400 translate-x-[2px]" />
                        </div>
                      </div>

                      {/* Disc body */}
                      <div className="relative p-3 bg-zinc-900 rounded-full border-4 border-zinc-950 shadow-2xl shrink-0 mt-3">
                        <div
                          className={`w-36 h-36 rounded-full relative overflow-hidden bg-[radial-gradient(circle_at_center,_#202025_0%,_#09090b_66%,_#000000_100%)] flex items-center justify-center ${
                            isPlaying ? "animate-[spin_20s_linear_infinite]" : ""
                          }`}
                          style={{ boxShadow: "inset 0 0 30px rgba(0,0,0,1)" }}
                        >
                          <div className="absolute inset-3 rounded-full border border-zinc-850/20" />
                          <div className="absolute inset-7 rounded-full border border-zinc-850/25" />
                          <div className="absolute inset-11 rounded-full border border-zinc-850/20" />
                          <div className="absolute inset-16 rounded-full border border-zinc-800/15" />
                          
                          <div className="w-16 h-16 rounded-full overflow-hidden border-2 border-zinc-950">
                            <img
                              src={track.cover}
                              alt={track.title}
                              className="w-full h-full object-cover"
                            />
                          </div>
                          <div className="absolute w-2.5 h-2.5 rounded-full bg-[#09090b] border-2 border-zinc-850 z-10" />
                        </div>
                      </div>

                      {/* Meta titles */}
                      <div className="text-center mt-3.5">
                        <h2 className="text-sm md:text-base font-serif text-white tracking-widest font-bold line-clamp-1 px-2">
                          {track.title}
                        </h2>
                        <p className="text-[10px] md:text-xs text-zinc-400 font-light mt-0.5 font-sans">
                          {track.artist}
                        </p>
                      </div>

                    </div>

                    {/* Controls widget */}
                    <div className="space-y-3.5 pt-2">
                      <div className="flex items-center space-x-3 text-[10px] font-mono text-zinc-450">
                        <span>{formatTime(currentTime)}</span>
                        <input
                          type="range"
                          min={0}
                          max={duration || 100}
                          value={currentTime}
                          onChange={handleSeek}
                          className="flex-1 h-0.5 bg-zinc-900 rounded-lg appearance-none cursor-pointer accent-white hover:bg-zinc-850"
                        />
                        <span>{formatTime(duration)}</span>
                      </div>

                      <div className="flex items-center justify-between px-2">
                        <button
                          onClick={() => setIsShuffle(!isShuffle)}
                          className={`p-1 rounded hover:bg-zinc-900 transition-colors cursor-pointer ${
                            isShuffle ? "text-emerald-400 font-medium" : "text-zinc-550"
                          }`}
                          title="随机播放"
                        >
                          <Shuffle size={13} />
                        </button>

                        <div className="flex items-center space-x-3.5">
                          <button
                            onClick={handlePrev}
                            className="p-1.5 rounded-full bg-zinc-900 hover:bg-zinc-850 text-zinc-300 hover:text-white transition-all cursor-pointer border border-zinc-850"
                          >
                            <SkipBack size={13} />
                          </button>

                          <button
                            onClick={togglePlay}
                            className="p-2.5 rounded-full bg-white hover:bg-zinc-100 text-zinc-950 hover:scale-105 transition-all cursor-pointer shadow-xl"
                          >
                            {isPlaying ? <Pause size={15} className="fill-black text-black" /> : <Play size={15} className="fill-black text-black translate-x-[0.5px]" />}
                          </button>

                          <button
                            onClick={handleNext}
                            className="p-1.5 rounded-full bg-zinc-900 hover:bg-zinc-850 text-zinc-300 hover:text-white transition-all cursor-pointer border border-zinc-850"
                          >
                            <SkipForward size={13} />
                          </button>
                        </div>

                        <button
                          onClick={() => setIsRepeat(!isRepeat)}
                          className={`p-1 rounded hover:bg-zinc-900 transition-colors cursor-pointer ${
                            isRepeat ? "text-emerald-400 font-medium" : "text-zinc-550"
                          }`}
                          title="单曲循环"
                        >
                          <Repeat size={13} />
                        </button>
                      </div>
                    </div>

                  </div>
                )}

                {activeExpandedTab === "lyrics" && (
                  <div className="flex-1 overflow-y-auto py-3 font-serif scrollbar-none space-y-4 max-h-[360px] my-auto">
                    {track.lyrics.map((lyr, index) => {
                      const isActive = currentTime >= lyr.time && (index === track.lyrics.length - 1 || currentTime < track.lyrics[index + 1].time);
                      return (
                        <div
                          key={index}
                          className={`transition-all duration-500 text-center text-xs md:text-sm leading-relaxed px-3 ${
                            isActive
                              ? "text-white scale-105 font-bold opacity-100 italic"
                              : "text-zinc-500 opacity-40 font-light"
                          }`}
                        >
                          {lyr.text}
                        </div>
                      );
                    })}
                  </div>
                )}

                {activeExpandedTab === "playlist" && (
                  <div className="flex-1 overflow-y-auto py-2 space-y-1.5 max-h-[360px] my-auto scrollbar-none">
                    {PLAYLIST.map((t, idx) => (
                      <div
                        key={t.id}
                        onClick={() => {
                          setCurrentTrackIndex(idx);
                        }}
                        className={`p-2.5 rounded-xl border transition-all duration-300 flex items-center justify-between cursor-pointer ${
                          currentTrackIndex === idx
                            ? "bg-zinc-900 border-zinc-800 text-white"
                            : "border-zinc-950 hover:border-zinc-900 hover:bg-zinc-900/40 text-zinc-500 hover:text-zinc-300"
                        }`}
                      >
                        <div className="flex items-center space-x-3 min-w-0">
                          <span className="text-xs font-mono text-zinc-600">0{idx + 1}</span>
                          <div className="min-w-0">
                            <h4 className="text-xs font-semibold truncate pr-1">{t.title}</h4>
                            <p className="text-[9px] font-mono text-zinc-500 mt-0.5 truncate">{t.artist}</p>
                          </div>
                        </div>
                        {currentTrackIndex === idx && (
                          <Disc size={11} className="text-emerald-400 animate-spin shrink-0" />
                        )}
                      </div>
                    ))}
                  </div>
                )}

              </div>

              {/* Shared volume bottom track panel */}
              <div className="shrink-0 px-5 pb-5 pt-3 border-t border-zinc-900/60 bg-zinc-950/80 space-y-2 select-none">
                <div className="flex items-center justify-between">
                  <span className="text-[9px] font-mono text-zinc-600">音流调音 / COHESIVE VOLUME</span>
                  <span className="text-[9px] font-mono text-zinc-600">{Math.round(volume * 100)}%</span>
                </div>

                <div className="flex items-center space-x-2.5">
                  <button onClick={toggleMute} className="p-1 rounded hover:bg-zinc-900 text-zinc-500 hover:text-white transition-colors cursor-pointer">
                    {isMuted ? <VolumeX size={12} className="text-red-400" /> : <Volume2 size={12} />}
                  </button>
                  <input
                    type="range"
                    min={0}
                    max={1}
                    step={0.01}
                    value={isMuted ? 0 : volume}
                    onChange={handleVolumeChange}
                    className="flex-1 h-0.5 bg-zinc-900 rounded-lg appearance-none cursor-pointer accent-white hover:bg-zinc-850"
                  />
                </div>

                <p className="text-[9px] text-zinc-600 leading-normal text-center pt-0.5 font-serif italic">
                  “世俗浮夸杂音甚嚣，愿你在我的书房，守住一段清宁”
                </p>
              </div>

            </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
