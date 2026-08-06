"use client";

import { useEffect, useState } from "react";

export default function InspectGuard() {
    const [isDevToolsOpen, setIsDevToolsOpen] = useState(false);

    useEffect(() => {
        // Bypass inspect guard on mobile and tablet devices
        const isMobileOrTablet = () => {
            if (
                typeof window === "undefined" ||
                typeof navigator === "undefined"
            ) {
                return false;
            }
            const hasTouch =
                navigator.maxTouchPoints > 0 || "ontouchstart" in window;
            const isSmallScreen = window.innerWidth < 1024;
            const isMobileUA =
                /iphone|ipad|ipod|android|blackberry|mini|windows\sphone|iemobile/i.test(
                    navigator.userAgent.toLowerCase(),
                );
            return hasTouch || isSmallScreen || isMobileUA;
        };

        if (isMobileOrTablet()) {
            return;
        }

        // 1. Disable Right-Click Context Menu (except for episode buttons / interactive elements)
        const handleContextMenu = (e: MouseEvent) => {
            const target = e.target as HTMLElement | null;
            if (
                target?.closest &&
                (target.closest(".episode-btn") ||
                    target.closest("[data-allow-contextmenu]"))
            ) {
                return;
            }
            e.preventDefault();
        };

        // 2. Disable DevTools and Source-Viewing Keyboard Shortcuts
        const handleKeyDown = (e: KeyboardEvent) => {
            if (e.key === "F12" || e.keyCode === 123) {
                e.preventDefault();
                return;
            }

            const isCmdOrCtrl = e.ctrlKey || e.metaKey;
            const isAltOrOption = e.altKey;
            const isShift = e.shiftKey;

            const isInspectKey = ["I", "J", "C", "K"].includes(
                e.key.toUpperCase(),
            );
            if (isCmdOrCtrl && (isShift || isAltOrOption) && isInspectKey) {
                e.preventDefault();
                return;
            }

            if (isCmdOrCtrl && e.key.toUpperCase() === "U") {
                e.preventDefault();
                return;
            }

            if (isCmdOrCtrl && e.key.toUpperCase() === "S") {
                e.preventDefault();
                return;
            }
        };

        // 3. Low-overhead DevTools detection (window size delta & timing check)
        const checkDevTools = () => {
            const widthThreshold = window.outerWidth - window.innerWidth > 160;
            const heightThreshold = window.outerHeight - window.innerHeight > 160;
            
            if (widthThreshold || heightThreshold) {
                setIsDevToolsOpen(true);
                return;
            }

            // Fallback timing check
            const start = performance.now();
            // eslint-disable-next-line no-debugger
            debugger;
            const duration = performance.now() - start;
            if (duration > 100) {
                setIsDevToolsOpen(true);
            } else {
                setIsDevToolsOpen(false);
            }
        };

        document.addEventListener("contextmenu", handleContextMenu);
        document.addEventListener("keydown", handleKeyDown);
        window.addEventListener("resize", checkDevTools);

        const checkInterval = setInterval(checkDevTools, 2000);

        return () => {
            document.removeEventListener("contextmenu", handleContextMenu);
            document.removeEventListener("keydown", handleKeyDown);
            window.removeEventListener("resize", checkDevTools);
            clearInterval(checkInterval);
        };
    }, []);

    if (isDevToolsOpen) {
        return (
            <div className="fixed inset-0 z-[99999] bg-black/95 backdrop-blur-xl flex flex-col items-center justify-center p-6 text-center select-none">
                <div className="w-16 h-16 rounded-full bg-red-500/10 border border-red-500/20 flex items-center justify-center mb-4 animate-pulse">
                    <svg className="w-8 h-8 text-red-500" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 9v2m0 4h.01m-6.938 4h13.856c1.54 0 2.502-1.667 1.732-3L13.732 4c-.77-1.333-2.694-1.333-3.464 0L3.34 16c-.77 1.333.192 3 1.732 3z" />
                    </svg>
                </div>
                <h2 className="text-2xl font-bold text-white mb-2">Inspection Guard Active</h2>
                <p className="text-zinc-400 text-sm max-w-md mb-6">
                    Developer tools and element inspection are restricted to protect copyrighted media content. Please close developer tools to resume streaming.
                </p>
            </div>
        );
    }

    return null;
}

