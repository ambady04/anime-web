"use client";

import { useState, useEffect, useRef } from "react";
import { useRouter } from "next/navigation";
import {
    Heart,
    Star,
    Calendar,
    Volume2,
    UserCheck,
    Play,
    ArrowLeft,
    Loader2,
    Tv,
    Film,
    Info,
    ChevronDown,
    ChevronUp,
    Bookmark,
    Check,
    RotateCcw,
} from "lucide-react";
import { ItemDetails, StreamData } from "@/lib/api";
import { localStore, HistoryItem } from "@/lib/storage";
import VideoPlayer from "@/components/video-player";
import MovieShelf from "@/components/movie-shelf";
import Link from "next/link";
import { syncSeasonWatchedEpisodes } from "@/lib/sync";
import { useAuth } from "@/lib/auth-context";

const cleanTitle = (title: string): string => {
    return title
        .replace(/\[[^\]]+\]/g, "")
        .replace(/\([^)]+\)/g, "")
        .replace(/\s+/g, " ")
        .trim();
};

interface WatchClientProps {
    path: string;
    details: ItemDetails;
    stream: StreamData;
    activeSeason: number;
    activeEpisode: number;
}

export default function WatchClient({
    path,
    details,
    stream,
    activeSeason,
    activeEpisode,
}: WatchClientProps) {
    const router = useRouter();
    const { user } = useAuth();
    const [isPageLoading, setIsPageLoading] = useState(false);
    const [loadingEpisode, setLoadingEpisode] = useState<number | null>(null);
    const [loadingAudio, setLoadingAudio] = useState<string | null>(null);
    const [showInfo, setShowInfo] = useState(false);

    const { subject, stars, resource, related, metadata } = details;

    useEffect(() => {
        setIsPageLoading(false);
        setLoadingEpisode(null);
        setLoadingAudio(null);
    }, [path, stream]);

    const [isInWatchlist, setIsInWatchlist] = useState(false);
    const [bookmarkedSeason, setBookmarkedSeason] = useState<
        number | undefined
    >(undefined);
    const [bookmarkedEpisode, setBookmarkedEpisode] = useState<
        number | undefined
    >(undefined);

    useEffect(() => {
        setIsInWatchlist(localStore.isInWatchlist(subject.detailPath));
        const item = localStore.getWatchlistItem(subject.detailPath);
        setBookmarkedSeason(item?.bookmarkedSeason);
        setBookmarkedEpisode(item?.bookmarkedEpisode);
    }, [subject.detailPath]);

    const handleWatchlistToggle = () => {
        const added = localStore.toggleWatchlist({
            detailPath: subject.detailPath,
            title: subject.title,
            coverUrl: subject.cover?.url || "",
            subjectType: subject.subjectType,
            imdbRatingValue: subject.imdbRatingValue,
            releaseDate: subject.releaseDate || "",
            corner: subject.corner || "",
        });
        setIsInWatchlist(added);
        if (!added) {
            // If removed from watchlist, clear the episode bookmark state too
            setBookmarkedSeason(undefined);
            setBookmarkedEpisode(undefined);
        }
    };

    const isSeries = subject.subjectType === 2 || subject.subjectType === 7;

    const isEpisodeBookmarked =
        bookmarkedSeason === activeSeason &&
        bookmarkedEpisode === activeEpisode;

    const handleEpisodeBookmarkToggle = () => {
        const item = {
            detailPath: subject.detailPath,
            title: subject.title,
            coverUrl: subject.cover?.url || "",
            subjectType: subject.subjectType,
            imdbRatingValue: subject.imdbRatingValue,
            releaseDate: subject.releaseDate || "",
            corner: subject.corner || "",
        };

        if (isEpisodeBookmarked) {
            localStore.updateEpisodeBookmark(item, undefined, undefined);
            setBookmarkedSeason(undefined);
            setBookmarkedEpisode(undefined);
        } else {
            localStore.updateEpisodeBookmark(item, activeSeason, activeEpisode);
            setBookmarkedSeason(activeSeason);
            setBookmarkedEpisode(activeEpisode);
            setIsInWatchlist(true);
        }
    };

    // Auto-redirect to bookmarked episode if no query params are explicitly set
    useEffect(() => {
        if (typeof window !== "undefined") {
            const hasParams =
                window.location.search.includes("season=") ||
                window.location.search.includes("episode=");
            if (isSeries && !hasParams) {
                const item = localStore.getWatchlistItem(subject.detailPath);
                if (item?.bookmarkedSeason && item?.bookmarkedEpisode) {
                    router.replace(
                        `/watch/${path}?season=${item.bookmarkedSeason}&episode=${item.bookmarkedEpisode}`,
                    );
                }
            }
        }
    }, [isSeries, subject.detailPath, path, router]);

    const [selectedSeason, setSelectedSeason] = useState(activeSeason || 1);
    const currentSeasonData = resource?.seasons?.find(
        (s) => s.se === selectedSeason,
    );
    const totalEpisodes = currentSeasonData?.maxEp || 0;

    const [fillerEpisodes, setFillerEpisodes] = useState<Set<number>>(
        new Set(),
    );

    useEffect(() => {
        if (!isSeries || !subject.title) return;

        let isMounted = true;
        const cacheKey = `fillers-${subject.detailPath}-${selectedSeason}`;

        const cached = localStorage.getItem(cacheKey);
        if (cached) {
            try {
                const parsed = JSON.parse(cached) as number[];
                setFillerEpisodes(new Set(parsed));
                return;
            } catch (e) {
                console.error("Error parsing cached fillers:", e);
            }
        }

        const fetchFillers = async () => {
            try {
                const query = cleanTitle(subject.title);
                const searchRes = await fetch(
                    `https://api.jikan.moe/v4/anime?q=${encodeURIComponent(query)}&limit=1`,
                );
                if (!searchRes.ok) return;
                const searchJson = await searchRes.json();
                if (!searchJson.data || searchJson.data.length === 0) return;

                const malId = searchJson.data[0].mal_id;

                let currentPage = 1;
                let hasNextPage = true;
                const fillerEpNumbers: number[] = [];

                while (hasNextPage && currentPage <= 3) {
                    const epRes = await fetch(
                        `https://api.jikan.moe/v4/anime/${malId}/episodes?page=${currentPage}`,
                    );
                    if (!epRes.ok) break;
                    const epJson = await epRes.json();

                    if (epJson.data && Array.isArray(epJson.data)) {
                        epJson.data.forEach((ep: any) => {
                            if (ep.filler === true) {
                                fillerEpNumbers.push(ep.mal_id);
                            }
                        });
                    }

                    hasNextPage = epJson.pagination?.has_next_page || false;
                    if (hasNextPage) {
                        currentPage++;
                        await new Promise((resolve) =>
                            setTimeout(resolve, 350),
                        );
                    }
                }

                if (isMounted) {
                    setFillerEpisodes(new Set(fillerEpNumbers));
                    localStorage.setItem(
                        cacheKey,
                        JSON.stringify(fillerEpNumbers),
                    );
                }
            } catch (e) {
                console.error("Error fetching filler episodes:", e);
            }
        };

        fetchFillers();

        return () => {
            isMounted = false;
        };
    }, [isSeries, subject.title, subject.detailPath, selectedSeason]);

    const handleEpisodeClick = (epNum: number) => {
        // Mark the currently-playing episode as watched before switching
        if (activeEpisode && activeEpisode !== epNum) {
            localStore.markEpisodeWatched(
                subject.detailPath,
                selectedSeason,
                activeEpisode,
            );
            // Update UI immediately
            setWatchedEpisodes(
                localStore.getWatchedEpisodes(
                    subject.detailPath,
                    selectedSeason,
                ),
            );
        }
        setLoadingEpisode(epNum);
        setIsPageLoading(true);
        router.push(`/watch/${path}?season=${selectedSeason}&episode=${epNum}`);
    };

    const handleNextEpisode = () => {
        if (isSeries && activeEpisode < totalEpisodes) {
            // Mark current episode as watched before moving to next
            localStore.markEpisodeWatched(
                subject.detailPath,
                selectedSeason,
                activeEpisode,
            );
            setWatchedEpisodes(
                localStore.getWatchedEpisodes(
                    subject.detailPath,
                    selectedSeason,
                ),
            );
            handleEpisodeClick(activeEpisode + 1);
        }
    };

    const handlePrevEpisode = () => {
        if (isSeries && activeEpisode > 1) {
            handleEpisodeClick(activeEpisode - 1);
        }
    };

    const handleAudioClick = (detailPath: string) => {
        setLoadingAudio(detailPath);
        setIsPageLoading(true);
        router.push(
            `/watch/${detailPath}${isSeries ? `?season=${selectedSeason}&episode=${activeEpisode}` : ""}`,
        );
    };

    const hasDubs = subject.dubs && subject.dubs.length > 0;

    // Track which episodes have been watched (loaded from localStorage per season)
    const [watchedEpisodes, setWatchedEpisodes] = useState<Set<number>>(
        new Set(),
    );
    const [watchHistory, setWatchHistory] = useState<HistoryItem[]>([]);

    useEffect(() => {
        // Load local state synchronously first for instant UI response
        setWatchedEpisodes(
            localStore.getWatchedEpisodes(subject.detailPath, selectedSeason),
        );
        setWatchHistory(localStore.getHistory());

        // Bidirectional sync with cloud database in the background if logged in
        if (user) {
            syncSeasonWatchedEpisodes(
                user.uid,
                subject.detailPath,
                selectedSeason,
            )
                .then((syncedEps) => {
                    setWatchedEpisodes(syncedEps);
                })
                .catch((err) => {
                    console.error(
                        "[sync] Background episode sync failed:",
                        err,
                    );
                });
        }
    }, [subject.detailPath, selectedSeason, activeEpisode, user]);

    const handleEpisodeContextMenu = (e: React.MouseEvent, epNum: number) => {
        e.preventDefault();
        const isEpWatched = watchedEpisodes.has(epNum);
        if (isEpWatched) {
            localStore.markEpisodeUnwatched(
                subject.detailPath,
                selectedSeason,
                epNum,
            );
            // Clear progress from history too
            const currentHistory = localStore.getHistory();
            const updatedHistory = currentHistory.filter(
                (h) =>
                    !(
                        h.detailPath === subject.detailPath &&
                        h.season === selectedSeason &&
                        h.episode === epNum
                    ),
            );
            localStorage.setItem(
                "kixo_history",
                JSON.stringify(updatedHistory),
            );
        } else {
            localStore.markEpisodeWatched(
                subject.detailPath,
                selectedSeason,
                epNum,
            );
        }
        // Sync states to update UI instantly
        setWatchedEpisodes(
            localStore.getWatchedEpisodes(subject.detailPath, selectedSeason),
        );
        setWatchHistory(localStore.getHistory());
    };

    const toggleActiveEpisodeWatched = () => {
        const isEpWatched = watchedEpisodes.has(activeEpisode);
        if (isEpWatched) {
            localStore.markEpisodeUnwatched(
                subject.detailPath,
                activeSeason,
                activeEpisode,
            );

            // Clear progress from history too
            const currentHistory = localStore.getHistory();
            const updatedHistory = currentHistory.filter(
                (h) =>
                    !(
                        h.detailPath === subject.detailPath &&
                        h.season === activeSeason &&
                        h.episode === activeEpisode
                    ),
            );
            localStorage.setItem(
                "kixo_history",
                JSON.stringify(updatedHistory),
            );
        } else {
            localStore.markEpisodeWatched(
                subject.detailPath,
                activeSeason,
                activeEpisode,
            );
        }
        // Sync states to update UI instantly
        setWatchedEpisodes(
            localStore.getWatchedEpisodes(subject.detailPath, selectedSeason),
        );
        setWatchHistory(localStore.getHistory());
    };

    const handleMarkSeasonWatched = () => {
        if (
            window.confirm(
                `Mark all ${totalEpisodes} episodes of Season ${selectedSeason} as watched?`,
            )
        ) {
            localStore.markSeasonWatched(
                subject.detailPath,
                selectedSeason,
                totalEpisodes,
            );
            setWatchedEpisodes(
                localStore.getWatchedEpisodes(
                    subject.detailPath,
                    selectedSeason,
                ),
            );
        }
    };

    const handleClearSeasonWatched = () => {
        if (
            window.confirm(
                `Reset watched progress for all episodes in Season ${selectedSeason}?`,
            )
        ) {
            localStore.clearSeasonWatched(subject.detailPath, selectedSeason);
            // Clear history items of this season to remove progress bars
            const currentHistory = localStore.getHistory();
            const updatedHistory = currentHistory.filter(
                (h) =>
                    !(
                        h.detailPath === subject.detailPath &&
                        h.season === selectedSeason
                    ),
            );
            localStorage.setItem(
                "kixo_history",
                JSON.stringify(updatedHistory),
            );

            setWatchedEpisodes(new Set());
            setWatchHistory(localStore.getHistory());
        }
    };

    // Ref for the currently active episode button — used to auto-scroll it into view
    const activeEpRef = useRef<HTMLButtonElement | null>(null);
    useEffect(() => {
        if (activeEpRef.current) {
            activeEpRef.current.scrollIntoView({
                block: "nearest",
                behavior: "smooth",
            });
        }
    }, [activeSeason, activeEpisode, selectedSeason]);

    return (
        <div className="max-w-screen-2xl mx-auto px-3 sm:px-6 lg:px-8 py-4 animate-fade-in relative z-20">
            {/* Back button */}
            <button
                onClick={() => router.back()}
                className="flex items-center space-x-2 text-foreground/50 hover:text-primary transition-colors mb-4 text-xs font-black uppercase tracking-wider group focus:outline-none cursor-pointer"
            >
                <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                <span>Back to Catalog</span>
            </button>

            {/* ── Main two-column layout ── */}
            <div className="flex flex-col xl:flex-row gap-5">
                {/* ══ LEFT — Video Player + Info ══ */}
                <div className="flex-1 min-w-0 space-y-4">
                    {/* Video Player */}
                    <div className="w-full aspect-video rounded-2xl overflow-hidden shadow-card border border-glass-border relative bg-black">
                        <VideoPlayer
                            streamData={stream}
                            detailPath={path}
                            seriesDetailPath={subject.detailPath}
                            title={subject.title}
                            coverUrl={subject.cover?.url || ""}
                            isSeries={isSeries}
                            season={isSeries ? activeSeason : undefined}
                            episode={isSeries ? activeEpisode : undefined}
                            dubs={subject.dubs}
                            onNextEpisode={
                                activeEpisode < totalEpisodes
                                    ? handleNextEpisode
                                    : undefined
                            }
                            onPrevEpisode={
                                activeEpisode > 1
                                    ? handlePrevEpisode
                                    : undefined
                            }
                            shouldPause={
                                loadingEpisode !== null ||
                                loadingAudio !== null ||
                                isPageLoading
                            }
                        />
                        {(isPageLoading ||
                            loadingEpisode !== null ||
                            loadingAudio !== null) && (
                            <div className="absolute inset-0 bg-black/80 backdrop-blur-md flex flex-col items-center justify-center z-40 animate-fade-in">
                                {/* Animated loading ring */}
                                <div className="relative w-16 h-16 mb-4">
                                    <div className="absolute inset-0 rounded-full border-2 border-primary/20" />
                                    <div className="absolute inset-0 rounded-full border-2 border-transparent border-t-primary animate-spin" />
                                    <div
                                        className="absolute inset-2 rounded-full border-2 border-transparent border-b-primary/60 animate-spin"
                                        style={{
                                            animationDirection: "reverse",
                                            animationDuration: "1.5s",
                                        }}
                                    />
                                </div>
                                <p className="text-xs text-white font-bold uppercase tracking-widest">
                                    Switching Stream...
                                </p>
                                <p className="text-[10px] text-white/40 mt-1 font-medium">
                                    Resolving new CDN mirrors
                                </p>
                            </div>
                        )}
                    </div>

                    {/* Title bar + quick actions */}
                    <div className="p-4 sm:p-5 rounded-2xl glass-panel border border-glass-border shadow-card">
                        <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0">
                                {isSeries && (
                                    <span className="inline-flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-primary bg-primary/10 border border-primary/20 px-2.5 py-1 rounded-full mb-2">
                                        <Tv className="w-3 h-3" />
                                        TV Series • S{activeSeason} E
                                        {activeEpisode}
                                    </span>
                                )}
                                {!isSeries && (
                                    <span className="inline-flex items-center gap-1.5 text-[9px] font-black uppercase tracking-widest text-primary bg-primary/10 border border-primary/20 px-2.5 py-1 rounded-full mb-2">
                                        <Film className="w-3 h-3" />
                                        Feature Film
                                    </span>
                                )}
                                <h1 className="text-lg sm:text-xl md:text-2xl font-black text-foreground tracking-tight leading-snug line-clamp-2">
                                    {subject.title}
                                </h1>
                            </div>

                            {/* Info toggle on mobile */}
                            <button
                                onClick={() => setShowInfo((v) => !v)}
                                className="xl:hidden shrink-0 p-2 rounded-xl bg-glass-card border border-glass-border text-foreground/60 hover:text-primary transition-colors"
                            >
                                <Info className="w-4 h-4" />
                            </button>
                        </div>

                        {/* Badges row */}
                        <div className="flex flex-wrap items-center gap-2 mt-3 text-xs font-bold">
                            {subject.imdbRatingValue && (
                                <div className="flex items-center space-x-1.5 bg-yellow-500/10 border border-yellow-500/20 px-2.5 py-1.5 rounded-xl text-yellow-500">
                                    <Star className="w-3 h-3 fill-yellow-500" />
                                    <span>
                                        {subject.imdbRatingValue.toFixed(1)}{" "}
                                        IMDB
                                    </span>
                                </div>
                            )}
                            {subject.releaseDate && (
                                <div className="flex items-center space-x-1.5 bg-glass-card border border-glass-border px-2.5 py-1.5 rounded-xl text-foreground/70">
                                    <Calendar className="w-3 h-3 text-primary" />
                                    <span>
                                        {subject.releaseDate.split("-")[0]}
                                    </span>
                                </div>
                            )}
                            <button
                                onClick={handleWatchlistToggle}
                                className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl border transition-all cursor-pointer text-xs font-bold uppercase tracking-wider ${
                                    isInWatchlist
                                        ? "bg-primary border-primary/20 text-white shadow-lg shadow-primary-glow"
                                        : "bg-glass-card hover:bg-glass-panel border-glass-border text-foreground/70"
                                }`}
                            >
                                <Heart
                                    className={`w-3 h-3 ${isInWatchlist ? "fill-white" : ""}`}
                                />
                                <span>
                                    {isInWatchlist ? "Saved" : "Bookmark"}
                                </span>
                            </button>
                            {isSeries && (
                                <button
                                    onClick={handleEpisodeBookmarkToggle}
                                    className={`flex items-center space-x-1.5 px-3 py-1.5 rounded-xl border transition-all cursor-pointer text-xs font-bold uppercase tracking-wider ${
                                        isEpisodeBookmarked
                                            ? "bg-emerald-500 border-emerald-500/20 text-white shadow-lg shadow-emerald-500/20 animate-fade-in"
                                            : "bg-glass-card hover:bg-glass-panel border-glass-border text-foreground/70"
                                    }`}
                                    title={`Bookmark Season ${activeSeason} Episode ${activeEpisode}`}
                                >
                                    <Bookmark
                                        className={`w-3 h-3 ${isEpisodeBookmarked ? "fill-white" : ""}`}
                                    />
                                    <span>
                                        {isEpisodeBookmarked
                                            ? `Bookmarked S${activeSeason} E${activeEpisode}`
                                            : `Bookmark S${activeSeason} E${activeEpisode}`}
                                    </span>
                                </button>
                            )}
                        </div>

                        {/* Genres */}
                        {subject.genre && subject.genre.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-glass-border">
                                {subject.genre.map((gen, idx) => (
                                    <span
                                        key={idx}
                                        className="text-[9px] font-black uppercase tracking-wider bg-glass-card text-foreground/60 border border-glass-border px-2.5 py-1 rounded-full"
                                    >
                                        {gen}
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Collapsible Details (always visible on xl, toggled on mobile) */}
                    <div
                        className={`xl:block space-y-4 ${showInfo ? "block" : "hidden"}`}
                    >
                        {/* Synopsis */}
                        <div className="p-4 sm:p-5 rounded-2xl glass-panel border border-glass-border shadow-card space-y-2">
                            <h3 className="font-black text-foreground text-xs uppercase tracking-wider">
                                Synopsis
                            </h3>
                            <p className="text-foreground/65 text-xs sm:text-sm leading-relaxed">
                                {metadata?.description ||
                                    subject.description ||
                                    "No description available."}
                            </p>
                        </div>

                        {/* Cast */}
                        {stars && stars.length > 0 && (
                            <div className="p-4 sm:p-5 rounded-2xl glass-panel border border-glass-border shadow-card space-y-3">
                                <h3 className="font-black text-foreground text-xs uppercase tracking-wider flex items-center space-x-2">
                                    <UserCheck className="w-4 h-4 text-primary" />
                                    <span>Cast & Staff</span>
                                </h3>
                                <div className="grid grid-cols-3 sm:grid-cols-5 lg:grid-cols-6 xl:grid-cols-4 gap-2.5">
                                    {stars.slice(0, 8).map((star, idx) => (
                                        <div
                                            key={`${star.staffId}-${idx}`}
                                            className="p-2.5 bg-glass-card border border-glass-border rounded-xl flex flex-col items-center text-center gap-1.5"
                                        >
                                            {star.avatarUrl ? (
                                                // eslint-disable-next-line @next/next/no-img-element
                                                <img
                                                    src={star.avatarUrl}
                                                    alt={star.name}
                                                    className="w-10 h-10 rounded-full object-cover border border-glass-border"
                                                    loading="lazy"
                                                />
                                            ) : (
                                                <div className="w-10 h-10 rounded-full bg-foreground/10 flex items-center justify-center text-[10px] font-black text-foreground/50">
                                                    {star.name
                                                        .slice(0, 2)
                                                        .toUpperCase()}
                                                </div>
                                            )}
                                            <span className="text-[10px] font-bold text-foreground line-clamp-1 w-full">
                                                {star.name}
                                            </span>
                                            <span className="text-[9px] text-foreground/40 uppercase font-bold tracking-wide line-clamp-1 w-full">
                                                {star.character ||
                                                    (star.staffType === 2
                                                        ? "Director"
                                                        : "Cast")}
                                            </span>
                                        </div>
                                    ))}
                                </div>
                            </div>
                        )}
                    </div>
                </div>

                {/* ══ RIGHT SIDEBAR — Episodes + Audio ══ */}
                <div className="w-full xl:w-[340px] shrink-0 space-y-4 xl:sticky xl:top-20 xl:self-start xl:max-h-[calc(100vh-5rem)] xl:overflow-y-auto no-scrollbar">
                    {/* Episodes Panel (series only) */}
                    {isSeries &&
                        totalEpisodes > 0 &&
                        (() => {
                            const watchedCount = watchedEpisodes.size;
                            const seasonProgressPercent = Math.round(
                                (watchedCount / totalEpisodes) * 100,
                            );
                            return (
                                <div className="p-4 rounded-2xl glass-panel border border-glass-border shadow-card space-y-4">
                                    <div className="flex items-center justify-between">
                                        <h2 className="font-black text-foreground text-xs uppercase tracking-wider flex items-center space-x-2">
                                            <Play className="w-3.5 h-3.5 text-primary fill-primary animate-pulse" />
                                            <span>Episode Guide</span>
                                        </h2>
                                        {resource?.seasons &&
                                            resource.seasons.length > 1 && (
                                                <select
                                                    value={selectedSeason}
                                                    onChange={(e) =>
                                                        setSelectedSeason(
                                                            Number(
                                                                e.target.value,
                                                            ),
                                                        )
                                                    }
                                                    className="text-[10px] font-black bg-glass-card hover:bg-glass-panel border border-glass-border rounded-xl px-2.5 py-1.5 text-foreground focus:outline-none cursor-pointer uppercase tracking-wider transition-all"
                                                >
                                                    {resource.seasons.map(
                                                        (se) => (
                                                            <option
                                                                key={se.se}
                                                                value={se.se}
                                                                className="bg-background text-foreground"
                                                            >
                                                                Season {se.se}
                                                            </option>
                                                        ),
                                                    )}
                                                </select>
                                            )}
                                    </div>

                                    {/* Season Progress Bar */}
                                    <div className="space-y-1.5">
                                        <div className="flex items-center justify-between text-[9px] font-bold tracking-wider text-foreground/50 uppercase">
                                            <span>Season Progress</span>
                                            <span className="text-emerald-400 font-extrabold">
                                                {watchedCount} / {totalEpisodes}{" "}
                                                Watched ({seasonProgressPercent}
                                                %)
                                            </span>
                                        </div>
                                        <div className="w-full h-1.5 bg-foreground/5 rounded-full overflow-hidden border border-glass-border">
                                            <div
                                                className="h-full bg-linear-to-r from-emerald-500 to-emerald-400 rounded-full transition-all duration-500"
                                                style={{
                                                    width: `${seasonProgressPercent}%`,
                                                }}
                                            />
                                        </div>
                                    </div>

                                    {/* Action Buttons */}
                                    <div className="flex items-center gap-2 text-[9px] font-black uppercase tracking-wider text-foreground/50 border-t border-glass-border/40 pt-3">
                                        <button
                                            onClick={toggleActiveEpisodeWatched}
                                            className={`flex-1 border py-2 px-2.5 rounded-xl transition-all duration-300 flex items-center justify-center space-x-1 cursor-pointer font-black ${
                                                watchedEpisodes.has(
                                                    activeEpisode,
                                                )
                                                    ? "bg-emerald-500/10 border-emerald-500/25 text-emerald-600 hover:bg-emerald-500/20 hover:border-emerald-500/40"
                                                    : "bg-glass-card border-glass-border text-foreground/60 hover:bg-glass-panel hover:text-foreground"
                                            }`}
                                        >
                                            <Check className="w-2.5 h-2.5" />
                                            <span>
                                                {watchedEpisodes.has(
                                                    activeEpisode,
                                                )
                                                    ? "Unmark Episode"
                                                    : "Mark Episode Watched"}
                                            </span>
                                        </button>
                                        <button
                                            onClick={handleClearSeasonWatched}
                                            className="flex-1 bg-glass-card border border-glass-border text-foreground/60 hover:bg-red-500/10 hover:border-red-500/20 hover:text-red-500 py-2 px-2.5 rounded-xl transition-all duration-300 flex items-center justify-center space-x-1 cursor-pointer font-black"
                                        >
                                            <RotateCcw className="w-2.5 h-2.5" />
                                            <span>Clear Progress</span>
                                        </button>
                                    </div>

                                    {/* Show a hint when browsing a different season than what's currently playing */}
                                    {selectedSeason !== activeSeason && (
                                        <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-primary/8 border border-primary/20 text-primary text-[10px] font-bold">
                                            <Play className="w-3 h-3 fill-primary shrink-0" />
                                            <span>
                                                Now playing: S{activeSeason} E
                                                {activeEpisode} — click below to
                                                switch
                                            </span>
                                        </div>
                                    )}

                                    <div className="grid grid-cols-5 sm:grid-cols-8 xl:grid-cols-5 gap-2 max-h-64 xl:max-h-[380px] overflow-y-auto pr-0.5 no-scrollbar">
                                        {Array.from({
                                            length: totalEpisodes,
                                        }).map((_, idx) => {
                                            const epNum = idx + 1;
                                            const isActive =
                                                epNum === activeEpisode &&
                                                selectedSeason === activeSeason;
                                            const isWatched =
                                                watchedEpisodes.has(epNum);
                                            const isFiller =
                                                fillerEpisodes.has(epNum);

                                            const epHistory = watchHistory.find(
                                                (h) =>
                                                    h.detailPath ===
                                                        subject.detailPath &&
                                                    h.season ===
                                                        selectedSeason &&
                                                    h.episode === epNum,
                                            );
                                            const hasProgress =
                                                !isActive &&
                                                epHistory &&
                                                epHistory.progress > 5 &&
                                                epHistory.progress < 90;
                                            const progressPercent = epHistory
                                                ? epHistory.progress
                                                : 0;

                                            return (
                                                <button
                                                    key={epNum}
                                                    ref={
                                                        isActive
                                                            ? activeEpRef
                                                            : null
                                                    }
                                                    onClick={() =>
                                                        handleEpisodeClick(
                                                            epNum,
                                                        )
                                                    }
                                                    onContextMenu={(e) =>
                                                        handleEpisodeContextMenu(
                                                            e,
                                                            epNum,
                                                        )
                                                    }
                                                    disabled={
                                                        loadingEpisode === epNum
                                                    }
                                                    className={`relative py-3 rounded-xl text-xs font-black border transition-all duration-300 cursor-pointer overflow-hidden flex items-center justify-center ${
                                                        loadingEpisode === epNum
                                                            ? "bg-primary/50 text-white border-primary/30 animate-pulse scale-105"
                                                            : isActive
                                                              ? "bg-linear-to-br from-primary to-primary/80 text-white border-primary/20 shadow-md shadow-primary-glow/10 scale-105 font-bold"
                                                              : isWatched
                                                                ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/25 hover:bg-emerald-500/20 hover:text-emerald-700 hover:border-emerald-500/40"
                                                                : isFiller
                                                                  ? "bg-blue-500/10 text-blue-600 border-blue-500/25 hover:bg-blue-500/20 hover:text-blue-700 hover:border-blue-500/40"
                                                                  : "bg-glass-card border-glass-border text-foreground/60 hover:bg-glass-panel hover:text-foreground hover:border-glass-border-hover"
                                                    }`}
                                                >
                                                    {loadingEpisode ===
                                                    epNum ? (
                                                        <Loader2 className="w-3.5 h-3.5 animate-spin mx-auto text-white" />
                                                    ) : (
                                                        epNum
                                                    )}

                                                    {/* Small check indicator for watched episodes (only when not active) */}
                                                    {isWatched &&
                                                        !isActive &&
                                                        loadingEpisode !==
                                                            epNum && (
                                                            <span className="absolute top-1 right-1 text-[8px] text-emerald-400 font-extrabold leading-none">
                                                                ✓
                                                            </span>
                                                        )}

                                                    {/* Small dot indicator for filler episodes (only if not watched) */}
                                                    {!isWatched &&
                                                        isFiller &&
                                                        loadingEpisode !==
                                                            epNum && (
                                                            <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-blue-400 z-10" />
                                                        )}

                                                    {/* Partial progress bar */}
                                                    {hasProgress && (
                                                        <div className="absolute bottom-0 left-0 right-0 h-[2px] bg-foreground/10 overflow-hidden">
                                                            <div
                                                                className="h-full bg-linear-to-r from-blue-500 to-sky-400"
                                                                style={{
                                                                    width: `${progressPercent}%`,
                                                                }}
                                                            />
                                                        </div>
                                                    )}
                                                </button>
                                            );
                                        })}
                                    </div>
                                    <p className="text-[8px] text-foreground/30 font-medium text-center leading-tight mt-1 pt-1.5 border-t border-white/5">
                                        Tip: Right-click (or long-press) any
                                        episode to toggle watched status
                                        manually
                                    </p>
                                </div>
                            );
                        })()}

                    {/* Audio Tracks Panel */}
                    {hasDubs && (
                        <div className="p-4 rounded-2xl glass-panel border border-glass-border shadow-card space-y-3">
                            <h3 className="font-black text-foreground text-xs uppercase tracking-wider flex items-center space-x-2">
                                <Volume2 className="w-3.5 h-3.5 text-primary" />
                                <span>Available Audio Tracks</span>
                            </h3>
                            <div className="flex flex-col gap-1.5">
                                {subject.dubs!.map((dub, idx) => {
                                    const isCurrent =
                                        decodeURIComponent(path) ===
                                        decodeURIComponent(dub.detailPath);
                                    const isLoadingThis =
                                        loadingAudio === dub.detailPath;
                                    return (
                                        <button
                                            key={idx}
                                            onClick={() =>
                                                handleAudioClick(dub.detailPath)
                                            }
                                            disabled={isLoadingThis}
                                            className={`w-full flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold border transition-all duration-200 cursor-pointer ${
                                                isLoadingThis
                                                    ? "bg-primary/50 text-white border-primary/30 animate-pulse"
                                                    : isCurrent
                                                      ? "bg-primary text-white border-primary/20 shadow-lg shadow-primary-glow"
                                                      : "bg-glass-card hover:bg-glass-panel border-glass-border text-foreground/70 hover:text-foreground"
                                            }`}
                                        >
                                            <span className="flex items-center gap-2">
                                                {isLoadingThis ? (
                                                    <Loader2 className="w-3 h-3 animate-spin" />
                                                ) : (
                                                    <Volume2
                                                        className={`w-3 h-3 ${isCurrent ? "opacity-100" : "opacity-40"}`}
                                                    />
                                                )}
                                                {dub.lanName}
                                            </span>
                                            {dub.original && (
                                                <span
                                                    className={`text-[9px] uppercase tracking-widest font-black px-1.5 py-0.5 rounded-md ${isCurrent || isLoadingThis ? "bg-white/20" : "bg-primary/10 text-primary"}`}
                                                >
                                                    Original
                                                </span>
                                            )}
                                            {isCurrent && !isLoadingThis && (
                                                <span className="text-[9px] uppercase tracking-widest font-black px-1.5 py-0.5 rounded-md bg-white/20">
                                                    Playing
                                                </span>
                                            )}
                                            {isLoadingThis && (
                                                <span className="text-[9px] uppercase tracking-widest font-black px-1.5 py-0.5 rounded-md bg-white/20">
                                                    Loading
                                                </span>
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Movie badge (no episodes, no dubs) */}
                    {!isSeries && !hasDubs && (
                        <div className="p-5 rounded-2xl glass-panel border border-glass-border shadow-card text-center space-y-2">
                            <Film className="w-8 h-8 text-primary/40 mx-auto" />
                            <span className="inline-flex bg-primary/10 border border-primary/20 text-primary px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider">
                                Feature Film
                            </span>
                            <p className="text-xs text-foreground/45 font-medium">
                                Standalone film — no episodes or alternate audio
                                tracks available.
                            </p>
                        </div>
                    )}
                </div>
            </div>

            {/* Related Content */}
            {related && related.length > 0 && (
                <div className="mt-12 border-t border-glass-border pt-8">
                    <MovieShelf title="You May Also Like" subjects={related} />
                </div>
            )}
        </div>
    );
}
