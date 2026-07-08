"use client";

import { useRef, useState, useEffect } from "react";
import {
    Play,
    Pause,
    Volume2,
    VolumeX,
    Maximize,
    Minimize,
    Settings,
    Subtitles,
    Loader2,
    RotateCcw,
    Volume1,
    Maximize2,
    AlertTriangle,
    Scan,
    SkipBack,
    SkipForward,
    Headphones,
    Keyboard,
    HelpCircle,
} from "lucide-react";
import {
    StreamData,
    DownloadLink,
    Caption,
    DubModel,
    movieApi,
} from "@/lib/api";
import { localStore } from "@/lib/storage";

interface VideoPlayerProps {
    streamData: StreamData;
    title: string;
    coverUrl: string;
    detailPath: string;
    isSeries: boolean;
    season?: number;
    episode?: number;
    dubs?: DubModel[];
    onStreamRefresh?: (newStream: StreamData) => void;
    onNextEpisode?: () => void;
    onPrevEpisode?: () => void;
}

export default function VideoPlayer({
    streamData,
    title,
    coverUrl,
    detailPath,
    isSeries,
    season,
    episode,
    dubs,
    onStreamRefresh,
    onNextEpisode,
    onPrevEpisode,
}: VideoPlayerProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const audioMenuRef = useRef<HTMLDivElement>(null);
    const qualityMenuRef = useRef<HTMLDivElement>(null);
    const speedMenuRef = useRef<HTMLDivElement>(null);
    const subtitleMenuRef = useRef<HTMLDivElement>(null);
    const ratioMenuRef = useRef<HTMLDivElement>(null);

    // Stream options
    const downloads = streamData.downloads || [];
    const captions = streamData.captions || [];

    // Sort qualities from highest to lowest
    const sortedDownloads = [...downloads].sort(
        (a, b) => b.resolution - a.resolution,
    );

    // States
    const [activeDownload, setActiveDownload] = useState<DownloadLink | null>(
        null,
    );
    const [subtitleUrl, setSubtitleUrl] = useState<string>("");
    const [activeCaption, setActiveCaption] = useState<Caption | null>(null);

    const [isPlaying, setIsPlaying] = useState(false);
    const [duration, setDuration] = useState(0);
    const [currentTime, setCurrentTime] = useState(0);
    const [volume, setVolume] = useState(1);
    const [isMuted, setIsMuted] = useState(false);
    const [playbackRate, setPlaybackRate] = useState(1);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [aspectRatio, setAspectRatio] = useState<"contain" | "fill" | "cover">("contain");
    const [isAutoQuality, setIsAutoQuality] = useState(true);

    const [showControls, setShowControls] = useState(true);
    const [isLoading, setIsLoading] = useState(true);
    const [showQualityMenu, setShowQualityMenu] = useState(false);
    const [showSpeedMenu, setShowSpeedMenu] = useState(false);
    const [showSubtitleMenu, setShowSubtitleMenu] = useState(false);
    const [showRatioMenu, setShowRatioMenu] = useState(false);
    const [showSubtitles, setShowSubtitles] = useState(true);
    const [playerError, setPlayerError] = useState(false);
    const [showAudioMenu, setShowAudioMenu] = useState(false);
    const [autoRetryLabel, setAutoRetryLabel] = useState("");
    const [isRefreshing, setIsRefreshing] = useState(false);
    const [useDirectUrl, setUseDirectUrl] = useState(false);
    const [showRemaining, setShowRemaining] = useState(false);

    // Premium states
    const [showCheatSheet, setShowCheatSheet] = useState(false);
    const [showLeftSkipAnimation, setShowLeftSkipAnimation] = useState(false);
    const [showRightSkipAnimation, setShowRightSkipAnimation] = useState(false);
    const [isPiPSupported, setIsPiPSupported] = useState(false);
    const [isPiPActive, setIsPiPActive] = useState(false);

    // Track user inactivity to auto-hide controls
    const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    // Track double click state to distinguish single clicks
    const clickTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    // Track seek animation durations
    const leftSkipTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const rightSkipTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    // Track which qualities have failed so we don't re-try them
    const failedUrlsRef = useRef<Set<string>>(new Set());
    // Track URLs that failed via proxy — used to decide when to try direct
    const proxyFailedUrlsRef = useRef<Set<string>>(new Set());
    // Stall watchdog timer — fires if video stays in "loading" for too long
    const stallTimerRef = useRef<NodeJS.Timeout | null>(null);
    // Track how many times we've refreshed streams to avoid infinite loops
    const refreshCountRef = useRef(0);

    // Build the video source URL — uses proxy with referer hint, or direct CDN as fallback
    const buildVideoSrc = (url: string): string => {
        if (useDirectUrl) {
            return url; // Direct CDN URL (last resort, may work for some CDNs)
        }
        const referer =
            streamData.stream_domain || "https://videodownloader.site/";
        return `/api/video?url=${encodeURIComponent(url)}&referer=${encodeURIComponent(referer)}`;
    };

    // Initialize source on mount or stream data update
    useEffect(() => {
        // Reset failed URLs tracker and refresh counter when stream changes
        failedUrlsRef.current = new Set();
        proxyFailedUrlsRef.current = new Set();
        refreshCountRef.current = 0;
        setUseDirectUrl(false);
        setIsAutoQuality(true);

        if (sortedDownloads.length > 0) {
            // Pick 720p first (better reliability than 1080p on slow CDNs)
            // then fall to highest available if no 720p
            const defaultQuality =
                sortedDownloads.find((d) => d.resolution === 720) ||
                sortedDownloads.find((d) => d.resolution === 1080) ||
                sortedDownloads[0];
            setActiveDownload(defaultQuality);
            setIsLoading(true);
            setPlayerError(false);
            setAutoRetryLabel("");
        } else {
            setActiveDownload(null);
            if (refreshCountRef.current < 2) {
                refreshCountRef.current += 1;
                setAutoRetryLabel("Fetching fresh stream links...");
                setIsLoading(true);
                setPlayerError(false);
                refreshStreamData();
            } else {
                setIsLoading(false);
                setPlayerError(true);
                setAutoRetryLabel("");
            }
        }

        // Convert SRT to WebVTT if subtitle exists — prefer English, fallback to first available
        if (captions.length > 0) {
            const englishCaption = captions.find(
                (c) =>
                    c.lan === "en" ||
                    c.lanName?.toLowerCase().includes("english"),
            );
            const defaultCaption = englishCaption || captions[0];
            setActiveCaption(defaultCaption);
            loadSubtitleTrack(defaultCaption.url);
            setShowSubtitles(true);
        } else {
            setActiveCaption(null);
            setSubtitleUrl("");
            setShowSubtitles(false);
        }

        setIsPlaying(false);
        setShowAudioMenu(false);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [streamData]);

    // Set referrerPolicy directly on the video DOM element to bypass TypeScript's type check limit
    useEffect(() => {
        if (videoRef.current) {
            videoRef.current.setAttribute("referrerpolicy", "no-referrer");
        }
    }, [activeDownload]);

    // Check for Picture-in-Picture support
    useEffect(() => {
        if (typeof document !== "undefined") {
            setIsPiPSupported(
                document.pictureInPictureEnabled ||
                (videoRef.current && "requestPictureInPicture" in videoRef.current) ||
                false
            );
        }
    }, []);

    // Monitor Picture-in-Picture enter/leave events to synchronize isPiPActive state
    useEffect(() => {
        const videoElement = videoRef.current;
        const handleEnterPiP = () => setIsPiPActive(true);
        const handleLeavePiP = () => setIsPiPActive(false);

        if (videoElement) {
            videoElement.addEventListener("enterpictureinpicture", handleEnterPiP);
            videoElement.addEventListener("leavepictureinpicture", handleLeavePiP);
        }

        return () => {
            if (videoElement) {
                videoElement.removeEventListener("enterpictureinpicture", handleEnterPiP);
                videoElement.removeEventListener("leavepictureinpicture", handleLeavePiP);
            }
        };
    }, [activeDownload]);

    // Convert SRT to WebVTT Blob URL
    const loadSubtitleTrack = async (srtUrl: string) => {
        try {
            const res = await fetch(srtUrl);
            if (!res.ok) throw new Error("Subtitles failed to load.");
            const srtText = await res.text();

            // Simple SRT to WebVTT formatting conversion
            let vttText = "WEBVTT\n\n";
            // Replace SRT comma decimals with WebVTT periods
            vttText += srtText.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, "$1.$2");

            const blob = new Blob([vttText], { type: "text/vtt" });
            const objectUrl = URL.createObjectURL(blob);
            setSubtitleUrl(objectUrl);
        } catch (e) {
            console.error("Subtitle parse error:", e);
            setSubtitleUrl("");
        }
    };

    // Setup continue watching resume timestamp on load
    const handleLoadedMetadata = () => {
        setDuration(videoRef.current?.duration || 0);
        setIsLoading(false);
        setPlayerError(false);
        setAutoRetryLabel("");

        // Check history to resume
        const history = localStore.getHistory();
        let currentHistoryItem = history.find(
            (h) => h.detailPath === detailPath,
        );

        // Fallback: If not found, find by title/season/episode to support audio track swaps
        if (!currentHistoryItem) {
            currentHistoryItem = history.find(
                (h) =>
                    h.title === title &&
                    (!isSeries ||
                        (h.season === season && h.episode === episode)),
            );
        }

        if (currentHistoryItem && videoRef.current) {
            // Resume only if watched less than 95% and more than 5 seconds
            if (
                currentHistoryItem.progress < 95 &&
                currentHistoryItem.currentTime > 5
            ) {
                videoRef.current.currentTime = currentHistoryItem.currentTime;
            }
        }
    };

    const handlePlayerError = (e: any) => {
        if (!activeDownload) {
            setPlayerError(true);
            setIsLoading(false);
            return;
        }

        // Mark this URL as failed
        failedUrlsRef.current.add(activeDownload.url);

        // Also track proxy failures specifically
        if (!useDirectUrl) {
            proxyFailedUrlsRef.current.add(activeDownload.url);
        }

        // Try to find the next quality that hasn't failed yet
        const nextQuality = sortedDownloads.find(
            (d) => !failedUrlsRef.current.has(d.url),
        );

        if (nextQuality) {
            // Auto-switch to next quality silently
            setAutoRetryLabel(
                `Auto-switching to ${nextQuality.resolution}p...`,
            );
            setIsLoading(true);
            setActiveDownload(nextQuality);
        } else if (!useDirectUrl && sortedDownloads.length > 0) {
            // All proxy attempts failed — try direct CDN URLs as fallback
            // (bypasses proxy, may work if CDN doesn't check referer for browser requests)
            setAutoRetryLabel("Trying direct connection...");
            setIsLoading(true);
            failedUrlsRef.current = new Set(); // Reset so all qualities get tried again
            setUseDirectUrl(true);
            const best =
                sortedDownloads.find((d) => d.resolution === 720) ||
                sortedDownloads.find((d) => d.resolution === 480) ||
                sortedDownloads[0];
            setActiveDownload(null);
            setTimeout(() => setActiveDownload(best), 50);
        } else if (refreshCountRef.current < 2) {
            // All local qualities exhausted (both proxy and direct) — try fetching fresh stream URLs
            refreshCountRef.current += 1;
            setAutoRetryLabel("Fetching fresh stream links...");
            setIsLoading(true);
            setUseDirectUrl(false); // Reset to proxy mode for fresh URLs
            refreshStreamData();
        } else {
            // Everything exhausted — show error screen
            console.error(
                "Video player: all qualities, direct mode, and refreshes failed",
                e,
            );
            setPlayerError(true);
            setIsLoading(false);
            setAutoRetryLabel("");
        }
    };

    // Fetch fresh stream URLs from the API (called when all CDN URLs fail)
    const refreshStreamData = async () => {
        setIsRefreshing(true);
        try {
            const freshStream = await movieApi.getStream(
                detailPath,
                season || 0,
                episode || 0,
            );

            if (freshStream.downloads && freshStream.downloads.length > 0) {
                // Reset failed URLs and use new stream data
                failedUrlsRef.current = new Set();
                proxyFailedUrlsRef.current = new Set();
                setUseDirectUrl(false);
                setAutoRetryLabel("Fresh links found! Resuming...");

                // Notify parent if callback provided
                if (onStreamRefresh) onStreamRefresh(freshStream);

                // Pick best available quality from fresh data
                const freshSorted = [...freshStream.downloads].sort(
                    (a, b) => b.resolution - a.resolution,
                );
                const pick =
                    freshSorted.find((d) => d.resolution === 720) ||
                    freshSorted.find((d) => d.resolution === 1080) ||
                    freshSorted[0];

                setActiveDownload(null);
                setTimeout(() => setActiveDownload(pick), 50);
            } else {
                // API returned no streams
                setPlayerError(true);
                setIsLoading(false);
                setAutoRetryLabel("");
            }
        } catch (err) {
            console.error("Stream refresh failed:", err);
            setPlayerError(true);
            setIsLoading(false);
            setAutoRetryLabel("");
        } finally {
            setIsRefreshing(false);
        }
    };

    // Stall watchdog — if isLoading stays true for 10 seconds, treat it as an error
    // and auto-fallback to the next quality. This catches silent CDN timeouts on mobile.
    useEffect(() => {
        if (stallTimerRef.current) clearTimeout(stallTimerRef.current);

        if (isLoading && activeDownload && !playerError) {
            stallTimerRef.current = setTimeout(() => {
                // Only trigger if still in a loading state (not yet playing)
                if (!videoRef.current || videoRef.current.readyState < 2) {
                    handlePlayerError(new Error("Stream stall timeout"));
                }
            }, 20_000);
        }

        return () => {
            if (stallTimerRef.current) clearTimeout(stallTimerRef.current);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isLoading, activeDownload, playerError]);

    // Listen to time updates and sync progress with storage
    const handleTimeUpdate = () => {
        if (!videoRef.current) return;
        const current = videoRef.current.currentTime;
        setCurrentTime(current);

        // Save history progress every 3 seconds to avoid spamming
        if (duration > 0 && Math.floor(current) % 3 === 0) {
            const progressPercent = Math.min(
                Math.round((current / duration) * 100),
                100,
            );
            localStore.saveHistoryItem({
                detailPath,
                title,
                coverUrl,
                duration,
                currentTime: current,
                progress: progressPercent,
                isSeries,
                season,
                episode,
            });
        }

        // Mark episode as "watched" after 30 seconds of playback
        if (isSeries && season && episode && current >= 30) {
            localStore.markEpisodeWatched(detailPath, season, episode);
        }
    };

    // Save history on unmount/cleanup to capture exact progress
    useEffect(() => {
        const videoElement = videoRef.current;
        return () => {
            if (videoElement && videoElement.currentTime > 5) {
                const current = videoElement.currentTime;
                const dur = videoElement.duration || duration;
                if (dur > 0) {
                    const progressPercent = Math.min(
                        Math.round((current / dur) * 100),
                        100,
                    );
                    localStore.saveHistoryItem({
                        detailPath,
                        title,
                        coverUrl,
                        duration: dur,
                        currentTime: current,
                        progress: progressPercent,
                        isSeries,
                        season,
                        episode,
                    });
                }
            }
        };
    }, [detailPath, title, coverUrl, isSeries, season, episode, duration]);

    // Resolution selector handles video source swapping
    const handleQualityChange = (quality: DownloadLink, keepAuto = false) => {
        if (!videoRef.current || !activeDownload) return;
        if (!keepAuto) {
            setIsAutoQuality(false);
        }
        const currentPlayTime = videoRef.current.currentTime;
        const wasPlaying = !videoRef.current.paused;

        setIsLoading(true);
        setActiveDownload(quality);

        // Swap source via the proxy (not the raw CDN URL which will 403)
        videoRef.current.src = buildVideoSrc(quality.url);
        videoRef.current.load();

        // Restore timestamp
        const restoreTime = () => {
            if (videoRef.current) {
                videoRef.current.currentTime = currentPlayTime;
                if (wasPlaying) {
                    videoRef.current.play().catch(() => {});
                    setIsPlaying(true);
                }
                setIsLoading(false);
                videoRef.current.removeEventListener("canplay", restoreTime);
            }
        };

        videoRef.current.addEventListener("canplay", restoreTime);
        setShowQualityMenu(false);
    };

    const handleSubtitleChange = (caption: Caption | null) => {
        if (!caption) {
            setActiveCaption(null);
            setSubtitleUrl("");
            setShowSubtitles(false);
        } else {
            setActiveCaption(caption);
            loadSubtitleTrack(caption.url);
            setShowSubtitles(true);
        }
        setShowSubtitleMenu(false);
    };

    // Basic Playback Action
    const togglePlay = () => {
        if (!videoRef.current) return;
        if (isPlaying) {
            videoRef.current.pause();
            setIsPlaying(false);
        } else {
            videoRef.current.play().catch(() => {});
            setIsPlaying(true);
        }
    };

    // Seek bar scrubber scrubbing
    const handleScrubberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!videoRef.current) return;
        const seekTime = Number(e.target.value);
        videoRef.current.currentTime = seekTime;
        setCurrentTime(seekTime);
        triggerControlsVisibility();
    };

    // Mute volume toggle
    const toggleMute = () => {
        if (!videoRef.current) return;
        const newMutedState = !isMuted;
        videoRef.current.muted = newMutedState;
        setIsMuted(newMutedState);
    };

    // Volume slider adjustment
    const handleVolumeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
        if (!videoRef.current) return;
        const newVolume = Number(e.target.value);
        videoRef.current.volume = newVolume;
        setVolume(newVolume);
        if (newVolume === 0) {
            videoRef.current.muted = true;
            setIsMuted(true);
        } else {
            videoRef.current.muted = false;
            setIsMuted(false);
        }
    };

    // Playback speeds multiplier
    const handleSpeedChange = (rate: number) => {
        if (!videoRef.current) return;
        videoRef.current.playbackRate = rate;
        setPlaybackRate(rate);
        setShowSpeedMenu(false);
    };

    // Fullscreen implementation
    const toggleFullscreen = () => {
        if (!containerRef.current) return;
        if (!document.fullscreenElement) {
            containerRef.current
                .requestFullscreen()
                .then(() => {
                    setIsFullscreen(true);
                })
                .catch((err) => {
                    console.error("Fullscreen request failed:", err);
                });
        } else {
            document.exitFullscreen();
            setIsFullscreen(false);
        }
    };

    // Picture-in-Picture implementation
    const togglePiP = async () => {
        if (!videoRef.current) return;
        try {
            if (document.pictureInPictureElement) {
                await document.exitPictureInPicture();
                setIsPiPActive(false);
            } else {
                await videoRef.current.requestPictureInPicture();
                setIsPiPActive(true);
            }
        } catch (err) {
            console.error("PiP toggle failed:", err);
        }
    };

    // Handle single clicks on the screen
    const handleScreenClick = (e: React.MouseEvent) => {
        const clickTarget = e.target as HTMLElement;
        if (
            clickTarget.closest("button") ||
            clickTarget.closest("input") ||
            clickTarget.closest("select") ||
            clickTarget.closest(".bg-zinc-950/80") ||
            clickTarget.closest(".absolute.bottom-14")
        ) {
            return;
        }

        e.stopPropagation();

        // If a double-click timer is running, cancel it and let handleScreenDoubleClick handle it
        if (clickTimeoutRef.current) {
            clearTimeout(clickTimeoutRef.current);
            clickTimeoutRef.current = null;
            return;
        }

        // Set a timeout to delay the single click (play/pause) action
        clickTimeoutRef.current = setTimeout(() => {
            togglePlay();
            clickTimeoutRef.current = null;
        }, 220); // 220ms is fast enough to feel responsive, but slow enough to detect a double click
    };

    // Handle double clicks on the screen to toggle fullscreen or seek
    const handleScreenDoubleClick = (e: React.MouseEvent) => {
        const target = e.currentTarget as HTMLElement;
        const clickTarget = e.target as HTMLElement;
        if (
            clickTarget.closest("button") ||
            clickTarget.closest("input") ||
            clickTarget.closest("select") ||
            clickTarget.closest(".bg-zinc-950/80") ||
            clickTarget.closest(".absolute.bottom-14")
        ) {
            return;
        }

        e.stopPropagation();

        if (clickTimeoutRef.current) {
            clearTimeout(clickTimeoutRef.current);
            clickTimeoutRef.current = null;
        }

        const rect = target.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const clickRatio = x / rect.width;

        if (clickRatio < 0.35) {
            // Skip backward 10s
            if (videoRef.current) {
                videoRef.current.currentTime = Math.max(0, videoRef.current.currentTime - 10);
                setCurrentTime(videoRef.current.currentTime);
            }
            setShowLeftSkipAnimation(true);
            if (leftSkipTimeoutRef.current) clearTimeout(leftSkipTimeoutRef.current);
            leftSkipTimeoutRef.current = setTimeout(() => setShowLeftSkipAnimation(false), 800);
            triggerControlsVisibility();
        } else if (clickRatio > 0.65) {
            // Skip forward 10s
            if (videoRef.current) {
                videoRef.current.currentTime = Math.min(
                    videoRef.current.duration || 0,
                    videoRef.current.currentTime + 10,
                );
                setCurrentTime(videoRef.current.currentTime);
            }
            setShowRightSkipAnimation(true);
            if (rightSkipTimeoutRef.current) clearTimeout(rightSkipTimeoutRef.current);
            rightSkipTimeoutRef.current = setTimeout(() => setShowRightSkipAnimation(false), 800);
            triggerControlsVisibility();
        } else {
            // Double click in the middle: toggle fullscreen
            toggleFullscreen();
        }
    };

    // Handle click outside of dropdowns to close them
    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            const target = event.target as Node;
            if (audioMenuRef.current && !audioMenuRef.current.contains(target)) {
                setShowAudioMenu(false);
            }
            if (qualityMenuRef.current && !qualityMenuRef.current.contains(target)) {
                setShowQualityMenu(false);
            }
            if (speedMenuRef.current && !speedMenuRef.current.contains(target)) {
                setShowSpeedMenu(false);
            }
            if (subtitleMenuRef.current && !subtitleMenuRef.current.contains(target)) {
                setShowSubtitleMenu(false);
            }
            if (ratioMenuRef.current && !ratioMenuRef.current.contains(target)) {
                setShowRatioMenu(false);
            }
        };

        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, []);

    // Handle keyboard shortcuts
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            // Ignore shortcuts if the user is typing in form inputs
            const activeEl = document.activeElement;
            if (
                activeEl &&
                (activeEl.tagName === "INPUT" ||
                    activeEl.tagName === "TEXTAREA" ||
                    activeEl.getAttribute("contenteditable") === "true")
            ) {
                return;
            }

            if (!videoRef.current) return;

            switch (e.key.toLowerCase()) {
                case " ":
                case "spacebar":
                    e.preventDefault();
                    togglePlay();
                    break;
                case "f":
                    e.preventDefault();
                    toggleFullscreen();
                    break;
                case "arrowleft":
                    e.preventDefault();
                    videoRef.current.currentTime = Math.max(
                        0,
                        videoRef.current.currentTime - 10,
                    );
                    triggerControlsVisibility();
                    break;
                case "arrowright":
                    e.preventDefault();
                    videoRef.current.currentTime = Math.min(
                        videoRef.current.duration || 0,
                        videoRef.current.currentTime + 10,
                    );
                    triggerControlsVisibility();
                    break;
                case "arrowup":
                    e.preventDefault();
                    const newVolUp = Math.min(1, videoRef.current.volume + 0.1);
                    videoRef.current.volume = newVolUp;
                    setVolume(newVolUp);
                    if (newVolUp > 0) {
                        videoRef.current.muted = false;
                        setIsMuted(false);
                    }
                    triggerControlsVisibility();
                    break;
                case "arrowdown":
                    e.preventDefault();
                    const newVolDown = Math.max(0, videoRef.current.volume - 0.1);
                    videoRef.current.volume = newVolDown;
                    setVolume(newVolDown);
                    if (newVolDown === 0) {
                        videoRef.current.muted = true;
                        setIsMuted(true);
                    } else {
                        videoRef.current.muted = false;
                        setIsMuted(false);
                    }
                    triggerControlsVisibility();
                    break;
                case "m":
                    e.preventDefault();
                    toggleMute();
                    triggerControlsVisibility();
                    break;
                case "?":
                case "/":
                    if (e.key === "?" || e.shiftKey) {
                        e.preventDefault();
                        setShowCheatSheet((prev) => !prev);
                        triggerControlsVisibility();
                    }
                    break;
                default:
                    break;
            }
        };

        window.addEventListener("keydown", handleKeyDown);
        return () => {
            window.removeEventListener("keydown", handleKeyDown);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isPlaying, isFullscreen, volume, isMuted]);

    // Track fullscreen changes directly on document level (e.g. Escape key presses)
    useEffect(() => {
        const handleFullscreenChange = () => {
            setIsFullscreen(!!document.fullscreenElement);
        };
        document.addEventListener("fullscreenchange", handleFullscreenChange);
        return () =>
            document.removeEventListener(
                "fullscreenchange",
                handleFullscreenChange,
            );
    }, []);

    // Controls Visibility Timers
    const triggerControlsVisibility = () => {
        setShowControls(true);
        if (controlsTimeoutRef.current) {
            clearTimeout(controlsTimeoutRef.current);
        }

        // Hide controls after 1.2 seconds of inactivity while playing
        if (isPlaying) {
            controlsTimeoutRef.current = setTimeout(() => {
                setShowControls(false);
                setShowQualityMenu(false);
                setShowSpeedMenu(false);
                setShowAudioMenu(false);
                setShowSubtitleMenu(false);
                setShowRatioMenu(false);
            }, 1200);
        }
    };

    // Auto hide controls when playing, show them when paused, and clean up timers
    useEffect(() => {
        if (isPlaying) {
            setShowControls(true);
            if (controlsTimeoutRef.current) {
                clearTimeout(controlsTimeoutRef.current);
            }
            controlsTimeoutRef.current = setTimeout(() => {
                setShowControls(false);
                setShowQualityMenu(false);
                setShowSpeedMenu(false);
                setShowAudioMenu(false);
                setShowSubtitleMenu(false);
                setShowRatioMenu(false);
            }, 1200);
        } else {
            setShowControls(true);
            if (controlsTimeoutRef.current) {
                clearTimeout(controlsTimeoutRef.current);
            }
        }

        return () => {
            if (controlsTimeoutRef.current) {
                clearTimeout(controlsTimeoutRef.current);
            }
            if (clickTimeoutRef.current) {
                clearTimeout(clickTimeoutRef.current);
            }
        };
    }, [isPlaying]);

    // Format second timestamps to HH:MM:SS text
    const formatTime = (seconds: number) => {
        const hrs = Math.floor(seconds / 3600);
        const mins = Math.floor((seconds % 3600) / 60);
        const secs = Math.floor(seconds % 60);
        if (hrs > 0) {
            return `${hrs}:${mins < 10 ? "0" : ""}${mins}:${secs < 10 ? "0" : ""}${secs}`;
        }
        return `${mins}:${secs < 10 ? "0" : ""}${secs}`;
    };

    // Toggle Subtitle track display mode and disable other tracks to prevent duplicates
    useEffect(() => {
        const handleTrackChange = () => {
            if (!videoRef.current || !videoRef.current.textTracks) return;
            const tracks = videoRef.current.textTracks;
            let enabledAny = false;
            for (let i = 0; i < tracks.length; i++) {
                const track = tracks[i];
                if (showSubtitles && activeCaption) {
                    const isMatch =
                        track.language === activeCaption.lan ||
                        track.label === activeCaption.lanName;

                    if (isMatch && !enabledAny) {
                        track.mode = "showing";
                        enabledAny = true;
                    } else {
                        track.mode = "disabled";
                    }
                } else {
                    track.mode = "disabled";
                }
            }
        };

        const tracksList = videoRef.current?.textTracks;
        if (tracksList) {
            tracksList.addEventListener("addtrack", handleTrackChange);
            tracksList.addEventListener("change", handleTrackChange);
        }

        // Run initially
        handleTrackChange();

        return () => {
            if (tracksList) {
                tracksList.removeEventListener("addtrack", handleTrackChange);
                tracksList.removeEventListener("change", handleTrackChange);
            }
        };
    }, [showSubtitles, subtitleUrl, activeCaption]);

    const handleVideoEnded = () => {
        if (isSeries) {
            if (season && episode) {
                localStore.markEpisodeWatched(detailPath, season, episode);
            }
            if (onNextEpisode) {
                onNextEpisode();
            }
        }
    };

    return (
        <div
            ref={containerRef}
            onMouseMove={triggerControlsVisibility}
            onMouseLeave={() => isPlaying && setShowControls(false)}
            onClick={handleScreenClick}
            onDoubleClick={handleScreenDoubleClick}
            className={`relative w-full h-full bg-black select-none overflow-hidden group/player ${
                isPlaying && !showControls ? "cursor-none" : ""
            }`}
        >
            <style dangerouslySetInnerHTML={{ __html: `
                video.controls-visible::-webkit-media-text-track-display {
                    transform: translateY(-80px) !important;
                }
                video.controls-visible::-webkit-media-text-track-container {
                    transform: translateY(-80px) !important;
                }
                video::-webkit-media-text-track-display,
                video::-webkit-media-text-track-container {
                    transition: transform 0.25s cubic-bezier(0.4, 0, 0.2, 1) !important;
                }
                @keyframes bounceHorizontalLeft {
                    0%, 100% { transform: translateX(0); }
                    50% { transform: translateX(-6px); }
                }
                @keyframes bounceHorizontalRight {
                    0%, 100% { transform: translateX(0); }
                    50% { transform: translateX(6px); }
                }
                @keyframes pulseFast {
                    0%, 100% { opacity: 0; }
                    50% { opacity: 1; }
                }
                @keyframes fadeIn {
                    from { opacity: 0; transform: scale(0.95); }
                    to { opacity: 1; transform: scale(1); }
                }
                .animate-bounce-horizontal-left {
                    animation: bounceHorizontalLeft 0.5s infinite ease-in-out;
                }
                .animate-bounce-horizontal-right {
                    animation: bounceHorizontalRight 0.5s infinite ease-in-out;
                }
                .animate-pulse-fast {
                    animation: pulseFast 0.8s ease-in-out forwards;
                }
                .animate-fade-in {
                    animation: fadeIn 0.2s cubic-bezier(0.4, 0, 0.2, 1) forwards;
                }
            `}} />

            {/* Video Node */}
            {activeDownload && !playerError && (
                <video
                    ref={videoRef}
                    src={buildVideoSrc(activeDownload.url)}
                    onEnded={handleVideoEnded}
                    className={`w-full h-full ${showControls ? "controls-visible" : ""} ${
                        aspectRatio === "contain"
                            ? "object-contain"
                            : aspectRatio === "fill"
                              ? "object-fill"
                              : "object-cover"
                    }`}
                    onPlay={() => {
                        setIsPlaying(true);
                        setAutoRetryLabel("");
                    }}
                    onPause={() => setIsPlaying(false)}
                    onLoadedMetadata={handleLoadedMetadata}
                    onTimeUpdate={handleTimeUpdate}
                    onWaiting={() => setIsLoading(true)}
                    onPlaying={() => {
                        setIsLoading(false);
                        setAutoRetryLabel("");
                    }}
                    onError={handlePlayerError}
                    autoPlay
                    playsInline
                    preload="metadata"
                >
                    {/* Subtitle track */}
                    {subtitleUrl && activeCaption && (
                        <track
                            key={activeCaption.id || activeCaption.url}
                            kind="subtitles"
                            src={subtitleUrl}
                            srcLang={activeCaption.lan}
                            label={activeCaption.lanName}
                            default
                        />
                    )}
                </video>
            )}

            {/* Click Catcher Overlay */}
            {!playerError && (
                <div
                    className={`absolute inset-0 z-10 ${
                        isPlaying && !showControls ? "cursor-none" : "cursor-pointer"
                    }`}
                    onClick={handleScreenClick}
                    onDoubleClick={handleScreenDoubleClick}
                />
            )}

            {/* Double-Click Skip Animations */}
            {showLeftSkipAnimation && (
                <div className="absolute left-0 top-0 bottom-0 w-1/3 bg-white/5 flex flex-col items-center justify-center z-15 pointer-events-none rounded-r-full animate-pulse-fast">
                    <div className="flex flex-col items-center space-y-1.5 text-white bg-black/40 px-4 py-2.5 rounded-2xl backdrop-blur-sm">
                        <SkipBack className="w-5 h-5 fill-white animate-bounce-horizontal-left text-primary-light" />
                        <span className="text-xs font-black">-10s</span>
                    </div>
                </div>
            )}

            {showRightSkipAnimation && (
                <div className="absolute right-0 top-0 bottom-0 w-1/3 bg-white/5 flex flex-col items-center justify-center z-15 pointer-events-none rounded-l-full animate-pulse-fast">
                    <div className="flex flex-col items-center space-y-1.5 text-white bg-black/40 px-4 py-2.5 rounded-2xl backdrop-blur-sm">
                        <SkipForward className="w-5 h-5 fill-white animate-bounce-horizontal-right text-primary-light" />
                        <span className="text-xs font-black">+10s</span>
                    </div>
                </div>
            )}

            {/* Skip Intro Floating Button */}
            {isPlaying && currentTime >= 10 && currentTime <= 95 && (
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        if (videoRef.current) {
                            videoRef.current.currentTime = Math.min(
                                videoRef.current.duration || 0,
                                videoRef.current.currentTime + 85
                            );
                            setCurrentTime(videoRef.current.currentTime);
                        }
                        triggerControlsVisibility();
                    }}
                    className="absolute bottom-32 right-6 z-25 bg-zinc-950/90 border border-white/10 hover:bg-zinc-900 hover:border-white/20 text-white font-extrabold text-xs px-4 py-2.5 rounded-xl flex items-center space-x-1.5 shadow-2xl backdrop-blur-md transition-all active:scale-95 animate-fade-in cursor-pointer"
                >
                    <span>Skip Intro</span>
                    <SkipForward className="w-3.5 h-3.5 fill-white text-white" />
                </button>
            )}

            {/* Skip Outro / Next Episode Floating Button */}
            {isPlaying && isSeries && onNextEpisode && duration > 0 && currentTime >= duration - 150 && currentTime < duration - 10 && (
                <button
                    onClick={(e) => {
                        e.stopPropagation();
                        onNextEpisode();
                    }}
                    className="absolute bottom-32 right-6 z-25 bg-primary/95 border border-primary/20 hover:bg-primary text-white font-extrabold text-xs px-4 py-2.5 rounded-xl flex items-center space-x-1.5 shadow-2xl backdrop-blur-md transition-all active:scale-95 animate-fade-in cursor-pointer"
                >
                    <span>Next Episode</span>
                    <SkipForward className="w-3.5 h-3.5 fill-white text-white" />
                </button>
            )}

            {/* Loading state spinner */}
            {isLoading && (
                <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px] flex items-center justify-center z-30 pointer-events-none">
                    <Loader2 className="w-12 h-12 text-primary animate-spin" />
                </div>
            )}

            {/* Auto-retry label */}
            {autoRetryLabel && !playerError && (
                <div className="absolute inset-0 bg-black/70 backdrop-blur-sm flex flex-col items-center justify-center z-30 pointer-events-none">
                    <Loader2 className="w-10 h-10 text-primary animate-spin mb-3" />
                    <p className="text-white/80 text-xs font-bold uppercase tracking-widest">
                        {autoRetryLabel}
                    </p>
                </div>
            )}

            {/* Error state overlay */}
            {playerError && (
                <div className="absolute inset-0 bg-zinc-950 flex flex-col items-center justify-center p-6 text-center z-30">
                    <AlertTriangle className="w-14 h-14 text-yellow-500 mb-4 animate-pulse" />
                    <h3 className="text-white font-extrabold text-lg mb-2">
                        Video playback failed
                    </h3>
                    <p className="text-sm text-white/50 max-w-sm mb-6">
                        All available mirrors have been tried. This stream may
                        be temporarily unavailable — please try again later.
                    </p>
                    <button
                        onClick={() => {
                            // Full reset — clear failed URLs, reset refresh count, restart from highest quality
                            failedUrlsRef.current = new Set();
                            proxyFailedUrlsRef.current = new Set();
                            refreshCountRef.current = 0;
                            setUseDirectUrl(false);
                            setPlayerError(false);
                            setAutoRetryLabel("");
                            setIsLoading(true);
                            const best = sortedDownloads[0];
                            if (best) {
                                setActiveDownload(null);
                                setTimeout(() => setActiveDownload(best), 50);
                            } else {
                                // No downloads in current data — try fresh fetch
                                refreshStreamData();
                            }
                        }}
                        className="px-6 py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-white font-bold text-sm transition-all"
                    >
                        Retry All Mirrors
                    </button>
                </div>
            )}

            {/* Custom Overlay Controls HUD */}
            <div
                className={`absolute inset-0 bg-gradient-to-t from-black/50 via-transparent to-black/20 z-20 flex flex-col justify-between transition-opacity duration-300 ${
                    showControls
                        ? "opacity-100"
                        : "opacity-0 pointer-events-none"
                } ${isPlaying && !showControls ? "cursor-none" : ""}`}
                onClick={handleScreenClick}
                onDoubleClick={handleScreenDoubleClick}
            >
                {/* Top bar info */}
                <div className="flex items-center justify-between p-6 sm:p-8 w-full bg-gradient-to-b from-black/85 to-transparent">
                    <div className="text-white drop-shadow-md">
                        <h2 className="font-extrabold text-sm sm:text-base line-clamp-1">
                            {title}
                        </h2>
                        {isSeries && season && episode && (
                            <p className="text-[10px] sm:text-xs text-white/70 font-semibold mt-0.5">
                                Season {season} • Episode {episode}
                            </p>
                        )}
                    </div>
                </div>

                {/* Play/Pause center overlay (shows only on pause) */}
                {!isPlaying && !isLoading && (
                    <button
                        onClick={togglePlay}
                        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 rounded-full bg-primary/95 text-white flex items-center justify-center shadow-2xl transition-transform hover:scale-105 active:scale-95 z-30"
                    >
                        <Play className="w-7 h-7 fill-white translate-x-0.5" />
                    </button>
                )}

                {/* Bottom controls panel wrapped in a premium floating glass panel */}
                <div className="w-full max-w-6xl mx-auto px-4 pb-4 sm:px-6 sm:pb-6">
                    <div className="bg-zinc-950/80 backdrop-blur-md border border-white/10 rounded-2xl p-4 sm:p-5 shadow-2xl space-y-4 transition-all duration-300 hover:border-white/15">
                        {/* Timeline Seek Scrubber Track */}
                        <div className="flex items-center space-x-3">
                            <span className="text-white/80 font-mono text-xs select-none min-w-[45px] text-right">
                                {formatTime(currentTime)}
                            </span>

                            <input
                                type="range"
                                min="0"
                                max={duration || 100}
                                value={currentTime}
                                onChange={handleScrubberChange}
                                className="grow accent-primary cursor-pointer h-1 hover:h-1.5 transition-all bg-white/20 rounded-lg outline-none"
                            />

                             <span
                                onClick={() => setShowRemaining((prev) => !prev)}
                                className="text-white/60 font-mono text-xs select-none min-w-[45px] text-left cursor-pointer hover:text-white transition-colors"
                                title={showRemaining ? "Click to show duration" : "Click to show remaining time"}
                            >
                                {showRemaining
                                    ? `-${formatTime(Math.max(0, duration - currentTime))}`
                                    : formatTime(duration)}
                            </span>
                        </div>

                        {/* Controls Bar Row */}
                        <div className="flex items-center justify-between">
                            {/* Left Controls: Prev, Play, Next, Volume */}
                            <div className="flex items-center space-x-2.5 sm:space-x-3">
                                {/* Prev Episode */}
                                {isSeries && onPrevEpisode && (
                                    <button
                                        onClick={onPrevEpisode}
                                        className="p-2 rounded-xl text-white/80 hover:text-white hover:bg-white/10 transition-all focus:outline-none cursor-pointer flex items-center justify-center"
                                        title="Previous Episode"
                                    >
                                        <SkipBack className="w-4 h-4 fill-white text-white" />
                                    </button>
                                )}

                                {/* Play Pause */}
                                <button
                                    onClick={togglePlay}
                                    className="p-2 rounded-xl text-white/80 hover:text-white hover:bg-white/10 transition-all focus:outline-none cursor-pointer flex items-center justify-center"
                                >
                                    {isPlaying ? (
                                        <Pause className="w-4.5 h-4.5 fill-white" />
                                    ) : (
                                        <Play className="w-4.5 h-4.5 fill-white" />
                                    )}
                                </button>

                                {/* Next Episode */}
                                {isSeries && onNextEpisode && (
                                    <button
                                        onClick={onNextEpisode}
                                        className="p-2 rounded-xl text-white/80 hover:text-white hover:bg-white/10 transition-all focus:outline-none cursor-pointer flex items-center justify-center"
                                        title="Next Episode"
                                    >
                                        <SkipForward className="w-4 h-4 fill-white text-white" />
                                    </button>
                                )}

                                {/* Volume Panel */}
                                <div className="flex items-center space-x-2">
                                    <button
                                        onClick={toggleMute}
                                        className="p-2 rounded-xl text-white/80 hover:text-white hover:bg-white/10 transition-all focus:outline-none cursor-pointer flex items-center justify-center"
                                    >
                                        {isMuted || volume === 0 ? (
                                            <VolumeX className="w-4.5 h-4.5 text-primary" />
                                        ) : volume < 0.5 ? (
                                            <Volume1 className="w-4.5 h-4.5" />
                                        ) : (
                                            <Volume2 className="w-4.5 h-4.5" />
                                        )}
                                    </button>
                                    <input
                                        type="range"
                                        min="0"
                                        max="1"
                                        step="0.05"
                                        value={isMuted ? 0 : volume}
                                        onChange={handleVolumeChange}
                                        className="w-16 sm:w-20 accent-primary cursor-pointer h-1 bg-white/20 rounded-lg outline-none hover:bg-white/30 transition-all"
                                    />
                                </div>
                            </div>

                            {/* Right Controls: Subtitle, Audio/Dub, Speed, Quality, Screen Size, Fullscreen */}
                            <div className="flex items-center space-x-2 sm:space-x-3 relative">
                                {/* Subtitle Selector */}
                                {captions.length > 0 && (
                                    <div ref={subtitleMenuRef} className="relative">
                                        <button
                                            onClick={() => {
                                                setShowSubtitleMenu(!showSubtitleMenu);
                                                setShowQualityMenu(false);
                                                setShowSpeedMenu(false);
                                                setShowAudioMenu(false);
                                                setShowRatioMenu(false);
                                            }}
                                            className={`p-2 rounded-xl transition-all focus:outline-none cursor-pointer flex items-center justify-center hover:bg-white/10 ${
                                                showSubtitleMenu || showSubtitles
                                                    ? "text-primary bg-primary/10"
                                                    : "text-white/70 hover:text-white"
                                            }`}
                                            title="Subtitles"
                                        >
                                            <Subtitles className="w-4.5 h-4.5" />
                                        </button>

                                        {showSubtitleMenu && (
                                            <div className="absolute bottom-14 right-0 border border-zinc-800 rounded-2xl p-2.5 min-w-[130px] flex flex-col space-y-1 z-30 shadow-2xl animate-fade-in bg-zinc-950 bg-gradient-to-b from-zinc-900 to-black">
                                                <p className="text-[10px] text-white/40 px-2 py-1 font-bold">
                                                    Subtitles
                                                </p>
                                                <button
                                                    onClick={() => handleSubtitleChange(null)}
                                                    className={`text-left text-xs font-semibold px-2.5 py-1.5 rounded-lg hover:bg-white/5 transition-colors ${
                                                        !activeCaption
                                                            ? "text-primary bg-primary/10"
                                                            : "text-white/80"
                                                    }`}
                                                >
                                                    Off
                                                </button>
                                                {captions.map((caption) => (
                                                    <button
                                                        key={caption.id || caption.url}
                                                        onClick={() => handleSubtitleChange(caption)}
                                                        className={`text-left text-xs font-semibold px-2.5 py-1.5 rounded-lg hover:bg-white/5 transition-colors ${
                                                            activeCaption?.id === caption.id
                                                                ? "text-primary bg-primary/10"
                                                                : "text-white/80"
                                                        }`}
                                                    >
                                                        {caption.lanName}
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Audio/Dub selector popup */}
                                {dubs && dubs.length > 0 && (
                                    <div ref={audioMenuRef} className="relative">
                                        <button
                                            onClick={() => {
                                                setShowAudioMenu(!showAudioMenu);
                                                setShowQualityMenu(false);
                                                setShowSpeedMenu(false);
                                                setShowSubtitleMenu(false);
                                                setShowRatioMenu(false);
                                            }}
                                            className={`p-2 rounded-xl transition-all focus:outline-none cursor-pointer flex items-center justify-center hover:bg-white/10 ${
                                                showAudioMenu
                                                    ? "text-primary bg-primary/10"
                                                    : "text-white/70 hover:text-white"
                                            }`}
                                            title="Change Audio Track"
                                        >
                                            <Headphones className="w-4.5 h-4.5" />
                                        </button>

                                        {showAudioMenu && (
                                            <div className="absolute bottom-14 right-0 border border-zinc-800 rounded-2xl p-2.5 min-w-[130px] flex flex-col space-y-1 z-30 shadow-2xl animate-fade-in bg-zinc-950 bg-gradient-to-b from-zinc-900 to-black">
                                                <p className="text-[10px] text-white/40 px-2 py-1 font-bold">
                                                    Audio Track
                                                </p>
                                                {dubs.map((dub, idx) => {
                                                    const isCurrent =
                                                        detailPath ===
                                                        dub.detailPath;
                                                    return (
                                                        <button
                                                            key={idx}
                                                            onClick={() => {
                                                                setShowAudioMenu(
                                                                    false,
                                                                );
                                                                window.location.href = `/watch/${dub.detailPath}`;
                                                            }}
                                                            className={`text-left text-xs font-semibold px-2.5 py-1.5 rounded-lg hover:bg-white/5 transition-colors ${
                                                                isCurrent
                                                                    ? "text-primary bg-primary/10"
                                                                    : "text-white/80"
                                                            }`}
                                                        >
                                                            {dub.lanName}{" "}
                                                            {dub.original
                                                                ? "(Original)"
                                                                : ""}
                                                        </button>
                                                    );
                                                })}
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Quality Settings Dial Selector */}
                                <div ref={qualityMenuRef} className="relative">
                                    <button
                                        onClick={() => {
                                            setShowQualityMenu(!showQualityMenu);
                                            setShowSpeedMenu(false);
                                            setShowAudioMenu(false);
                                            setShowSubtitleMenu(false);
                                            setShowRatioMenu(false);
                                        }}
                                        className={`flex items-center space-x-1.5 font-bold text-xs px-3 py-1.5 rounded-xl border transition-all cursor-pointer ${
                                            showQualityMenu
                                                ? "bg-primary/20 text-primary-light border-primary/30"
                                                : "bg-white/5 border-white/10 text-white/80 hover:text-white hover:bg-white/10 hover:border-white/20"
                                        }`}
                                    >
                                        <span>
                                            {activeDownload
                                                ? isAutoQuality
                                                    ? `Auto (${activeDownload.resolution}p)`
                                                    : `${activeDownload.resolution}p`
                                                : "Auto"}
                                        </span>
                                        <Settings className="w-3.5 h-3.5" />
                                    </button>
 
                                    {showQualityMenu &&
                                        sortedDownloads.length > 0 && (
                                            <div className="absolute bottom-14 right-0 border border-zinc-800 rounded-2xl p-2.5 min-w-[120px] flex flex-col space-y-1 z-30 shadow-2xl animate-fade-in bg-zinc-950 bg-gradient-to-b from-zinc-900 to-black">
                                                <p className="text-[10px] text-white/40 px-2 py-1 font-bold">
                                                    Quality
                                                </p>
                                                <button
                                                    onClick={() => {
                                                        setIsAutoQuality(true);
                                                        setShowQualityMenu(false);
                                                        const defaultQuality =
                                                            sortedDownloads.find((d) => d.resolution === 720) ||
                                                            sortedDownloads.find((d) => d.resolution === 1080) ||
                                                            sortedDownloads[0];
                                                        if (defaultQuality && activeDownload?.id !== defaultQuality.id) {
                                                            handleQualityChange(defaultQuality, true);
                                                        }
                                                    }}
                                                    className={`text-left text-xs font-semibold px-2.5 py-1.5 rounded-lg hover:bg-white/5 transition-colors ${
                                                        isAutoQuality
                                                            ? "text-primary bg-primary/10"
                                                            : "text-white/80"
                                                    }`}
                                                >
                                                    Auto
                                                </button>
                                                {sortedDownloads.map((link) => (
                                                    <button
                                                        key={link.id}
                                                        onClick={() => {
                                                            handleQualityChange(link);
                                                            setShowQualityMenu(false);
                                                        }}
                                                        className={`text-left text-xs font-semibold px-2.5 py-1.5 rounded-lg hover:bg-white/5 transition-colors ${
                                                            !isAutoQuality && activeDownload?.id === link.id
                                                                ? "text-primary bg-primary/10"
                                                                : "text-white/80"
                                                        }`}
                                                    >
                                                        {link.resolution}p
                                                    </button>
                                                ))}
                                            </div>
                                        )}
                                </div>

                                {/* Speed Settings Dial Selector */}
                                <div ref={speedMenuRef} className="relative">
                                    <button
                                        onClick={() => {
                                            setShowSpeedMenu(!showSpeedMenu);
                                            setShowQualityMenu(false);
                                            setShowAudioMenu(false);
                                            setShowSubtitleMenu(false);
                                            setShowRatioMenu(false);
                                        }}
                                        className={`text-xs font-bold px-3 py-1.5 rounded-xl transition-all cursor-pointer hover:bg-white/10 ${
                                            showSpeedMenu
                                                ? "text-primary bg-primary/10"
                                                : "text-white/80 hover:text-white"
                                        }`}
                                    >
                                        {playbackRate}x
                                    </button>

                                    {showSpeedMenu && (
                                        <div className="absolute bottom-14 right-0 border border-zinc-800 rounded-2xl p-2.5 min-w-[100px] flex flex-col space-y-1 z-30 shadow-2xl animate-fade-in bg-zinc-950 bg-gradient-to-b from-zinc-900 to-black">
                                            <p className="text-[10px] text-white/40 px-2 py-1 font-bold">
                                                Speed
                                            </p>
                                            {[0.5, 0.75, 1.0, 1.25, 1.5, 2.0].map(
                                                (rate) => (
                                                    <button
                                                        key={rate}
                                                        onClick={() =>
                                                            handleSpeedChange(rate)
                                                        }
                                                        className={`text-left text-xs font-semibold px-2.5 py-1.5 rounded-lg hover:bg-white/5 transition-colors ${
                                                            playbackRate === rate
                                                                ? "text-primary bg-primary/10"
                                                                : "text-white/80"
                                                        }`}
                                                    >
                                                        {rate.toFixed(1)}x
                                                    </button>
                                                ),
                                            )}
                                        </div>
                                    )}
                                </div>

                                {/* Aspect Ratio Settings Dial Selector */}
                                <div ref={ratioMenuRef} className="relative">
                                    <button
                                        onClick={() => {
                                            setShowRatioMenu(!showRatioMenu);
                                            setShowQualityMenu(false);
                                            setShowSpeedMenu(false);
                                            setShowAudioMenu(false);
                                            setShowSubtitleMenu(false);
                                        }}
                                        className={`p-2 rounded-xl transition-all focus:outline-none cursor-pointer flex items-center justify-center hover:bg-white/10 ${
                                            showRatioMenu
                                                ? "text-primary bg-primary/10"
                                                : "text-white/70 hover:text-white"
                                        }`}
                                        title="Aspect Ratio"
                                    >
                                        <svg
                                            viewBox="0 0 24 24"
                                            fill="none"
                                            stroke="currentColor"
                                            strokeWidth="2"
                                            strokeLinecap="round"
                                            strokeLinejoin="round"
                                            className="w-4.5 h-4.5"
                                        >
                                            {/* Outer screen frame */}
                                            <rect x="3" y="5" width="18" height="14" rx="2" />
                                            {/* Diagonal scale arrows */}
                                            <path d="M 9 15 L 15 9" />
                                            <path d="M 12 9 L 15 9 L 15 12" />
                                            <path d="M 12 15 L 9 15 L 9 12" />
                                        </svg>
                                    </button>

                                    {showRatioMenu && (
                                        <div className="absolute bottom-14 right-0 border border-zinc-800 rounded-2xl p-2.5 min-w-[130px] flex flex-col space-y-1 z-30 shadow-2xl animate-fade-in bg-zinc-950 bg-gradient-to-b from-zinc-900 to-black">
                                            <p className="text-[10px] text-white/40 px-2 py-1 font-bold">
                                                Screen Size
                                            </p>
                                            <button
                                                onClick={() => {
                                                    setAspectRatio("contain");
                                                    setShowRatioMenu(false);
                                                }}
                                                className={`text-left text-xs font-semibold px-2.5 py-1.5 rounded-lg hover:bg-white/5 transition-colors ${
                                                    aspectRatio === "contain"
                                                        ? "text-primary bg-primary/10"
                                                        : "text-white/80"
                                                }`}
                                            >
                                                Fit Screen
                                            </button>
                                            <button
                                                onClick={() => {
                                                    setAspectRatio("fill");
                                                    setShowRatioMenu(false);
                                                }}
                                                className={`text-left text-xs font-semibold px-2.5 py-1.5 rounded-lg hover:bg-white/5 transition-colors ${
                                                    aspectRatio === "fill"
                                                        ? "text-primary bg-primary/10"
                                                        : "text-white/80"
                                                }`}
                                            >
                                                Stretch Screen
                                            </button>
                                            <button
                                                onClick={() => {
                                                    setAspectRatio("cover");
                                                    setShowRatioMenu(false);
                                                }}
                                                className={`text-left text-xs font-semibold px-2.5 py-1.5 rounded-lg hover:bg-white/5 transition-colors ${
                                                    aspectRatio === "cover"
                                                        ? "text-primary bg-primary/10"
                                                        : "text-white/80"
                                                }`}
                                            >
                                                Zoom / Fill
                                            </button>
                                        </div>
                                    )}
                                </div>

                                {/* Picture-in-Picture Trigger */}
                                {isPiPSupported && (
                                    <button
                                        onClick={togglePiP}
                                        className={`p-2 rounded-xl transition-all focus:outline-none cursor-pointer flex items-center justify-center hover:bg-white/10 ${
                                            isPiPActive
                                                ? "text-primary bg-primary/10"
                                                : "text-white/70 hover:text-white"
                                        }`}
                                        title="Picture-in-Picture"
                                    >
                                        <Scan className="w-4.5 h-4.5" />
                                    </button>
                                )}

                                {/* Keyboard Cheat-Sheet Trigger */}
                                <button
                                    onClick={() => {
                                        setShowCheatSheet(!showCheatSheet);
                                        setShowQualityMenu(false);
                                        setShowSpeedMenu(false);
                                        setShowAudioMenu(false);
                                        setShowSubtitleMenu(false);
                                        setShowRatioMenu(false);
                                    }}
                                    className={`p-2 rounded-xl transition-all focus:outline-none cursor-pointer flex items-center justify-center hover:bg-white/10 ${
                                        showCheatSheet
                                            ? "text-primary bg-primary/10"
                                            : "text-white/70 hover:text-white"
                                    }`}
                                    title="Keyboard Shortcuts Guide"
                                >
                                    <Keyboard className="w-4.5 h-4.5" />
                                </button>

                                {/* Fullscreen Trigger */}
                                <button
                                    onClick={toggleFullscreen}
                                    className="p-2 rounded-xl text-white/70 hover:text-white hover:bg-white/10 transition-all focus:outline-none cursor-pointer flex items-center justify-center"
                                >
                                    {isFullscreen ? (
                                        <Minimize className="w-4.5 h-4.5" />
                                    ) : (
                                        <Maximize className="w-4.5 h-4.5" />
                                    )}
                                </button>
                            </div>
                        </div>

                        {/* Hotkeys Cheat Sheet Modal */}
                        {showCheatSheet && (
                            <div
                                onClick={() => setShowCheatSheet(false)}
                                className="absolute inset-0 bg-black/80 backdrop-blur-md flex items-center justify-center z-40 p-4 animate-fade-in"
                            >
                                <div
                                    onClick={(e) => e.stopPropagation()}
                                    className="bg-zinc-900 border border-white/10 p-6 rounded-2xl max-w-md w-full shadow-2xl space-y-4 text-white"
                                >
                                    <div className="flex items-center justify-between border-b border-white/10 pb-3">
                                        <h3 className="text-sm font-extrabold uppercase tracking-widest text-primary">
                                            Keyboard Shortcuts
                                        </h3>
                                        <button
                                            onClick={() => setShowCheatSheet(false)}
                                            className="text-white/45 hover:text-white text-xs font-bold px-2.5 py-1.5 bg-white/5 hover:bg-white/10 rounded-xl transition-colors cursor-pointer"
                                        >
                                            Close
                                        </button>
                                    </div>
                                    <div className="grid grid-cols-2 gap-3 text-xs">
                                        <div className="flex justify-between items-center bg-white/5 px-3 py-2 rounded-xl">
                                            <span className="text-white/60 font-semibold">Play / Pause</span>
                                            <kbd className="bg-zinc-800 px-1.5 py-0.5 rounded border border-zinc-700 font-mono text-[10px]">Space</kbd>
                                        </div>
                                        <div className="flex justify-between items-center bg-white/5 px-3 py-2 rounded-xl">
                                            <span className="text-white/60 font-semibold">Fullscreen</span>
                                            <kbd className="bg-zinc-800 px-1.5 py-0.5 rounded border border-zinc-700 font-mono text-[10px]">F</kbd>
                                        </div>
                                        <div className="flex justify-between items-center bg-white/5 px-3 py-2 rounded-xl">
                                            <span className="text-white/60 font-semibold">Rewind 10s</span>
                                            <kbd className="bg-zinc-800 px-1.5 py-0.5 rounded border border-zinc-700 font-mono text-[10px]">←</kbd>
                                        </div>
                                        <div className="flex justify-between items-center bg-white/5 px-3 py-2 rounded-xl">
                                            <span className="text-white/60 font-semibold">Forward 10s</span>
                                            <kbd className="bg-zinc-800 px-1.5 py-0.5 rounded border border-zinc-700 font-mono text-[10px]">→</kbd>
                                        </div>
                                        <div className="flex justify-between items-center bg-white/5 px-3 py-2 rounded-xl">
                                            <span className="text-white/60 font-semibold">Volume Up</span>
                                            <kbd className="bg-zinc-800 px-1.5 py-0.5 rounded border border-zinc-700 font-mono text-[10px]">↑</kbd>
                                        </div>
                                        <div className="flex justify-between items-center bg-white/5 px-3 py-2 rounded-xl">
                                            <span className="text-white/60 font-semibold">Volume Down</span>
                                            <kbd className="bg-zinc-800 px-1.5 py-0.5 rounded border border-zinc-700 font-mono text-[10px]">↓</kbd>
                                        </div>
                                        <div className="flex justify-between items-center bg-white/5 px-3 py-2 rounded-xl">
                                            <span className="text-white/60 font-semibold">Mute Toggle</span>
                                            <kbd className="bg-zinc-800 px-1.5 py-0.5 rounded border border-zinc-700 font-mono text-[10px]">M</kbd>
                                        </div>
                                        <div className="flex justify-between items-center bg-white/5 px-3 py-2 rounded-xl">
                                            <span className="text-white/60 font-semibold">Hotkeys Menu</span>
                                            <kbd className="bg-zinc-800 px-1.5 py-0.5 rounded border border-zinc-700 font-mono text-[10px]">?</kbd>
                                        </div>
                                    </div>
                                    <p className="text-[10px] text-white/40 text-center font-medium pt-2">
                                        Tip: You can also double-click left/right side of the video to seek 10s.
                                    </p>
                                </div>
                            </div>
                        )}
                    </div>
                </div>
            </div>
        </div>
    );
}
