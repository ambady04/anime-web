"use client";

import { useEffect, useState } from "react";
import { Clock, Trash2, ArrowRight, Play, X } from "lucide-react";
import Link from "next/link";
import { localStore, HistoryItem } from "@/lib/storage";

export default function HistoryPage() {
    const [history, setHistory] = useState<HistoryItem[]>([]);

    useEffect(() => {
        setHistory(localStore.getHistory());
    }, []);

    const handleClearHistory = () => {
        if (
            window.confirm(
                "Are you sure you want to clear your full watch history?",
            )
        ) {
            localStore.clearHistory();
            setHistory([]);
        }
    };

    const handleRemoveItem = (e: React.MouseEvent, path: string) => {
        e.preventDefault();
        e.stopPropagation();
        localStore.removeHistoryItem(path);
        setHistory(localStore.getHistory());
    };

    const formatTime = (seconds: number) => {
        const hrs = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        if (hrs > 0) {
            return `${hrs}:${mins < 10 ? "0" : ""}${mins}:${secs < 10 ? "0" : ""}${secs}`;
        }
        return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
    };

    return (
        <div className="max-w-380 mx-auto px-4 sm:px-6 lg:px-8 py-10 relative z-20 animate-fade-in">
            {/* Header Info */}
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-10 pb-6 border-b border-glass-border select-none">
                <div>
                    <h1 className="text-2xl sm:text-3.5xl font-black text-foreground flex items-center space-x-2">
                        <Clock className="w-8 h-8 text-primary filter drop-shadow-[0_0_8px_var(--primary-glow)] animate-pulse" />
                        <span className="uppercase tracking-wider">
                            Watch History
                        </span>
                    </h1>
                    <p className="text-xs sm:text-sm text-foreground/50 font-medium mt-1">
                        Keep track of what you started watching.
                    </p>
                </div>

                {history.length > 0 && (
                    <button
                        onClick={handleClearHistory}
                        className="text-xs text-primary hover:text-white border border-primary/20 bg-primary/10 hover:bg-primary px-4 py-2.5 rounded-xl transition-all cursor-pointer font-bold flex items-center space-x-1.5 focus:outline-none uppercase tracking-wider"
                    >
                        <Trash2 className="w-4 h-4" />
                        <span>Clear History</span>
                    </button>
                )}
            </div>

            {/* History Items list */}
            {history.length > 0 ? (
                <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {history.map((item) => {
                        const watchUrl = `/watch/${item.detailPath}${
                            item.isSeries && item.season && item.episode
                                ? `?season=${item.season}&episode=${item.episode}`
                                : ""
                        }`;

                        return (
                            <div
                                key={item.detailPath}
                                className="flex rounded-2xl overflow-hidden bg-glass-panel border border-glass-border hover:border-glass-border-hover shadow-card relative group transition-all duration-300"
                            >
                                {/* Image side */}
                                <div className="relative w-1/3 aspect-video md:aspect-auto shrink-0 bg-foreground/5 overflow-hidden">
                                    {/* eslint-disable-next-line @next/next/no-img-element */}
                                    <img
                                        src={item.coverUrl}
                                        alt={item.title}
                                        className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300 select-none pointer-events-none"
                                        loading="lazy"
                                    />

                                    {/* Play overlay button on thumbnail hover */}
                                    <Link
                                        href={watchUrl}
                                        className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 flex items-center justify-center transition-all duration-300 z-10"
                                    >
                                        <div className="w-9 h-9 rounded-full bg-primary flex items-center justify-center shadow-lg shadow-primary-glow">
                                            <Play className="w-3.5 h-3.5 fill-white text-white translate-x-0.5" />
                                        </div>
                                    </Link>
                                </div>

                                {/* Info side */}
                                <div className="p-4 flex flex-col justify-between grow">
                                    <div>
                                        <div className="flex items-start justify-between">
                                            <Link
                                                href={watchUrl}
                                                className="font-extrabold text-sm sm:text-base text-foreground hover:text-primary transition-colors line-clamp-1 pr-6"
                                            >
                                                {item.title}
                                            </Link>

                                            {/* Remove item button */}
                                            <button
                                                onClick={(e) =>
                                                    handleRemoveItem(
                                                        e,
                                                        item.detailPath,
                                                    )
                                                }
                                                className="text-foreground/40 hover:text-primary absolute top-3.5 right-3.5 p-1 rounded-full hover:bg-glass-card border border-transparent hover:border-glass-border transition-all focus:outline-none cursor-pointer"
                                                title="Remove from history"
                                            >
                                                <X className="w-3.5 h-3.5" />
                                            </button>
                                        </div>

                                        <p className="text-[10px] font-black text-primary tracking-wider uppercase mt-1">
                                            {item.isSeries
                                                ? `Season ${item.season} • Episode ${item.episode}`
                                                : "Feature Film"}
                                        </p>
                                    </div>

                                    {/* Progress info and meter bar */}
                                    <div className="mt-4 space-y-1.5">
                                        <div className="flex justify-between items-center text-[10px] font-bold tracking-wide uppercase text-foreground/50">
                                            <span>
                                                {item.progress}% Completed
                                            </span>
                                            <span>
                                                {formatTime(item.currentTime)} /{" "}
                                                {formatTime(item.duration)}
                                            </span>
                                        </div>

                                        {/* Progress slider bar background */}
                                        <div className="w-full h-1 bg-foreground/10 rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-linear-to-r from-primary to-primary-light shadow-[0_0_6px_var(--primary-glow)]"
                                                style={{
                                                    width: `${item.progress}%`,
                                                }}
                                            />
                                        </div>
                                    </div>
                                </div>
                            </div>
                        );
                    })}
                </div>
            ) : (
                /* Empty State */
                <div className="text-center py-16 bg-glass-card rounded-3xl border border-glass-border p-8 max-w-md mx-auto shadow-sm select-none">
                    <Clock className="w-10 h-10 text-foreground/20 mx-auto mb-4" />
                    <h3 className="text-sm font-black text-foreground uppercase tracking-wider mb-1">
                        No History Logs
                    </h3>
                    <p className="text-xs text-foreground/50 font-medium max-w-xs mx-auto mb-6">
                        You haven&apos;t started watching any videos yet. Start
                        streaming to track your progress!
                    </p>
                    <Link
                        href="/"
                        className="inline-flex items-center space-x-2 bg-primary hover:bg-primary-light text-white px-5 py-3 rounded-xl font-bold text-xs uppercase tracking-wider shadow-lg shadow-primary-glow transition-all"
                    >
                        <span>Start Watching Now</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                </div>
            )}
        </div>
    );
}
