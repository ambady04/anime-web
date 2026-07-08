"use client";

import { useEffect, useState } from "react";
import { Heart, Trash2, ArrowRight } from "lucide-react";
import Link from "next/link";
import { localStore, WatchlistItem } from "@/lib/storage";
import MovieCard from "@/components/movie-card";

export default function FavoritesPage() {
    const [favorites, setFavorites] = useState<WatchlistItem[]>([]);

    useEffect(() => {
        setFavorites(localStore.getWatchlist());
    }, []);

    const handleClearFavorites = () => {
        if (window.confirm("Clear all watchlist items?")) {
            localStorage.removeItem("kixo_watchlist");
            setFavorites([]);
        }
    };

    return (
        <div className="max-w-380 mx-auto px-4 sm:px-6 lg:px-8 py-10 relative z-20 animate-fade-in">
            {/* Header */}
            <div className="mb-10 pb-6 border-b border-glass-border flex flex-col sm:flex-row sm:items-center justify-between gap-4 select-none">
                <div>
                    <h1 className="text-2xl sm:text-3.5xl font-black text-foreground flex items-center space-x-2">
                        <Heart className="w-8 h-8 text-primary fill-primary filter drop-shadow-[0_0_8px_var(--primary-glow)] animate-pulse" />
                        <span className="uppercase tracking-wider">
                            My Watchlist
                        </span>
                    </h1>
                    <p className="text-xs sm:text-sm text-foreground/50 font-medium mt-1">
                        Movies and series you bookmarked to watch later.
                    </p>
                </div>

                {favorites.length > 0 && (
                    <button
                        onClick={handleClearFavorites}
                        className="text-xs text-primary hover:text-white border border-primary/20 bg-primary/10 hover:bg-primary px-4 py-2.5 rounded-xl transition-all cursor-pointer font-bold flex items-center space-x-1.5 focus:outline-none uppercase tracking-wider"
                    >
                        <Trash2 className="w-4 h-4" />
                        <span>Clear Watchlist</span>
                    </button>
                )}
            </div>

            {/* Grid Content */}
            {favorites.length > 0 ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
                    {favorites.map((fav) => (
                        <div key={fav.detailPath} className="animate-slide-up">
                            {/* Map WatchlistItem to Subject to consume MovieCard */}
                            <MovieCard
                                subject={{
                                    subjectId: fav.detailPath,
                                    detailPath: fav.detailPath,
                                    title: fav.title,
                                    cover: { url: fav.coverUrl },
                                    subjectType: fav.subjectType,
                                    imdbRatingValue: fav.imdbRatingValue,
                                    description: "",
                                    releaseDate: fav.releaseDate || "",
                                    duration: 0,
                                    genre: [],
                                    countryName: "",
                                    corner: fav.corner,
                                    hasResource: true,
                                }}
                                bookmarkedSeason={fav.bookmarkedSeason}
                                bookmarkedEpisode={fav.bookmarkedEpisode}
                            />
                        </div>
                    ))}
                </div>
            ) : (
                /* Empty State */
                <div className="text-center py-16 bg-glass-card rounded-3xl border border-glass-border p-8 max-w-md mx-auto shadow-sm select-none">
                    <Heart className="w-10 h-10 text-foreground/20 mx-auto mb-4" />
                    <h3 className="text-sm font-black text-foreground uppercase tracking-wider mb-1">
                        Your Watchlist is Empty
                    </h3>
                    <p className="text-xs text-foreground/50 font-medium max-w-xs mx-auto mb-6">
                        Find items to add to your watchlist by clicking the
                        bookmark button on any movie watch page.
                    </p>
                    <Link
                        href="/"
                        className="inline-flex items-center space-x-2 bg-primary hover:bg-primary-light text-white px-5 py-3 rounded-xl font-bold text-xs uppercase tracking-wider shadow-lg shadow-primary-glow transition-all"
                    >
                        <span>Explore Popular Movies</span>
                        <ArrowRight className="w-3.5 h-3.5" />
                    </Link>
                </div>
            )}
        </div>
    );
}
