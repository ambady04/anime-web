"use client";

import { useState, useEffect } from "react";
import { HomepageData, movieApi } from "@/lib/api";
import HeroSlider from "@/components/hero-slider";
import MovieShelf from "@/components/movie-shelf";
import ContinueWatching from "@/components/continue-watching";
import CustomCollections from "@/components/custom-collections";
import Link from "next/link";
import { Film, RefreshCw, Loader2 } from "lucide-react";

interface HomeClientProps {
    initialHomeData?: HomepageData | null;
}

export default function HomeClient({ initialHomeData }: HomeClientProps) {
    const [homeData, setHomeData] = useState<HomepageData | null>(initialHomeData || null);
    const [isLoading, setIsLoading] = useState<boolean>(!initialHomeData || !initialHomeData.operatingList || initialHomeData.operatingList.length === 0);

    useEffect(() => {
        let isMounted = true;
        async function loadHomeData() {
            if (homeData && homeData.operatingList && homeData.operatingList.length > 0) {
                setIsLoading(false);
                return;
            }
            try {
                setIsLoading(true);
                const data = await movieApi.getHome(false);
                if (isMounted && data && data.operatingList) {
                    setHomeData(data);
                }
            } catch (err) {
                console.error("HomeClient fetch error:", err);
            } finally {
                if (isMounted) setIsLoading(false);
            }
        }
        loadHomeData();
        return () => {
            isMounted = false;
        };
    }, []);

    // Extract banner section
    const bannerModule = homeData?.operatingList?.find(
        (m) => m.type === "BANNER",
    );
    const banners = bannerModule?.banner?.items || [];

    // Extract all content shelves containing subjects (Trending, Cinema, Series, Anime, etc.)
    const shelves =
        homeData?.operatingList?.filter(
            (m) =>
                m.subjects &&
                m.subjects.length > 0 &&
                m.type !== "BANNER" &&
                m.type !== "FILTER" &&
                m.type !== "CUSTOM",
        ) || [];

    return (
        <div className="pb-16 relative">
            {/* 1. Hero Banner Slider Section */}
            {banners.length > 0 ? (
                <HeroSlider banners={banners} />
            ) : (
                <div className="h-[15vh] w-full" />
            )}

            {/* 2. Client-side Continue Watching History */}
            <ContinueWatching />

            {/* 3. Display Content Shelves (Trending, Cinema, Anime, Series, etc.) */}
            {shelves.length > 0 ? (
                <div className="space-y-4">
                    {shelves.map((shelf, idx) => (
                        <MovieShelf
                            key={`${shelf.opId || "shelf"}-${idx}`}
                            title={shelf.title || "Trending Content"}
                            subjects={shelf.subjects || []}
                        />
                    ))}
                </div>
            ) : isLoading ? (
                <div className="max-w-md mx-auto my-16 p-8 rounded-3xl glass-panel border border-glass-border text-center shadow-2xl relative z-20 select-none">
                    <Loader2 className="w-12 h-12 text-primary mx-auto mb-4 animate-spin" />
                    <h2 className="text-lg font-black text-foreground uppercase tracking-wider mb-2">
                        Loading Media Catalog
                    </h2>
                    <p className="text-xs text-foreground/70 font-medium">
                        Fetching trending movies, series, and anime shelves from live mirrors...
                    </p>
                </div>
            ) : (
                <div className="max-w-md mx-auto my-16 p-8 rounded-3xl glass-panel border border-glass-border text-center shadow-2xl relative z-20 select-none">
                    <Film className="w-12 h-12 text-primary mx-auto mb-4 animate-pulse" />
                    <h2 className="text-lg font-black text-foreground uppercase tracking-wider mb-2">
                        Catalog Reloading
                    </h2>
                    <p className="text-xs text-foreground/70 mb-6 font-medium">
                        Fetching latest movies, series, and trending catalogs from live media mirrors.
                    </p>
                    <button
                        onClick={async () => {
                            setIsLoading(true);
                            try {
                                const d = await movieApi.getHome(false);
                                setHomeData(d);
                            } finally {
                                setIsLoading(false);
                            }
                        }}
                        className="inline-flex items-center space-x-2 bg-primary hover:bg-primary-light text-white px-5 py-3 rounded-xl font-bold text-xs uppercase tracking-wider transition-all cursor-pointer"
                    >
                        <RefreshCw className="w-3.5 h-3.5" />
                        <span>Refresh Catalog</span>
                    </button>
                </div>
            )}

            {/* 4. Custom Curated Collections */}
            <CustomCollections />
        </div>
    );
}
