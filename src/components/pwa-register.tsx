"use client";

import { useEffect } from "react";

export default function PWARegister() {
    useEffect(() => {
        if (typeof window === "undefined" || !("serviceWorker" in navigator)) {
            return;
        }

        // In development the service worker only causes trouble: it can serve stale
        // JS/CSS chunks (Turbopack keeps chunk URLs stable while content changes),
        // making code edits appear to have no effect. So in dev we actively remove
        // any previously installed worker and wipe its caches, then bail out.
        if (process.env.NODE_ENV !== "production") {
            navigator.serviceWorker.getRegistrations().then((regs) => {
                regs.forEach((reg) => reg.unregister());
            });
            if ("caches" in window) {
                caches
                    .keys()
                    .then((keys) => keys.forEach((k) => caches.delete(k)));
            }
            return;
        }

        // Production: register the worker for offline support.
        window.addEventListener("load", () => {
            navigator.serviceWorker
                .register("/sw.js")
                .then((reg) => {
                    // Proactively check for an updated worker on each load.
                    reg.update();
                })
                .catch((err) => {
                    console.error("Service Worker registration failed:", err);
                });
        });
    }, []);

    return null;
}
