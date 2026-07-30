"use client";

import { memo } from "react";
import { motion } from "framer-motion";

/* ============================================================
   Poster Card Skeleton (2:3 ratio)
   ============================================================ */
export const PosterSkeleton = memo(function PosterSkeleton() {
    return (
        <div className="relative w-full aspect-[2/3] rounded-[20px] overflow-hidden shimmer-bg" />
    );
});

/* ============================================================
   Movie Shelf Row Skeleton
   ============================================================ */
interface ShelfSkeletonProps {
    count?: number;
    showTitle?: boolean;
}

export const ShelfSkeleton = memo(function ShelfSkeleton({
    count = 8,
    showTitle = true,
}: ShelfSkeletonProps) {
    return (
        <div className="px-4 sm:px-6 lg:px-8 my-8">
            {showTitle && (
                <div className="w-40 h-6 rounded-lg shimmer-bg mb-5" />
            )}
            <div className="flex gap-3 sm:gap-4 overflow-hidden">
                {Array.from({ length: count }).map((_, i) => (
                    <motion.div
                        key={i}
                        className="shrink-0 w-[130px] sm:w-[155px] md:w-[175px] lg:w-[195px] xl:w-[210px]"
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: i * 0.05, duration: 0.4 }}
                    >
                        <PosterSkeleton />
                    </motion.div>
                ))}
            </div>
        </div>
    );
});

/* ============================================================
   Hero Skeleton
   ============================================================ */
export const HeroSkeleton = memo(function HeroSkeleton() {
    return (
        <div className="relative w-full h-[100svh] overflow-hidden bg-card">
            <div className="shimmer-bg absolute inset-0" />
            <div className="absolute inset-0 bg-gradient-to-r from-background via-background/70 to-transparent" />
            <div className="absolute bottom-[15%] left-8 sm:left-16 space-y-4 max-w-xl">
                <div className="w-16 h-6 rounded-full shimmer-bg" />
                <div className="w-80 h-16 rounded-xl shimmer-bg" />
                <div className="space-y-2">
                    <div className="w-64 h-4 rounded shimmer-bg" />
                    <div className="w-48 h-4 rounded shimmer-bg" />
                </div>
                <div className="flex gap-3">
                    <div className="w-36 h-12 rounded-2xl shimmer-bg" />
                    <div className="w-28 h-12 rounded-2xl shimmer-bg" />
                </div>
            </div>
        </div>
    );
});

/* ============================================================
   Continue Watching Card Skeleton
   ============================================================ */
export const ContinueWatchingSkeleton = memo(function ContinueWatchingSkeleton() {
    return (
        <div className="shrink-0 w-[220px] sm:w-[260px] rounded-[20px] overflow-hidden bg-card">
            <div className="w-full aspect-video shimmer-bg" />
            <div className="p-3 space-y-2">
                <div className="w-3/4 h-4 rounded shimmer-bg" />
                <div className="w-1/2 h-3 rounded shimmer-bg" />
                <div className="w-full h-1 rounded-full shimmer-bg mt-1" />
            </div>
        </div>
    );
});
