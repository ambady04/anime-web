import { movieApi } from "@/lib/api";
import HeroSlider from "@/components/hero-slider";
import MovieShelf from "@/components/movie-shelf";
import ContinueWatching from "@/components/continue-watching";
import Link from "next/link";
import { Film, RefreshCw, Layers } from "lucide-react";

export const revalidate = 3600; // Revalidate cache hourly

export default async function HomePage() {
    let homeData = null;
    let errorMsg = "";

    try {
        homeData = await movieApi.getHome(false);
    } catch (e: any) {
        console.error("HomePage API Error:", e);
        errorMsg = e.message || "Error loading live media catalog.";
    }

    // Extract sections
    const bannerModule = homeData?.operatingList?.find(
        (m) => m.type === "BANNER",
    );
    const banners = bannerModule?.banner?.items || [];

    const filterModule = homeData?.operatingList?.find(
        (m) => m.type === "FILTER",
    );
    const categories = filterModule?.filters || [];

    const shelves =
        homeData?.operatingList?.filter(
            (m) =>
                m.type === "SUBJECTS_MOVIE" &&
                m.subjects &&
                m.subjects.length > 0,
        ) || [];

    return (
        <div className="pb-16 relative">
            {/* 1. Hero Banner Slider Section */}
            {banners.length > 0 ? (
                <HeroSlider banners={banners} />
            ) : (
                /* Fallback Empty Hero spacing */
                <div className="h-[25vh] w-full" />
            )}

            {/* 2. Client-side Continue Watching History */}
            <ContinueWatching />

            {/* 3. Category Filter Badges */}
            {categories.length > 0 && (
                <div className="max-w-380 mx-auto px-4 sm:px-6 lg:px-8 my-10 relative z-20">
                    <div className="flex items-center space-x-2 mb-6 select-none">
                        <Layers className="w-4 h-4 text-primary" />
                        <h2 className="text-xs font-black uppercase tracking-wider text-foreground/45">
                            Browse by Genre
                        </h2>
                    </div>
                    <div className="flex flex-wrap gap-2.5">
                        {categories.slice(0, 12).map((cat, idx) => (
                            <Link
                                key={idx}
                                href={`/search?category=${encodeURIComponent(cat.title)}`}
                                className="group relative px-6 py-2.5 rounded-full overflow-hidden glass-card border border-glass-border flex items-center justify-center text-center transition-all duration-300 shadow-sm"
                            >
                                {/* Background thumb with low opacity */}
                                {cat.image?.url && (
                                    // eslint-disable-next-line @next/next/no-img-element
                                    <img
                                        src={cat.image.url}
                                        alt={cat.title}
                                        className="absolute inset-0 w-full h-full object-cover opacity-10 group-hover:opacity-20 group-hover:scale-105 transition-all duration-300 select-none pointer-events-none"
                                    />
                                )}
                                {/* Text overlay */}
                                <span className="font-bold text-xs text-foreground/75 group-hover:text-primary transition-colors relative z-10 select-none">
                                    {cat.title}
                                </span>
                            </Link>
                        ))}
                    </div>
                </div>
            )}

            {/* 4. Display Content Shelves (Trending, Cinema, etc.) */}
            {shelves.length > 0 ? (
                <div className="space-y-4">
                    {shelves.map((shelf, idx) => (
                        <MovieShelf
                            key={shelf.opId || idx}
                            title={shelf.title}
                            subjects={shelf.subjects}
                        />
                    ))}
                </div>
            ) : errorMsg ? (
                /* API Error UI Container */
                <div className="max-w-md mx-auto my-24 p-8 rounded-3xl glass-panel border border-glass-border text-center shadow-2xl relative z-20 select-none">
                    <Film className="w-12 h-12 text-primary mx-auto mb-4 animate-pulse" />
                    <h2 className="text-lg font-black text-foreground uppercase tracking-wider mb-2">
                        Service Temporarily Offline
                    </h2>
                    <p className="text-xs text-foreground/70 mb-6 font-medium">
                        We are experiencing problems fetching catalogs from the
                        live media backend API.
                    </p>
                    <div className="p-3 bg-primary/10 border border-primary/20 rounded-xl text-xs text-primary font-mono text-left mb-6 overflow-x-auto">
                        {errorMsg}
                    </div>
                    <Link
                        href="/"
                        className="inline-flex items-center space-x-2 bg-primary hover:bg-primary-light text-white px-5 py-3 rounded-xl font-bold text-xs uppercase tracking-wider transition-all"
                    >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Retry Connection</span>
                    </Link>
                </div>
            ) : (
                /* Loading skeleton fallback */
                <div className="max-w-380 mx-auto px-4 py-20 text-center text-foreground/50 font-bold uppercase tracking-wider text-xs animate-pulse select-none">
                    <p>Scanning Vercel media nodes...</p>
                </div>
            )}
        </div>
    );
}
