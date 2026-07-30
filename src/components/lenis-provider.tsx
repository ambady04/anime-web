"use client";

import { useEffect, useRef } from "react";
import { usePathname } from "next/navigation";

export default function LenisProvider() {
    const lenisRef = useRef<any>(null);
    const rafIdRef = useRef<number>(0);
    const pathname = usePathname();

    // Disable Lenis on the watch/video page — Lenis intercepts wheel events
    // which breaks the video player timeline scrubber and volume control.
    const isWatchPage = pathname?.startsWith("/watch");

    useEffect(() => {
        // If we're on the watch page, destroy any existing lenis instance and bail
        if (isWatchPage) {
            cancelAnimationFrame(rafIdRef.current);
            if (lenisRef.current) {
                lenisRef.current.destroy();
                lenisRef.current = null;
                document.documentElement.classList.remove("lenis");
            }
            return;
        }

        let lenis: any;

        const initLenis = async () => {
            try {
                const LenisClass = (await import("lenis")).default;
                lenis = new LenisClass({
                    duration: 1.1,
                    easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
                    orientation: "vertical",
                    gestureOrientation: "vertical",
                    smoothWheel: true,
                    syncTouch: true,
                    autoResize: true,
                });

                lenisRef.current = lenis;
                document.documentElement.classList.add("lenis");

                const raf = (time: number) => {
                    lenis.raf(time);
                    rafIdRef.current = requestAnimationFrame(raf);
                };
                rafIdRef.current = requestAnimationFrame(raf);
            } catch {
                // Lenis unavailable — graceful fallback to native scroll
            }
        };

        initLenis();

        return () => {
            cancelAnimationFrame(rafIdRef.current);
            if (lenisRef.current) {
                lenisRef.current.destroy();
                lenisRef.current = null;
                document.documentElement.classList.remove("lenis");
            }
        };
    }, [isWatchPage]);

    return null;
}
