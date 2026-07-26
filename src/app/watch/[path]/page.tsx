import { movieApi } from "@/lib/api";
import WatchClient from "./watch-client";
import Link from "next/link";
import { AlertTriangle, ArrowLeft } from "lucide-react";

interface PageProps {
    params: Promise<{ path: string }>;
    searchParams: Promise<{ season?: string; episode?: string }>;
}

export default async function WatchPage({ params, searchParams }: PageProps) {
    const { path } = await params;
    const { season, episode } = await searchParams;

    let details = null;
    let stream = null;
    let activeSeason = 0;
    let activeEpisode = 0;
    let errorMsg = "";

    try {
        // Parse season/episode from URL params early (before waiting for details)
        const parsedSeason = season ? Number(season) : 0;
        const parsedEpisode = episode ? Number(episode) : 0;

        // Fetch details and stream in PARALLEL to eliminate waterfall.
        // If season/episode are in URL params, use them; if not (0), the backend
        // will automatically select (1, 1) for series/anime or (0, 0) for movies.
        const [detailsResult, streamResult] = await Promise.allSettled([
            movieApi.getDetails(path),
            movieApi.getStream(path, parsedSeason, parsedEpisode),
        ]);

        if (detailsResult.status === "fulfilled") {
            details = detailsResult.value;
        } else {
            throw detailsResult.reason;
        }

        // Determine actual season/episode from details
        const isSeries =
            details.subject.subjectType === 2 ||
            details.subject.subjectType === 7 ||
            details.subject.subjectType === 10;
        if (isSeries) {
            activeSeason = parsedSeason || 1;
            activeEpisode = parsedEpisode || 1;
        } else {
            activeSeason = 0;
            activeEpisode = 0;
        }

        if (streamResult.status === "fulfilled") {
            stream = streamResult.value;
        } else {
            // Stream failed but details succeeded — try once more with correct params
            stream = await movieApi.getStream(
                path,
                activeSeason,
                activeEpisode,
            );
        }
    } catch (e: any) {
        errorMsg =
            e.message || "The streaming link was rejected by media hosts.";
    }

    if (errorMsg || !details || !stream) {
        return (
            <div className="max-w-md mx-auto my-32 p-8 rounded-3xl glass-panel border border-glass-border text-center shadow-2xl relative z-20">
                <AlertTriangle className="w-12 h-12 text-yellow-500 mx-auto mb-4 animate-bounce" />
                <h2 className="text-xl font-bold text-foreground mb-2">
                    Streaming Offline
                </h2>
                <p className="text-sm text-foreground/60 mb-6">
                    This media link cannot be retrieved. It may be
                    geo-restricted or temporarily unavailable on host mirrors.
                </p>
                {errorMsg && (
                    <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400 font-mono text-left mb-6 overflow-x-auto">
                        {errorMsg}
                    </div>
                )}
                <div className="flex flex-col space-y-3">
                    <Link
                        href="/"
                        className="flex items-center justify-center space-x-2 bg-primary hover:bg-primary/95 text-white px-5 py-2.5 rounded-xl font-semibold text-sm transition-all"
                    >
                        <ArrowLeft className="w-4 h-4" />
                        <span>Return Home</span>
                    </Link>
                </div>
            </div>
        );
    }

    return (
        <div className="min-h-screen">
            <WatchClient
                path={path}
                details={details}
                stream={stream}
                activeSeason={activeSeason}
                activeEpisode={activeEpisode}
            />
        </div>
    );
}

// This page must remain dynamic - stream URLs contain expiring CDN tokens
export const dynamic = "force-dynamic";

// Reduce function execution time with shorter timeout
export const maxDuration = 30;
