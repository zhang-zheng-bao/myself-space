import React, { useState } from "react";
import { motion, AnimatePresence } from "motion/react";
import { X, ChevronLeft, ChevronRight, ExternalLink, Globe } from "lucide-react";
import { Work } from "../types";
import VideoPlayer from "./VideoPlayer";

interface WorkDetailModalProps {
  work: Work;
  onClose: () => void;
}

export default function WorkDetailModal({ work, onClose }: WorkDetailModalProps) {
  const [currentImgIndex, setCurrentImgIndex] = useState(0);

  const prevImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!work.images || work.images.length === 0) return;
    setCurrentImgIndex((prev) => (prev === 0 ? work.images.length - 1 : prev - 1));
  };

  const nextImage = (e: React.MouseEvent) => {
    e.stopPropagation();
    if (!work.images || work.images.length === 0) return;
    setCurrentImgIndex((prev) => (prev === work.images.length - 1 ? 0 : prev + 1));
  };

  const getCategoryLabel = (cat: string) => {
    switch (cat) {
      case "operation":
        return "账号运营";
      case "app":
        return "应用制作";
      case "video":
        return "视频剪辑";
      case "design":
        return "原型图设计";
      case "poetry":
        return "闲诗";
      default:
        return cat;
    }
  };

  return (
    <AnimatePresence>
      <div className="fixed inset-0 z-50 flex items-center justify-center p-4 md:p-6 select-none">
        {/* Backdrop */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          exit={{ opacity: 0 }}
          onClick={onClose}
          className="absolute inset-0 bg-black/90 backdrop-blur-md"
        />

        {/* Content Container */}
        <motion.div
          initial={{ opacity: 0, scale: 0.95, y: 15 }}
          animate={{ opacity: 1, scale: 1, y: 0 }}
          exit={{ opacity: 0, scale: 0.95, y: 15 }}
          transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
          className="relative w-full max-w-4xl max-h-[90vh] overflow-y-auto bg-zinc-950 border border-zinc-800 rounded-xl flex flex-col md:flex-row shadow-2xl scrollbar-thin scrollbar-thumb-zinc-800"
        >
          {/* Close Button */}
          <button
            onClick={onClose}
            className="absolute top-4 right-4 z-10 p-2 rounded-full bg-zinc-900/80 border border-zinc-800 text-zinc-400 hover:text-white transition-colors cursor-pointer"
          >
            <X size={16} />
          </button>

          {/* Media Section (Left or Top) */}
          <div className="w-full md:w-1/2 bg-black flex flex-col justify-center border-b md:border-b-0 md:border-r border-zinc-900">
            {/* Direct video output if it's primary, with images carousel fallback */}
            {work.videoUrl ? (
              <div className="p-4 md:p-6 space-y-4">
                <span className="text-[10px] uppercase tracking-widest font-mono text-zinc-500 block">
                  在线放映 / VIDEO PLAYER
                </span>
                <VideoPlayer src={work.videoUrl} poster={work.images?.[0]} />
              </div>
            ) : null}

            {/* Carousel Section */}
            <div className="relative aspect-video w-full flex items-center justify-center p-4">
              {work.images && work.images.length > 0 ? (
                <>
                  <div className="absolute inset-4 overflow-hidden rounded-lg border border-zinc-900 bg-zinc-900/40">
                    <img
                      src={work.images[currentImgIndex]}
                      alt={`${work.title} - ${currentImgIndex}`}
                      className="w-full h-full object-cover transition-all duration-700"
                      referrerPolicy="no-referrer"
                    />
                  </div>

                  {/* Navigation Arrows */}
                  {work.images.length > 1 && (
                    <>
                      <button
                        onClick={prevImage}
                        className="absolute left-6 p-1.5 rounded-full bg-zinc-900/75 border border-zinc-800 hover:border-zinc-600 text-zinc-300 hover:text-white transition-colors cursor-pointer"
                      >
                        <ChevronLeft size={16} />
                      </button>
                      <button
                        onClick={nextImage}
                        className="absolute right-6 p-1.5 rounded-full bg-zinc-900/75 border border-zinc-800 hover:border-zinc-600 text-zinc-300 hover:text-white transition-colors cursor-pointer"
                      >
                        <ChevronRight size={16} />
                      </button>

                      {/* Dots */}
                      <div className="absolute bottom-6 left-1/2 transform -translate-x-1/2 flex space-x-1.5 bg-black/60 px-2.5 py-1 rounded-full border border-zinc-800/50">
                        {work.images.map((_, idx) => (
                          <div
                            key={idx}
                            className={`w-1.5 h-1.5 rounded-full transition-colors ${
                              idx === currentImgIndex ? "bg-zinc-100" : "bg-zinc-700"
                            }`}
                          />
                        ))}
                      </div>
                    </>
                  )}
                </>
              ) : (
                <div className="text-xs text-zinc-600 font-mono">No preview images available</div>
              )}
            </div>
          </div>

          {/* Details Section (Right or Bottom) */}
          <div className="w-full md:w-1/2 p-6 md:p-8 flex flex-col justify-between">
            <div>
              {/* Category */}
              <div className="flex items-center space-x-3 mb-4">
                <span className="px-2.5 py-0.5 rounded text-[10px] bg-zinc-900 border border-zinc-800 text-zinc-400 font-medium">
                  {getCategoryLabel(work.category)}
                </span>
                <span className="text-[10px] font-mono text-zinc-500 tracking-wider">
                  PROJECT DETAIL
                </span>
              </div>

              {/* Title */}
              <h2 className="text-xl md:text-2xl font-serif text-white tracking-tight leading-relaxed mb-4">
                {work.title}
              </h2>

              {/* Description */}
              <div className="text-zinc-400 text-xs md:text-sm leading-relaxed mb-6 space-y-4 font-sans font-light">
                {work.description.split("\n").map((para, i) => (
                  <p key={i}>{para}</p>
                ))}
              </div>

              {/* Tags */}
              <div className="mb-6">
                <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest block mb-2">
                  技术与媒介 / Tags
                </span>
                <div className="flex flex-wrap gap-1.5">
                  {work.tags.map((tag, idx) => (
                    <span
                      key={idx}
                      className="text-[10px] px-2 py-0.5 bg-zinc-900 border border-zinc-850 hover:border-zinc-800 text-zinc-400 rounded transition-colors"
                    >
                      {tag}
                    </span>
                  ))}
                </div>
              </div>
            </div>

            {/* Links / Footer */}
            {work.links && work.links.length > 0 && (
              <div className="pt-6 border-t border-zinc-900">
                <span className="text-[10px] font-mono text-zinc-500 uppercase tracking-widest block mb-3">
                  作品链接 / External URL
                </span>
                <div className="flex flex-wrap gap-3">
                  {work.links.map((link, idx) => (
                    <a
                      key={idx}
                      href={link.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center space-x-1.5 text-xs text-zinc-300 hover:text-white transition-colors bg-zinc-900 border border-zinc-800 px-3 py-1.5 rounded-lg hover:border-zinc-700 cursor-pointer"
                    >
                      <span>{link.label}</span>
                      <ExternalLink size={12} className="text-zinc-500" />
                    </a>
                  ))}
                </div>
              </div>
            )}
          </div>
        </motion.div>
      </div>
    </AnimatePresence>
  );
}
