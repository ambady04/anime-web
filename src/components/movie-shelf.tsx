"use client";

import { useRef, useState, useEffect, memo, useCallback } from "react";
import { motion } from "framer-motion";
import { ChevronLeft, ChevronRight } from "lucide-react";
import MovieCard from "./movie-card";
import { Subject } from "@/lib/api";

interface MovieShelfProps {
    title: string;
    subjects: Subject[];
}

function MovieShelf({ title, subjects }: MovieShelfProps) {
    const rowRef = useRef<HTMLDivElement>(null);
    const [showLeft, setShowLeft] = useState(false);
    const [showRight, setShowRight] = useState(true);

    const checkScroll = useCallback(() => {
        if (!rowRef.current) return;
        const { scrollLeft, scrollWidth, clientWidth } = rowRef.current;
        setShowLeft(scrollLeft > 10);
        setShowRight(scrollLeft + clientWidth < scrollWidth - 15);
    }, []);

    useEffect(() => {
        const el = rowRef.current;
        if (!el) return;
        el.addEventListener("scroll", checkScroll, { passive: true });
        window.addEventListener("resize", checkScroll, { passive: true });
        checkScroll();
        return () => {
            el.removeEventListener("scroll", checkScroll);
            window.removeEventListener("resize", checkScroll);
        };
    }, [subjects, checkScroll]);



    const scroll = useCallback((dir: "left" | "right") => {
        if (!rowRef.current) return;
        const { clientWidth, scrollLeft } = rowRef.current;
        rowRef.current.scrollTo({
            left: dir === "left" ? scrollLeft - clientWidth * 0.75 : scrollLeft + clientWidth * 0.75,
            behavior: "smooth",
        });
    }, []);

    if (!subjects || subjects.length === 0) return null;

    const btnStyle = {
        background: "rgba(17,17,17,0.85)",
        border: "1px solid rgba(255,255,255,0.08)",
        backdropFilter: "blur(16px)",
        boxShadow: "0 8px 32px rgba(0,0,0,0.6)",
    };

    return (
        <section className="relative group/shelf my-6 sm:my-8 max-w-tv px-4 sm:px-6 lg:px-8 z-20">

            {/* ── Section Title ── */}
            <div className="flex items-center justify-between mb-5">
                <motion.h2
                    className="text-lg sm:text-xl md:text-2xl font-black text-white tracking-tight select-none relative section-title"
                    initial={{ opacity: 0, x: -16 }}
                    whileInView={{ opacity: 1, x: 0 }}
                    viewport={{ once: true }}
                    transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                >
                    {title}
                </motion.h2>
            </div>

            {/* ── Scroll Row ── */}
            <div className="relative flex items-center">
                {/* Left fade mask */}
                {showLeft && (
                    <div
                        className="absolute left-0 top-0 bottom-0 w-16 pointer-events-none z-10"
                        style={{ background: "linear-gradient(90deg, rgba(10,10,15,1), transparent)" }}
                    />
                )}

                {/* Right fade mask */}
                {showRight && (
                    <div
                        className="absolute right-0 top-0 bottom-0 w-16 pointer-events-none z-10"
                        style={{ background: "linear-gradient(270deg, rgba(10,10,15,1), transparent)" }}
                    />
                )}

                {/* Left Arrow */}
                <motion.button
                    onClick={() => scroll("left")}
                    className="absolute left-0 z-20 w-10 h-10 rounded-full flex items-center justify-center text-white cursor-pointer focus:outline-none"
                    style={btnStyle}
                    initial={{ opacity: 0, x: -8 }}
                    animate={{ opacity: showLeft ? 1 : 0, x: showLeft ? 0 : -8, pointerEvents: showLeft ? "auto" : "none" }}
                    whileHover={{ scale: 1.1, borderColor: "rgba(225,29,72,0.65)", color: "var(--primary)" }}
                    whileTap={{ scale: 0.92 }}
                    transition={{ duration: 0.2 }}
                    aria-label="Scroll left"
                >
                    <ChevronLeft className="w-4 h-4" />
                </motion.button>

                {/* Card Row */}
                <motion.div
                    ref={rowRef}
                    className="flex overflow-x-auto gap-3 sm:gap-4 py-3 w-full"
                    style={{ scrollSnapType: "x mandatory", scrollbarWidth: "none" }}
                    initial={{ opacity: 0, y: 16 }}
                    whileInView={{ opacity: 1, y: 0 }}
                    viewport={{ once: true, margin: "-40px" }}
                    transition={{ duration: 0.5, ease: [0.16, 1, 0.3, 1] }}
                >
                    {subjects.map((subject, index) => (
                        <div
                            key={`${subject.subjectId}-${index}`}
                            className="shrink-0 w-[130px] sm:w-[155px] md:w-[175px] lg:w-[195px] xl:w-[210px] 2xl:w-[235px] 3xl:w-[270px] 4xl:w-[320px]"
                            style={{ scrollSnapAlign: "start" }}
                        >
                            <MovieCard subject={subject} index={index} />
                        </div>
                    ))}
                </motion.div>

                {/* Right Arrow */}
                <motion.button
                    onClick={() => scroll("right")}
                    className="absolute right-0 z-20 w-10 h-10 rounded-full flex items-center justify-center text-white cursor-pointer focus:outline-none"
                    style={btnStyle}
                    initial={{ opacity: 0, x: 8 }}
                    animate={{ opacity: showRight ? 1 : 0, x: showRight ? 0 : 8, pointerEvents: showRight ? "auto" : "none" }}
                    whileHover={{ scale: 1.1, borderColor: "rgba(225,29,72,0.65)", color: "var(--primary)" }}
                    whileTap={{ scale: 0.92 }}
                    transition={{ duration: 0.2 }}
                    aria-label="Scroll right"
                >
                    <ChevronRight className="w-4 h-4" />
                </motion.button>
            </div>
        </section>
    );
}

export default memo(MovieShelf);
