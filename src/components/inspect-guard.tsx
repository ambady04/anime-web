"use client";

import { useEffect } from "react";

export default function InspectGuard() {
    useEffect(() => {
        // 1. Disable Right-Click Context Menu
        const handleContextMenu = (e: MouseEvent) => {
            e.preventDefault();
        };

        // 2. Disable DevTools and Source-Viewing Keyboard Shortcuts
        const handleKeyDown = (e: KeyboardEvent) => {
            // F12 (code 123)
            if (e.key === "F12" || e.keyCode === 123) {
                e.preventDefault();
                return;
            }

            const isCmdOrCtrl = e.ctrlKey || e.metaKey;
            const isAltOrOption = e.altKey;
            const isShift = e.shiftKey;

            // Ctrl+Shift+I, Ctrl+Shift+J, Ctrl+Shift+C, Ctrl+Shift+K
            // Cmd+Opt+I, Cmd+Opt+J, Cmd+Opt+C, Cmd+Opt+K
            const isInspectKey = ["I", "J", "C", "K"].includes(e.key.toUpperCase());
            if (isCmdOrCtrl && (isShift || isAltOrOption) && isInspectKey) {
                e.preventDefault();
                return;
            }

            // Ctrl+U / Cmd+U (View Source)
            if (isCmdOrCtrl && e.key.toUpperCase() === "U") {
                e.preventDefault();
                return;
            }

            // Ctrl+S / Cmd+S (Save Page)
            if (isCmdOrCtrl && e.key.toUpperCase() === "S") {
                e.preventDefault();
                return;
            }
        };

        // Action when DevTools/Inspection is active
        const handleDevToolsDetected = () => {
            try {
                // Clear page contents
                if (typeof document !== "undefined" && document.body) {
                    document.body.innerHTML = `
                        <div style="background:#0a0a0a;color:#fff;display:flex;flex-direction:column;align-items:center;justify-content:center;height:100vh;font-family:sans-serif;font-weight:bold;gap:12px;user-select:none;">
                            <span style="font-size:32px;color:#E31C25;">⚠️ ACCESS DENIED</span>
                            <span style="font-size:14px;color:rgba(255,255,255,0.6);font-weight:normal;">Developer tools are disabled to protect content.</span>
                        </div>
                    `;
                }
                // Redirect immediately to clear the Network history panel
                window.location.replace("about:blank");
            } catch (e) {}
        };

        // 3. High-Accuracy Timing-based DevTools Detector
        // If DevTools is closed, the 'debugger' statement is ignored, taking < 1ms.
        // If DevTools is open, the browser pauses, causing the delay to exceed the threshold.
        const checkDevTools = () => {
            const start = performance.now();
            
            // Trigger debugger breakpoint
            // eslint-disable-next-line no-debugger
            debugger;
            
            const end = performance.now();
            
            if (end - start > 100) {
                handleDevToolsDetected();
            }
        };

        document.addEventListener("contextmenu", handleContextMenu);
        document.addEventListener("keydown", handleKeyDown);

        // Run the timing check repeatedly every 1 second
        const detectInterval = setInterval(checkDevTools, 1000);

        // Run immediately on load
        checkDevTools();

        return () => {
            document.removeEventListener("contextmenu", handleContextMenu);
            document.removeEventListener("keydown", handleKeyDown);
            clearInterval(detectInterval);
        };
    }, []);

    return null;
}
