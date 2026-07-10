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

// Vanilla TS helper to compute CRC32 checksum for ZIP headers
function crc32(data: Uint8Array): number {
    let crc = 0xffffffff;
    for (let i = 0; i < data.length; i++) {
        const byte = data[i];
        let lookup = (crc ^ byte) & 0xff;
        for (let j = 0; j < 8; j++) {
            if (lookup & 1) {
                lookup = (lookup >>> 1) ^ 0xedb88320;
            } else {
                lookup = lookup >>> 1;
            }
        }
        crc = (crc >>> 8) ^ lookup;
    }
    return (crc ^ 0xffffffff) >>> 0;
}

// Vanilla TS helper to construct a standard uncompressed ZIP archive (Store mode) in the browser
function createSimpleZip(files: { name: string; content: string }[]): Blob {
    const textEncoder = new TextEncoder();
    const parts: Uint8Array[] = [];
    const directoryHeaders: Uint8Array[] = [];
    let offset = 0;

    for (const file of files) {
        const fileData = textEncoder.encode(file.content);
        const filenameData = textEncoder.encode(file.name);
        
        // 1. Local File Header
        const localHeader = new Uint8Array(30 + filenameData.length);
        const view = new DataView(localHeader.buffer);
        
        view.setUint32(0, 0x04034b50, true); // Local file header signature
        view.setUint16(4, 10, true);         // Version needed to extract (1.0)
        view.setUint16(6, 0, true);          // General purpose bit flag
        view.setUint16(8, 0, true);          // Compression method (0 = store/uncompressed)
        view.setUint16(10, 0, true);         // Last mod file time
        view.setUint16(12, 0, true);         // Last mod file date
        
        const crc = crc32(fileData);
        view.setUint32(14, crc, true);       // CRC-32
        view.setUint32(18, fileData.length, true); // Compressed size
        view.setUint32(22, fileData.length, true); // Uncompressed size
        view.setUint16(26, filenameData.length, true); // Filename length
        view.setUint16(28, 0, true);         // Extra field length
        
        localHeader.set(filenameData, 30);
        
        parts.push(localHeader);
        parts.push(fileData);

        // 2. Central Directory File Header
        const dirHeader = new Uint8Array(46 + filenameData.length);
        const dirView = new DataView(dirHeader.buffer);
        
        dirView.setUint32(0, 0x02014b50, true); // Central file header signature
        dirView.setUint16(4, 20, true);         // Version made by
        dirView.setUint16(6, 10, true);         // Version needed to extract
        dirView.setUint16(8, 0, true);          // General purpose bit flag
        dirView.setUint16(10, 0, true);         // Compression method
        dirView.setUint16(12, 0, true);         // Last mod file time
        dirView.setUint16(14, 0, true);         // Last mod file date
        dirView.setUint32(16, crc, true);       // CRC-32
        dirView.setUint32(20, fileData.length, true); // Compressed size
        dirView.setUint32(24, fileData.length, true); // Uncompressed size
        dirView.setUint16(28, filenameData.length, true); // Filename length
        dirView.setUint16(30, 0, true);         // Extra field length
        dirView.setUint16(32, 0, true);         // File comment length
        dirView.setUint16(34, 0, true);         // Disk number start
        dirView.setUint16(36, 0, true);         // Internal file attributes
        dirView.setUint32(38, 0, true);         // External file attributes
        dirView.setUint32(42, offset, true);    // Relative offset of local header
        
        dirHeader.set(filenameData, 46);
        directoryHeaders.push(dirHeader);

        offset += localHeader.length + fileData.length;
    }

    const dirOffset = offset;
    let dirSize = 0;
    for (const h of directoryHeaders) {
        parts.push(h);
        dirSize += h.length;
    }

    // 3. End of Central Directory Record (EOCD)
    const eocd = new Uint8Array(22);
    const eocdView = new DataView(eocd.buffer);
    
    eocdView.setUint32(0, 0x06054b50, true); // End of central dir signature
    eocdView.setUint16(4, 0, true);          // Number of this disk
    eocdView.setUint16(6, 0, true);          // Disk where central directory starts
    eocdView.setUint16(8, directoryHeaders.length, true); // Number of central directory records on this disk
    eocdView.setUint16(10, directoryHeaders.length, true); // Total number of central directory records
    eocdView.setUint32(12, dirSize, true);   // Size of central directory
    eocdView.setUint32(16, dirOffset, true); // Offset of start of central directory, relative to start of archive
    eocdView.setUint16(20, 0, true);         // Comment length

    parts.push(eocd);

    return new Blob(parts as any[], { type: "application/zip" });
}

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
        const hasActiveDownloads = tasks.some((t) => t.status === "downloading" && !t.isNative);
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

    // Bundles all language subtitles into a single ZIP file and triggers a single download save dialog
    async downloadSubtitles(captions: Caption[], videoFilename: string) {
        if (!captions || captions.length === 0) return;
        const baseName = videoFilename.endsWith(".mp4") ? videoFilename.slice(0, -4) : videoFilename;
        
        try {
            const resolvedFiles: { name: string; content: string }[] = [];
            
            // Fetch subtitles content parallelly
            const fetchPromises = captions.map(async (caption) => {
                try {
                    const proxyUrl = `/api/video?url=${encodeURIComponent(caption.url)}&referer=${encodeURIComponent("https://videodownloader.site/")}&mode=stream`;
                    const res = await fetch(proxyUrl);
                    if (!res.ok) throw new Error(`HTTP ${res.status}`);
                    
                    const text = await res.text();
                    const ext = caption.url.endsWith(".vtt") ? ".vtt" : ".srt";
                    resolvedFiles.push({
                        name: `${baseName}.${caption.lan}${ext}`,
                        content: text,
                    });
                } catch (e) {
                    console.error("Failed to fetch subtitle track:", caption.lanName, e);
                }
            });
            
            await Promise.all(fetchPromises);
            
            if (resolvedFiles.length === 0) return;
            
            // Construct zip file and save natively in browser
            const zipBlob = createSimpleZip(resolvedFiles);
            const zipFilename = `${baseName}_subtitles.zip`;
            
            const blobUrl = URL.createObjectURL(zipBlob);
            const a = document.createElement("a");
            a.href = blobUrl;
            a.download = zipFilename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);
            
            setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
        } catch (e) {
            console.error("Failed to bundle subtitles into zip archive:", e);
        }
    },

    // 2. In-App Tracked Download (Streams chunks in JS to show progress, cancels if tab closed/reloaded)
    async startDownload(url: string, referer: string, filename: string, size?: number, captions?: Caption[]) {
        const id = `${url}-${Date.now()}`;
        const controller = new AbortController();

        // Trigger subtitles zip download immediately at the start of the download action
        // to separate it in time from the video blob save, avoiding browser popup/multiple-file blocks.
        if (captions && captions.length > 0) {
            this.downloadSubtitles(captions, filename);
        }

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
            const responseSize = contentLength ? parseInt(contentLength, 10) : 0;
            // Use size passed from watch client (accurate resolution size) if Content-Length is chunked/missing
            const totalBytes = size && size > 0 ? size : responseSize;
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
