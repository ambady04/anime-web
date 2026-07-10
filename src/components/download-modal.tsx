"use client";

import React, { useState, useEffect, useCallback } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
    X,
    Download,
    Copy,
    Check,
    Loader2,
    FileText,
    Terminal,
    Play,
    AlertCircle,
    ChevronRight,
    Sparkles,
} from "lucide-react";
import { movieApi, DownloadLink, Subject, ResourceModel, StreamData } from "@/lib/api";

// Helper to format bytes to human readable format
function formatBytes(bytes: number): string {
    if (!bytes || bytes === 0) return "Unknown Size";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

// Clean titles for filenames
const cleanFilename = (title: string): string => {
    return title
        .replace(/[^a-zA-Z0-9.\-\s_]/g, "")
        .replace(/\s+/g, "_")
        .trim();
};

interface DownloadModalProps {
    isOpen: boolean;
    onClose: () => void;
    path: string;
    subject: Subject;
    resource: ResourceModel;
    activeSeason: number;
    activeEpisode: number;
    currentEpisodeStream: StreamData | null;
}

interface ResolvedEpisode {
    epNum: number;
    url: string;
    resolution: number;
    size: number;
    success: boolean;
    error?: string;
}

export default function DownloadModal({
    isOpen,
    onClose,
    path,
    subject,
    resource,
    activeSeason,
    activeEpisode,
    currentEpisodeStream,
}: DownloadModalProps) {
    const isSeries = subject.subjectType === 2 || subject.subjectType === 7;
    const seasonsList = resource?.seasons || [];

    // Tabs for series: "episode" or "season"
    const [activeTab, setActiveTab] = useState<"episode" | "season">("episode");

    // Copy Feedback State
    const [copiedId, setCopiedId] = useState<string | null>(null);

    // --- State for Single Episode / Movie Download ---
    const [selectedEpisode, setSelectedEpisode] = useState<number>(activeEpisode || 1);
    const [selectedSeasonSingle, setSelectedSeasonSingle] = useState<number>(activeSeason || 1);
    const [singleStream, setSingleStream] = useState<StreamData | null>(null);
    const [isSingleLoading, setIsSingleLoading] = useState<boolean>(false);
    const [singleError, setSingleError] = useState<string | null>(null);

    // --- State for Batch Season Download ---
    const [batchSeason, setBatchSeason] = useState<number>(activeSeason || 1);
    const [targetResolution, setTargetResolution] = useState<string>("best"); // "best", "1080", "720", "480", "360"
    const [isBatchResolving, setIsBatchResolving] = useState<boolean>(false);
    const [resolvingProgress, setResolvingProgress] = useState<number>(0);
    const [resolvingTotal, setResolvingTotal] = useState<number>(0);
    const [resolvedEpisodes, setResolvedEpisodes] = useState<ResolvedEpisode[]>([]);
    const [batchCancelRef, setBatchCancelRef] = useState<{ cancelled: boolean }>({ cancelled: false });

    // Handle copying feedback
    const handleCopy = (text: string, id: string) => {
        navigator.clipboard.writeText(text);
        setCopiedId(id);
        setTimeout(() => setCopiedId(null), 2000);
    };

    // Load single download links (Movie or Episode)
    const loadSingleStream = useCallback(async () => {
        if (!isOpen) return;

        // If it's a Movie, we already have the stream from parent props
        if (!isSeries) {
            setSingleStream(currentEpisodeStream);
            return;
        }

        // If it is the current active season & episode, we can reuse parent's streamData
        if (selectedSeasonSingle === activeSeason && selectedEpisode === activeEpisode && currentEpisodeStream) {
            setSingleStream(currentEpisodeStream);
            setSingleError(null);
            return;
        }

        // Otherwise fetch dynamically
        setIsSingleLoading(true);
        setSingleError(null);
        try {
            const data = await movieApi.getStream(path, selectedSeasonSingle, selectedEpisode);
            setSingleStream(data);
        } catch (err: any) {
            console.error("Error fetching single stream:", err);
            setSingleError(err.message || "Failed to retrieve streaming/download links.");
            setSingleStream(null);
        } finally {
            setIsSingleLoading(false);
        }
    }, [isOpen, isSeries, selectedSeasonSingle, selectedEpisode, activeSeason, activeEpisode, currentEpisodeStream, path]);

    // Trigger loading single stream when episode/season choice changes
    useEffect(() => {
        loadSingleStream();
    }, [loadSingleStream]);

    // Handle batch season resolution
    const startBatchResolving = async () => {
        const targetSeasonData = seasonsList.find((s) => s.se === batchSeason);
        const maxEp = targetSeasonData?.maxEp || 0;
        if (maxEp === 0) return;

        setIsBatchResolving(true);
        setResolvingProgress(0);
        setResolvingTotal(maxEp);
        setResolvedEpisodes([]);
        
        const cancelObj = { cancelled: false };
        setBatchCancelRef(cancelObj);

        const results: ResolvedEpisode[] = [];
        const batchSize = 3; // concurrent request batch size

        for (let i = 1; i <= maxEp; i += batchSize) {
            if (cancelObj.cancelled) break;

            const promises = [];
            for (let j = 0; j < batchSize && (i + j) <= maxEp; j++) {
                const epNum = i + j;
                promises.push(
                    (async () => {
                        try {
                            const streamData = await movieApi.getStream(path, batchSeason, epNum);
                            if (cancelObj.cancelled) return;

                            const downloads = streamData.downloads || [];
                            if (downloads.length === 0) {
                                return {
                                    epNum,
                                    url: "",
                                    resolution: 0,
                                    size: 0,
                                    success: false,
                                    error: "No download links found.",
                                };
                            }

                            // Filter downloads by target resolution
                            let selectedLink: DownloadLink | null = null;
                            const sorted = [...downloads].sort((a, b) => b.resolution - a.resolution);

                            if (targetResolution === "best") {
                                selectedLink = sorted[0];
                            } else {
                                const targetResNum = parseInt(targetResolution);
                                selectedLink = sorted.find((d) => d.resolution === targetResNum) || sorted[0];
                            }

                            return {
                                epNum,
                                url: selectedLink.url,
                                resolution: selectedLink.resolution,
                                size: selectedLink.size,
                                success: true,
                            };
                        } catch (err: any) {
                            return {
                                epNum,
                                url: "",
                                resolution: 0,
                                size: 0,
                                success: false,
                                error: err.message || "Failed to resolve link.",
                            };
                        }
                    })()
                );
            }

            const batchResults = await Promise.all(promises);
            if (cancelObj.cancelled) break;

            // Filter out any undefined due to early cancellation checks
            const validResults = batchResults.filter((r) => r !== undefined) as ResolvedEpisode[];
            results.push(...validResults);
            
            setResolvedEpisodes([...results]);
            setResolvingProgress(Math.min(i + batchSize - 1, maxEp));
        }

        if (!cancelObj.cancelled) {
            setResolvingProgress(maxEp);
            setIsBatchResolving(false);
        }
    };

    const cancelBatchResolving = () => {
        batchCancelRef.cancelled = true;
        setIsBatchResolving(false);
    };

    // Download Helpers
    const downloadAllInBrowser = () => {
        const successful = resolvedEpisodes.filter((ep) => ep.success && ep.url);
        if (successful.length === 0) return;

        successful.forEach((ep, index) => {
            setTimeout(() => {
                const a = document.createElement("a");
                a.href = ep.url;
                a.target = "_blank";
                a.rel = "noopener noreferrer";
                a.download = `${cleanFilename(subject.title)}_S${batchSeason}E${ep.epNum}.mp4`;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
            }, index * 1200); // 1.2s delay to prevent pop-up blocking
        });
    };

    const downloadTxtPlaylist = () => {
        const successful = resolvedEpisodes.filter((ep) => ep.success && ep.url);
        if (successful.length === 0) return;

        const content = successful.map((ep) => ep.url).join("\n");
        const blob = new Blob([content], { type: "text/plain" });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement("a");
        a.href = url;
        a.download = `${cleanFilename(subject.title)}_S${batchSeason}_links.txt`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    const downloadShScript = () => {
        const successful = resolvedEpisodes.filter((ep) => ep.success && ep.url);
        if (successful.length === 0) return;

        const baseName = cleanFilename(subject.title);
        const scriptLines = [
            "#!/bin/bash",
            `# Batch download script for ${subject.title} Season ${batchSeason}`,
            `echo "Starting batch download for ${subject.title}..."`,
            "mkdir -p downloads",
            "",
        ];

        successful.forEach((ep) => {
            const outName = `downloads/${baseName}_S${batchSeason}E${ep.epNum}_${ep.resolution}p.mp4`;
            scriptLines.push(`echo "Downloading Episode ${ep.epNum} (${ep.resolution}p)..."`);
            scriptLines.push(`curl -L -o "${outName}" "${ep.url}"`);
            scriptLines.push("");
        });

        scriptLines.push('echo "Batch download finished!"');

        const blob = new Blob([scriptLines.join("\n")], { type: "text/x-shellscript" });
        const url = URL.createObjectURL(blob);
        
        const a = document.createElement("a");
        a.href = url;
        a.download = `download_${baseName}_S${batchSeason}.sh`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);
    };

    // Calculate details for active season selector
    const currentSeasonData = seasonsList.find((s) => s.se === selectedSeasonSingle);
    const maxEpisodesForSelectedSeason = currentSeasonData?.maxEp || 0;

    return (
        <AnimatePresence>
            {isOpen && (
                <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                    {/* Backdrop */}
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        onClick={onClose}
                        className="absolute inset-0 bg-black/85 backdrop-blur-md"
                    />

                    {/* Modal Panel */}
                    <motion.div
                        initial={{ scale: 0.95, opacity: 0 }}
                        animate={{ scale: 1, opacity: 1 }}
                        exit={{ scale: 0.95, opacity: 0 }}
                        transition={{ type: "spring", duration: 0.4 }}
                        className="relative w-full max-w-2xl bg-zinc-950/95 backdrop-blur-md border border-white/10 p-5 rounded-3xl shadow-2xl z-10 flex flex-col max-h-[90vh] overflow-hidden"
                    >
                        {/* Close button */}
                        <button
                            onClick={onClose}
                            className="absolute top-4 right-4 p-2 rounded-xl text-foreground/50 hover:text-white hover:bg-white/5 transition-colors focus:outline-none cursor-pointer z-20"
                        >
                            <X className="w-4 h-4" />
                        </button>

                        {/* Title and Badge */}
                        <div className="mb-4 pr-10">
                            <span className="inline-flex bg-primary/10 border border-primary/20 text-primary px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider mb-2">
                                Download Hub
                            </span>
                            <h2 className="text-lg font-black text-foreground line-clamp-1">
                                {subject.title}
                            </h2>
                            <p className="text-xs text-foreground/50">
                                {isSeries ? "Download episodes or grab full seasons for offline viewing" : "Get direct links for high-speed offline downloads"}
                            </p>
                        </div>

                        {/* Tabs (only for TV Series) */}
                        {isSeries && (
                            <div className="flex bg-zinc-900/50 border border-white/5 p-1 rounded-2xl mb-4">
                                <button
                                    onClick={() => setActiveTab("episode")}
                                    className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                                        activeTab === "episode"
                                            ? "bg-primary text-white shadow-md"
                                            : "text-foreground/60 hover:text-foreground"
                                    }`}
                                >
                                    Episode Download
                                </button>
                                <button
                                    onClick={() => setActiveTab("season")}
                                    className={`flex-1 py-2 text-xs font-bold rounded-xl transition-all cursor-pointer ${
                                        activeTab === "season"
                                            ? "bg-primary text-white shadow-md"
                                            : "text-foreground/60 hover:text-foreground"
                                    }`}
                                >
                                    Season Batch Downloader
                                </button>
                            </div>
                        )}

                        {/* --- SINGLE DOWNLOAD TAB (Movies, or Episode Wise Series Download) --- */}
                        {(!isSeries || activeTab === "episode") && (
                            <div className="flex-1 flex flex-col min-h-0">
                                {isSeries && (
                                    <div className="grid grid-cols-2 gap-3 mb-4">
                                        {/* Season Selector */}
                                        <div className="flex flex-col space-y-1">
                                            <label className="text-[10px] uppercase font-black tracking-wider text-foreground/45">
                                                Season
                                            </label>
                                            <select
                                                value={selectedSeasonSingle}
                                                onChange={(e) => {
                                                    const s = Number(e.target.value);
                                                    setSelectedSeasonSingle(s);
                                                    setSelectedEpisode(1);
                                                }}
                                                className="text-xs bg-zinc-900 border border-white/10 rounded-xl px-3 py-2 text-foreground focus:outline-none cursor-pointer focus:border-primary transition-all"
                                            >
                                                {seasonsList.map((se) => (
                                                    <option key={se.se} value={se.se}>
                                                        Season {se.se}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>

                                        {/* Episode Selector */}
                                        <div className="flex flex-col space-y-1">
                                            <label className="text-[10px] uppercase font-black tracking-wider text-foreground/45">
                                                Episode
                                            </label>
                                            <select
                                                value={selectedEpisode}
                                                onChange={(e) => setSelectedEpisode(Number(e.target.value))}
                                                className="text-xs bg-zinc-900 border border-white/10 rounded-xl px-3 py-2 text-foreground focus:outline-none cursor-pointer focus:border-primary transition-all"
                                            >
                                                {Array.from({ length: maxEpisodesForSelectedSeason }).map((_, i) => (
                                                    <option key={i + 1} value={i + 1}>
                                                        Episode {i + 1}
                                                    </option>
                                                ))}
                                            </select>
                                        </div>
                                    </div>
                                )}

                                {/* Links List */}
                                <div className="flex-1 overflow-y-auto pr-1 no-scrollbar space-y-2.5">
                                    {isSingleLoading ? (
                                        <div className="flex flex-col items-center justify-center py-12 space-y-3">
                                            <Loader2 className="w-8 h-8 text-primary animate-spin" />
                                            <p className="text-xs text-foreground/50">Resolving download links...</p>
                                        </div>
                                    ) : singleError ? (
                                        <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-400">
                                            <AlertCircle className="w-5 h-5 shrink-0" />
                                            <span className="text-xs leading-relaxed">{singleError}</span>
                                        </div>
                                    ) : !singleStream || !singleStream.downloads || singleStream.downloads.length === 0 ? (
                                        <div className="text-center py-12 space-y-2 border border-dashed border-white/10 rounded-2xl">
                                            <AlertCircle className="w-8 h-8 text-foreground/35 mx-auto" />
                                            <p className="text-xs text-foreground/50">No download resources found.</p>
                                        </div>
                                    ) : (
                                        [...singleStream.downloads]
                                            .sort((a, b) => b.resolution - a.resolution)
                                            .map((link) => {
                                                const copyId = `single-${link.id}`;
                                                return (
                                                    <div
                                                        key={link.id}
                                                        className="flex items-center justify-between p-3.5 bg-zinc-900/60 border border-white/5 hover:border-white/15 rounded-2xl transition-all duration-300 group"
                                                    >
                                                        <div className="flex items-center space-x-3.5">
                                                            <div className="bg-primary/10 border border-primary/20 text-primary w-11 h-11 rounded-xl flex items-center justify-center text-xs font-black">
                                                                {link.resolution}p
                                                            </div>
                                                            <div className="space-y-0.5">
                                                                <p className="text-xs font-bold text-white group-hover:text-primary transition-colors">
                                                                    {link.resolution}p High Definition MP4
                                                                </p>
                                                                <p className="text-[10px] text-foreground/45 font-medium">
                                                                    Size: {formatBytes(link.size)}
                                                                </p>
                                                            </div>
                                                        </div>

                                                        <div className="flex items-center gap-2">
                                                            <button
                                                                onClick={() => handleCopy(link.url, copyId)}
                                                                className="p-2 rounded-xl bg-zinc-800/80 hover:bg-zinc-800 border border-white/5 text-foreground/75 hover:text-white transition-all cursor-pointer"
                                                                title="Copy Direct Link"
                                                            >
                                                                {copiedId === copyId ? (
                                                                    <Check className="w-3.5 h-3.5 text-emerald-500 animate-fade-in" />
                                                                ) : (
                                                                    <Copy className="w-3.5 h-3.5" />
                                                                )}
                                                            </button>
                                                            <a
                                                                href={link.url}
                                                                target="_blank"
                                                                rel="noopener noreferrer"
                                                                className="flex items-center space-x-1.5 py-2 px-3.5 rounded-xl bg-primary hover:bg-primary/90 text-white font-bold text-xs shadow-md shadow-primary-glow/10 hover:shadow-primary-glow/20 transition-all"
                                                                title="Download Now"
                                                            >
                                                                <Download className="w-3.5 h-3.5" />
                                                                <span>Download</span>
                                                            </a>
                                                        </div>
                                                    </div>
                                                );
                                            })
                                    )}
                                </div>
                            </div>
                        )}

                        {/* --- BATCH SEASON DOWNLOAD TAB --- */}
                        {isSeries && activeTab === "season" && (
                            <div className="flex-1 flex flex-col min-h-0">
                                {/* Configuration */}
                                {!isBatchResolving && resolvedEpisodes.length === 0 && (
                                    <div className="bg-zinc-900/40 border border-white/5 rounded-2xl p-4 space-y-4">
                                        <div className="grid grid-cols-2 gap-4">
                                            {/* Season Select */}
                                            <div className="flex flex-col space-y-1.5">
                                                <label className="text-[10px] uppercase font-black tracking-wider text-foreground/45">
                                                    Select Season
                                                </label>
                                                <select
                                                    value={batchSeason}
                                                    onChange={(e) => setBatchSeason(Number(e.target.value))}
                                                    className="text-xs bg-zinc-950 border border-white/10 rounded-xl px-3 py-2 text-foreground focus:outline-none cursor-pointer focus:border-primary transition-all"
                                                >
                                                    {seasonsList.map((se) => (
                                                        <option key={se.se} value={se.se}>
                                                            Season {se.se} ({se.maxEp} Episodes)
                                                        </option>
                                                    ))}
                                                </select>
                                            </div>

                                            {/* Quality Select */}
                                            <div className="flex flex-col space-y-1.5">
                                                <label className="text-[10px] uppercase font-black tracking-wider text-foreground/45">
                                                    Preferred Quality
                                                </label>
                                                <select
                                                    value={targetResolution}
                                                    onChange={(e) => setTargetResolution(e.target.value)}
                                                    className="text-xs bg-zinc-950 border border-white/10 rounded-xl px-3 py-2 text-foreground focus:outline-none cursor-pointer focus:border-primary transition-all"
                                                >
                                                    <option value="best">Best Available Quality</option>
                                                    <option value="1080">1080p Only</option>
                                                    <option value="720">720p Only</option>
                                                    <option value="480">480p Only</option>
                                                    <option value="360">360p Only</option>
                                                </select>
                                            </div>
                                        </div>

                                        <button
                                            onClick={startBatchResolving}
                                            className="w-full flex items-center justify-center space-x-2 py-3 rounded-xl bg-primary hover:bg-primary/95 text-white font-black text-xs uppercase tracking-wider shadow-lg shadow-primary-glow/10 hover:shadow-primary-glow/20 cursor-pointer transition-all"
                                        >
                                            <Sparkles className="w-4 h-4 fill-white animate-pulse" />
                                            <span>Generate Download Links</span>
                                        </button>
                                    </div>
                                )}

                                {/* Progress State */}
                                {isBatchResolving && (
                                    <div className="bg-zinc-900/40 border border-white/5 rounded-2xl p-5 text-center space-y-4">
                                        <div className="flex justify-between text-xs font-bold text-foreground/50">
                                            <span>Resolving Season {batchSeason} Links...</span>
                                            <span className="text-primary font-black">
                                                {resolvingProgress} / {resolvingTotal} Resolved
                                            </span>
                                        </div>
                                        
                                        {/* Progress Bar */}
                                        <div className="w-full h-2 bg-zinc-950 border border-white/5 rounded-full overflow-hidden">
                                            <div
                                                className="h-full bg-linear-to-r from-primary to-primary-glow rounded-full transition-all duration-300"
                                                style={{ width: `${(resolvingProgress / resolvingTotal) * 100}%` }}
                                            />
                                        </div>

                                        <div className="flex items-center justify-center gap-2 text-xs text-foreground/60">
                                            <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />
                                            <span>Fetching episode URLs. Do not close this modal.</span>
                                        </div>

                                        <button
                                            onClick={cancelBatchResolving}
                                            className="px-4 py-2 border border-red-500/35 hover:bg-red-500/10 text-red-400 font-bold text-xs rounded-xl transition-all cursor-pointer"
                                        >
                                            Cancel Operation
                                        </button>
                                    </div>
                                )}

                                {/* Batch Action Hub and Results */}
                                {resolvedEpisodes.length > 0 && (
                                    <div className="flex-1 flex flex-col min-h-0 space-y-4">
                                        {/* Batch Action Toolbar */}
                                        {!isBatchResolving && (
                                            <div className="bg-zinc-900/50 border border-white/5 p-3 rounded-2xl space-y-2">
                                                <div className="flex justify-between items-center text-[10px] font-black text-foreground/45 uppercase tracking-widest px-1">
                                                    <span>Batch download options (Season {batchSeason})</span>
                                                    <span className="text-emerald-400">Done</span>
                                                </div>
                                                <div className="grid grid-cols-2 sm:grid-cols-4 gap-2">
                                                    <button
                                                        onClick={() => {
                                                            const urls = resolvedEpisodes
                                                                .filter((e) => e.success && e.url)
                                                                .map((e) => e.url)
                                                                .join("\n");
                                                            handleCopy(urls, "batch-copy");
                                                        }}
                                                        className="flex items-center justify-center space-x-1.5 py-2 px-2.5 rounded-xl bg-zinc-800/80 hover:bg-zinc-800 border border-white/5 text-foreground hover:text-white font-bold text-[10px] uppercase tracking-wider cursor-pointer transition-all"
                                                    >
                                                        {copiedId === "batch-copy" ? (
                                                            <Check className="w-3 h-3 text-emerald-500" />
                                                        ) : (
                                                            <Copy className="w-3 h-3 text-primary" />
                                                        )}
                                                        <span>{copiedId === "batch-copy" ? "Copied" : "Copy Links"}</span>
                                                    </button>
                                                    <button
                                                        onClick={downloadTxtPlaylist}
                                                        className="flex items-center justify-center space-x-1.5 py-2 px-2.5 rounded-xl bg-zinc-800/80 hover:bg-zinc-800 border border-white/5 text-foreground hover:text-white font-bold text-[10px] uppercase tracking-wider cursor-pointer transition-all"
                                                    >
                                                        <FileText className="w-3 h-3 text-primary" />
                                                        <span>Download TXT</span>
                                                    </button>
                                                    <button
                                                        onClick={downloadShScript}
                                                        className="flex items-center justify-center space-x-1.5 py-2 px-2.5 rounded-xl bg-zinc-800/80 hover:bg-zinc-800 border border-white/5 text-foreground hover:text-white font-bold text-[10px] uppercase tracking-wider cursor-pointer transition-all"
                                                    >
                                                        <Terminal className="w-3 h-3 text-primary" />
                                                        <span>Download SH</span>
                                                    </button>
                                                    <button
                                                        onClick={downloadAllInBrowser}
                                                        className="flex items-center justify-center space-x-1.5 py-2 px-2.5 rounded-xl bg-primary hover:bg-primary/90 text-white font-bold text-[10px] uppercase tracking-wider cursor-pointer transition-all col-span-2 sm:col-span-1"
                                                    >
                                                        <Download className="w-3 h-3" />
                                                        <span>Download All</span>
                                                    </button>
                                                </div>
                                                <p className="text-[8px] text-foreground/30 font-medium text-center pt-1 border-t border-white/5">
                                                    Tip: Copy all URLs to clipboard, then import them directly into IDM or JDownloader.
                                                </p>
                                            </div>
                                        )}

                                        {/* Resolved episodes list */}
                                        <div className="flex-1 overflow-y-auto space-y-2 pr-1 no-scrollbar">
                                            {resolvedEpisodes.map((ep) => {
                                                const copyId = `batch-ep-${ep.epNum}`;
                                                return (
                                                    <div
                                                        key={ep.epNum}
                                                        className={`flex items-center justify-between p-2.5 border rounded-2xl transition-all ${
                                                            ep.success
                                                                ? "bg-zinc-900/40 border-white/5 hover:border-white/10"
                                                                : "bg-red-500/5 border-red-500/10"
                                                        }`}
                                                    >
                                                        <div className="flex items-center space-x-3">
                                                            <div className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black ${
                                                                ep.success
                                                                    ? "bg-emerald-500/10 text-emerald-500"
                                                                    : "bg-red-500/10 text-red-400"
                                                            }`}>
                                                                E{ep.epNum}
                                                            </div>
                                                            <div className="space-y-0.5">
                                                                <p className="text-xs font-bold text-white leading-none">
                                                                    Episode {ep.epNum}
                                                                </p>
                                                                <p className="text-[9px] text-foreground/45 font-medium leading-none">
                                                                    {ep.success ? `${ep.resolution}p • ${formatBytes(ep.size)}` : ep.error}
                                                                </p>
                                                            </div>
                                                        </div>

                                                        {ep.success && (
                                                            <div className="flex items-center gap-1.5">
                                                                <button
                                                                    onClick={() => handleCopy(ep.url, copyId)}
                                                                    className="p-1.5 rounded-lg bg-zinc-800/80 hover:bg-zinc-800 border border-white/5 text-foreground/75 hover:text-white transition-all cursor-pointer"
                                                                    title="Copy Link"
                                                                >
                                                                    {copiedId === copyId ? (
                                                                        <Check className="w-3 h-3 text-emerald-500 animate-fade-in" />
                                                                    ) : (
                                                                        <Copy className="w-3 h-3" />
                                                                    )}
                                                                </button>
                                                                <a
                                                                    href={ep.url}
                                                                    target="_blank"
                                                                    rel="noopener noreferrer"
                                                                    className="p-1.5 rounded-lg bg-zinc-800/80 hover:bg-primary border border-white/5 hover:border-primary/10 text-foreground/75 hover:text-white transition-all"
                                                                    title="Download Episode"
                                                                >
                                                                    <Download className="w-3 h-3" />
                                                                </a>
                                                            </div>
                                                        )}
                                                    </div>
                                                );
                                            })}
                                        </div>

                                        {/* Reset Button */}
                                        {!isBatchResolving && (
                                            <button
                                                onClick={() => {
                                                    setResolvedEpisodes([]);
                                                    setIsBatchResolving(false);
                                                }}
                                                className="w-full text-center py-2 text-[10px] font-black uppercase tracking-wider text-foreground/40 hover:text-foreground transition-colors cursor-pointer"
                                            >
                                                Configure & Resolve Again
                                            </button>
                                        )}
                                    </div>
                                )}
                            </div>
                        )}
                    </motion.div>
                </div>
            )}
        </AnimatePresence>
    );
}
