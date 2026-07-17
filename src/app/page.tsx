import { movieApi, Subject } from "@/lib/api";
import HeroSlider from "@/components/hero-slider";
import MovieShelf from "@/components/movie-shelf";
import ContinueWatching from "@/components/continue-watching";
import Link from "next/link";
import { Film, RefreshCw } from "lucide-react";

export const dynamic = "force-dynamic";

// Custom curated collections to show on homepage
const CUSTOM_COLLECTIONS = [
    { title: "English Latest", fetchType: "category", query: "english" },
    { title: "Malayalam Latest", fetchType: "category", query: "malayalam" },
    { title: "DC Universe", fetchType: "search", query: "dc" },
    { title: "Marvel", fetchType: "search", query: "marvel" },
] as const;

async function fetchCollection(
    config: (typeof CUSTOM_COLLECTIONS)[number],
): Promise<{ title: string; subjects: Subject[] }> {
    try {
        if (config.fetchType === "category") {
            const data = await movieApi.getCategory(config.query, 1);
            // Category API may return data in different shapes
            const items =
                (data as any)?.data?.items || (data as any)?.items || [];
            return { title: config.title, subjects: items.slice(0, 20) };
        } else {
            const data = await movieApi.search(config.query, 1);
            return {
                title: config.title,
                subjects: (data.items || []).slice(0, 20),
            };
        }
    } catch {
        return { title: config.title, subjects: [] };
    }
}

export default async function HomePage() {
    let homeData = null;
    let errorMsg = "";

    // Fetch homepage data AND custom collections in parallel (no waterfall)
    const [homeResult, ...collectionResults] = await Promise.allSettled([
        movieApi.getHome(false),
        ...CUSTOM_COLLECTIONS.map(fetchCollection),
    ]);

    if (homeResult.status === "fulfilled") {
        homeData = homeResult.value;
    } else {
        errorMsg =
            homeResult.reason?.message || "Error loading live media catalog.";
    }

    const customCollections = collectionResults.map((r) =>
        r.status === "fulfilled"
            ? r.value
            : { title: "", subjects: [] as Subject[] },
    );

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

            {/* 3. Display Content Shelves (Trending, Cinema, etc.) */}
            {shelves.length > 0 ? (
                <div className="space-y-4">
                    {shelves.map((shelf, idx) => (
                        <MovieShelf
                            key={`${shelf.opId || "shelf"}-${idx}`}
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

            {/* 4. Custom Curated Collections (at the end) */}
            {customCollections.some((c) => c.subjects.length > 0) && (
                <div className="space-y-4">
                    {customCollections.map(
                        (collection, idx) =>
                            collection.subjects.length > 0 && (
                                <MovieShelf
                                    key={`${collection.title || "collection"}-${idx}`}
                                    title={collection.title}
                                    subjects={collection.subjects}
                                />
                            ),
                    )}
                </div>
            )}
        </div>
    );
}
