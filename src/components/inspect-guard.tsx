"use client";

import { useEffect } from "react";

export default function InspectGuard() {
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

        // 1. Disable Right-Click Context Menu
        const handleContextMenu = (e: MouseEvent) => {
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

        document.addEventListener("contextmenu", handleContextMenu);
        document.addEventListener("keydown", handleKeyDown);

        // REMOVED: The debugger-based DevTools detection was running every 1 second
        // and consuming significant CPU time on Vercel. The keyboard shortcut blocking
        // above provides sufficient protection without the CPU overhead.

        return () => {
            document.removeEventListener("contextmenu", handleContextMenu);
            document.removeEventListener("keydown", handleKeyDown);
        };
    }, []);

    return null;
}
