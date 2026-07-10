"use client";

import React, { useState, useEffect } from "react";
import { Download, X, Play, AlertCircle, Trash2, CheckCircle } from "lucide-react";
import { downloadStore, DownloadTask } from "@/lib/download-store";

// Helper to format bytes to human readable format
function formatBytes(bytes: number): string {
    if (!bytes || bytes === 0) return "0 Bytes";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

interface DownloadManagerProps {
    isOpen: boolean;
    onClose: () => void;
}

export default function DownloadManager({ isOpen, onClose }: DownloadManagerProps) {
    const [tasks, setTasks] = useState<DownloadTask[]>([]);

    useEffect(() => {
        const unsubscribe = downloadStore.subscribe((newTasks) => {
            setTasks(newTasks);
        });
        return unsubscribe;
    }, []);

    if (!isOpen) return null;

    const hasTasks = tasks.length > 0;
    const activeTasksCount = tasks.filter((t) => t.status === "downloading").length;

    return (
        <div className="absolute right-0 mt-2.5 w-80 sm:w-96 rounded-2xl border border-glass-border bg-zinc-950/95 backdrop-blur-md shadow-2xl z-50 overflow-hidden flex flex-col max-h-[420px]">
            {/* Header */}
            <div className="px-4 py-3 border-b border-glass-border flex items-center justify-between bg-white/2 shrink-0">
                <div className="flex items-center space-x-2">
                    <Download className="w-4 h-4 text-primary animate-pulse" />
                    <span className="text-xs font-black uppercase tracking-wider text-foreground">
                        Downloads Manager
                    </span>
                    {activeTasksCount > 0 && (
                        <span className="bg-primary/20 text-primary border border-primary/20 px-2 py-0.5 rounded-full text-[9px] font-black">
                            {activeTasksCount} Active
                        </span>
                    )}
                </div>
                <button
                    onClick={onClose}
                    className="p-1 rounded-lg text-foreground/45 hover:text-white hover:bg-white/5 transition-colors cursor-pointer"
                >
                    <X className="w-3.5 h-3.5" />
                </button>
            </div>

            {/* Tasks List */}
            <div className="flex-1 overflow-y-auto p-3 space-y-2.5 no-scrollbar min-h-0">
                {!hasTasks ? (
                    <div className="py-12 text-center space-y-2">
                        <Download className="w-8 h-8 text-foreground/20 mx-auto" />
                        <p className="text-xs text-foreground/45">No active downloads found.</p>
                        <p className="text-[10px] text-foreground/30">Downloads you start will show up here.</p>
                    </div>
                ) : (
                    tasks.map((task) => {
                        const isDownloading = task.status === "downloading";
                        const isCompleted = task.status === "completed";
                        const isFailed = task.status === "failed";

                        return (
                            <div
                                key={task.id}
                                className="p-3 rounded-xl border border-white/5 bg-white/1 hover:bg-white/2 transition-colors relative overflow-hidden group"
                            >
                                <div className="flex items-start justify-between gap-3">
                                    <div className="space-y-1 flex-1 min-w-0">
                                        {/* Filename */}
                                        <p className="text-xs font-bold text-foreground line-clamp-1 pr-6 group-hover:text-primary transition-colors">
                                            {task.filename}
                                        </p>
                                        
                                        {/* Status Message */}
                                        <div className="flex items-center gap-1.5 text-[10px] font-medium text-foreground/50">
                                            {isDownloading && (
                                                <>
                                                    <span className="inline-block w-1.5 h-1.5 rounded-full bg-primary animate-ping" />
                                                    <span>
                                                        Downloading ({task.progress}%)
                                                        {task.downloadedBytes !== undefined && task.size !== undefined && (
                                                            <span className="text-foreground/35 ml-1">
                                                                • {formatBytes(task.downloadedBytes)} of {formatBytes(task.size)}
                                                            </span>
                                                        )}
                                                    </span>
                                                </>
                                            )}
                                            {isCompleted && (
                                                <span className="text-emerald-400 flex items-center gap-1">
                                                    <CheckCircle className="w-3 h-3 shrink-0" />
                                                    Finished Successfully
                                                </span>
                                            )}
                                            {isFailed && (
                                                <span className="text-red-400 flex items-center gap-1">
                                                    <AlertCircle className="w-3 h-3 shrink-0" />
                                                    {task.error || "Download Failed"}
                                                </span>
                                            )}
                                        </div>
                                    </div>

                                    {/* Action button */}
                                    <div className="shrink-0 relative z-10">
                                        {isDownloading ? (
                                            <button
                                                onClick={() => task.cancel?.()}
                                                className="p-1.5 rounded-lg border border-red-500/25 hover:bg-red-500/10 text-red-400 cursor-pointer transition-colors"
                                                title="Cancel Download"
                                            >
                                                <X className="w-3.5 h-3.5" />
                                            </button>
                                        ) : (
                                            <button
                                                onClick={() => downloadStore.removeTask(task.id)}
                                                className="p-1.5 rounded-lg border border-glass-border bg-glass-card hover:bg-glass-panel hover:text-white text-foreground/50 cursor-pointer transition-colors"
                                                title="Dismiss Task"
                                            >
                                                <Trash2 className="w-3.5 h-3.5" />
                                            </button>
                                        )}
                                    </div>
                                </div>

                                {/* Progress bar (only for active or completed) */}
                                {(isDownloading || isCompleted) && (
                                    <div className="mt-2.5 w-full h-1 bg-zinc-950 rounded-full overflow-hidden border border-white/5">
                                        <div
                                            className={`h-full rounded-full transition-all duration-300 ${
                                                isCompleted ? "bg-emerald-500" : "bg-primary"
                                            }`}
                                            style={{ width: `${task.progress}%` }}
                                        />
                                    </div>
                                )}
                            </div>
                        );
                    })
                )}
            </div>

            {/* Footer */}
            {hasTasks && (
                <div className="px-3 py-2 border-t border-glass-border bg-white/2 shrink-0 flex justify-end">
                    <button
                        onClick={() => downloadStore.clearAll()}
                        className="flex items-center space-x-1 py-1.5 px-3 rounded-lg border border-red-500/25 bg-red-500/5 hover:bg-red-500/10 text-red-400 text-[10px] font-black uppercase tracking-wider transition-colors cursor-pointer"
                    >
                        <Trash2 className="w-3 h-3" />
                        <span>Clear All</span>
                    </button>
                </div>
            )}
        </div>
    );
}
