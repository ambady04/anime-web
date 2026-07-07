"use client";

import { useState, useEffect, useRef } from "react";
import { useSearchParams, useRouter } from "next/navigation";
import {
    Search,
    Loader2,
    Film,
    Tv,
    Grid,
    Flame,
    Sparkles,
    Clock,
    Star,
    Globe,
    Sword,
    Heart,
    Laugh,
    Skull,
    Ghost,
    Rocket,
    Music2,
    Baby,
    Drama,
    Swords,
    Zap,
    ChevronRight,
} from "lucide-react";
import { movieApi, Subject } from "@/lib/api";
import MovieCard from "@/components/movie-card";

interface SearchClientProps {
    initialQuery?: string;
    initialCategory?: string;
}

const GENRE_CATEGORIES = [
    {
        label: "Action",
        icon: Sword,
        color: "#E31C25",
        bg: "rgba(227,28,37,0.12)",
        name: "action",
    },
    {
        label: "Adventure",
        icon: Rocket,
        color: "#FF6B35",
        bg: "rgba(255,107,53,0.12)",
        name: "adventure",
    },
    {
        label: "Animation",
        icon: Sparkles,
        color: "#9B59B6",
        bg: "rgba(155,89,182,0.12)",
        name: "animation",
    },
    {
        label: "Comedy",
        icon: Laugh,
        color: "#F1C40F",
        bg: "rgba(241,196,15,0.12)",
        name: "comedy",
    },
    {
        label: "Crime",
        icon: Skull,
        color: "#E74C3C",
        bg: "rgba(231,76,60,0.12)",
        name: "crime",
    },
    {
        label: "Drama",
        icon: Drama,
        color: "#3498DB",
        bg: "rgba(52,152,219,0.12)",
        name: "drama",
    },
    {
        label: "Fantasy",
        icon: Ghost,
        color: "#1ABC9C",
        bg: "rgba(26,188,156,0.12)",
        name: "fantasy",
    },
    {
        label: "Horror",
        icon: Skull,
        color: "#8E44AD",
        bg: "rgba(142,68,173,0.12)",
        name: "horror",
    },
    {
        label: "Music",
        icon: Music2,
        color: "#E91E63",
        bg: "rgba(233,30,99,0.12)",
        name: "music",
    },
    {
        label: "Mystery",
        icon: Ghost,
        color: "#607D8B",
        bg: "rgba(96,125,139,0.12)",
        name: "mystery",
    },
    {
        label: "Romance",
        icon: Heart,
        color: "#FF4081",
        bg: "rgba(255,64,129,0.12)",
        name: "romance",
    },
    {
        label: "Sci-Fi",
        icon: Zap,
        color: "#00BCD4",
        bg: "rgba(0,188,212,0.12)",
        name: "sci-fi",
    },
    {
        label: "Kids",
        icon: Baby,
        color: "#4CAF50",
        bg: "rgba(76,175,80,0.12)",
        name: "family",
    },
    {
        label: "Thriller",
        icon: Swords,
        color: "#FF5722",
        bg: "rgba(255,87,34,0.12)",
        name: "thriller",
    },
    {
        label: "World",
        icon: Globe,
        color: "#2196F3",
        bg: "rgba(33,150,243,0.12)",
        name: "world",
    },
    {
        label: "Top Rated",
        icon: Star,
        color: "#FFC107",
        bg: "rgba(255,193,7,0.12)",
        name: "top",
    },
];

const QUICK_SEARCHES = [
    { label: "🔥 Trending Now", q: "trending" },
    { label: "⚡ New Releases", q: "new 2024" },
    { label: "🎌 Anime", q: "anime" },
    { label: "🎬 Marvel", q: "marvel" },
    { label: "🌙 DC Universe", q: "dc" },
    { label: "🕵️ Detective", q: "detective" },
    { label: "🧙 Fantasy Epic", q: "fantasy" },
    { label: "🚀 Space", q: "space" },
];

