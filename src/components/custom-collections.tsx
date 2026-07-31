"use client";

import { useEffect, useState } from "react";
import { movieApi, Subject } from "@/lib/api";
import MovieShelf from "./movie-shelf";
import { ShelfSkeleton } from "./loading-skeleton";

const CUSTOM_COLLECTIONS = [
    { title: "English Latest", fetchType: "category", query: "english" },
    { title: "Malayalam Latest", fetchType: "category", query: "malayalam" },
    { title: "DC Universe", fetchType: "search", query: "dc" },
    { title: "Marvel", fetchType: "search", query: "marvel" },
] as const;

interface CollectionData {
    title: string;
    subjects: Subject[];
    loading: boolean;
}

export default function CustomCollections() {
    const [collections, setCollections] = useState<CollectionData[]>(
        CUSTOM_COLLECTIONS.map((c) => ({
            title: c.title,
            subjects: [],
            loading: true,
        }))
    );

    useEffect(() => {
        let isMounted = true;

        async function fetchCollection(
            config: (typeof CUSTOM_COLLECTIONS)[number],
            index: number
        ) {
            try {
                let subjects: Subject[] = [];
                if (config.fetchType === "category") {
                    const data = await movieApi.getCategory(config.query, 1);
                    subjects = (data as any)?.data?.items || (data as any)?.items || [];
                } else {
                    const data = await movieApi.search(config.query, 1);
                    subjects = data.items || [];
                }

                if (isMounted) {
                    setCollections((prev) => {
                        const updated = [...prev];
                        updated[index] = {
                            title: config.title,
                            subjects: subjects.slice(0, 20),
                            loading: false,
                        };
                        return updated;
                    });
                }
            } catch (err) {
                console.error(`Failed to fetch collection: ${config.title}`, err);
                if (isMounted) {
                    setCollections((prev) => {
                        const updated = [...prev];
                        updated[index] = {
                            title: config.title,
                            subjects: [],
                            loading: false,
                        };
                        return updated;
                    });
                }
            }
        }

        CUSTOM_COLLECTIONS.forEach((config, idx) => {
            fetchCollection(config, idx);
        });

        return () => {
            isMounted = false;
        };
    }, []);

    return (
        <div className="space-y-4">
            {collections.map((col, idx) => {
                if (col.loading) {
                    return <ShelfSkeleton key={idx} count={8} showTitle={true} />;
                }
                if (col.subjects.length === 0) return null;
                return (
                    <MovieShelf
                        key={idx}
                        title={col.title}
                        subjects={col.subjects}
                    />
                );
            })}
        </div>
    );
}
