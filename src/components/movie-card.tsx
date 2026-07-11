"use client";

import { useState, useEffect, memo } from "react";
import Link from "next/link";
import { Star, Play, Tv, Film } from "lucide-react";
import { Subject } from "@/lib/api";
import { localStore } from "@/lib/storage";

interface MovieCardProps {
    subject: Subject;
    bookmarkedSeason?: number;
    bookmarkedEpisode?: number;
}

function MovieCard({
    subject,
    bookmarkedSeason: propBookmarkedSeason,
    bookmarkedEpisode: propBookmarkedEpisode,
}: MovieCardProps) {
    // If the cover URL is relative or missing, we can fallback, but we should make sure we support it.
    const imageUrl = subject.cover?.url || "/placeholder.jpg";

    const isSeries = subject.subjectType === 2 || subject.subjectType === 7;

    const [bookmarkedSeason, setBookmarkedSeason] = useState<
        number | undefined
    >(propBookmarkedSeason);
    const [bookmarkedEpisode, setBookmarkedEpisode] = useState<
        number | undefined
    >(propBookmarkedEpisode);

    useEffect(() => {
        if (propBookmarkedSeason !== undefined) {
            setBookmarkedSeason(propBookmarkedSeason);
        }
        if (propBookmarkedEpisode !== undefined) {
            setBookmarkedEpisode(propBookmarkedEpisode);
        }
        if (
            isSeries &&
            propBookmarkedSeason === undefined &&
            propBookmarkedEpisode === undefined
        ) {
            const item = localStore.getWatchlistItem(subject.detailPath);
            setBookmarkedSeason(item?.bookmarkedSeason);
            setBookmarkedEpisode(item?.bookmarkedEpisode);
        }
    }, [
        isSeries,
        subject.detailPath,
        propBookmarkedSeason,
        propBookmarkedEpisode,
    ]);

    // Decide the layout link path.
    // The path parameter is the detailPath, e.g., "from-hindi-Icj9nKQHUt2"
    const watchLink =
        bookmarkedSeason && bookmarkedEpisode
            ? `/watch/${subject.detailPath}?season=${bookmarkedSeason}&episode=${bookmarkedEpisode}`
            : `/watch/${subject.detailPath}`;

    return (
        <Link
            href={watchLink}
            className="group relative block w-full aspect-2/3 rounded-xl sm:rounded-2xl overflow-hidden glass-card transition-all duration-300"
        >
            {/* Background Poster Image */}
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
                src={imageUrl}
                alt={subject.title}
                className="absolute inset-0 w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ease-out select-none pointer-events-none"
                loading="lazy"
            />

            {/* Dark Overlay on Hover */}
            <div className="absolute inset-0 bg-linear-to-t from-black/90 via-black/35 to-transparent opacity-85 sm:opacity-65 group-hover:opacity-95 transition-opacity duration-300 flex flex-col justify-end p-4 z-10">
                {/* Play Icon - Hover reveal */}
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-11 h-11 rounded-full bg-primary flex items-center justify-center scale-75 group-hover:scale-100 opacity-0 group-hover:opacity-100 transition-all duration-300 shadow-lg shadow-primary-glow z-20">
                    <Play className="w-4.5 h-4.5 fill-white text-white translate-x-0.5" />
                </div>

                {/* Tags Row */}
                <div className="flex items-center justify-between mb-1.5 flex-wrap gap-1">
                    {/* Rating Badge */}
                    {subject.imdbRatingValue > 0 && (
                        <div className="flex items-center space-x-1 bg-black/60 backdrop-blur-md px-2 py-0.5 rounded-md border border-white/10">
                            <Star className="w-3 h-3 text-yellow-500 fill-yellow-500" />
                            <span className="text-[10px] font-black text-yellow-500">
                                {subject.imdbRatingValue.toFixed(1)}
                            </span>
                        </div>
                    )}

                    {/* Format Badge */}
                    {bookmarkedSeason && bookmarkedEpisode ? (
                        <div className="bg-emerald-500/20 backdrop-blur-md px-2 py-0.5 rounded-md border border-emerald-500/40 flex items-center space-x-1 shadow-lg shadow-emerald-500/10">
                            <Tv className="w-2.5 h-2.5 text-emerald-400 fill-emerald-400/20" />
                            <span className="text-[8px] font-black text-emerald-400 uppercase tracking-wider">
                                Resume S{bookmarkedSeason} E{bookmarkedEpisode}
                            </span>
                        </div>
                    ) : (
                        <div className="bg-white/10 backdrop-blur-md px-2 py-0.5 rounded-md border border-white/5 flex items-center space-x-1">
                            {isSeries ? (
                                <Tv className="w-2.5 h-2.5 text-primary-light" />
                            ) : (
                                <Film className="w-2.5 h-2.5 text-white/90" />
                            )}
                            <span className="text-[8px] font-black text-white/90 uppercase tracking-wider">
                                {isSeries ? "Series" : "Movie"}
                            </span>
                        </div>
                    )}
                </div>

                {/* Movie Title */}
                <h3 className="font-extrabold text-[11px] sm:text-xs md:text-sm 2xl:text-base text-white group-hover:text-primary-light transition-colors line-clamp-2">
                    {subject.title}
                </h3>

                {/* Release date or language tag */}
                {subject.releaseDate && (
                    <p className="text-[10px] text-white/60 mt-0.5">
                        {subject.releaseDate.split("-")[0]}
                    </p>
                )}
            </div>

            {/* Corner Label Overlay (e.g. Hindi, CAM, etc.) */}
            {subject.corner && (
                <div className="absolute top-2.5 left-2.5 bg-primary text-white text-[8px] font-black uppercase tracking-wider px-2 py-0.5 rounded-md shadow-md z-20 border border-white/10">
                    {subject.corner}
                </div>
            )}
        </Link>
    );
}

export default memo(MovieCard);