const POPULAR_COLLECTIONS = [
    {
        title: "Anime Hits",
        desc: "Top-rated anime series and films",
        q: "anime",
        gradient:
            "linear-gradient(135deg,rgba(155,89,182,0.15) 0%,rgba(227,28,37,0.08) 100%)",
        accent: "#9B59B6",
    },
    {
        title: "Blockbuster Movies",
        desc: "Hollywood's biggest box office hits",
        q: "blockbuster",
        gradient:
            "linear-gradient(135deg,rgba(227,28,37,0.12) 0%,rgba(255,107,53,0.06) 100%)",
        accent: "#E31C25",
    },
    {
        title: "Korean Drama",
        desc: "The best K-dramas streaming now",
        q: "korean drama",
        gradient:
            "linear-gradient(135deg,rgba(233,30,99,0.12) 0%,rgba(52,152,219,0.06) 100%)",
        accent: "#E91E63",
    },
    {
        title: "Sci-Fi Universe",
        desc: "Space, tech and future worlds",
        q: "sci-fi space",
        gradient:
            "linear-gradient(135deg,rgba(0,188,212,0.12) 0%,rgba(33,150,243,0.06) 100%)",
        accent: "#00BCD4",
    },
    {
        title: "Crime & Thriller",
        desc: "Edge-of-your-seat crime dramas",
        q: "crime thriller",
        gradient:
            "linear-gradient(135deg,rgba(96,125,139,0.15) 0%,rgba(231,76,60,0.06) 100%)",
        accent: "#607D8B",
    },
    {
        title: "Family & Kids",
        desc: "Fun for the whole family",
        q: "family kids",
        gradient:
            "linear-gradient(135deg,rgba(76,175,80,0.12) 0%,rgba(241,196,15,0.06) 100%)",
        accent: "#4CAF50",
    },
];

