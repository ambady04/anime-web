"use client";

import { useEffect, useRef } from "react";

export default function LenisProvider() {
    const lenisRef = useRef<any>(null);

    useEffect(() => {
        let lenis: any;
        let rafId: number;

        const initLenis = async () => {
            try {
                const LenisClass = (await import("lenis")).default;
                lenis = new LenisClass({
                    duration: 1.2,
                    easing: (t: number) => Math.min(1, 1.001 - Math.pow(2, -10 * t)),
                    orientation: "vertical",
                    gestureOrientation: "vertical",
                    smoothWheel: true,
                    wheelMultiplier: 0.9,
                    touchMultiplier: 1.5,
                    infinite: false,
                    autoResize: true,
                });

                lenisRef.current = lenis;

                // Add lenis class for CSS targeting
                document.documentElement.classList.add("lenis");

                const raf = (time: number) => {
                    lenis.raf(time);
                    rafId = requestAnimationFrame(raf);
                };
                rafId = requestAnimationFrame(raf);
            } catch {
                // Lenis failed to load — fallback to native scroll (SSR safe)
            }
        };

        initLenis();

        return () => {
            cancelAnimationFrame(rafId);
            if (lenisRef.current) {
                lenisRef.current.destroy();
                document.documentElement.classList.remove("lenis");
            }
        };
    }, []);

    return null;
}
