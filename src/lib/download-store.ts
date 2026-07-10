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
    currentIdx?: number;
}

type Listener = (tasks: DownloadTask[]) => void;

let listeners: Set<Listener> = new Set();
let tasks: DownloadTask[] = [];

// Vanilla TS helper to compute CRC32 checksum for ZIP headers
const crcTable = new Int32Array(256);
for (let i = 0; i < 256; i++) {
    let c = i;
    for (let j = 0; j < 8; j++) {
        c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
    }
    crcTable[i] = c;
}

function crc32(data: Uint8Array): number {
    let crc = 0 ^ (-1);
    for (let i = 0; i < data.length; i++) {
        crc = (crc >>> 8) ^ crcTable[(crc ^ data[i]) & 0xff];
    }
    return (crc ^ (-1)) >>> 0;
}

// Vanilla TS helper to construct a standard uncompressed ZIP archive (Store mode) in the browser
function createSimpleZip(files: { name: string; content: Uint8Array | string }[]): Blob {
    const textEncoder = new TextEncoder();
    const parts: Uint8Array[] = [];
    const directoryHeaders: Uint8Array[] = [];
    let offset = 0;

    for (const file of files) {
        const fileData = typeof file.content === "string" ? textEncoder.encode(file.content) : file.content;
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

        const cancel = () => {
            try {
                controller.abort();
            } catch (e) {
                console.error("Abort failed:", e);
            }
            this.updateTask(id, { status: "failed", error: "Cancelled by user" });
        };

        // Add task to store immediately so the UI shows it started!
        this.addTask(id, filename, false, cancel);

        // Fetch subtitles in parallel at the start
        const subtitleFiles: { name: string; content: string }[] = [];
        const baseName = filename.endsWith(".mp4") ? filename.slice(0, -4) : filename;
        const folderName = baseName
            .replace(/_S(\d+)E(\d+)_/i, " S$1 E$2 ")
            .replace(/_/g, " ")
            .trim();

        if (captions && captions.length > 0) {
            try {
                const fetchPromises = captions.map(async (caption) => {
                    try {
                        const proxyUrl = `/api/video?url=${encodeURIComponent(caption.url)}&referer=${encodeURIComponent("https://videodownloader.site/")}&mode=stream`;
                        const res = await fetch(proxyUrl, { signal: controller.signal });
                        if (!res.ok) throw new Error(`HTTP ${res.status}`);
                        
                        const text = await res.text();
                        const ext = caption.url.endsWith(".vtt") ? ".vtt" : ".srt";
                        subtitleFiles.push({
                            name: `${folderName}/${baseName}.${caption.lan}${ext}`,
                            content: text,
                        });
                    } catch (e) {
                        console.error("Failed to fetch subtitle track:", caption.lanName, e);
                    }
                });
                await Promise.all(fetchPromises);
            } catch (e) {
                console.error("Failed to pre-download subtitles:", e);
            }
        }

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

            // If we successfully fetched subtitles, package everything into a single ZIP file
            if (subtitleFiles.length > 0) {
                const videoData = new Uint8Array(downloadedBytes);
                let offset = 0;
                for (const chunk of chunks) {
                    videoData.set(chunk, offset);
                    offset += chunk.length;
                }

                const filesToZip = [
                    {
                        name: `${folderName}/${filename}`,
                        content: videoData,
                    },
                    ...subtitleFiles
                ];

                const zipBlob = createSimpleZip(filesToZip);
                const zipFilename = `${folderName}.zip`;

                const blobUrl = URL.createObjectURL(zipBlob);
                const a = document.createElement("a");
                a.href = blobUrl;
                a.download = zipFilename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                
                setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
            } else {
                // Fallback to normal single video file download
                const blob = new Blob(chunks as BlobPart[], { type: response.headers.get("content-type") || "video/mp4" });
                const blobUrl = URL.createObjectURL(blob);
                const a = document.createElement("a");
                a.href = blobUrl;
                a.download = filename;
                document.body.appendChild(a);
                a.click();
                document.body.removeChild(a);
                
                setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);
            }

        } catch (error: any) {
            if (error.name === "AbortError") {
                return; // Cancel handles state update
            }
            console.error("Download failed:", error);
            this.updateTask(id, { status: "failed", error: error.message || "Unknown download error" });
        }
    },

    // 3. Bulk Season Download (Downloads items sequentially to avoid memory pressure and packages into one ZIP)
    async startBulkDownload(
        items: { url: string; referer: string; filename: string; size?: number; captions?: Caption[] }[],
        bulkFilename: string
    ) {
        const id = `bulk-${Date.now()}`;
        const controller = new AbortController();

        const cancel = () => {
            try {
                controller.abort();
            } catch (e) {
                console.error("Abort failed:", e);
            }
            this.updateTask(id, { status: "failed", error: "Cancelled by user" });
        };

        const totalExpectedSize = items.reduce((acc, item) => acc + (item.size || 0), 0);
        this.addTask(id, bulkFilename, false, cancel);
        this.updateTask(id, { size: totalExpectedSize });

        try {
            const filesToZip: { name: string; content: Uint8Array | string }[] = [];
            let totalDownloadedBytes = 0;

            for (let i = 0; i < items.length; i++) {
                if (controller.signal.aborted) break;

                const item = items[i];
                this.updateTask(id, { currentIdx: i });
                
                // 1. Fetch subtitles for this item in parallel
                const subtitleFiles: { name: string; content: string }[] = [];
                const baseName = item.filename.endsWith(".mp4") ? item.filename.slice(0, -4) : item.filename;
                const epFolderName = baseName
                    .replace(/_S(\d+)E(\d+)_/i, " S$1 E$2 ")
                    .replace(/_/g, " ")
                    .trim();

                const folderPrefix = `${bulkFilename.replace(/\.zip$/i, "")}/${epFolderName}`;

                if (item.captions && item.captions.length > 0) {
                    try {
                        const fetchPromises = item.captions.map(async (caption) => {
                            try {
                                const proxyUrl = `/api/video?url=${encodeURIComponent(caption.url)}&referer=${encodeURIComponent("https://videodownloader.site/")}&mode=stream`;
                                const res = await fetch(proxyUrl, { signal: controller.signal });
                                if (!res.ok) throw new Error(`HTTP ${res.status}`);
                                const text = await res.text();
                                const ext = caption.url.endsWith(".vtt") ? ".vtt" : ".srt";
                                subtitleFiles.push({
                                    name: `${folderPrefix}/${baseName}.${caption.lan}${ext}`,
                                    content: text,
                                });
                            } catch (e) {
                                console.error("Failed to fetch subtitle track:", caption.lanName, e);
                            }
                        });
                        await Promise.all(fetchPromises);
                    } catch (e) {
                        console.error("Failed to download subtitles:", e);
                    }
                }

                // 2. Fetch video file chunks
                const dlUrl = `/api/video?url=${encodeURIComponent(item.url)}&referer=${encodeURIComponent(item.referer)}&mode=stream`;
                const response = await fetch(dlUrl, {
                    signal: controller.signal,
                });

                if (!response.ok) {
                    throw new Error(`Server returned HTTP ${response.status}: ${response.statusText}`);
                }

                const contentLength = response.headers.get("content-length");
                const responseSize = contentLength ? parseInt(contentLength, 10) : 0;
                const itemSize = item.size && item.size > 0 ? item.size : responseSize;

                const reader = response.body?.getReader();
                if (!reader) {
                    throw new Error("Response body stream is not readable.");
                }

                const chunks: Uint8Array[] = [];
                let itemDownloadedBytes = 0;

                while (true) {
                    const { done, value } = await reader.read();
                    if (done) break;

                    chunks.push(value);
                    itemDownloadedBytes += value.length;
                    
                    const currentTotalDownloaded = totalDownloadedBytes + itemDownloadedBytes;
                    const progress = totalExpectedSize > 0 ? Math.round((currentTotalDownloaded / totalExpectedSize) * 100) : 0;
                    this.updateTask(id, { progress, downloadedBytes: currentTotalDownloaded, currentIdx: i });
                }

                totalDownloadedBytes += itemDownloadedBytes;

                // Concatenate video chunks
                const videoData = new Uint8Array(itemDownloadedBytes);
                let offset = 0;
                for (const chunk of chunks) {
                    videoData.set(chunk, offset);
                    offset += chunk.length;
                }

                // Add video file to ZIP entries
                filesToZip.push({
                    name: `${folderPrefix}/${item.filename}`,
                    content: videoData,
                });

                // Add subtitle files to ZIP entries
                filesToZip.push(...subtitleFiles);
            }

            if (controller.signal.aborted) return;

            this.updateTask(id, { status: "completed", progress: 100 });

            // Create single bulk ZIP file
            const zipBlob = createSimpleZip(filesToZip);
            const blobUrl = URL.createObjectURL(zipBlob);
            const a = document.createElement("a");
            a.href = blobUrl;
            a.download = bulkFilename;
            document.body.appendChild(a);
            a.click();
            document.body.removeChild(a);

            setTimeout(() => URL.revokeObjectURL(blobUrl), 10000);

        } catch (error: any) {
            if (error.name === "AbortError") {
                return;
            }
            console.error("Bulk download failed:", error);
            this.updateTask(id, { status: "failed", error: error.message || "Unknown bulk download error" });
        }
    }
};