export default function SearchClient({
    initialQuery,
    initialCategory,
}: SearchClientProps = {}) {
    const searchParams = useSearchParams();
    const router = useRouter();

    const queryParam = searchParams.get("q") || "";
    const categoryParam = searchParams.get("category") || "";

    const [query, setQuery] = useState(queryParam);
    const [filterType, setFilterType] = useState<number | undefined>(undefined);
    const [results, setResults] = useState<Subject[]>([]);
    const [isLoading, setIsLoading] = useState(false);
    const [errorMsg, setErrorMsg] = useState("");

    const debounceTimer = useRef<NodeJS.Timeout | null>(null);
    const isIdle = !queryParam && !categoryParam;

    useEffect(() => {
        setQuery(queryParam);
        const term = queryParam.trim();
        if (!term && !categoryParam) {
            setResults([]);
            setIsLoading(false);
            return;
        }
        setIsLoading(true);
        setErrorMsg("");
        const fetchResults = async () => {
            try {
                let list: Subject[] = [];
                if (categoryParam) {
                    const data = await movieApi.getCategory(categoryParam);
                    list = data.items || [];
                } else {
                    const data = await movieApi.search(term);
                    list = data.items || [];
                }
                if (filterType !== undefined) {
                    list = list.filter((item) => {
                        const isSeries =
                            item.subjectType === 2 || item.subjectType === 7;
                        return filterType === 2 ? isSeries : !isSeries;
                    });
                }
                setResults(list);
            } catch (e: any) {
                console.error(e);
                setErrorMsg("Search request failed");
            } finally {
                setIsLoading(false);
            }
        };
        fetchResults();
    }, [queryParam, categoryParam, filterType]);

    const handleQueryChange = (val: string) => {
        setQuery(val);
        if (debounceTimer.current) clearTimeout(debounceTimer.current);
        debounceTimer.current = setTimeout(() => {
            const p = new URLSearchParams();
            if (val.trim()) p.set("q", val.trim());
            router.replace("/search?" + p.toString());
        }, 500);
    };

    const handleCategoryClick = (name: string) =>
        router.push("/search?category=" + encodeURIComponent(name));

    const handleQuickSearch = (q: string) =>
        router.push("/search?q=" + encodeURIComponent(q));

    const clearSearch = () => {
        setQuery("");
        router.replace("/search");
    };

    const currentGenreMeta = GENRE_CATEGORIES.find(
        (g) => g.name === categoryParam,
    );

    return (
        <div className="max-w-380 mx-auto px-4 sm:px-6 lg:px-8 py-8 animate-fade-in relative z-20">
            {/* Page Header */}
            <div className="mb-8">
                <h1 className="text-3xl sm:text-4xl font-black text-foreground mb-1.5">
                    {isIdle
                        ? "Explore Catalog"
                        : categoryParam
                          ? (currentGenreMeta?.label ?? categoryParam)
                          : "Search Results"}
                </h1>
                <p className="text-xs sm:text-sm text-foreground/50 font-medium">
                    {isIdle
                        ? "Discover movies, series, anime, and more from around the world."
                        : categoryParam
                          ? "Browsing the " +
                            (currentGenreMeta?.label ?? categoryParam) +
                            " collection"
                          : 'Showing results for "' + queryParam + '"'}
                </p>
            </div>

            {/* Controls */}
            <div className="flex flex-col md:flex-row gap-4 items-center justify-between mb-8 pb-6 border-b border-glass-border">
                <div className="relative w-full md:max-w-lg">
                    <input
                        type="text"
                        placeholder="Search titles, genres, actors..."
                        value={query}
                        onChange={(e) => handleQueryChange(e.target.value)}
                        className="w-full glass-input rounded-2xl py-3.5 pl-12 pr-10 text-xs sm:text-sm text-foreground focus:outline-none placeholder-foreground/35"
                    />
                    <Search className="absolute left-4 top-1/2 -translate-y-1/2 text-foreground/45 w-4 h-4" />
                    {isLoading ? (
                        <Loader2 className="absolute right-4 top-1/2 -translate-y-1/2 text-primary w-4 h-4 animate-spin" />
                    ) : (
                        query && (
                            <button
                                onClick={clearSearch}
                                className="absolute right-3.5 top-1/2 -translate-y-1/2 text-foreground/40 hover:text-primary transition-colors text-lg leading-none"
                            >
                                ×
                            </button>
                        )
                    )}
                </div>
                <div className="flex space-x-2 w-full md:w-auto overflow-x-auto no-scrollbar py-1">
                    {(
                        [
                            {
                                label: "All Results",
                                value: undefined,
                                Icon: Grid,
                            },
                            { label: "Movies", value: 1, Icon: Film },
                            { label: "TV Series", value: 2, Icon: Tv },
                        ] as const
                    ).map(({ label, value, Icon }) => (
                        <button
                            key={label}
                            onClick={() =>
                                setFilterType(value as number | undefined)
                            }
                            className={
                                "flex items-center space-x-1.5 px-4 py-2.5 rounded-xl text-[10px] font-black uppercase tracking-wider transition-all duration-300 cursor-pointer select-none border " +
                                (filterType === value
                                    ? "bg-primary text-white border-primary/20 shadow-lg shadow-primary-glow"
                                    : "bg-glass-card hover:bg-glass-panel text-foreground/60 hover:text-foreground border-glass-border shadow-sm")
                            }
                        >
                            <Icon className="w-3.5 h-3.5" />
                            <span>{label}</span>
                        </button>
                    ))}
                </div>
            </div>

            {/* ── IDLE: discovery UI ── */}
            {isIdle && !isLoading && (
                <div className="space-y-12">
                    {/* Quick Picks */}
                    <section>
                        <div className="flex items-center space-x-2 mb-5">
                            <Flame className="w-4 h-4 text-primary" />
                            <h2 className="text-sm font-black text-foreground uppercase tracking-wider">
                                Quick Picks
                            </h2>
                        </div>
                        <div className="flex flex-wrap gap-2.5">
                            {QUICK_SEARCHES.map((qs) => (
                                <button
                                    key={qs.q}
                                    onClick={() => handleQuickSearch(qs.q)}
                                    className="px-4 py-2.5 rounded-xl text-xs font-bold border bg-glass-card hover:bg-glass-panel border-glass-border hover:border-primary/30 text-foreground/75 hover:text-foreground transition-all duration-200 cursor-pointer select-none"
                                >
                                    {qs.label}
                                </button>
                            ))}
                        </div>
                    </section>

                    {/* Genre Grid */}
                    <section>
                        <div className="flex items-center space-x-2 mb-5">
                            <Sparkles className="w-4 h-4 text-primary" />
                            <h2 className="text-sm font-black text-foreground uppercase tracking-wider">
                                Browse by Genre
                            </h2>
                        </div>
                        <div className="grid grid-cols-2 sm:grid-cols-4 md:grid-cols-6 lg:grid-cols-8 gap-3">
                            {GENRE_CATEGORIES.map((genre) => {
                                const Icon = genre.icon;
                                return (
                                    <button
                                        key={genre.name}
                                        onClick={() =>
                                            handleCategoryClick(genre.name)
                                        }
                                        className="group relative flex flex-col items-center justify-center gap-2.5 p-4 rounded-2xl border cursor-pointer select-none transition-all duration-300 overflow-hidden hover:scale-[1.05]"
                                        style={{
                                            background: genre.bg,
                                            borderColor: genre.color + "22",
                                        }}
                                        onMouseEnter={(e) => {
                                            (
                                                e.currentTarget as HTMLElement
                                            ).style.borderColor =
                                                genre.color + "55";
                                            (
                                                e.currentTarget as HTMLElement
                                            ).style.boxShadow =
                                                "0 8px 24px " +
                                                genre.color +
                                                "22";
                                        }}
                                        onMouseLeave={(e) => {
                                            (
                                                e.currentTarget as HTMLElement
                                            ).style.borderColor =
                                                genre.color + "22";
                                            (
                                                e.currentTarget as HTMLElement
                                            ).style.boxShadow = "";
                                        }}
                                    >
                                        <div
                                            className="w-10 h-10 rounded-xl flex items-center justify-center transition-transform duration-300 group-hover:scale-110"
                                            style={{
                                                background: genre.color + "20",
                                                color: genre.color,
                                            }}
                                        >
                                            <Icon className="w-5 h-5" />
                                        </div>
                                        <span className="text-[11px] font-black text-foreground/80 group-hover:text-foreground tracking-wide text-center leading-tight transition-colors">
                                            {genre.label}
                                        </span>
                                        <ChevronRight
                                            className="absolute right-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 opacity-0 group-hover:opacity-60 transition-all duration-200 -translate-x-1 group-hover:translate-x-0"
                                            style={{ color: genre.color }}
                                        />
                                    </button>
                                );
                            })}
                        </div>
                    </section>

                    {/* Popular Collections */}
                    <section>
                        <div className="flex items-center space-x-2 mb-5">
                            <Clock className="w-4 h-4 text-primary" />
                            <h2 className="text-sm font-black text-foreground uppercase tracking-wider">
                                Popular Collections
                            </h2>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                            {POPULAR_COLLECTIONS.map((col) => (
                                <button
                                    key={col.q}
                                    onClick={() => handleQuickSearch(col.q)}
                                    className="group relative flex items-center justify-between p-5 rounded-2xl border cursor-pointer text-left transition-all duration-300 hover:scale-[1.02] overflow-hidden"
                                    style={{
                                        background: col.gradient,
                                        borderColor: col.accent + "22",
                                    }}
                                    onMouseEnter={(e) => {
                                        (
                                            e.currentTarget as HTMLElement
                                        ).style.borderColor = col.accent + "44";
                                    }}
                                    onMouseLeave={(e) => {
                                        (
                                            e.currentTarget as HTMLElement
                                        ).style.borderColor = col.accent + "22";
                                    }}
                                >
                                    <div>
                                        <h3 className="text-sm font-black text-foreground mb-0.5">
                                            {col.title}
                                        </h3>
                                        <p className="text-[11px] text-foreground/55 font-medium">
                                            {col.desc}
                                        </p>
                                    </div>
                                    <ChevronRight
                                        className="w-5 h-5 shrink-0 opacity-40 group-hover:opacity-80 transition-all duration-200 group-hover:translate-x-1"
                                        style={{ color: col.accent }}
                                    />
                                </button>
                            ))}
                        </div>
                    </section>
                </div>
            )}

            {/* Loading Skeleton */}
            {isLoading && (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
                    {Array.from({ length: 12 }).map((_, i) => (
                        <div
                            key={i}
                            className="rounded-2xl bg-glass-card border border-glass-border overflow-hidden animate-pulse"
                        >
                            <div className="aspect-2/3 bg-glass-panel" />
                            <div className="p-3 space-y-2">
                                <div className="h-3 bg-glass-panel rounded w-4/5" />
                                <div className="h-2.5 bg-glass-panel rounded w-1/2" />
                            </div>
                        </div>
                    ))}
                </div>
            )}

            {/* Error */}
            {!isLoading && errorMsg && (
                <div className="text-center py-20 bg-glass-card rounded-3xl border border-glass-border p-8 max-w-sm mx-auto shadow-sm">
                    <p className="text-xs text-red-500 font-bold uppercase tracking-wider">
                        {errorMsg}
                    </p>
                </div>
            )}

            {/* Results */}
            {!isLoading && !errorMsg && results.length > 0 && (
                <div>
                    <p className="text-xs text-foreground/40 font-bold uppercase tracking-widest mb-5">
                        {results.length} result{results.length !== 1 ? "s" : ""}{" "}
                        found
                    </p>
                    <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6">
                        {results.map((item, idx) => (
                            <div
                                key={item.subjectId + "-" + idx}
                                className="animate-slide-up"
                            >
                                <MovieCard subject={item} />
                            </div>
                        ))}
                    </div>
                </div>
            )}

            {/* No Results */}
            {!isLoading && !errorMsg && results.length === 0 && !isIdle && (
                <div className="text-center py-20 bg-glass-card rounded-3xl border border-glass-border p-8 max-w-sm mx-auto shadow-sm select-none">
                    <Search className="w-10 h-10 text-foreground/30 mx-auto mb-4" />
                    <h3 className="text-sm font-black text-foreground uppercase tracking-wider mb-1">
                        No Results Found
                    </h3>
                    <p className="text-xs text-foreground/50 font-medium mb-5">
                        We couldn&apos;t find anything matching your search. Try
                        different keywords or browse genres.
                    </p>
                    <button
                        onClick={clearSearch}
                        className="px-5 py-2.5 rounded-xl text-xs font-black uppercase tracking-wider bg-primary text-white border border-primary/20 shadow-lg shadow-primary-glow cursor-pointer"
                    >
                        Browse Categories
                    </button>
                </div>
            )}
        </div>
    );
}
