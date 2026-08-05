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

    try {
        // Stream is intentionally NOT fetched server-side because Cloudflare Worker
        // execution limits (Error 1102) and egress rate-limits trigger on upstream CDNs.
        // The client browser fetches stream links directly with 0 Cloudflare Worker limits.
        details = await movieApi.getDetails(path);
    } catch {
        // Client-side fallback in WatchClient
    }

    return (
        <div className="min-h-screen">
            <WatchClient
                path={path}
                initialDetails={details}
                initialStream={null}
                initialSeason={parsedSeason}
                initialEpisode={parsedEpisode}
            />
        </div>
    );
}

export const dynamic = "force-dynamic";
