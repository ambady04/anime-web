"use client";

import React, { useState, useEffect, useCallback, useRef } from "react";
import { createPortal } from "react-dom";
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
  ChevronDown,
} from "lucide-react";
import {
  movieApi,
  DownloadLink,
  Subject,
  ResourceModel,
  StreamData,
  Caption,
} from "@/lib/api";
import { downloadStore, DownloadTask } from "@/lib/download-store";

// Helper to format bytes to human readable format
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 Bytes";
  const k = 1024;
  const sizes = ["Bytes", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

// Clean titles for filenames — uses first word only for compact names
function cleanFilename(title: string): string {
  // Remove bracketed content like [Tamil], [Hindi]
  const cleaned = title.replace(/\[[^\]]*\]/g, "").trim();
  // Get first word (or first two if first is very short)
  const words = cleaned.split(/\s+/).filter(Boolean);
  if (words.length === 0) return "Video";
  const name =
    words[0].length <= 3 && words.length > 1
      ? `${words[0]}_${words[1]}`
      : words[0];
  return name.replace(/[^a-zA-Z0-9_\-]/g, "");
}

// Full title for folder names
function cleanFolderName(title: string): string {
  return title
    .replace(/[^a-zA-Z0-9_\-\s]/g, "")
    .replace(/\s+/g, "_")
    .substring(0, 40);
}

interface CustomDropdownProps<T> {
  value: T;
  onChange: (val: T) => void;
  options: { value: T; label: string }[];
  label?: string;
  className?: string;
}

