import { NextRequest, NextResponse } from "next/server";

export const revalidate = 86400; // cache route for 24h

// In-memory cache to persist MAL ID & filler lookups across requests in warm worker instances
interface CacheEntry {
    fillers: number[];
    malId: number;
    total: number;
    timestamp: number;
}
const fillersCache = new Map<string, CacheEntry>();
const CACHE_TTL = 24 * 60 * 60 * 1000; // 24 hours

async function jikanGet(
    url: string,
    retries = 3,
    baseDelay = 1000,
): Promise<any> {
    for (let i = 0; i < retries; i++) {
        try {
            const res = await fetch(url, {
                headers: { Accept: "application/json" },
                signal: AbortSignal.timeout(8000),
            });
            if (res.status === 429) {
                const delay = baseDelay * (i + 1) * 2 + Math.random() * 200;
                await new Promise((r) => setTimeout(r, delay));
                continue;
            }
            if (!res.ok) {
                throw new Error(`${res.status} ${url}`);
            }
            return await res.json();
        } catch (err: any) {
            if (i === retries - 1) throw err;
            const delay = baseDelay * Math.pow(1.5, i) + Math.random() * 100;
            await new Promise((r) => setTimeout(r, delay));
        }
    }
}

// AniList GraphQL fallback for resolving MAL ID when Jikan is unavailable
async function getMalIdFromAniList(title: string): Promise<number> {
    const query = `
    query ($search: String) {
      Media(search: $search, type: ANIME, format_in: [TV, TV_SHORT]) {
        idMal
      }
    }
  `;
    const res = await fetch("https://graphql.anilist.co", {
        method: "POST",
        headers: {
            "Content-Type": "application/json",
            Accept: "application/json",
        },
        body: JSON.stringify({ query, variables: { search: title } }),
        signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return 0;
    const json = await res.json();
    return json?.data?.Media?.idMal || 0;
}

export async function GET(req: NextRequest) {
    const { searchParams } = new URL(req.url);
    const title = searchParams.get("title");

    if (!title) {
        return NextResponse.json({ error: "Missing title" }, { status: 400 });
    }

    const cacheKey = title.toLowerCase().trim();
    const cached = fillersCache.get(cacheKey);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
        return NextResponse.json(
            {
                fillers: cached.fillers,
                malId: cached.malId,
                total: cached.total,
            },
            {
                headers: {
                    "Cache-Control":
                        "public, s-maxage=86400, stale-while-revalidate=3600",
                },
            },
        );
    }

    try {
        // ── 1. Resolve MAL ID (try Jikan first, fall back to AniList) ────────
        let malId = 0;

        try {
            const searchJson = await jikanGet(
                `https://api.jikan.moe/v4/anime?q=${encodeURIComponent(title)}&type=tv&limit=10`,
            );
            const results: any[] = searchJson.data || [];
            if (results.length > 0) {
                const q = title.toLowerCase().trim();
                const entry =
                    results.find(
                        (a: any) =>
                            a.title?.toLowerCase() === q ||
                            a.title_english?.toLowerCase() === q,
                    ) ||
                    results.find((a: any) => a.type === "TV") ||
                    results[0];
                malId = entry.mal_id;
            }
        } catch {
            // Jikan failed — try AniList as fallback
        }

        // Fallback to AniList if Jikan didn't return a MAL ID
        if (!malId) {
            malId = await getMalIdFromAniList(title);
        }

        if (!malId) {
            const emptyPayload = { fillers: [], malId: 0, total: 0 };
            fillersCache.set(cacheKey, {
                ...emptyPayload,
                timestamp: Date.now(),
            });
            return NextResponse.json(emptyPayload);
        }

        // ── 2. Fetch page 1 to learn total page count ────────────────────────
        const page1 = await jikanGet(
            `https://api.jikan.moe/v4/anime/${malId}/episodes?page=1`,
        );
        const totalPages: number = page1.pagination?.last_visible_page ?? 1;

        // Collect fillers from page 1
        const fillerSet = new Set<number>();
        for (const ep of page1.data ?? []) {
            if (ep.filler === true) fillerSet.add(ep.mal_id);
        }

        // ── 3. Fetch remaining pages in parallel (max 5 concurrent) ──────────
        if (totalPages > 1) {
            const remaining = Array.from(
                { length: totalPages - 1 },
                (_, i) => i + 2,
            );

            const chunkSize = 5;
            for (let i = 0; i < remaining.length; i += chunkSize) {
                const chunk = remaining.slice(i, i + chunkSize);
                const results = await Promise.allSettled(
                    chunk.map((p) =>
                        jikanGet(
                            `https://api.jikan.moe/v4/anime/${malId}/episodes?page=${p}`,
                        ),
                    ),
                );
                for (const r of results) {
                    if (r.status === "fulfilled") {
                        for (const ep of r.value.data ?? []) {
                            if (ep.filler === true) fillerSet.add(ep.mal_id);
                        }
                    }
                }
                if (i + chunkSize < remaining.length) {
                    await new Promise((r) => setTimeout(r, 300));
                }
            }
        }

        const fillers = Array.from(fillerSet).sort((a, b) => a - b);
        const resultPayload = { fillers, malId, total: fillers.length };
        fillersCache.set(cacheKey, { ...resultPayload, timestamp: Date.now() });

        return NextResponse.json(resultPayload, {
            headers: {
                "Cache-Control":
                    "public, s-maxage=86400, stale-while-revalidate=3600",
            },
        });
    } catch {
        // Return graceful fallback, do not crash
        return NextResponse.json({ fillers: [], malId: 0, total: 0 });
    }
}
