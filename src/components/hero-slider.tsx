"use client";

import { useState, useEffect, memo, useCallback } from "react";
import Link from "next/link";
import { motion, AnimatePresence } from "framer-motion";
import {
    Play,
    Star,
    Calendar,
    Film,
    Tv,
    Info,
    ChevronRight,
} from "lucide-react";
import { BannerItem, isSeriesType } from "@/lib/api";

interface HeroSliderProps {
    banners: BannerItem[];
}

const SLIDE_INTERVAL = 9000;

const staggerContainer = {
    hidden: {},
    visible: {
        transition: { staggerChildren: 0.12, delayChildren: 0.1 },
    },
};

const staggerItem = {
    hidden: { opacity: 0, y: 28 },
    visible: {
        opacity: 1,
        y: 0,
        transition: { duration: 0.6, ease: "easeOut" as const },
    },
};

function HeroSlider({ banners }: HeroSliderProps) {
    const [current, setCurrent] = useState(0);
    const [isHovered, setIsHovered] = useState(false);

    const activeBanners = banners.filter(
        (b) => b.detailPath || (b.subject && b.subject.detailPath),
    );

    const next = useCallback(() => {
        setCurrent((prev) => (prev + 1) % activeBanners.length);
    }, [activeBanners.length]);

    const prev = useCallback(() => {
        setCurrent(
            (prev) => (prev - 1 + activeBanners.length) % activeBanners.length,
        );
    }, [activeBanners.length]);

    useEffect(() => {
        if (activeBanners.length <= 1 || isHovered) return;
        const timer = setInterval(next, SLIDE_INTERVAL);
        return () => clearInterval(timer);
    }, [activeBanners.length, isHovered, next]);

    if (activeBanners.length === 0) return null;

    const activeItem = activeBanners[current];
    const subject = activeItem.subject;
    const imageUrl = activeItem.image?.url || subject?.cover?.url || "";
    const title = subject?.title || activeItem.title || "Featured Film";
    const desc =
        subject?.description || "Experience the best cinematic streams.";
    const rating = Number(subject?.imdbRatingValue || 0);
    const rawGenre = subject?.genre;
    const genres = (
        Array.isArray(rawGenre)
            ? rawGenre
            : typeof rawGenre === "string"
              ? (rawGenre as string)
                    .split(",")
                    .map((g) => g.trim())
                    .filter(Boolean)
              : []
    ).slice(0, 3);
    const detailPath = activeItem.detailPath || subject?.detailPath || "";
    const year = subject?.releaseDate?.split("-")[0];
    const isSeries = isSeriesType(subject?.subjectType);
    const corner = subject?.corner;

    return (
        <section
            className="relative w-full overflow-hidden -mt-16"
            style={{ height: "100svh" }}
            onMouseEnter={() => setIsHovered(true)}
            onMouseLeave={() => setIsHovered(false)}
            aria-label="Featured content"
        >
            {/* ── Background image with Ken Burns zoom ── */}
            <AnimatePresence mode="sync">
                <motion.div
                    key={`bg-${current}`}
                    className="absolute inset-0"
                    initial={{ opacity: 0, scale: 1.05 }}
                    animate={{ opacity: 1, scale: 1.08 }}
                    exit={{ opacity: 0 }}
                    transition={{
                        opacity: { duration: 1, ease: "easeInOut" },
                        scale: { duration: 18, ease: "linear" },
                    }}
                >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                        src={imageUrl}
                        alt={title}
                        className="w-full h-full object-cover select-none pointer-events-none"
                        loading="eager"
                    />
                </motion.div>
            </AnimatePresence>

            {/* ── Gradient overlays ── */}
            <div className="absolute inset-0 hero-gradient-left z-10" />
            <div className="absolute inset-0 hero-gradient-bottom z-10" />
            <div className="absolute inset-0 hero-gradient-top z-10" />
            <div className="absolute inset-0 hero-vignette z-10" />

            {/* ── Ambient poster glow ── */}
            <motion.div
                key={`glow-${current}`}
                className="absolute right-0 top-0 w-2/3 h-full pointer-events-none z-10"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ duration: 1.5 }}
                style={{
                    background:
                        "radial-gradient(ellipse at 80% 40%, rgba(225,29,72,0.08) 0%, transparent 60%)",
                }}
            />

            {/* ── Content ── */}
            <div className="absolute inset-0 z-20 flex items-end pb-[10vh] sm:pb-[12vh]">
                <div className="max-w-tv px-6 sm:px-8 lg:px-12 w-full">
                    <AnimatePresence mode="wait">
                        <motion.div
                            key={`content-${current}`}
                            className="max-w-2xl"
                            variants={staggerContainer}
                            initial="hidden"
                            animate="visible"
                        >
                            {/* Corner badge / dub badge */}
                            {corner && (
                                <motion.div
                                    variants={staggerItem}
                                    className="mb-5"
                                >
                                    <span
                                        className="inline-flex items-center px-3.5 py-1.5 rounded-full text-[10px] font-black uppercase tracking-[0.15em] text-white"
                                        style={{
                                            background:
                                                "linear-gradient(135deg, var(--primary), var(--primary-dark))",
                                            boxShadow:
                                                "0 4px 16px rgba(225,29,72,0.4)",
                                        }}
                                    >
                                        {corner}
                                    </span>
                                </motion.div>
                            )}

                            {/* Title */}
                            <motion.h1
                                variants={staggerItem}
                                className="font-black text-white leading-none tracking-tight mb-4"
                                style={{
                                    fontSize: "clamp(36px, 5.5vw, 76px)",
                                    textShadow: "0 4px 40px rgba(10,10,15,0.8)",
                                }}
                            >
                                {title}
                            </motion.h1>

                            {/* Meta chips */}
                            <motion.div
                                variants={staggerItem}
                                className="flex flex-wrap items-center gap-2 mb-5"
                            >
                                {rating && rating > 0 && (
                                    <div
                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-bold"
                                        style={{
                                            background: "rgba(234,179,8,0.12)",
                                            border: "1px solid rgba(234,179,8,0.25)",
                                            color: "#EAB308",
                                        }}
                                    >
                                        <Star className="w-3 h-3 fill-current" />
                                        <span>{rating.toFixed(1)} IMDB</span>
                                    </div>
                                )}

                                {year && (
                                    <div
                                        className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-secondary"
                                        style={{
                                            background:
                                                "rgba(255,255,255,0.07)",
                                            border: "1px solid rgba(255,255,255,0.08)",
                                        }}
                                    >
                                        <Calendar className="w-3 h-3 text-primary" />
                                        {year}
                                    </div>
                                )}

                                <div
                                    className="flex items-center gap-1.5 px-3 py-1.5 rounded-full text-xs font-semibold text-secondary"
                                    style={{
                                        background: "rgba(255,255,255,0.07)",
                                        border: "1px solid rgba(255,255,255,0.08)",
                                    }}
                                >
                                    {isSeries ? (
                                        <Tv className="w-3 h-3 text-primary" />
                                    ) : (
                                        <Film className="w-3 h-3 text-primary" />
                                    )}
                                    {isSeries ? "Series" : "Movie"}
                                </div>

                                {genres.map((g) => (
                                    <div
                                        key={g}
                                        className="px-3 py-1.5 rounded-full text-xs font-semibold text-secondary"
                                        style={{
                                            background:
                                                "rgba(255,255,255,0.05)",
                                            border: "1px solid rgba(255,255,255,0.07)",
                                        }}
                                    >
                                        {g}
                                    </div>
                                ))}
                            </motion.div>

                            {/* Description */}
                            <motion.p
                                variants={staggerItem}
                                className="text-secondary text-sm sm:text-base leading-relaxed line-clamp-3 mb-8 max-w-xl"
                                style={{
                                    textShadow: "0 2px 10px rgba(10,10,15,0.9)",
                                }}
                            >
                                {desc}
                            </motion.p>

                            {/* Action Buttons */}
                            <motion.div
                                variants={staggerItem}
                                className="flex items-center gap-4 flex-wrap"
                            >
                                {/* Primary Play Button */}
                                <Link href={`/watch/${detailPath}`}>
                                    <motion.div
                                        className="relative flex items-center gap-2.5 px-7 py-3.5 rounded-2xl text-sm font-bold text-white overflow-hidden cursor-pointer select-none"
                                        style={{
                                            background:
                                                "linear-gradient(135deg, var(--primary) 0%, var(--primary-dark) 100%)",
                                            boxShadow:
                                                "0 8px 32px rgba(225,29,72,0.45), 0 2px 8px rgba(225,29,72,0.2)",
                                        }}
                                        whileHover={{
                                            scale: 1.04,
                                            boxShadow:
                                                "0 12px 48px rgba(225,29,72,0.6), 0 4px 16px rgba(225,29,72,0.3)",
                                        }}
                                        whileTap={{ scale: 0.97 }}
                                        transition={{
                                            type: "spring",
                                            stiffness: 400,
                                            damping: 20,
                                        }}
                                    >
                                        <Play className="w-4 h-4 fill-white" />
                                        <span>Watch Now</span>
                                    </motion.div>
                                </Link>

                                {/* Secondary Info Button */}
                                <Link href={`/watch/${detailPath}`}>
                                    <motion.div
                                        className="flex items-center gap-2 px-6 py-3.5 rounded-2xl text-sm font-semibold text-white cursor-pointer select-none"
                                        style={{
                                            background: "rgba(255,255,255,0.1)",
                                            border: "1px solid rgba(255,255,255,0.15)",
                                            backdropFilter: "blur(12px)",
                                        }}
                                        whileHover={{
                                            scale: 1.04,
                                            background:
                                                "rgba(255,255,255,0.15)",
                                            borderColor:
                                                "rgba(255,255,255,0.25)",
                                        }}
                                        whileTap={{ scale: 0.97 }}
                                        transition={{
                                            type: "spring",
                                            stiffness: 400,
                                            damping: 20,
                                        }}
                                    >
                                        <Info className="w-4 h-4" />
                                        <span>More Info</span>
                                    </motion.div>
                                </Link>
                            </motion.div>
                        </motion.div>
                    </AnimatePresence>
                </div>
            </div>

            {/* ── Slide Navigation ── */}
            {activeBanners.length > 1 && (
                <div className="absolute bottom-[6vh] right-6 sm:right-12 z-30 flex items-center gap-3">
                    {/* Progress pills */}
                    <div className="flex items-center gap-1.5">
                        {activeBanners.map((_, idx) => (
                            <button
                                key={idx}
                                onClick={() => setCurrent(idx)}
                                className="relative overflow-hidden rounded-full cursor-pointer focus:outline-none"
                                style={{
                                    height: 3,
                                    width: idx === current ? 28 : 8,
                                    background:
                                        idx === current
                                            ? "var(--primary)"
                                            : "rgba(255,255,255,0.2)",
                                    boxShadow:
                                        idx === current
                                            ? "0 0 10px rgba(225,29,72,0.7)"
                                            : "none",
                                    transition:
                                        "all 0.4s cubic-bezier(0.16,1,0.3,1)",
                                }}
                                aria-label={`Slide ${idx + 1}`}
                            />
                        ))}
                    </div>

                    {/* Next arrow */}
                    <motion.button
                        onClick={next}
                        whileHover={{ scale: 1.1 }}
                        whileTap={{ scale: 0.92 }}
                        className="w-9 h-9 rounded-full flex items-center justify-center text-white cursor-pointer focus:outline-none"
                        style={{
                            background: "rgba(255,255,255,0.1)",
                            border: "1px solid rgba(255,255,255,0.12)",
                            backdropFilter: "blur(12px)",
                        }}
                        aria-label="Next slide"
                    >
                        <ChevronRight className="w-4 h-4" />
                    </motion.button>
                </div>
            )}
        </section>
    );
}

export default memo(HeroSlider);
