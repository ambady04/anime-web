"use client";

import { useState, useEffect, useRef, memo, useCallback } from "react";
import Link from "next/link";
import { motion, useSpring } from "framer-motion";
import { Star, Play, Tv, Film, Plus } from "lucide-react";
import { Subject, isSeriesType } from "@/lib/api";
import { localStore } from "@/lib/storage";

interface MovieCardProps {
    subject: Subject;
    bookmarkedSeason?: number;
    bookmarkedEpisode?: number;
    index?: number;
}

function MovieCard({
    subject,
    bookmarkedSeason: propBookmarkedSeason,
    bookmarkedEpisode: propBookmarkedEpisode,
    index = 0,
}: MovieCardProps) {
    const imageUrl = subject.cover?.url || "/placeholder.jpg";
    const isSeries = isSeriesType(subject.subjectType);

    const [bookmarkedSeason, setBookmarkedSeason] = useState<number | undefined>(propBookmarkedSeason);
    const [bookmarkedEpisode, setBookmarkedEpisode] = useState<number | undefined>(propBookmarkedEpisode);
    const [imageLoaded, setImageLoaded] = useState(false);

    // 3D tilt Framer Motion Values (bypasses React renders on mousemove)
    const cardRef = useRef<HTMLDivElement>(null);
    const [isHovered, setIsHovered] = useState(false);
    const rotateX = useSpring(0, { stiffness: 300, damping: 25 });
    const rotateY = useSpring(0, { stiffness: 300, damping: 25 });
    const scale = useSpring(1, { stiffness: 300, damping: 25 });

    useEffect(() => {
        if (propBookmarkedSeason !== undefined) setBookmarkedSeason(propBookmarkedSeason);
        if (propBookmarkedEpisode !== undefined) setBookmarkedEpisode(propBookmarkedEpisode);
        if (isSeries && propBookmarkedSeason === undefined && propBookmarkedEpisode === undefined) {
            const item = localStore.getWatchlistItem(subject.detailPath);
            if (item?.bookmarkedSeason && item?.bookmarkedEpisode) {
                setBookmarkedSeason(item.bookmarkedSeason);
                setBookmarkedEpisode(item.bookmarkedEpisode);
            } else {
                const historyItem = localStore.getHistory().find((h) => h.detailPath === subject.detailPath);
                if (historyItem?.season && historyItem?.episode) {
                    setBookmarkedSeason(historyItem.season);
                    setBookmarkedEpisode(historyItem.episode);
                }
            }
        }
    }, [isSeries, subject.detailPath, propBookmarkedSeason, propBookmarkedEpisode]);

    const handleMouseMove = useCallback((e: React.MouseEvent<HTMLDivElement>) => {
        if (!cardRef.current) return;
        const rect = cardRef.current.getBoundingClientRect();
        const x = (e.clientY - rect.top) / rect.height - 0.5;
        const y = (e.clientX - rect.left) / rect.width - 0.5;
        rotateX.set(x * 12);
        rotateY.set(y * -12);
    }, [rotateX, rotateY]);

    const handleMouseEnter = useCallback(() => {
        setIsHovered(true);
        scale.set(1.03);
    }, [scale]);

    const handleMouseLeave = useCallback(() => {
        setIsHovered(false);
        rotateX.set(0);
        rotateY.set(0);
        scale.set(1);
    }, [rotateX, rotateY, scale]);

    const watchLink =
        bookmarkedSeason && bookmarkedEpisode
            ? `/watch/${subject.detailPath}?season=${bookmarkedSeason}&episode=${bookmarkedEpisode}`
            : `/watch/${subject.detailPath}`;

    return (
        <motion.div
            ref={cardRef}
            className="relative w-full aspect-[2/3] cursor-pointer select-none"
            style={{ 
                perspective: 800, 
                transformStyle: "preserve-3d",
                rotateX,
                rotateY,
                scale
            }}
            onMouseMove={handleMouseMove}
            onMouseEnter={handleMouseEnter}
            onMouseLeave={handleMouseLeave}
        >
            <Link href={watchLink} className="absolute inset-0 block rounded-[20px] overflow-hidden">
                {/* ── Poster image with blur-in loading ── */}
                <div className="absolute inset-0" style={{ background: "#000000" }}>
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={imageUrl}
                        alt={subject.title}
                        className="w-full h-full object-cover transition-transform duration-700 ease-out"
                        style={{
                            opacity: imageLoaded ? 1 : 0,
                            transition: "opacity 0.5s ease, transform 0.7s ease",
                            transform: isHovered ? "scale(1.08)" : "scale(1)",
                        }}
                        loading="lazy"
                        onLoad={() => setImageLoaded(true)}
                    />
                    {/* Shimmer while loading */}
                    {!imageLoaded && <div className="absolute inset-0 shimmer-bg" />}
                </div>

                {/* ── Base gradient overlay (always visible) ── */}
                <div
                    className="absolute inset-0 transition-opacity duration-400"
                    style={{
                        background: "linear-gradient(180deg, transparent 40%, rgba(0,0,0,0.7) 70%, rgba(0,0,0,0.95) 100%)",
                        opacity: isHovered ? 0.95 : 0.85,
                    }}
                />

                {/* ── Glow border on hover ── */}
                <motion.div
                    className="absolute inset-0 rounded-[20px] pointer-events-none"
                    style={{ border: "1px solid rgba(255,255,255,0.06)" }}
                    animate={{
                        boxShadow: isHovered
                            ? "0 24px 60px -10px rgba(229, 9, 20, 0.28), 0 0 35px -5px rgba(229, 9, 20, 0.18)"
                            : "0 8px 32px rgba(0,0,0,0.8)",
                    }}
                    transition={{ duration: 0.35 }}
                />

                {/* ── Center Play Button ── */}
                <motion.div
                    className="absolute inset-0 flex items-center justify-center z-10"
                    animate={{ opacity: isHovered ? 1 : 0 }}
                    transition={{ duration: 0.25 }}
                >
                    <motion.div
                        className="w-12 h-12 rounded-full flex items-center justify-center"
                        style={{
                            background: "linear-gradient(135deg, var(--primary), var(--primary-dark))",
                            boxShadow: "0 8px 32px rgba(229,9,20,0.6)",
                        }}
                        animate={{ scale: isHovered ? 1 : 0.7 }}
                        transition={{ type: "spring", stiffness: 400, damping: 20 }}
                    >
                        <Play className="w-5 h-5 fill-white text-white ml-[1px]" />
                    </motion.div>
                </motion.div>

                {/* ── Top-right action buttons (fade in on hover) ── */}
                <motion.div
                    className="absolute top-3 right-3 z-20 flex flex-col gap-1.5"
                    animate={{ opacity: isHovered ? 1 : 0, y: isHovered ? 0 : -8 }}
                    transition={{ duration: 0.25 }}
                >
                    <motion.button
                        className="w-8 h-8 rounded-full flex items-center justify-center"
                        style={{ background: "rgba(0,0,0,0.7)", border: "1px solid rgba(255,255,255,0.12)", backdropFilter: "blur(8px)" }}
                        whileHover={{ scale: 1.15, borderColor: "rgba(229,9,20,0.5)" }}
                        whileTap={{ scale: 0.9 }}
                        onClick={(e) => e.preventDefault()}
                        aria-label="Add to watchlist"
                    >
                        <Plus className="w-3.5 h-3.5 text-white" />
                    </motion.button>
                </motion.div>

                {/* ── Bottom info area ── */}
                <div className="absolute bottom-0 left-0 right-0 p-3.5 z-10">
                    {/* Badges row */}
                    <div className="flex items-center gap-1.5 mb-2 flex-wrap">
                        {Number(subject.imdbRatingValue) > 0 && (
                            <div
                                className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black"
                                style={{ background: "rgba(0,0,0,0.6)", border: "1px solid rgba(234,179,8,0.3)", color: "#EAB308", backdropFilter: "blur(8px)" }}
                            >
                                <Star className="w-2.5 h-2.5 fill-current" />
                                {Number(subject.imdbRatingValue).toFixed(1)}
                            </div>
                        )}

                        {bookmarkedSeason && bookmarkedEpisode ? (
                            <div
                                className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-black"
                                style={{ background: "rgba(16,185,129,0.15)", border: "1px solid rgba(16,185,129,0.3)", color: "#34D399", backdropFilter: "blur(8px)" }}
                            >
                                <Tv className="w-2.5 h-2.5" />
                                S{bookmarkedSeason} E{bookmarkedEpisode}
                            </div>
                        ) : (
                            <div
                                className="flex items-center gap-1 px-2 py-0.5 rounded-md text-[10px] font-semibold text-[rgba(255,255,255,0.7)]"
                                style={{ background: "rgba(255,255,255,0.07)", border: "1px solid rgba(255,255,255,0.08)", backdropFilter: "blur(8px)" }}
                            >
                                {isSeries ? <Tv className="w-2.5 h-2.5" /> : <Film className="w-2.5 h-2.5" />}
                                {isSeries ? "Series" : "Movie"}
                            </div>
                        )}
                    </div>

                    {/* Title */}
                    <h3
                        className="font-bold text-[11px] sm:text-xs md:text-sm text-white leading-tight line-clamp-2 transition-colors duration-200"
                        style={{ color: isHovered ? "var(--primary-light)" : "#ffffff", textShadow: "0 1px 8px rgba(0,0,0,0.8)" }}
                    >
                        {subject.title}
                    </h3>

                    {subject.releaseDate && (
                        <p className="text-[10px] text-secondary mt-0.5 font-medium">
                            {subject.releaseDate.split("-")[0]}
                        </p>
                    )}
                </div>
            </Link>
        </motion.div>
    );
}

export default memo(MovieCard);
