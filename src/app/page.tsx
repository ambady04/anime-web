import { movieApi } from "@/lib/api";
import HeroSlider from "@/components/hero-slider";
import MovieShelf from "@/components/movie-shelf";
import ContinueWatching from "@/components/continue-watching";
import Link from "next/link";
import { Film, RefreshCw } from "lucide-react";

export const dynamic = "force-dynamic";

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
