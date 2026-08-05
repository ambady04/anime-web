"use client";

import { useState, useEffect, useRef, useMemo, useCallback } from "react";
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
    AlertTriangle,
} from "lucide-react";
import { movieApi, ItemDetails, StreamData, DubModel, isSeriesType, parseResolution } from "@/lib/api";
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

const cleanFilename = (title: string): string => {
    return title
        .replace(/[^a-zA-Z0-9.\-\s_]/g, "")
        .replace(/\s+/g, "_")
        .trim();
};

function formatBytes(bytes: number): string {
    if (!bytes || bytes === 0) return "Unknown Size";
    const k = 1024;
    const sizes = ["Bytes", "KB", "MB", "GB", "TB"];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
}

interface WatchClientProps {
    path: string;
    initialDetails?: ItemDetails | null;
    initialStream?: StreamData | null;
    initialSeason?: number;
    initialEpisode?: number;
}

export default function WatchClient({
    path,
    initialDetails,
    initialStream,
    initialSeason = 0,
    initialEpisode = 0,
}: WatchClientProps) {
    const router = useRouter();
    const { user } = useAuth();
    const [details, setDetails] = useState<ItemDetails | null>(initialDetails || null);
    const [stream, setStream] = useState<StreamData | null>(initialStream || null);
    const [activeSeason, setActiveSeason] = useState<number>(initialSeason);
    const [activeEpisode, setActiveEpisode] = useState<number>(initialEpisode);
    const [isLoadingData, setIsLoadingData] = useState<boolean>(!initialDetails);
    const [fetchError, setFetchError] = useState<string>("");

    const [isPageLoading, setIsPageLoading] = useState(false);
    const [loadingEpisode, setLoadingEpisode] = useState<number | null>(null);
    const [loadingAudio, setLoadingAudio] = useState<string | null>(null);
    const [showInfo, setShowInfo] = useState(false);
    const [showSeasonDropdown, setShowSeasonDropdown] = useState(false);

    useEffect(() => {
        let isMounted = true;
        async function loadClientMediaData() {
            if (details && stream) {
                setIsLoadingData(false);
                return;
            }
            try {
                if (!details) {
                    setIsLoadingData(true);
                }
                setFetchError("");

                let d = details;
                if (!d) {
                    d = await movieApi.getDetails(path);
                    if (!isMounted) return;
                    setDetails(d);
                    setIsLoadingData(false);
                }

                const isSeries = isSeriesType(d?.subject?.subjectType);
                const sNum = activeSeason || initialSeason || (isSeries ? 1 : 0);
                const eNum = activeEpisode || initialEpisode || (isSeries ? 1 : 0);
                if (isMounted) {
                    setActiveSeason(sNum);
                    setActiveEpisode(eNum);
                }

                let s = stream;
                if (!s) {
                    s = await movieApi.getStream(path, sNum, eNum);
                    if (!isMounted) return;
                    setStream(s);
                }
            } catch (err: any) {
                if (isMounted) {
                    setFetchError(err?.message || "Failed to retrieve media playback link.");
                }
            } finally {
                if (isMounted) setIsLoadingData(false);
            }
        }
        loadClientMediaData();
        return () => {
            isMounted = false;
        };
    }, [path]);

    useEffect(() => {
        if (!showSeasonDropdown) return;
        const handleOutsideClick = (event: MouseEvent) => {
            const container = document.getElementById(
                "season-selector-container",
            );
            if (container && !container.contains(event.target as Node)) {
                setShowSeasonDropdown(false);
            }
        };
        document.addEventListener("click", handleOutsideClick);
        return () => {
            document.removeEventListener("click", handleOutsideClick);
        };
    }, [showSeasonDropdown]);

    useEffect(() => {
        setIsPageLoading(false);
        setLoadingEpisode(null);
        setLoadingAudio(null);
    }, [path, stream]);

    const subject = details?.subject;
    const stars = details?.stars || [];
    const resource = details?.resource;
    const related = details?.related || [];
    const metadata = details?.metadata;

    const [isInWatchlist, setIsInWatchlist] = useState(false);
    const [bookmarkedSeason, setBookmarkedSeason] = useState<
        number | undefined
    >(undefined);
    const [bookmarkedEpisode, setBookmarkedEpisode] = useState<
        number | undefined
    >(undefined);

    useEffect(() => {
        if (!subject?.detailPath) return;
        setIsInWatchlist(localStore.isInWatchlist(subject.detailPath));
        const item = localStore.getWatchlistItem(subject.detailPath);
        setBookmarkedSeason(item?.bookmarkedSeason);
        setBookmarkedEpisode(item?.bookmarkedEpisode);
    }, [subject?.detailPath]);

    const handleWatchlistToggle = () => {
        if (!subject) return;
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
            setBookmarkedSeason(undefined);
            setBookmarkedEpisode(undefined);
        }
    };

    const isSeries = isSeriesType(subject?.subjectType);

    const isEpisodeBookmarked =
        bookmarkedSeason === activeSeason &&
        bookmarkedEpisode === activeEpisode;

    const handleEpisodeBookmarkToggle = () => {
        if (!subject) return;
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

    useEffect(() => {
        if (typeof window !== "undefined" && subject?.detailPath) {
            const hasParams =
                window.location.search.includes("season=") ||
                window.location.search.includes("episode=");
            if (isSeries && !hasParams) {
                const item = localStore.getWatchlistItem(subject.detailPath);
                if (item?.bookmarkedSeason && item?.bookmarkedEpisode) {
                    window.location.replace(
                        `/watch/${path}?season=${item.bookmarkedSeason}&episode=${item.bookmarkedEpisode}`,
                    );
                }
            }
        }
    }, [isSeries, subject?.detailPath, path]);

    const [selectedSeason, setSelectedSeason] = useState(activeSeason || 1);

    const [watchedEpisodes, setWatchedEpisodes] = useState<Set<number>>(new Set());
    const [watchHistory, setWatchHistory] = useState<HistoryItem[]>([]);

    useEffect(() => {
        if (!subject?.detailPath) return;
        setWatchedEpisodes(localStore.getWatchedEpisodes(subject.detailPath, selectedSeason));
        setWatchHistory(localStore.getHistory());

        if (user) {
            syncSeasonWatchedEpisodes(user.uid, subject.detailPath, selectedSeason)
                .then((syncedEps) => setWatchedEpisodes(syncedEps))
                .catch(() => {});
        }
    }, [subject?.detailPath, selectedSeason, user]);

    useEffect(() => {
        if (activeSeason && activeSeason !== selectedSeason) {
            setSelectedSeason(activeSeason);
        }
    }, [activeSeason]);

    const currentSeasonData = useMemo(
        () => resource?.seasons?.find((s) => s.se === selectedSeason),
        [resource?.seasons, selectedSeason],
    );
    const totalEpisodes = currentSeasonData?.maxEp || 0;

    const [fillerEpisodes, setFillerEpisodes] = useState<Set<number>>(
        new Set(),
    );

    useEffect(() => {
        if (!isSeries || !subject?.title) return;

        let isMounted = true;
        const cacheKey = `fillers-v4-${subject.detailPath}`;

        const cached = localStorage.getItem(cacheKey);
        if (cached) {
            try {
                const parsed = JSON.parse(cached) as number[];
                setFillerEpisodes(new Set(parsed));
                return;
            } catch (e) {
                localStorage.removeItem(cacheKey);
            }
        }

        const fetchFillers = async () => {
            try {
                const query = cleanTitle(subject.title);
                const res = await fetch(
                    `/api/fillers?title=${encodeURIComponent(query)}`,
                );
                if (!res.ok) return;
                const json = (await res.json()) as any;
                const fillers: number[] = json.fillers || [];

                if (isMounted) {
                    setFillerEpisodes(new Set(fillers));
                    localStorage.setItem(cacheKey, JSON.stringify(fillers));
                }
            } catch (e) {
                console.error("Error fetching filler episodes:", e);
            }
        };

        fetchFillers();

        return () => {
            isMounted = false;
        };
    }, [isSeries, subject?.title, subject?.detailPath]);

    const activeEpRef = useRef<HTMLButtonElement | null>(null);

    const hasDubs = useMemo(
        () => Boolean(subject?.dubs && subject.dubs.length > 0),
        [subject?.dubs],
    );

    const completeDubs = useMemo(() => {
        if (!subject?.dubs || subject.dubs.length === 0) return [];

        const decodedPath = decodeURIComponent(path);
        const currentInList = subject.dubs.some(
            (d) => decodeURIComponent(d.detailPath) === decodedPath,
        );
        if (currentInList) return subject.dubs;

        const COUNTRY_TO_LANG: Record<string, string> = {
            japan: "Japanese",
            korea: "Korean",
            china: "Chinese",
            india: "Hindi",
            france: "French",
            germany: "German",
            spain: "Spanish",
            italy: "Italian",
            russia: "Russian",
            thailand: "Thai",
            turkey: "Turkish",
            usa: "English",
            "united states": "English",
            uk: "English",
        };

        const cornerVal = subject?.corner?.trim();
        const isValidCorner =
            cornerVal &&
            cornerVal.length > 0 &&
            !cornerVal.toLowerCase().includes("cam") &&
            !cornerVal.toLowerCase().includes("original");

        let derivedLang = "English";
        if (isValidCorner) {
            derivedLang = cornerVal;
        } else {
            const country = subject?.countryName?.toLowerCase() ?? "";
            for (const [key, lang] of Object.entries(COUNTRY_TO_LANG)) {
                if (country.includes(key)) {
                    derivedLang = lang;
                    break;
                }
            }
        }

        const currentEntry: DubModel = {
            subjectId: subject?.subjectId || "",
            lanName: derivedLang,
            lanCode: derivedLang.slice(0, 2).toLowerCase(),
            original: true,
            type: 1,
            detailPath: subject?.detailPath || path,
        };

        return [currentEntry, ...subject.dubs];
    }, [subject, path]);

    if (!details || !subject) {
        if (fetchError) {
            return (
                <div className="max-w-md mx-auto my-32 p-8 rounded-3xl glass-panel border border-glass-border text-center shadow-2xl relative z-20">
                    <AlertTriangle className="w-12 h-12 text-yellow-500 mx-auto mb-4 animate-bounce" />
                    <h2 className="text-xl font-bold text-foreground mb-2">Streaming Offline</h2>
                    <p className="text-sm text-foreground/60 mb-6">
                        This media link cannot be retrieved. It may be geo-restricted or temporarily unavailable on host mirrors.
                    </p>
                    <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400 font-mono text-left mb-6 overflow-x-auto">
                        {fetchError}
                    </div>
                    <div className="flex flex-col space-y-3">
                        <button
                            onClick={() => { setDetails(null); setStream(null); }}
                            className="flex items-center justify-center space-x-2 bg-primary hover:opacity-90 text-white px-5 py-2.5 rounded-xl font-semibold text-sm transition-all cursor-pointer"
                        >
                            <span>Try Again</span>
                        </button>
                        <Link
                            href="/"
                            className="flex items-center justify-center space-x-2 bg-white/5 hover:bg-white/10 border border-white/10 text-white/70 px-5 py-2.5 rounded-xl font-semibold text-sm transition-all"
                        >
                            <ArrowLeft className="w-4 h-4" />
                            <span>Return Home</span>
                        </Link>
                    </div>
                </div>
            );
        }
        return (
            <div className="max-w-md mx-auto my-32 p-8 rounded-3xl glass-panel border border-glass-border text-center shadow-2xl relative z-20 select-none">
                <Loader2 className="w-12 h-12 text-primary mx-auto mb-4 animate-spin" />
                <h2 className="text-lg font-black text-foreground uppercase tracking-wider mb-2">
                    Connecting Media Stream
                </h2>
                <p className="text-xs text-foreground/70 font-medium">
                    Fetching details and high-speed video mirrors directly from edge nodes...
                </p>
            </div>
        );
    }

    const handleEpisodeChange = async (se: number, ep: number) => {
        if (loadingEpisode === ep && activeSeason === se && activeEpisode === ep) return;
        setLoadingEpisode(ep);
        setActiveSeason(se);
        setActiveEpisode(ep);

        if (typeof window !== "undefined") {
            window.history.pushState({}, "", `/watch/${path}?season=${se}&episode=${ep}`);
        }
        try {
            const newStream = await movieApi.getStream(path, se, ep);
            setStream(newStream);
        } catch (err) {
            console.error("Episode stream fetch error:", err);
        } finally {
            setLoadingEpisode(null);
        }
    };

    const ratingNum = Number(subject?.imdbRatingValue || 0);
    const genres = useMemo(() => {
        const rawGenre = subject?.genre;
        if (Array.isArray(rawGenre)) {
            return rawGenre.map((g) => String(g).trim()).filter(Boolean);
        }
        if (typeof rawGenre === "string") {
            return (rawGenre as string).split(",").map((g) => g.trim()).filter(Boolean);
        }
        return [];
    }, [subject?.genre]);

    return (
        <div className="max-w-screen-2xl mx-auto px-3 sm:px-6 lg:px-8 py-4 animate-fade-in relative z-20">
            <button
                onClick={() => router.back()}
                className="flex items-center space-x-2 text-foreground/50 hover:text-primary transition-colors mb-4 text-xs font-black uppercase tracking-wider group focus:outline-none cursor-pointer"
            >
                <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
                <span>Back to Catalog</span>
            </button>

            <div className="flex flex-col xl:flex-row gap-5">
                {/* LEFT — Main Video Player & Content Info */}
                <div className="flex-1 min-w-0 space-y-4">
                    <VideoPlayer
                        streamData={stream || { downloads: [], captions: [], hasResource: false, limited: false, limitedCode: "", stream_domain: "https://videodownloader.site/" }}
                        title={cleanTitle(subject.title)}
                        coverUrl={subject.cover?.url || ""}
                        detailPath={subject.detailPath}
                        isSeries={Boolean(isSeries)}
                        season={activeSeason}
                        episode={activeEpisode}
                        onNextEpisode={() => {
                            if (activeEpisode < totalEpisodes) {
                                handleEpisodeChange(activeSeason, activeEpisode + 1);
                            }
                        }}
                        onPrevEpisode={() => {
                            if (activeEpisode > 1) {
                                handleEpisodeChange(activeSeason, activeEpisode - 1);
                            }
                        }}
                    />

                    {/* Title & Action Buttons Panel */}
                    <div className="p-4 sm:p-5 rounded-2xl glass-panel border border-glass-border shadow-xl">
                        <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
                            <div className="space-y-1.5">
                                <div className="flex flex-wrap items-center gap-2">
                                    <h1 className="text-xl sm:text-2xl font-black text-foreground tracking-tight">
                                        {cleanTitle(subject.title)}
                                    </h1>
                                    {isSeries && activeEpisode > 0 && (
                                        <span className="px-2.5 py-0.5 rounded-full bg-primary/20 text-primary text-xs font-bold border border-primary/30">
                                            S{activeSeason} E{activeEpisode}
                                        </span>
                                    )}
                                </div>
                                <div className="flex flex-wrap items-center gap-3 text-xs text-foreground/60 font-medium">
                                    {ratingNum > 0 && (
                                        <span className="flex items-center gap-1 text-amber-400 font-bold">
                                            <Star className="w-3.5 h-3.5 fill-amber-400" />
                                            {ratingNum.toFixed(1)}
                                        </span>
                                    )}
                                    {subject.releaseDate && <span>Released: {subject.releaseDate}</span>}
                                    {subject.duration > 0 && <span>{Math.floor(subject.duration / 60)} mins</span>}
                                    {subject.countryName && <span>{subject.countryName}</span>}
                                </div>
                            </div>

                            <div className="flex items-center gap-2 shrink-0">
                                <button
                                    onClick={handleWatchlistToggle}
                                    className={`flex items-center space-x-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                                        isInWatchlist
                                            ? "bg-primary text-white shadow-lg shadow-primary/25"
                                            : "bg-white/5 hover:bg-white/10 text-foreground/80 border border-white/10"
                                    }`}
                                >
                                    <Heart
                                        className={`w-3.5 h-3.5 ${
                                            isInWatchlist ? "fill-current" : ""
                                        }`}
                                    />
                                    <span>
                                        {isInWatchlist
                                            ? "In Watchlist"
                                            : "Add to Watchlist"}
                                    </span>
                                </button>

                                {isSeries && activeEpisode > 0 && (
                                    <button
                                        onClick={handleEpisodeBookmarkToggle}
                                        className={`flex items-center space-x-1.5 px-4 py-2 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                                            isEpisodeBookmarked
                                                ? "bg-amber-500 text-white shadow-lg shadow-amber-500/25"
                                                : "bg-white/5 hover:bg-white/10 text-foreground/80 border border-white/10"
                                        }`}
                                        title={
                                            isEpisodeBookmarked
                                                ? "Bookmarked episode — Click to clear"
                                                : "Bookmark current episode"
                                        }
                                    >
                                        <Bookmark
                                            className={`w-3.5 h-3.5 ${
                                                isEpisodeBookmarked
                                                    ? "fill-current"
                                                    : ""
                                            }`}
                                        />
                                        <span>
                                            {isEpisodeBookmarked
                                                ? `S${activeSeason} E${activeEpisode} Saved`
                                                : "Bookmark Episode"}
                                        </span>
                                    </button>
                                )}
                            </div>
                        </div>

                        {/* Genres */}
                        {genres.length > 0 && (
                            <div className="flex flex-wrap gap-1.5 pt-3 mt-3 border-t border-white/5">
                                {genres.map((g) => (
                                    <span
                                        key={g}
                                        className="px-2.5 py-0.5 rounded-full bg-white/5 border border-white/10 text-[10px] sm:text-xs font-semibold text-foreground/70"
                                    >
                                        {g}
                                    </span>
                                ))}
                            </div>
                        )}
                    </div>

                    {/* Storyline & Overview Panel */}
                    {(subject.description || metadata?.description) && (
                        <div className="p-4 sm:p-5 rounded-2xl glass-panel border border-glass-border shadow-xl space-y-2">
                            <h3 className="text-xs font-black uppercase tracking-wider text-foreground/50">
                                Storyline & Overview
                            </h3>
                            <p className="text-xs sm:text-sm text-foreground/80 leading-relaxed">
                                {subject.description || metadata?.description}
                            </p>
                        </div>
                    )}

                    {/* Cast & Crew */}
                    {stars && stars.length > 0 && (
                        <div className="p-4 sm:p-5 rounded-2xl glass-panel border border-glass-border shadow-xl space-y-3">
                            <h3 className="text-xs font-black uppercase tracking-wider text-foreground/50">
                                Top Cast
                            </h3>
                            <div className="flex items-center gap-3 overflow-x-auto custom-scrollbar pb-1">
                                {stars.slice(0, 10).map((star, idx) => (
                                    <div
                                        key={`${star.staffId || star.name || "star"}-${star.character || ""}-${idx}`}
                                        className="flex items-center space-x-2.5 bg-white/5 border border-white/10 px-3 py-1.5 rounded-xl shrink-0"
                                    >
                                        {star.avatarUrl ? (
                                            /* eslint-disable-next-line @next/next/no-img-element */
                                            <img
                                                src={star.avatarUrl}
                                                alt={star.name}
                                                className="w-7 h-7 rounded-full object-cover border border-white/10"
                                            />
                                        ) : (
                                            <div className="w-7 h-7 rounded-full bg-primary/20 flex items-center justify-center text-primary text-xs font-bold">
                                                {star.name.charAt(0)}
                                            </div>
                                        )}
                                        <div className="min-w-0">
                                            <p className="text-xs font-bold text-foreground truncate max-w-[120px]">
                                                {star.name}
                                            </p>
                                            {star.character && (
                                                <p className="text-[10px] text-foreground/50 truncate max-w-[120px]">
                                                    {star.character}
                                                </p>
                                            )}
                                        </div>
                                    </div>
                                ))}
                            </div>
                        </div>
                    )}
                </div>

                {/* RIGHT SIDEBAR — Episodes, Audio Languages & Specs */}
                <div className="w-full xl:w-[340px] flex-shrink-0 space-y-4">
                    {/* Episodes Guide */}
                    {isSeries && resource?.seasons && resource.seasons.length > 0 && (
                        <div className="p-4 rounded-2xl glass-panel border border-glass-border shadow-xl space-y-3">
                            <div className="flex items-center justify-between">
                                <h3 className="text-xs font-black uppercase tracking-wider text-foreground/70">
                                    Episodes ({totalEpisodes})
                                </h3>

                                {resource.seasons.length > 1 && (
                                    <div
                                        id="season-selector-container"
                                        className="relative"
                                    >
                                        <button
                                            onClick={() =>
                                                setShowSeasonDropdown(
                                                    !showSeasonDropdown,
                                                )
                                            }
                                            className="flex items-center space-x-1 bg-white/5 hover:bg-white/10 border border-white/10 px-3 py-1 rounded-lg text-xs font-bold text-foreground/80 cursor-pointer"
                                        >
                                            <span>Season {selectedSeason}</span>
                                            <ChevronDown className="w-3 h-3" />
                                        </button>

                                        {showSeasonDropdown && (
                                            <div className="absolute right-0 mt-1 w-36 py-1 bg-neutral-900 border border-white/10 rounded-xl shadow-2xl z-50 overflow-hidden">
                                                {resource.seasons.map((s) => (
                                                    <button
                                                        key={s.se}
                                                        onClick={() => {
                                                            setSelectedSeason(
                                                                s.se,
                                                            );
                                                            setShowSeasonDropdown(
                                                                false,
                                                            );
                                                        }}
                                                        className={`w-full text-left px-3 py-1.5 text-xs font-bold transition-colors cursor-pointer ${
                                                            s.se ===
                                                            selectedSeason
                                                                ? "bg-primary text-white"
                                                                : "text-foreground/70 hover:bg-white/10"
                                                        }`}
                                                    >
                                                        Season {s.se}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}
                            </div>

                            <div className="max-h-[460px] overflow-y-auto custom-scrollbar pr-1 grid grid-cols-5 sm:grid-cols-8 xl:grid-cols-5 gap-2">
                                {Array.from(
                                    { length: totalEpisodes },
                                    (_, i) => i + 1,
                                ).map((epNum) => {
                                    const isCurrent =
                                        selectedSeason === activeSeason &&
                                        epNum === activeEpisode;
                                    const isWatched = watchedEpisodes.has(epNum);
                                    const isFiller = fillerEpisodes.has(epNum);

                                    return (
                                        <button
                                            key={epNum}
                                            ref={isCurrent ? activeEpRef : null}
                                            disabled={
                                                loadingEpisode === epNum ||
                                                isCurrent
                                            }
                                            onClick={() => handleEpisodeChange(selectedSeason, epNum)}
                                            className={`p-2 rounded-xl text-center text-xs font-bold transition-all relative group cursor-pointer ${
                                                isCurrent
                                                    ? "bg-primary text-white ring-2 ring-primary/50 shadow-lg shadow-primary/30"
                                                    : isWatched
                                                    ? "bg-primary/20 text-primary border border-primary/30"
                                                    : "bg-white/5 hover:bg-white/10 text-foreground/70 border border-white/5"
                                            }`}
                                        >
                                            {loadingEpisode === epNum ? (
                                                <Loader2 className="w-3.5 h-3.5 animate-spin mx-auto text-primary" />
                                            ) : (
                                                <span>{epNum}</span>
                                            )}
                                            {isFiller && (
                                                <span
                                                    className="absolute -top-1 -right-1 w-2 h-2 rounded-full bg-amber-400"
                                                    title="Filler Episode"
                                                />
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Audio Languages / Dubs Panel */}
                    {completeDubs.length > 0 && (
                        <div className="p-4 rounded-2xl glass-panel border border-glass-border shadow-xl space-y-3">
                            <h3 className="text-xs font-black uppercase tracking-wider text-foreground/70">
                                Audio Languages
                            </h3>
                            <div className="flex flex-col gap-1.5">
                                {completeDubs.map((dub) => {
                                    const isSelected =
                                        decodeURIComponent(dub.detailPath) ===
                                        decodeURIComponent(path);
                                    return (
                                        <button
                                            key={dub.detailPath}
                                            disabled={
                                                isSelected ||
                                                loadingAudio === dub.detailPath
                                            }
                                            onClick={() => {
                                                setLoadingAudio(
                                                    dub.detailPath,
                                                );
                                                router.push(
                                                    `/watch/${dub.detailPath}?season=${activeSeason}&episode=${activeEpisode}`,
                                                );
                                            }}
                                            className={`flex items-center justify-between px-3.5 py-2.5 rounded-xl text-xs font-bold transition-all cursor-pointer ${
                                                isSelected
                                                    ? "bg-primary text-white shadow-md shadow-primary/20"
                                                    : "bg-white/5 hover:bg-white/10 text-foreground/70 border border-white/5"
                                            }`}
                                        >
                                            <div className="flex items-center space-x-2">
                                                <Volume2 className="w-4 h-4 opacity-70" />
                                                <span>{dub.lanName}</span>
                                            </div>
                                            {isSelected && (
                                                <span className="text-[10px] uppercase font-black tracking-wider bg-white/20 px-2 py-0.5 rounded-md">
                                                    Active
                                                </span>
                                            )}
                                            {loadingAudio === dub.detailPath && (
                                                <Loader2 className="w-3.5 h-3.5 animate-spin text-primary" />
                                            )}
                                        </button>
                                    );
                                })}
                            </div>
                        </div>
                    )}

                    {/* Media Details Panel */}
                    <div className="p-4 rounded-2xl glass-panel border border-glass-border shadow-xl space-y-3">
                        <h3 className="text-xs font-black uppercase tracking-wider text-foreground/70">
                            Media Details
                        </h3>
                        <div className="space-y-2 text-xs">
                            {ratingNum > 0 && (
                                <div className="flex items-center justify-between py-1 border-b border-white/5">
                                    <span className="text-foreground/50 font-medium">IMDb Rating</span>
                                    <span className="font-bold text-amber-400 flex items-center gap-1">
                                        <Star className="w-3.5 h-3.5 fill-amber-400" />
                                        {ratingNum.toFixed(1)} / 10
                                    </span>
                                </div>
                            )}
                            {subject.countryName && (
                                <div className="flex items-center justify-between py-1 border-b border-white/5">
                                    <span className="text-foreground/50 font-medium">Country</span>
                                    <span className="font-semibold text-foreground">{subject.countryName}</span>
                                </div>
                            )}
                            {subject.releaseDate && (
                                <div className="flex items-center justify-between py-1 border-b border-white/5">
                                    <span className="text-foreground/50 font-medium">Release Year</span>
                                    <span className="font-semibold text-foreground">{subject.releaseDate}</span>
                                </div>
                            )}
                            {subject.duration > 0 && (
                                <div className="flex items-center justify-between py-1">
                                    <span className="text-foreground/50 font-medium">Duration</span>
                                    <span className="font-semibold text-foreground">{Math.floor(subject.duration / 60)} mins</span>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>

            {related.length > 0 && (
                <div className="mt-8">
                    <MovieShelf
                        title="You Might Also Like"
                        subjects={related}
                    />
                </div>
            )}
        </div>
    );
}
