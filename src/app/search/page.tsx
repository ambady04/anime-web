import { Suspense } from "react";
import nextDynamic from "next/dynamic";

// Dynamic import - search page is not critical for initial page load
const SearchClient = nextDynamic(() => import("./search-client"), {
    loading: () => (
        <div className="max-w-380 mx-auto px-4 sm:px-6 lg:px-8 py-8">
            <div className="h-10 w-64 bg-glass-card rounded-2xl animate-pulse mb-2" />
            <div className="h-4 w-96 bg-glass-card rounded-xl animate-pulse mb-8" />
            <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-6 mt-12">
                {Array.from({ length: 12 }).map((_, i) => (
                    <div
                        key={i}
                        className="rounded-2xl bg-glass-card border border-glass-border overflow-hidden animate-pulse"
                    >
                        <div className="aspect-2/3 bg-glass-panel" />
                        <div className="p-3 space-y-2">
                            <div className="h-3 bg-glass-panel rounded w-4/5" />
                            <div className="h-2.5 bg-glass-panel rounded w-1/2" />
                        </div>
                    </div>
                ))}
            </div>
        </div>
    ),
});

interface PageProps {
    searchParams: Promise<{ q?: string; category?: string }>;
}

export default async function SearchPage({ searchParams }: PageProps) {
    const { q, category } = await searchParams;

    return (
        <div className="min-h-screen">
            <Suspense
                fallback={
                    <div className="max-w-380 mx-auto px-4 sm:px-6 lg:px-8 py-8">
                        <div className="h-10 w-64 bg-glass-card rounded-2xl animate-pulse mb-2" />
                        <div className="h-4 w-96 bg-glass-card rounded-xl animate-pulse mb-8" />
                    </div>
                }
            >
                <SearchClient initialQuery={q} initialCategory={category} />
            </Suspense>
        </div>
    );
}
