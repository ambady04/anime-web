import { movieApi } from "@/lib/api";
import WatchClient from "./watch-client";

interface PageProps {
    params: Promise<{ path: string }>;
    searchParams: Promise<{ season?: string; episode?: string }>;
}

export default async function WatchPage({ params, searchParams }: PageProps) {
    const { path } = await params;
    const { season, episode } = await searchParams;

    const parsedSeason = season ? Number(season) : 0;
    const parsedEpisode = episode ? Number(episode) : 0;

    let details = null;
    let stream = null;

    try {
        const [detailsResult, streamResult] = await Promise.allSettled([
            movieApi.getDetails(path),
            movieApi.getStream(path, parsedSeason, parsedEpisode),
        ]);
        if (detailsResult.status === "fulfilled") {
            details = detailsResult.value;
        }
        if (streamResult.status === "fulfilled") {
            stream = streamResult.value;
        }
    } catch {
        // Client-side fallback in WatchClient
    }

    return (
        <div className="min-h-screen">
            <WatchClient
                path={path}
                initialDetails={details}
                initialStream={stream}
                initialSeason={parsedSeason}
                initialEpisode={parsedEpisode}
            />
        </div>
    );
}

export const dynamic = "force-dynamic";
