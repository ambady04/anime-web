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
} from "lucide-react";
import { ItemDetails, StreamData } from "@/lib/api";
import { localStore } from "@/lib/storage";
import VideoPlayer from "@/components/video-player";
import MovieShelf from "@/components/movie-shelf";
import Link from "next/link";

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
    useEffect(() => {
        setIsInWatchlist(localStore.isInWatchlist(subject.detailPath));
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
    };

    const isSeries =
        subject.subjectType === 2 ||
        subject.subjectType === 7;

    const [selectedSeason, setSelectedSeason] = useState(activeSeason || 1);
    const currentSeasonData = resource?.seasons?.find(
        (s) => s.se === selectedSeason,
    );
    const totalEpisodes = currentSeasonData?.maxEp || 0;

    const handleEpisodeClick = (epNum: number) => {
        setLoadingEpisode(epNum);
        setIsPageLoading(true);
        router.push(`/watch/${path}?season=${selectedSeason}&episode=${epNum}`);
    };

    const handleNextEpisode = () => {
        if (isSeries && activeEpisode < totalEpisodes) {
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
    useEffect(() => {
        setWatchedEpisodes(
            localStore.getWatchedEpisodes(subject.detailPath, selectedSeason),
        );
    }, [subject.detailPath, selectedSeason]);

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
                            title={subject.title}
                            coverUrl={subject.cover?.url || ""}
                            isSeries={isSeries}
                            season={isSeries ? activeSeason : undefined}
                            episode={isSeries ? activeEpisode : undefined}
                            dubs={subject.dubs}
                            onNextEpisode={activeEpisode < totalEpisodes ? handleNextEpisode : undefined}
                            onPrevEpisode={activeEpisode > 1 ? handlePrevEpisode : undefined}
                        />
                        {isPageLoading && (
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
                                className="xl:hidden flex-shrink-0 p-2 rounded-xl bg-glass-card border border-glass-border text-foreground/60 hover:text-primary transition-colors"
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
                <div className="w-full xl:w-[340px] flex-shrink-0 space-y-4 xl:sticky xl:top-20 xl:self-start xl:max-h-[calc(100vh-5rem)] xl:overflow-y-auto no-scrollbar">
                    {/* Episodes Panel (series only) */}
                    {isSeries && totalEpisodes > 0 && (
                        <div className="p-4 rounded-2xl glass-panel border border-glass-border shadow-card space-y-3">
                            <div className="flex items-center justify-between">
                                <h2 className="font-black text-foreground text-xs uppercase tracking-wider flex items-center space-x-2">
                                    <Play className="w-3.5 h-3.5 text-primary fill-primary" />
                                    <span>Episode Guide</span>
                                </h2>
                                {resource?.seasons &&
                                    resource.seasons.length > 1 && (
                                        <select
                                            value={selectedSeason}
                                            onChange={(e) =>
                                                setSelectedSeason(
                                                    Number(e.target.value),
                                                )
                                            }
                                            className="text-[10px] font-black bg-glass-card hover:bg-glass-panel border border-glass-border rounded-xl px-2.5 py-1.5 text-foreground focus:outline-none cursor-pointer uppercase tracking-wider"
                                        >
                                            {resource.seasons.map((se) => (
                                                <option
                                                    key={se.se}
                                                    value={se.se}
                                                    className="bg-background text-foreground"
                                                >
                                                    Season {se.se}
                                                </option>
                                            ))}
                                        </select>
                                    )}
                            </div>

                            {/* Show a hint when browsing a different season than what's currently playing */}
                            {selectedSeason !== activeSeason && (
                                <div className="flex items-center gap-2 px-3 py-2 rounded-xl bg-primary/8 border border-primary/20 text-primary text-[10px] font-bold">
                                    <Play className="w-3 h-3 fill-primary flex-shrink-0" />
                                    <span>
                                        Now playing: S{activeSeason} E
                                        {activeEpisode} — click an episode below
                                        to switch
                                    </span>
                                </div>
                            )}

                            <div className="grid grid-cols-5 sm:grid-cols-8 xl:grid-cols-5 gap-2 max-h-64 xl:max-h-[380px] overflow-y-auto pr-0.5 no-scrollbar">
                                {Array.from({ length: totalEpisodes }).map(
                                    (_, idx) => {
                                        const epNum = idx + 1;
                                        // Currently playing episode (same season as URL)
                                        const isActive =
                                            epNum === activeEpisode &&
                                            selectedSeason === activeSeason;
                                        // Previously watched but not currently active
                                        const isWatched =
                                            watchedEpisodes.has(epNum) &&
                                            !isActive;
                                        return (
                                            <button
                                                key={epNum}
                                                ref={
                                                    isActive
                                                        ? activeEpRef
                                                        : null
                                                }
                                                onClick={() =>
                                                    handleEpisodeClick(epNum)
                                                }
                                                disabled={
                                                    loadingEpisode === epNum
                                                }
                                                className={`relative py-3 rounded-xl text-xs font-black border transition-all cursor-pointer ${
                                                    loadingEpisode === epNum
                                                        ? "bg-primary/50 text-white border-primary/30 animate-pulse scale-105"
                                                        : isActive
                                                          ? "bg-primary text-white border-primary/20 shadow-lg shadow-primary-glow scale-105"
                                                          : isWatched
                                                            ? "bg-emerald-500/15 text-emerald-400 border-emerald-500/30 hover:bg-emerald-500/25 hover:border-emerald-500/50"
                                                            : "bg-glass-card hover:bg-primary/10 hover:border-primary/30 border-glass-border text-foreground/60 hover:text-foreground"
                                                }`}
                                            >
                                                {loadingEpisode === epNum ? (
                                                    <Loader2 className="w-3 h-3 animate-spin mx-auto" />
                                                ) : (
                                                    epNum
                                                )}
                                                {/* Small dot indicator for watched episodes */}
                                                {isWatched &&
                                                    loadingEpisode !==
                                                        epNum && (
                                                        <span className="absolute top-1 right-1 w-1.5 h-1.5 rounded-full bg-emerald-400" />
                                                    )}
                                            </button>
                                        );
                                    },
                                )}
                            </div>
                        </div>
                    )}

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
