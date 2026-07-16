"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
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
        if (hrs > 0) {
            return `${hrs}:${makeTwoDigits(mins)}:${makeTwoDigits(secs)}`;
        }
        return `${mins}:${makeTwoDigits(secs)}`;
    };

    const makeTwoDigits = (num: number) => {
        return num < 10 ? `0${num}` : num;
    };

    if (!mounted || history.length === 0) return null;

    return (
        <div className="relative my-8 max-w-380 mx-auto px-4 sm:px-6 lg:px-8 animate-fade-in z-20">
            {/* Title Header */}
            <div className="flex items-center justify-between mb-4">
                <h2 className="text-lg sm:text-xl font-black tracking-wider uppercase text-foreground relative inline-block group-hover:text-primary transition-colors select-none">
                    Continue Watching
                    <span className="absolute bottom-0 left-0 w-8 h-[2.5px] bg-primary rounded-full shadow-[0_0_8px_rgba(227,28,37,0.5)]" />
                </h2>
                <button
                    onClick={handleClearAll}
                    className="text-xs text-foreground/45 hover:text-primary transition-colors flex items-center space-x-1.5 cursor-pointer font-bold uppercase tracking-wider"
                >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Clear All</span>
                </button>
            </div>

            {/* Horizontal scroll list */}
            <div className="flex overflow-x-auto space-x-4 py-2 no-scrollbar w-full">
                {history.map((item) => {
                    const watchUrl = `/watch/${item.detailPath}${
                        item.isSeries && item.season && item.episode
                            ? `?season=${item.season}&episode=${item.episode}`
                            : ""
                    }`;

                    return (
                        <div
                            key={item.detailPath}
                            className="shrink-0 w-[200px] sm:w-[240px] md:w-[270px] relative rounded-2xl overflow-hidden glass-card group flex flex-col transition-all duration-300"
                        >
                            {/* Card Image Area */}
                            <div className="relative aspect-video w-full overflow-hidden bg-foreground/5">
                                {/* eslint-disable-next-line @next/next/no-img-element */}
                                <img
                                    src={item.coverUrl}
                                    alt={item.title}
                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 select-none pointer-events-none"
                                    loading="lazy"
                                />

                                {/* Hover Play Button Overlay */}
                                <Link
                                    href={watchUrl}
                                    className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all duration-300 z-10"
                                >
                                    <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center shadow-lg transform translate-y-2 group-hover:translate-y-0 transition-all duration-300 shadow-primary-glow">
                                        <Play className="w-4 h-4 fill-white text-white translate-x-0.5" />
                                    </div>
                                </Link>

                                {/* Remove from history button */}
                                <button
                                    onClick={(e) =>
                                        handleRemove(e, item.detailPath)
                                    }
                                    className="absolute top-2.5 right-2.5 p-1.5 rounded-full bg-black/60 hover:bg-primary text-white border border-white/5 opacity-0 group-hover:opacity-100 transition-all duration-200 z-20 focus:outline-none cursor-pointer"
                                    title="Remove from history"
                                >
                                    <X className="w-3 h-3" />
                                </button>

                                {/* Progress Bar overlay */}
                                <div className="absolute bottom-0 left-0 right-0 h-1 bg-white/20 z-15">
                                    <div
                                        className="h-full bg-linear-to-r from-primary to-primary-light shadow-[0_0_6px_var(--primary-glow)]"
                                        style={{ width: `${item.progress}%` }}
                                    />
                                </div>
                            </div>

                            {/* Meta Info Area */}
                            <div className="p-3.5 flex flex-col grow bg-glass-panel border-t border-glass-border">
                                <Link
                                    href={watchUrl}
                                    className="font-bold text-xs sm:text-sm text-foreground line-clamp-1 hover:text-primary transition-colors duration-200"
                                >
                                    {item.title}
                                </Link>

                                <div className="flex items-center justify-between mt-1.5 text-[10px] font-bold tracking-wide uppercase text-foreground/50">
                                    <span className="flex items-center space-x-1">
                                        <Clock className="w-3 h-3 text-primary" />
                                        <span>
                                            {item.isSeries
                                                ? `S${item.season} E${item.episode}`
                                                : "Movie"}
                                        </span>
                                    </span>
                                    <span>
                                        {formatTime(item.currentTime)} /{" "}
                                        {formatTime(item.duration)}
                                    </span>
                                </div>
                            </div>
                        </div>
                    );
                })}
            </div>
        </div>
    );
}
