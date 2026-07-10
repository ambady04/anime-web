import { Caption } from "@/lib/api";

export interface DownloadTask {
    id: string;
    filename: string;
    progress: number; // 0 to 100
    status: "downloading" | "completed" | "failed";
    size?: number;
    downloadedBytes?: number;
    error?: string;
    isNative?: boolean;
    cancel?: () => void;
}

type Listener = (tasks: DownloadTask[]) => void;

let listeners: Set<Listener> = new Set();
let tasks: DownloadTask[] = [];

// Load initial tasks from LocalStorage if available
if (typeof window !== "undefined") {
    try {
        const saved = localStorage.getItem("kixo_downloads");
        if (saved) {
            const parsed = JSON.parse(saved) as DownloadTask[];
            // If any task was left in "downloading" state when the tab closed/reloaded:
            // - If it is a native browser download, keep it active (since browser downloads survive reloads).
            // - If it is an in-app JS download, mark it as failed/interrupted.
            tasks = parsed.map((t) =>
                t.status === "downloading" && !t.isNative
                    ? { ...t, status: "failed", error: "Interrupted by page reload" }
                    : t
            );
        }
    } catch (e) {
        console.error("Failed to load downloads from localStorage", e);
    }
}

// Global beforeunload listener to prevent accidental page refresh during downloads
if (typeof window !== "undefined") {
    window.addEventListener("beforeunload", (event) => {
        const hasActiveDownloads = tasks.some((t) => t.status === "downloading");
        if (hasActiveDownloads) {
            event.preventDefault();
            event.returnValue = "A download is currently in progress. Refreshing or closing this page will cancel the download.";
            return event.returnValue;
        }
    });
}

export const downloadStore = {
    subscribe(listener: Listener) {
        listeners.add(listener);
        listener(tasks);
        return () => {
            listeners.delete(listener);
        };
    },

    getTasks() {
        return tasks;
    },

    addTask(id: string, filename: string, isNative: boolean = false, cancel?: () => void) {
        const newTask: DownloadTask = {
            id,
            filename,
            progress: isNative ? 100 : 0,
            status: "downloading",
            isNative,
            cancel,
        };
        tasks = [newTask, ...tasks].slice(0, 35); // limit task list history size
        this.notify();
        this.persist();
    },

    updateTask(id: string, updates: Partial<DownloadTask>) {
        tasks = tasks.map((t) => (t.id === id ? { ...t, ...updates } : t));
        this.notify();
        this.persist();
    },

    removeTask(id: string) {
        tasks = tasks.filter((t) => t.id !== id);
        this.notify();
        this.persist();
    },

    clearAll() {
        tasks.forEach((t) => {
            if (t.status === "downloading" && t.cancel) {
                t.cancel();
            }
        });
        tasks = [];
        this.notify();
        this.persist();
    },

    persist() {
        if (typeof window !== "undefined") {
            try {
                // Strip functions before saving to localStorage
                const serializable = tasks.map(({ cancel, ...rest }) => rest);
                localStorage.setItem("kixo_downloads", JSON.stringify(serializable));
            } catch (e) {
                console.error("Failed to persist downloads to localStorage", e);
            }
        }
    },

    notify() {
        listeners.forEach((l) => l(tasks));
    },

    // 1. Browser Native Download (Bypasses page reloads/closing, zero memory, very robust)
    startBrowserDownload(url: string, referer: string, filename: string, captions?: Caption[]) {
        const id = `${url}-${Date.now()}`;
        const dlUrl = `/api/video?url=${encodeURIComponent(url)}&referer=${encodeURIComponent(referer)}&mode=stream&download=true&filename=${encodeURIComponent(filename)}`;

        // Trigger standard browser download
        const a = document.createElement("a");
        a.href = dlUrl;
        a.target = "_blank";
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);

        // Add completed task entry to downloads manager
        this.addTask(id, filename, true);

        // Trigger subtitles download if available
        if (captions && captions.length > 0) {
            this.downloadSubtitles(captions, filename);
        }
    },

    async downloadSubtitles(captions: Caption[], videoFilename: string) {
        if (!captions || captions.length === 0) return;
        const baseName = videoFilename.endsWith(".mp4") ? videoFilename.slice(0, -4) : videoFilename;
        
        for (const caption of captions) {
            try {
                // Fetch subtitles via local video proxy to bypass CDN access block
                const proxyUrl = `/api/video?url=${encodeURIComponent(caption.url)}&referer=${encodeURIComponent("https://videodownloader.site/")}&mode=stream`;
                const res = await fetch(proxyUrl);
                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                
                const blob = await res.blob();
                const ext = caption.url.endsWith(".vtt") ? ".vtt" : ".srt";
                const subFilename = `${baseName}.${caption.lan}${ext}`;
                
                const blobUrl = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = blobUrl;
                a.download = subFilename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                URL.revokeObjectURL(blobUrl);
            } catch (e) {
                console.error("Failed to download subtitle:", caption.lanName, e);
            }
        }
    },

    // 2. In-App Tracked Download (Streams chunks in JS to show progress, cancels if tab closed/reloaded)
    async startDownload(url: string, referer: string, filename: string, captions?: Caption[]) {
        const id = `${url}-${Date.now()}`;
        const controller = new AbortController();

        const cancel = () => {
            try {
                controller.abort();
            } catch (e) {
                console.error("Abort failed:", e);
            }
            this.updateTask(id, { status: "failed", error: "Cancelled by user" });
        };

        this.addTask(id, filename, false, cancel);

        try {
            const dlUrl = `/api/video?url=${encodeURIComponent(url)}&referer=${encodeURIComponent(referer)}&mode=stream`;
            const response = await fetch(dlUrl, {
                signal: controller.signal,
            });

            if (!response.ok) {
                throw new Error(`Server returned HTTP ${response.status}: ${response.statusText}`);
            }

            const contentLength = response.headers.get("content-length");
            const totalBytes = contentLength ? parseInt(contentLength, 10) : 0;
            this.updateTask(id, { size: totalBytes });

            const reader = response.body?.getReader();
            if (!reader) {
                throw new Error("Response body stream is not readable.");
            }

            const chunks: Uint8Array[] = [];
            let downloadedBytes = 0;

            while (true) {
                const { done, value } = await reader.read();
                if (done) break;

                chunks.push(value);
                downloadedBytes += value.length;

                const progress = totalBytes > 0 ? Math.round((downloadedBytes / totalBytes) * 100) : 0;
                this.updateTask(id, { progress, downloadedBytes });
            }

            this.updateTask(id, { status: "completed", progress: 100 });

            // Package chunks and trigger save dialog
            const blob = new Blob(chunks as BlobPart[], { type: response.headers.get("content-type") || "video/mp4" });
            const blobUrl = URL.createObjectURL(blob);
            const a = document.createElement("a");
            a.href = blobUrl;
            a.download = filename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            
            // Release memory URL
            setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);

        } catch (error: any) {
            if (error.name === "AbortError") {
                return; // Cancel handles state update
            }
            console.error("Download failed:", error);
            this.updateTask(id, { status: "failed", error: error.message || "Unknown download error" });
        }
    }
};
