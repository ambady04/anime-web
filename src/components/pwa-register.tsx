"use client";

import { useEffect } from "react";

export default function PWARegister() {
    useEffect(() => {
        if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
            return;
        }

        // Register service worker for video referrer interception & offline support
        const registerWorker = () => {
            navigator.serviceWorker
                .register("/sw.js")
                .then((reg) => {
                    reg.update();
                })
                .catch((err) => {
                    console.error("Service Worker registration failed:", err);
                });
        };

        if (document.readyState === "complete") {
            registerWorker();
        } else {
            window.addEventListener("load", registerWorker);
        }
    }, []);

    return null;
}
