"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import { Play, X, Trash2, Clock } from "lucide-react";
import { localStore, HistoryItem } from "@/lib/storage";

export default function ContinueWatching() {
    const [history, setHistory] = useState<HistoryItem[]>([]);
    const [mounted, setMounted] = useState(false);

    useEffect(() => {
        setMounted(true);
        setHistory(localStore.getHistory());
    }, []);

    const handleRemove = (e: React.MouseEvent, path: string) => {
        e.preventDefault();
        e.stopPropagation();
        localStore.removeHistoryItem(path);
        setHistory(localStore.getHistory());
    };

    const handleClearAll = () => {
        if (window.confirm("Clear all watch history?")) {
            localStore.clearHistory();
            setHistory([]);
        }
    };

    const formatTime = (seconds: number) => {
        const hrs = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        const pad = (n: number) => (n < 10 ? `0${n}` : n);
        return hrs > 0 ? `${hrs}:${pad(mins)}:${pad(secs)}` : `${mins}:${pad(secs)}`;
    };

    if (!mounted || history.length === 0) return null;

    return (
        <motion.section
            className="relative my-6 sm:my-8 max-w-tv px-4 sm:px-6 lg:px-8 z-20"
            initial={{ opacity: 0, y: 24 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.6, ease: [0.16, 1, 0.3, 1] }}
        >
            {/* ── Header ── */}
            <div className="flex items-center justify-between mb-5">
                <h2 className="text-lg sm:text-xl md:text-2xl font-black text-white tracking-tight select-none relative section-title">
                    Continue Watching
                </h2>
                <motion.button
                    onClick={handleClearAll}
                    className="flex items-center gap-1.5 text-xs font-semibold text-secondary hover:text-primary transition-colors cursor-pointer uppercase tracking-widest"
                    whileHover={{ scale: 1.04 }}
                    whileTap={{ scale: 0.96 }}
                >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Clear All</span>
                </motion.button>
            </div>

            {/* ── Card Row ── */}
            <div
                className="flex overflow-x-auto gap-4 py-2 w-full"
                style={{ scrollSnapType: "x mandatory" }}
            >
                <AnimatePresence>
                    {history.map((item, i) => {
                        const watchUrl = `/watch/${item.detailPath}${
                            item.isSeries && item.season && item.episode
                                ? `?season=${item.season}&episode=${item.episode}`
                                : ""
                        }`;

                        return (
                            <motion.div
                                key={item.detailPath}
                                className="shrink-0 w-[220px] sm:w-[260px] md:w-[290px] xl:w-[320px] 2xl:w-[360px] 3xl:w-[420px] 4xl:w-[480px] rounded-[20px] overflow-hidden relative group"
                                style={{
                                    background: "#080808",
                                    border: "1px solid rgba(255,255,255,0.06)",
                                    scrollSnapAlign: "start",
                                }}
                                initial={{ opacity: 0, x: 30 }}
                                animate={{ opacity: 1, x: 0 }}
                                exit={{ opacity: 0, scale: 0.9, x: -20 }}
                                transition={{ duration: 0.4, delay: i * 0.06, ease: [0.16, 1, 0.3, 1] }}
                                whileHover={{
                                    borderColor: "rgba(255, 255, 255, 0.15)",
                                    boxShadow: "0 12px 32px rgba(0, 0, 0, 0.5)",
                                }}
                            >
                                {/* Poster area */}
                                <div className="relative w-full overflow-hidden" style={{ aspectRatio: "16/9" }}>
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                        src={item.coverUrl}
                                        alt={item.title}
                                        className="w-full h-full object-cover transition-transform duration-500 ease-out group-hover:scale-105"
                                        loading="lazy"
                                    />

                                    {/* Dark overlay */}
                                    <div className="absolute inset-0 bg-black/30 opacity-0 group-hover:opacity-100 transition-opacity duration-300" />

                                    {/* Play button */}
                                    <Link
                                        href={watchUrl}
                                        className="absolute inset-0 flex items-center justify-center z-10"
                                        aria-label={`Resume ${item.title}`}
                                    >
                                        <div
                                            className="w-12 h-12 rounded-full flex items-center justify-center opacity-90 sm:opacity-0 group-hover:opacity-100 scale-90 group-hover:scale-100 transition-all duration-300 shadow-xl"
                                            style={{
                                                background:
                                                    "linear-gradient(135deg, var(--primary), var(--primary-dark))",
                                                boxShadow:
                                                    "0 8px 32px rgba(229, 9, 20, 0.6)",
                                            }}
                                        >
                                            <Play className="w-5 h-5 fill-white text-white ml-[1px]" />
                                        </div>
                                    </Link>

                                    {/* Remove button */}
                                    <button
                                        onClick={(e) =>
                                            handleRemove(e, item.detailPath)
                                        }
                                        className="absolute top-2.5 right-2.5 w-7 h-7 rounded-full flex items-center justify-center text-white/90 hover:text-white bg-black/70 hover:bg-red-600 border border-white/10 hover:border-transparent opacity-0 group-hover:opacity-100 transition-all duration-200 z-20 cursor-pointer shadow-md"
                                        title="Remove from history"
                                    >
                                        <X className="w-3.5 h-3.5" />
                                    </button>

                                    {/* Progress bar */}
                                    <div className="absolute bottom-0 left-0 right-0 h-[3px] z-10" style={{ background: "rgba(255,255,255,0.1)" }}>
                                        <motion.div
                                            className="h-full rounded-full"
                                            style={{
                                                background: "linear-gradient(90deg, var(--primary), var(--primary-light))",
                                                boxShadow: "0 0 8px rgba(255,0,85,0.7)",
                                            }}
                                            initial={{ width: 0 }}
                                            animate={{ width: `${item.progress}%` }}
                                            transition={{ duration: 0.8, ease: [0.16, 1, 0.3, 1], delay: i * 0.08 }}
                                        />
                                    </div>
                                </div>

                                {/* Meta info */}
                                <div className="p-3.5 flex flex-col gap-1.5">
                                    <Link
                                        href={watchUrl}
                                        className="font-bold text-xs sm:text-sm text-white leading-tight line-clamp-1 hover:text-primary-light transition-colors duration-200"
                                    >
                                        {item.title}
                                    </Link>

                                    <div className="flex items-center justify-between text-[10px] font-semibold tracking-wide uppercase text-secondary">
                                        <span className="flex items-center gap-1">
                                            <Clock className="w-3 h-3 text-primary" />
                                            {item.isSeries ? `S${item.season || 1} E${item.episode || 1}` : "Movie"}
                                        </span>
                                        <span>
                                            {formatTime(item.currentTime)} / {formatTime(item.duration)}
                                        </span>
                                    </div>
                                </div>
                            </motion.div>
                        );
                    })}
                </AnimatePresence>
            </div>
        </motion.section>
    );
}