function CustomDropdown<T extends string | number>({
  value,
  onChange,
  options,
  label,
  className = "",
}: CustomDropdownProps<T>) {
  const [isOpen, setIsOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handleOutsideClick = (event: MouseEvent) => {
      if (
        containerRef.current &&
        !containerRef.current.contains(event.target as Node)
      ) {
        setIsOpen(false);
      }
    };
    document.addEventListener("click", handleOutsideClick);
    return () => {
      document.removeEventListener("click", handleOutsideClick);
    };
  }, [isOpen]);

  const activeOption = options.find((opt) => opt.value === value);

  return (
    <div className={`relative ${className}`} ref={containerRef}>
      {label && (
        <label className="text-[10px] uppercase font-black tracking-wider text-foreground/45 mb-1 block">
          {label}
        </label>
      )}
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className="w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl border border-glass-border bg-glass-card hover:bg-glass-panel text-xs text-foreground font-semibold focus:outline-none cursor-pointer transition-all text-left"
      >
        <span className="truncate">
          {activeOption ? activeOption.label : String(value)}
        </span>
        <ChevronDown className="w-3.5 h-3.5 ml-1.5 text-foreground/45 shrink-0" />
      </button>

      {isOpen && (
        <div className="absolute left-0 right-0 mt-2 rounded-xl border border-glass-border bg-zinc-950/95 backdrop-blur-md shadow-2xl z-50 py-1 max-h-48 overflow-y-auto scrollbar-thin">
          {options.map((opt) => (
            <button
              key={String(opt.value)}
              type="button"
              onClick={() => {
                onChange(opt.value);
                setIsOpen(false);
              }}
              className={`w-full text-left px-3.5 py-2 text-xs font-semibold transition-all flex items-center justify-between cursor-pointer ${
                value === opt.value
                  ? "bg-primary text-white"
                  : "text-foreground/80 hover:text-white hover:bg-white/5"
              }`}
            >
              <span className="truncate">{opt.label}</span>
              {value === opt.value && (
                <Check className="w-3.5 h-3.5 text-white shrink-0 ml-1.5" />
              )}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}

// Range picker — lets user type "from" and "to" episode numbers and apply as a selection
function RangePicker({
  maxEp,
  onApply,
}: {
  maxEp: number;
  onApply: (from: number, to: number) => void;
}) {
  const [from, setFrom] = useState<string>("1");
  const [to, setTo] = useState<string>(String(maxEp));

  // Keep "to" capped when maxEp changes (season switch)
  useEffect(() => {
    setFrom("1");
    setTo(String(maxEp));
  }, [maxEp]);

  const fromNum = Math.max(1, Math.min(parseInt(from) || 1, maxEp));
  const toNum = Math.max(fromNum, Math.min(parseInt(to) || maxEp, maxEp));
  const isValid = !isNaN(fromNum) && !isNaN(toNum) && fromNum <= toNum;

  return (
    <div className="flex items-center gap-2 bg-zinc-900/60 border border-white/5 rounded-xl px-3 py-2">
      <span className="text-[10px] font-black uppercase tracking-wider text-foreground/40 shrink-0">
        Range
      </span>
      <input
        type="number"
        min={1}
        max={maxEp}
        value={from}
        onChange={(e) => setFrom(e.target.value)}
        onBlur={() => setFrom(String(fromNum))}
        className="w-14 bg-zinc-800 border border-white/10 rounded-lg text-xs font-bold text-white text-center px-2 py-1.5 focus:outline-none focus:border-primary/50 transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        placeholder="1"
      />
      <span className="text-foreground/30 text-xs font-bold">—</span>
      <input
        type="number"
        min={1}
        max={maxEp}
        value={to}
        onChange={(e) => setTo(e.target.value)}
        onBlur={() => setTo(String(toNum))}
        className="w-14 bg-zinc-800 border border-white/10 rounded-lg text-xs font-bold text-white text-center px-2 py-1.5 focus:outline-none focus:border-primary/50 transition-colors [appearance:textfield] [&::-webkit-outer-spin-button]:appearance-none [&::-webkit-inner-spin-button]:appearance-none"
        placeholder={String(maxEp)}
      />
      <button
        type="button"
        disabled={!isValid}
        onClick={() => isValid && onApply(fromNum, toNum)}
        className="ml-auto shrink-0 px-3 py-1.5 rounded-lg bg-primary/90 hover:bg-primary disabled:opacity-40 disabled:cursor-not-allowed text-white text-[10px] font-black uppercase tracking-wider transition-all cursor-pointer"
      >
        Apply
      </button>
    </div>
  );
}

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
  referer?: string;
  error?: string;
  captions?: Caption[];
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
  const [mounted, setMounted] = useState(false);
  const [tasks, setTasks] = useState<DownloadTask[]>([]);

  useEffect(() => {
    setMounted(true);
    const unsubscribe = downloadStore.subscribe((newTasks) => {
      setTasks(newTasks);
    });
    return () => unsubscribe();
  }, []);

  const isSeries = subject.subjectType === 2 || subject.subjectType === 7;
  const seasonsList = resource?.seasons || [];

  // Tabs for series: "episode" or "season"
  const [activeTab, setActiveTab] = useState<"episode" | "season">("episode");

  // Copy Feedback State
  const [copiedId, setCopiedId] = useState<string | null>(null);

  // --- State for Single Episode / Movie Download ---
  const [selectedEpisode, setSelectedEpisode] = useState<number>(
    activeEpisode || 1,
  );
  const [selectedSeasonSingle, setSelectedSeasonSingle] = useState<number>(
    activeSeason || 1,
  );
  const [singleStream, setSingleStream] = useState<StreamData | null>(null);
  const [isSingleLoading, setIsSingleLoading] = useState<boolean>(false);
  const [singleError, setSingleError] = useState<string | null>(null);

  // --- State for Batch Season Download ---
  const [batchSeason, setBatchSeason] = useState<number>(activeSeason || 1);
  const [selectedEpisodes, setSelectedEpisodes] = useState<Set<number>>(() => {
    const targetSeason = (resource?.seasons || []).find(
      (s) => s.se === (activeSeason || 1),
    );
    const maxEp = targetSeason?.maxEp || 0;
    return new Set(Array.from({ length: maxEp }, (_, i) => i + 1));
  });
  const [targetResolution, setTargetResolution] = useState<string>("best"); // "best", "1080", "720", "480", "360"
  const [isBatchResolving, setIsBatchResolving] = useState<boolean>(false);
  const [resolvingProgress, setResolvingProgress] = useState<number>(0);
  const [resolvingTotal, setResolvingTotal] = useState<number>(0);
  const [resolvedEpisodes, setResolvedEpisodes] = useState<ResolvedEpisode[]>(
    [],
  );
  const [batchCancelRef, setBatchCancelRef] = useState<{
    cancelled: boolean;
  }>({ cancelled: false });

  // Calculate bulk season downloading states
  const cleanTitle = subject.title.replace(/[^a-zA-Z0-9\s]/g, "");
  const zipFilename = `${cleanTitle} Season ${batchSeason}.zip`;
  const bulkTask = tasks.find((t) => t.filename === zipFilename);
  const isBulkDownloading = bulkTask?.status === "downloading";
  const isBulkCompleted = bulkTask?.status === "completed";
  const bulkProgress = bulkTask?.progress || 0;

  // --- Subtitle Language Selection ---
  // "none" = no subtitles, "all" = all languages, or specific code like "en", "es"
  const [selectedSubLang, setSelectedSubLang] = useState<string>("en");

  // Get available subtitle languages from current stream
  const availableCaptions =
    singleStream?.captions || currentEpisodeStream?.captions || [];

  // Filter captions based on user selection
  const getFilteredCaptions = (
    captions: Caption[] | undefined,
  ): Caption[] | undefined => {
    if (!captions || captions.length === 0) return undefined;
    if (selectedSubLang === "none") return undefined;
    if (selectedSubLang === "all") return captions;
    return captions.filter(
      (c) =>
        c.lan === selectedSubLang ||
        c.lanName?.toLowerCase().includes(selectedSubLang),
    );
  };

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
    if (
      selectedSeasonSingle === activeSeason &&
      selectedEpisode === activeEpisode &&
      currentEpisodeStream
    ) {
      setSingleStream(currentEpisodeStream);
      setSingleError(null);
      return;
    }

    // Otherwise fetch dynamically
    setIsSingleLoading(true);
    setSingleError(null);
    try {
      const data = await movieApi.getStream(
        path,
        selectedSeasonSingle,
        selectedEpisode,
      );
      setSingleStream(data);
    } catch (err: any) {
      console.error("Error fetching single stream:", err);
      setSingleError(
        err.message || "Failed to retrieve streaming/download links.",
      );
      setSingleStream(null);
    } finally {
      setIsSingleLoading(false);
    }
  }, [
    isOpen,
    isSeries,
    selectedSeasonSingle,
    selectedEpisode,
    activeSeason,
    activeEpisode,
    currentEpisodeStream,
    path,
  ]);

  // Trigger loading single stream when episode/season choice changes
  useEffect(() => {
    loadSingleStream();
  }, [loadSingleStream]);

  // Handle batch season resolution
  const startBatchResolving = async () => {
    const episodesToResolve = Array.from(selectedEpisodes).sort(
      (a, b) => a - b,
    );
    if (episodesToResolve.length === 0) return;

    setIsBatchResolving(true);
    setResolvingProgress(0);
    setResolvingTotal(episodesToResolve.length);
    setResolvedEpisodes([]);

    const cancelObj = { cancelled: false };
    setBatchCancelRef(cancelObj);

    const results: ResolvedEpisode[] = [];
    const batchSize = 3;

    for (let i = 0; i < episodesToResolve.length; i += batchSize) {
      if (cancelObj.cancelled) break;

      const chunk = episodesToResolve.slice(i, i + batchSize);
      const promises = chunk.map((epNum) =>
        (async () => {
          try {
            const streamData = await movieApi.getStream(
              path,
              batchSeason,
              epNum,
            );
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

            let selectedLink: DownloadLink | null = null;
            const sorted = [...downloads].sort(
              (a, b) => b.resolution - a.resolution,
            );

            if (targetResolution === "best") {
              selectedLink = sorted[0];
            } else {
              const targetResNum = parseInt(targetResolution);
              selectedLink =
                sorted.find((d) => d.resolution === targetResNum) || sorted[0];
            }

            return {
              epNum,
              url: selectedLink.url,
              resolution: selectedLink.resolution,
              size: selectedLink.size,
              success: true,
              referer:
                streamData.stream_domain || "https://videodownloader.site/",
              captions: streamData.captions,
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
        })(),
      );

      const batchResults = await Promise.all(promises);
      if (cancelObj.cancelled) break;

      const validResults = batchResults.filter(
        (r) => r !== undefined,
      ) as ResolvedEpisode[];
      results.push(...validResults);

      setResolvedEpisodes([...results]);
      setResolvingProgress(Math.min(i + batchSize, episodesToResolve.length));
    }

    if (!cancelObj.cancelled) {
      setResolvingProgress(episodesToResolve.length);
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

    const cleanTitle = subject.title.replace(/[^a-zA-Z0-9\s]/g, "");
    const zipFilename = `${cleanTitle} Season ${batchSeason}.zip`;

    const items = successful.map((ep) => {
      const shortName = cleanFilename(subject.title);
      const filename = `${shortName}_S${batchSeason}E${ep.epNum}_${ep.resolution}p.mp4`;
      const referer = ep.referer || "https://videodownloader.site/";
      return {
        url: ep.url,
        referer,
        filename,
        size: ep.size,
        captions: getFilteredCaptions(ep.captions),
      };
    });

    downloadStore.startBulkDownload(items, zipFilename);
  };

  const downloadTxtPlaylist = () => {
    const successful = resolvedEpisodes.filter((ep) => ep.success && ep.url);
    if (successful.length === 0) return;

    const content = successful.map((ep) => ep.url).join("\n");
    const blob = new Blob([content], { type: "text/plain" });
    const url = URL.createObjectURL(blob);

    const shortName = cleanFilename(subject.title);
    const a = document.createElement("a");
    a.href = url;
    a.download = `${shortName}_S${batchSeason}_links.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const downloadShScript = () => {
    const successful = resolvedEpisodes.filter((ep) => ep.success && ep.url);
    if (successful.length === 0) return;

    const shortName = cleanFilename(subject.title);
    const scriptLines = [
      "#!/bin/bash",
      `# Batch download script for ${subject.title} Season ${batchSeason}`,
      `echo "Starting batch download for ${subject.title}..."`,
      "mkdir -p downloads",
      "",
    ];

    successful.forEach((ep) => {
      const outName = `downloads/${shortName}_S${batchSeason}E${ep.epNum}_${ep.resolution}p.mp4`;
      scriptLines.push(
        `echo "Downloading Episode ${ep.epNum} (${ep.resolution}p)..."`,
      );
      scriptLines.push(`curl -L -o "${outName}" "${ep.url}"`);
      scriptLines.push("");
    });

    scriptLines.push('echo "Batch download finished!"');

    const blob = new Blob([scriptLines.join("\n")], {
      type: "text/x-shellscript",
    });
    const url = URL.createObjectURL(blob);

    const a = document.createElement("a");
    a.href = url;
    a.download = `dl_${shortName}_S${batchSeason}.sh`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  // Calculate details for active season selector
  const currentSeasonData = seasonsList.find(
    (s) => s.se === selectedSeasonSingle,
  );
  const maxEpisodesForSelectedSeason = currentSeasonData?.maxEp || 0;

  if (!mounted) return null;

  return createPortal(
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
                {isSeries
                  ? "Download episodes or grab full seasons for offline viewing"
                  : "Get direct links for high-speed offline downloads"}
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
                    <CustomDropdown
                      label="Season"
                      value={selectedSeasonSingle}
                      onChange={(val) => {
                        setSelectedSeasonSingle(val);
                        setSelectedEpisode(1);
                      }}
                      options={seasonsList.map((se) => ({
                        value: se.se,
                        label: `Season ${se.se}`,
                      }))}
                    />

                    {/* Episode Selector */}
                    <CustomDropdown
                      label="Episode"
                      value={selectedEpisode}
                      onChange={(val) => setSelectedEpisode(val)}
                      options={Array.from({
                        length: maxEpisodesForSelectedSeason,
                      }).map((_, i) => ({
                        value: i + 1,
                        label: `Episode ${i + 1}`,
                      }))}
                    />
                  </div>
                )}

                {/* Subtitle Language Selector */}
                {availableCaptions.length > 0 && (
                  <div className="mb-3">
                    <CustomDropdown
                      label="Subtitle"
                      value={selectedSubLang}
                      onChange={(val) => setSelectedSubLang(val)}
                      options={[
                        {
                          value: "none",
                          label: "No Subtitles",
                        },
                        {
                          value: "all",
                          label: "All Languages (ZIP)",
                        },
                        ...availableCaptions.map((c) => ({
                          value: c.lan,
                          label: c.lanName || c.lan,
                        })),
                      ]}
                    />
                  </div>
                )}

                {/* Links List */}
                <div className="flex-1 overflow-y-auto pr-1 no-scrollbar space-y-2.5">
                  {isSingleLoading ? (
                    <div className="flex flex-col items-center justify-center py-12 space-y-3">
                      <Loader2 className="w-8 h-8 text-primary animate-spin" />
                      <p className="text-xs text-foreground/50">
                        Resolving download links...
                      </p>
                    </div>
                  ) : singleError ? (
                    <div className="flex items-center gap-3 p-4 bg-red-500/10 border border-red-500/20 rounded-2xl text-red-400">
                      <AlertCircle className="w-5 h-5 shrink-0" />
                      <span className="text-xs leading-relaxed">
                        {singleError}
                      </span>
                    </div>
                  ) : !singleStream ||
                    !singleStream.downloads ||
                    singleStream.downloads.length === 0 ? (
                    <div className="text-center py-12 space-y-2 border border-dashed border-white/10 rounded-2xl">
                      <AlertCircle className="w-8 h-8 text-foreground/35 mx-auto" />
                      <p className="text-xs text-foreground/50">
                        No download resources found.
                      </p>
                    </div>
                  ) : (
                    [...singleStream.downloads]
                      .sort((a, b) => b.resolution - a.resolution)
                      .map((link) => {
                        const copyId = `single-${link.id}`;
                        const activeTask = tasks.find((t) =>
                          t.id.startsWith(link.url),
                        );
                        const isDownloading =
                          activeTask?.status === "downloading";
                        const isCompleted = activeTask?.status === "completed";

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
                              <button
                                onClick={() => {
                                  if (isDownloading) return;
                                  const shortName = cleanFilename(
                                    subject.title,
                                  );
                                  const filename = `${shortName}_S${selectedSeasonSingle}E${selectedEpisode}_${link.resolution}p.mp4`;
                                  downloadStore.startDownload(
                                    link.url,
                                    singleStream?.stream_domain ||
                                      "https://videodownloader.site/",
                                    filename,
                                    link.size,
                                    getFilteredCaptions(singleStream?.captions),
                                  );
                                }}
                                className={`flex items-center space-x-1.5 py-2 px-3.5 rounded-xl font-bold text-xs shadow-md transition-all cursor-pointer ${
                                  isDownloading
                                    ? "bg-amber-500/20 border border-amber-500/30 text-amber-400 cursor-not-allowed"
                                    : isCompleted
                                      ? "bg-emerald-600 hover:bg-emerald-600/90 text-white"
                                      : "bg-primary hover:bg-primary/95 text-white shadow-primary-glow/10 hover:shadow-primary-glow/20"
                                }`}
                                title={
                                  isDownloading
                                    ? "Downloading..."
                                    : isCompleted
                                      ? "Download Again"
                                      : "Download Now"
                                }
                                disabled={isDownloading}
                              >
                                {isDownloading ? (
                                  <>
                                    <Loader2 className="w-3.5 h-3.5 animate-spin text-amber-400" />
                                    <span>
                                      Downloading ({activeTask.progress}%)
                                    </span>
                                  </>
                                ) : isCompleted ? (
                                  <>
                                    <Check className="w-3.5 h-3.5 text-white" />
                                    <span>Finished</span>
                                  </>
                                ) : (
                                  <>
                                    <Download className="w-3.5 h-3.5" />
                                    <span>Download</span>
                                  </>
                                )}
                              </button>
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
                      <CustomDropdown
                        label="Select Season"
                        value={batchSeason}
                        onChange={(val) => {
                          setBatchSeason(val);
                          const season = seasonsList.find((s) => s.se === val);
                          const maxEp = season?.maxEp || 0;
                          setSelectedEpisodes(
                            new Set(
                              Array.from({ length: maxEp }, (_, i) => i + 1),
                            ),
                          );
                          setResolvedEpisodes([]);
                        }}
                        options={seasonsList.map((se) => ({
                          value: se.se,
                          label: `Season ${se.se} (${se.maxEp} Episodes)`,
                        }))}
                      />

                      {/* Quality Select */}
                      <CustomDropdown
                        label="Preferred Quality"
                        value={targetResolution}
                        onChange={(val) => setTargetResolution(val)}
                        options={[
                          {
                            value: "best",
                            label: "Best Available Quality",
                          },
                          {
                            value: "1080",
                            label: "1080p Only",
                          },
                          {
                            value: "720",
                            label: "720p Only",
                          },
                          {
                            value: "480",
                            label: "480p Only",
                          },
                          {
                            value: "360",
                            label: "360p Only",
                          },
                        ]}
                      />
                    </div>

                    {/* Subtitle Selection for Batch */}
                    <CustomDropdown
                      label="Subtitle Language"
                      value={selectedSubLang}
                      onChange={(val) => setSelectedSubLang(val)}
                      options={[
                        {
                          value: "none",
                          label: "No Subtitles",
                        },
                        {
                          value: "all",
                          label: "All Languages (ZIP)",
                        },
                        {
                          value: "en",
                          label: "English",
                        },
                        {
                          value: "es",
                          label: "Spanish",
                        },
                        {
                          value: "fr",
                          label: "French",
                        },
                        {
                          value: "de",
                          label: "German",
                        },
                        {
                          value: "pt",
                          label: "Portuguese",
                        },
                        {
                          value: "ar",
                          label: "Arabic",
                        },
                        {
                          value: "hi",
                          label: "Hindi",
                        },
                        {
                          value: "ja",
                          label: "Japanese",
                        },
                        {
                          value: "ko",
                          label: "Korean",
                        },
                        {
                          value: "zh",
                          label: "Chinese",
                        },
                      ]}
                    />

                    {/* Episode Picker */}
                    {(() => {
                      const batchSeasonData = seasonsList.find(
                        (s) => s.se === batchSeason,
                      );
                      const maxEp = batchSeasonData?.maxEp || 0;
                      if (maxEp === 0) return null;
                      const allSelected = selectedEpisodes.size === maxEp;
                      return (
                        <div className="space-y-2">
                          {/* Header row: label + select all */}
                          <div className="flex items-center justify-between">
                            <label className="text-[10px] uppercase font-black tracking-wider text-foreground/45">
                              Select Episodes
                            </label>
                            <button
                              type="button"
                              onClick={() => {
                                if (allSelected) {
                                  setSelectedEpisodes(new Set());
                                } else {
                                  setSelectedEpisodes(
                                    new Set(
                                      Array.from(
                                        { length: maxEp },
                                        (_, i) => i + 1,
                                      ),
                                    ),
                                  );
                                }
                              }}
                              className="text-[10px] font-black uppercase tracking-wider text-primary hover:text-primary/80 transition-colors cursor-pointer"
                            >
                              {allSelected ? "Deselect All" : "Select All"}
                            </button>
                          </div>

                          {/* Range selector row */}
                          <RangePicker
                            maxEp={maxEp}
                            onApply={(from, to) => {
                              setSelectedEpisodes(
                                new Set(
                                  Array.from(
                                    { length: to - from + 1 },
                                    (_, i) => from + i,
                                  ),
                                ),
                              );
                            }}
                          />

                          {/* Episode grid */}
                          <div className="flex flex-wrap gap-1.5 max-h-[120px] overflow-y-auto no-scrollbar p-1">
                            {Array.from({ length: maxEp }, (_, i) => i + 1).map(
                              (ep) => {
                                const isSelected = selectedEpisodes.has(ep);
                                return (
                                  <button
                                    key={ep}
                                    type="button"
                                    onClick={() => {
                                      const next = new Set(selectedEpisodes);
                                      if (isSelected) next.delete(ep);
                                      else next.add(ep);
                                      setSelectedEpisodes(next);
                                    }}
                                    className={`w-9 h-9 rounded-lg text-xs font-black transition-all cursor-pointer border ${
                                      isSelected
                                        ? "bg-primary border-primary/50 text-white shadow-sm"
                                        : "bg-zinc-900 border-white/5 text-foreground/50 hover:border-white/20 hover:text-white"
                                    }`}
                                  >
                                    {ep}
                                  </button>
                                );
                              },
                            )}
                          </div>
                        </div>
                      );
                    })()}

                    <button
                      onClick={startBatchResolving}
                      disabled={selectedEpisodes.size === 0}
                      className="w-full flex items-center justify-center space-x-2 py-3 rounded-xl bg-primary hover:bg-primary/95 disabled:opacity-40 disabled:cursor-not-allowed text-white font-black text-xs uppercase tracking-wider shadow-lg shadow-primary-glow/10 hover:shadow-primary-glow/20 cursor-pointer transition-all"
                    >
                      <Sparkles className="w-4 h-4 fill-white animate-pulse" />
                      <span>
                        Generate Download Links ({selectedEpisodes.size}{" "}
                        Episodes)
                      </span>
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
                        style={{
                          width: `${(resolvingProgress / resolvingTotal) * 100}%`,
                        }}
                      />
                    </div>

                    <div className="flex items-center justify-center gap-2 text-xs text-foreground/60">
                      <Loader2 className="w-3.5 h-3.5 text-primary animate-spin" />
                      <span>
                        Fetching episode URLs. Do not close this modal.
                      </span>
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
                      <div className="bg-zinc-900/50 border border-white/5 p-3 rounded-2xl flex flex-col items-stretch">
                        <button
                          onClick={() => {
                            if (isBulkDownloading) return;
                            downloadAllInBrowser();
                          }}
                          disabled={isBulkDownloading}
                          className={`flex items-center justify-center space-x-1.5 py-3 px-4 rounded-xl font-bold text-xs uppercase tracking-wider transition-all w-full cursor-pointer ${
                            isBulkDownloading
                              ? "bg-amber-500/20 border border-amber-500/30 text-amber-400 cursor-not-allowed"
                              : isBulkCompleted
                                ? "bg-emerald-600 hover:bg-emerald-600/90 text-white"
                                : "bg-primary hover:bg-primary/95 text-white shadow-lg shadow-primary-glow/10 hover:shadow-primary-glow/20"
                          }`}
                        >
                          {isBulkDownloading ? (
                            <>
                              <Loader2 className="w-4 h-4 animate-spin text-amber-400" />
                              <span>
                                Downloading Season {batchSeason} ({bulkProgress}
                                %)
                              </span>
                            </>
                          ) : isBulkCompleted ? (
                            <>
                              <Check className="w-4 h-4 text-white" />
                              <span>Season Download Finished</span>
                            </>
                          ) : (
                            <>
                              <Download className="w-4 h-4" />
                              <span>Download Full Season {batchSeason}</span>
                            </>
                          )}
                        </button>
                      </div>
                    )}

                    {/* Resolved episodes list */}
                    <div className="flex-1 overflow-y-auto space-y-2 pr-1 no-scrollbar">
                      {resolvedEpisodes.map((ep, index) => {
                        const copyId = `batch-ep-${ep.epNum}`;
                        const activeTask = tasks.find((t) =>
                          t.id.startsWith(ep.url),
                        );
                        const isDownloading =
                          activeTask?.status === "downloading";
                        const isCompleted = activeTask?.status === "completed";

                        const isBulkEpDownloading =
                          isBulkDownloading && bulkTask?.currentIdx === index;
                        const isBulkEpCompleted =
                          isBulkCompleted ||
                          (isBulkDownloading &&
                            bulkTask &&
                            bulkTask.currentIdx !== undefined &&
                            bulkTask.currentIdx > index);

                        const isDownloadingOrBulkDownloading =
                          isDownloading || isBulkEpDownloading;
                        const isCompletedOrBulkCompleted =
                          isCompleted || isBulkEpCompleted;

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
                              <div
                                className={`w-8 h-8 rounded-lg flex items-center justify-center text-xs font-black ${
                                  ep.success
                                    ? "bg-emerald-500/10 text-emerald-500"
                                    : "bg-red-500/10 text-red-400"
                                }`}
                              >
                                E{ep.epNum}
                              </div>
                              <div className="space-y-0.5">
                                <p className="text-xs font-bold text-white leading-none">
                                  Episode {ep.epNum}
                                </p>
                                <p className="text-[9px] text-foreground/45 font-medium leading-none">
                                  {ep.success
                                    ? `${ep.resolution}p • ${formatBytes(ep.size)}`
                                    : ep.error}
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
                                <button
                                  onClick={() => {
                                    if (isDownloadingOrBulkDownloading) return;
                                    const shortName = cleanFilename(
                                      subject.title,
                                    );
                                    const filename = `${shortName}_S${batchSeason}E${ep.epNum}_${ep.resolution}p.mp4`;
                                    downloadStore.startDownload(
                                      ep.url,
                                      ep.referer ||
                                        "https://videodownloader.site/",
                                      filename,
                                      ep.size,
                                      getFilteredCaptions(ep.captions),
                                    );
                                  }}
                                  className={`p-1.5 rounded-lg border transition-all cursor-pointer ${
                                    isDownloadingOrBulkDownloading
                                      ? "bg-amber-500/10 border-amber-500/20 text-amber-400 cursor-not-allowed"
                                      : isCompletedOrBulkCompleted
                                        ? "bg-emerald-600 hover:bg-emerald-600/90 text-white border-emerald-500/20"
                                        : "bg-zinc-800/80 hover:bg-primary border-white/5 hover:border-primary/10 text-foreground/75 hover:text-white"
                                  }`}
                                  title={
                                    isDownloadingOrBulkDownloading
                                      ? "Downloading..."
                                      : isCompletedOrBulkCompleted
                                        ? "Finished"
                                        : "Download Episode"
                                  }
                                  disabled={isDownloadingOrBulkDownloading}
                                >
                                  {isDownloadingOrBulkDownloading ? (
                                    <Loader2 className="w-3 h-3 animate-spin text-amber-400" />
                                  ) : isCompletedOrBulkCompleted ? (
                                    <Check className="w-3 h-3 text-white" />
                                  ) : (
                                    <Download className="w-3 h-3" />
                                  )}
                                </button>
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
    </AnimatePresence>,
    document.body,
  );
}
