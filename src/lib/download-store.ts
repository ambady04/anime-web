export interface DownloadTask {
    id: string;
    filename: string;
    progress: number; // 0 to 100
    status: "downloading" | "completed" | "failed";
    size?: number;
    downloadedBytes?: number;
    error?: string;
    cancel?: () => void;
}

type Listener = (tasks: DownloadTask[]) => void;

let listeners: Set<Listener> = new Set();
let tasks: DownloadTask[] = [];

export const downloadStore = {
    subscribe(listener: Listener) {
        listeners.add(listener);
        // Trigger initial emission on subscribe
        listener(tasks);
        return () => {
            listeners.delete(listener);
        };
    },

    getTasks() {
        return tasks;
    },

    addTask(id: string, filename: string, cancel?: () => void) {
        const newTask: DownloadTask = {
            id,
            filename,
            progress: 0,
            status: "downloading",
            cancel,
        };
        tasks = [...tasks, newTask];
        this.notify();
    },

    updateTask(id: string, updates: Partial<DownloadTask>) {
        tasks = tasks.map((t) => (t.id === id ? { ...t, ...updates } : t));
        this.notify();
    },

    removeTask(id: string) {
        tasks = tasks.filter((t) => t.id !== id);
        this.notify();
    },

    clearAll() {
        // Cancel any active tasks before clearing
        tasks.forEach((t) => {
            if (t.status === "downloading" && t.cancel) {
                t.cancel();
            }
        });
        tasks = [];
        this.notify();
    },

    notify() {
        listeners.forEach((l) => l(tasks));
    },

    async startDownload(url: string, referer: string, filename: string) {
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

        this.addTask(id, filename, cancel);

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
