import { NextRequest, NextResponse } from "next/server";

export const revalidate = 86400; // cache route for 24h

async function jikanGet(url: string): Promise<any> {
  const res = await fetch(url, { headers: { Accept: "application/json" } });
  if (!res.ok) throw new Error(`${res.status} ${url}`);
  return res.json();
}

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const title = searchParams.get("title");

  if (!title) {
    return NextResponse.json({ error: "Missing title" }, { status: 400 });
  }

  try {
    // ── 1. Resolve MAL ID ────────────────────────────────────────────────
    const searchJson = await jikanGet(
      `https://api.jikan.moe/v4/anime?q=${encodeURIComponent(title)}&type=tv&limit=10`,
    );

    const results: any[] = searchJson.data || [];
    if (results.length === 0) {
      return NextResponse.json({ fillers: [] });
    }

    const q = title.toLowerCase().trim();
    const entry =
      results.find(
        (a: any) =>
          a.title?.toLowerCase() === q || a.title_english?.toLowerCase() === q,
      ) ||
      results.find((a: any) => a.type === "TV") ||
      results[0];

    const malId: number = entry.mal_id;

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
      const remaining = Array.from({ length: totalPages - 1 }, (_, i) => i + 2);

      // Process in chunks of 5 to stay within Jikan's rate limit
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
        // Brief pause between chunks to respect rate limits
        if (i + chunkSize < remaining.length) {
          await new Promise((r) => setTimeout(r, 300));
        }
      }
    }

    const fillers = Array.from(fillerSet).sort((a, b) => a - b);

    return NextResponse.json(
      { fillers, malId, total: fillers.length },
      {
        headers: {
          "Cache-Control":
            "public, s-maxage=86400, stale-while-revalidate=3600",
        },
      },
    );
  } catch (err: any) {
    console.error("[/api/fillers]", err.message);
    return NextResponse.json({ fillers: [] });
  }
}
