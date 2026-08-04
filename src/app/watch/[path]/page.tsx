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
        // Only fetch details server-side.
        // Stream is intentionally NOT fetched server-side because Cloudflare Worker
        // egress IPs are rate-limited (429) by the upstream CDN. The client (browser)
        // fetches streams directly from the CDN with no rate-limit issues.
        details = await movieApi.getDetails(path);
    } catch {
        // Fallback to client-side fetching in WatchClient
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
