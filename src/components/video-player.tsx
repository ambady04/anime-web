"use client";

import { useRef, useState, useEffect, useMemo, useCallback } from "react";
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
    HelpCircle,
    PictureInPicture2,
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
    seriesDetailPath?: string;
    isSeries: boolean;
    season?: number;
    episode?: number;
    dubs?: DubModel[];
    onStreamRefresh?: (newStream: StreamData) => void;
    onNextEpisode?: () => void;
    onPrevEpisode?: () => void;
    shouldPause?: boolean;
}

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

export default function VideoPlayer({
    streamData,
    title,
    coverUrl,
    detailPath,
    seriesDetailPath,
    isSeries,
    season,
    episode,
    dubs,
    onStreamRefresh,
    onNextEpisode,
    onPrevEpisode,
    shouldPause,
}: VideoPlayerProps) {
    const videoRef = useRef<HTMLVideoElement>(null);
    const containerRef = useRef<HTMLDivElement>(null);
    const audioMenuRef = useRef<HTMLDivElement>(null);
    const qualityMenuRef = useRef<HTMLDivElement>(null);
    const qualityMenuMobileRef = useRef<HTMLDivElement>(null);
    const speedMenuRef = useRef<HTMLDivElement>(null);
    const subtitleMenuRef = useRef<HTMLDivElement>(null);
    const ratioMenuRef = useRef<HTMLDivElement>(null);
    const scrubbingTimeRef = useRef<number>(0);
    const transientRetryCountRef = useRef<number>(0);

    // Stream options
    // Memoize derived arrays from streamData to stabilize references across renders
    const downloads = useMemo(
        () => streamData.downloads || [],
        [streamData.downloads],
    );
    const captions = useMemo(
        () => streamData.captions || [],
        [streamData.captions],
    );

    // Sort qualities from highest to lowest
    const sortedDownloads = useMemo(() => {
        return [...downloads].sort((a, b) => b.resolution - a.resolution);
    }, [downloads]);

    // States
    const [activeDownload, setActiveDownload] = useState<DownloadLink | null>(
        null,
    );
    const [subtitleUrl, setSubtitleUrl] = useState<string>("");
    const [activeCaption, setActiveCaption] = useState<Caption | null>(null);

    const [isPlaying, setIsPlaying] = useState(false);
    const [isScrubbing, setIsScrubbing] = useState(false);
    const [duration, setDuration] = useState(0);
    const [currentTime, setCurrentTime] = useState(0);
    const [bufferedPercent, setBufferedPercent] = useState(0);
    const [volume, setVolume] = useState(1);
    const [isMuted, setIsMuted] = useState(false);
    const [playbackRate, setPlaybackRate] = useState(1);
    const [isFullscreen, setIsFullscreen] = useState(false);
    const [aspectRatio, setAspectRatio] = useState<
        "contain" | "fill" | "cover"
    >("contain");
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
    const [showRemaining, setShowRemaining] = useState(false);

    // ─── Native-style 3-flag playback pattern ───
    // Mirrors VideoPlayer.js: isVideoLoaded + initialSeekTime + isInitialSeekDone
    const [isVideoLoaded, setIsVideoLoaded] = useState(false);
    const [initialSeekTime, setInitialSeekTime] = useState<number | null>(
        () => {
            if (typeof window === "undefined") return null;
            const savedHistory = localStore.getRawHistory();
            let historyItem: (typeof savedHistory)[number] | undefined;

            if (isSeries && season && episode) {
                historyItem = savedHistory.find(
                    (h) =>
                        h.detailPath === (seriesDetailPath || detailPath) &&
                        h.season === season &&
                        h.episode === episode,
                );
            } else {
                historyItem = savedHistory.find(
                    (h) => h.detailPath === (seriesDetailPath || detailPath),
                );
            }
            if (!historyItem) {
                historyItem = savedHistory.find(
                    (h) =>
                        h.title === title &&
                        (!isSeries ||
                            (h.season === season && h.episode === episode)),
                );
            }
            const resumeTime =
                historyItem &&
                historyItem.progress < 95 &&
                historyItem.currentTime > 5
                    ? historyItem.currentTime
                    : 0;
            return resumeTime;
        },
    );
    const [isInitialSeekDone, setIsInitialSeekDone] = useState(false);
    const [retryTrigger, setRetryTrigger] = useState(0);
    const [isHistoryChecked, setIsHistoryChecked] = useState(false);
    const [prevPath, setPrevPath] = useState(detailPath);

    if (detailPath !== prevPath) {
        setPrevPath(detailPath);
        setIsHistoryChecked(false);
    }

    // Premium states
    const [showLeftSkipAnimation, setShowLeftSkipAnimation] = useState(false);
    const [showRightSkipAnimation, setShowRightSkipAnimation] = useState(false);
    const [isPiPSupported, setIsPiPSupported] = useState(false);
    const [isPiPActive, setIsPiPActive] = useState(false);
    const [subtitleSize, setSubtitleSize] = useState<string>(() => {
        if (typeof window !== "undefined") {
            return localStorage.getItem("player-subtitle-size") || "22px";
        }
        return "22px";
    });

    // Mobile gesture states
    const [gestureIndicator, setGestureIndicator] = useState<{
        type: "volume" | "brightness" | "seek" | null;
        value: number;
    }>({ type: null, value: 0 });
    const [brightnessLevel, setBrightnessLevel] = useState(1);
    const touchStartRef = useRef<{
        x: number;
        y: number;
        time: number;
        side: "left" | "right" | "center";
        startVolume: number;
        startBrightness: number;
        startTime: number;
        isVerticalGesture: boolean;
        isHorizontalGesture: boolean;
        moved: boolean;
    } | null>(null);
    const gestureTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    // Track if user is on a touch device — on touch, taps toggle controls, not play/pause
    const isTouchDeviceRef = useRef(false);
    // Track whether the current click originated from a touch event
    const lastInteractionWasTouchRef = useRef(false);
    // Double-tap detection for mobile seek (left/right sides)
    const doubleTapRef = useRef<{
        time: number;
        side: "left" | "right" | "center";
    } | null>(null);
    // Pending single-tap timer — lets us wait briefly to see if a second tap
    // (double-tap to seek) is coming before we toggle the controls.
    const singleTapTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    // Mirror of showControls so timers/callbacks can read the latest value
    // without being re-created on every visibility change.
    const showControlsRef = useRef(true);
    // Live mirrors used by the auto-hide timer so it never hides the controls
    // while the video is paused or the user is actively scrubbing the seek bar.
    const isPlayingRef = useRef(false);
    const isScrubbingRef = useRef(false);

    useEffect(() => {
        localStorage.setItem("player-subtitle-size", subtitleSize);
    }, [subtitleSize]);

    // Detect touch device on mount
    useEffect(() => {
        isTouchDeviceRef.current =
            "ontouchstart" in window ||
            navigator.maxTouchPoints > 0 ||
            window.matchMedia("(pointer: coarse)").matches;
    }, []);

    // Non-passive touchmove listener so gesture controls (volume / brightness /
    // seek swipes) can actually block the browser's default scroll/zoom.
    // React attaches onTouchMove as a PASSIVE listener, which makes
    // e.preventDefault() a no-op and causes the page to scroll during swipes —
    // the main source of janky mobile gestures. We only prevent default while a
    // custom gesture is genuinely in progress, so taps and menu scrolling are
    // left untouched.
    useEffect(() => {
        const el = containerRef.current;
        if (!el) return;
        const onNativeTouchMove = (e: TouchEvent) => {
            const t = touchStartRef.current;
            if (t && (t.isVerticalGesture || t.isHorizontalGesture)) {
                if (e.cancelable) e.preventDefault();
            }
        };
        el.addEventListener("touchmove", onNativeTouchMove, { passive: false });
        return () => el.removeEventListener("touchmove", onNativeTouchMove);
    }, []);

    // Dynamic AniSkip intro/outro states
    const [introStart, setIntroStart] = useState<number | null>(null);
    const [introEnd, setIntroEnd] = useState<number | null>(null);
    const [outroStart, setOutroStart] = useState<number | null>(null);
    const [outroEnd, setOutroEnd] = useState<number | null>(null);

    useEffect(() => {
        if (!isSeries || !episode) return;

        let active = true;
        const fetchSkipTimes = async () => {
            try {
                // Check sessionStorage cache first to prevent Jikan rate limit issues
                const cacheKey = `aniskip-${title}-${episode}`;
                const cached = sessionStorage.getItem(cacheKey);
                if (cached) {
                    const data = JSON.parse(cached);
                    if (data && active) {
                        setIntroStart(data.introStart);
                        setIntroEnd(data.introEnd);
                        setOutroStart(data.outroStart);
                        setOutroEnd(data.outroEnd);
                    }
                    return;
                }

                // 1. Get MAL ID from our server-side API (which acts as a cached Jikan proxy)
                const searchRes = await fetch(
                    `/api/fillers?title=${encodeURIComponent(title)}`,
                );
                if (!searchRes.ok) return; // Silently skip if API unavailable
                const searchData = await searchRes.json();
                const malId = searchData.malId;
                if (!malId) return; // No MAL ID found — skip times unavailable for this title

                // 2. Get Skip times from AniSkip API
                const skipUrl = `https://api.aniskip.com/v2/skip-times/${malId}/${episode}?types[]=op&types[]=ed&episodeLength=${duration || 0}`;
                const skipRes = await fetch(skipUrl);
                if (!skipRes.ok) return; // AniSkip unavailable for this episode - skip silently
                const skipData = await skipRes.json();

                if (skipData.found) {
                    let opStart: number | null = null;
                    let opEnd: number | null = null;
                    let edStart: number | null = null;
                    let edEnd: number | null = null;

                    for (const result of skipData.results) {
                        if (result["skip-type"] === "op") {
                            opStart = result.interval["start-time"];
                            opEnd = result.interval["end-time"];
                        } else if (result["skip-type"] === "ed") {
                            edStart = result.interval["start-time"];
                            edEnd = result.interval["end-time"];
                        }
                    }

                    if (active) {
                        setIntroStart(opStart);
                        setIntroEnd(opEnd);
                        setOutroStart(edStart);
                        setOutroEnd(edEnd);
                    }

                    // Save to cache
                    sessionStorage.setItem(
                        cacheKey,
                        JSON.stringify({
                            introStart: opStart,
                            introEnd: opEnd,
                            outroStart: edStart,
                            outroEnd: edEnd,
                        }),
                    );
                }
            } catch {
                // Skip times unavailable — not critical, use default intro estimate
                if (active) {
                    setIntroStart(2);
                    setIntroEnd(95);
                }
            }
        };

        fetchSkipTimes();

        return () => {
            active = false;
        };
    }, [title, episode, isSeries, duration]);

    // Track user inactivity to auto-hide controls
    const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    // Delay showing loading spinner to avoid flash on quick seeks
    const waitingTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    // Track double click state to distinguish single clicks
    const clickTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    // Track seek animation durations
    const leftSkipTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    const rightSkipTimeoutRef = useRef<NodeJS.Timeout | null>(null);
    // Track which qualities have failed so we don't re-try them
    const failedUrlsRef = useRef<Set<string>>(new Set());
    // Track which URLs are using the proxy fallback
    const proxiedUrlsRef = useRef<Set<string>>(new Set());
    // Stall watchdog timer — fires if video stays in "loading" for too long
    const stallTimerRef = useRef<NodeJS.Timeout | null>(null);
    // True only during initial source load — prevents watchdog from firing on normal seek buffering
    const isInitialLoadRef = useRef<boolean>(false);
    const hlsRef = useRef<any>(null);
    const seekOnLoadRef = useRef<number | null>(null);
    const playOnLoadRef = useRef<boolean>(false);
    // Preserved seek time for quality switches
    const preservedTimeRef = useRef<number>(0);
    const preservedPlayingRef = useRef<boolean>(false);
    // Track how many times we've refreshed streams to avoid infinite loops
    const refreshCountRef = useRef(0);
    // Guard flag: true while we're switching source (proxy/quality). Prevents duplicate onError handling.
    const isRecoveringRef = useRef(false);
    // Track which episodes have already been marked as watched (prevent duplicate syncs)
    const markedEpisodesRef = useRef<Set<string>>(new Set());
    // Prevents controls from auto-hiding on every buffer/seek — only once on first real playback
    const hasInitiallyLoadedRef = useRef(false);
    // Auto quality upgrade: after initial low-quality playback starts, schedule an upgrade to HD
    const autoUpgradeTimerRef = useRef<NodeJS.Timeout | null>(null);

    // ─── Source loading effect ───
    // Mirrors native VideoPlayer.js: just loads the source and stops.
    // Seek + play are handled by the initial-seek effect once canplay fires.
    // If direct play fails, the proxy fallback URL will be used on retry.
    useEffect(() => {
        if (!isHistoryChecked || !activeDownload) return;

        // The CDN behind activeDownload.url requires a specific Referer header
        // that browsers cannot attach to a direct <video src> request.
        // Cloudflare Workers strip the Referer header on outbound fetch even with
        // explicit Request objects, so we route through the backend proxy which can
        // set Referer freely. The frontend edge route (/api/video) is kept as a
        // fast-path attempt — if CF ever stops stripping Referer, it'll just work.
        proxiedUrlsRef.current.add(activeDownload.url);
        const referer =
            streamData.stream_domain || "https://videodownloader.site/";
        const proxyBase = "https://api.abisolutions.online/api/video";
        const src = `${proxyBase}?url=${encodeURIComponent(activeDownload.url)}&referer=${encodeURIComponent(referer)}&mode=stream`;

        const setup = () => {
            const video = videoRef.current;
            if (!video) return;

            isInitialLoadRef.current = true;
            isRecoveringRef.current = false;
            setIsVideoLoaded(false);

            if (hlsRef.current) {
                hlsRef.current.destroy();
                hlsRef.current = null;
            }

            const isHls =
                src.includes(".m3u8") || src.toLowerCase().includes("m3u8");

            if (isHls) {
                if (video.canPlayType("application/vnd.apple.mpegurl")) {
                    // Native HLS (Safari)
                    video.src = src;
                    video.load();
                } else {
                    // Hls.js (Chrome / Firefox / Edge)
                    import("hls.js").then(({ default: Hls }) => {
                        if (!Hls.isSupported()) {
                            handlePlayerError(new Error("HLS not supported"));
                            return;
                        }
                        const hls = new Hls({
                            enableWorker: true,
                            lowLatencyMode: false,
                            maxBufferLength: 120,
                            maxMaxBufferLength: 300,
                            maxBufferSize: 120 * 1000 * 1000,
                            startLevel: -1,
                            abrEwmaFastLive: 3,
                            abrEwmaSlowLive: 9,
                            fragLoadingMaxRetry: 4,
                            manifestLoadingMaxRetry: 3,
                            levelLoadingMaxRetry: 4,
                            nudgeMaxRetry: 5,
                            startPosition:
                                initialSeekTime && initialSeekTime > 0
                                    ? initialSeekTime
                                    : -1,
                        });
                        hlsRef.current = hls;
                        hls.attachMedia(video);
                        hls.loadSource(src);
                        // canplay on the video element fires after HLS buffers first fragment

                        hls.on(Hls.Events.ERROR, (_event, data) => {
                            if (data.fatal) {
                                if (
                                    data.type === Hls.ErrorTypes.NETWORK_ERROR
                                ) {
                                    hls.startLoad();
                                } else if (
                                    data.type === Hls.ErrorTypes.MEDIA_ERROR
                                ) {
                                    hls.recoverMediaError();
                                } else {
                                    handlePlayerError(
                                        new Error("HLS playback failed"),
                                    );
                                }
                            }
                        });
                    });
                }
            } else {
                // Progressive MP4 / WebM
                video.src = src;
                video.load();
            }
        };

        if (videoRef.current) {
            setup();
        } else {
            const raf = requestAnimationFrame(() => setup());
            return () => cancelAnimationFrame(raf);
        }

        return () => {
            if (hlsRef.current) {
                hlsRef.current.destroy();
                hlsRef.current = null;
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeDownload, retryTrigger, isHistoryChecked]);

    // ─── Initial seek + play effect ───
    // Fires once when: source ready (isVideoLoaded) + know where to start (initialSeekTime) + not yet sought.
    useEffect(() => {
        if (!isVideoLoaded || initialSeekTime === null || isInitialSeekDone)
            return;
        const video = videoRef.current;
        if (!video) return;

        if (initialSeekTime > 0) {
            video.currentTime = initialSeekTime;
        }
        setIsInitialSeekDone(true);

        // 300 ms delayed play — avoids seek race condition on slow connections
        const t = setTimeout(() => {
            const playPromise = video.play();
            if (playPromise !== undefined) {
                playPromise
                    .then(() => {
                        // Play started successfully
                        setIsPlaying(true);
                        setIsLoading(false);
                        if (!hasInitiallyLoadedRef.current) {
                            hasInitiallyLoadedRef.current = true;
                        }
                    })
                    .catch((err) => {
                        // Play was rejected (autoplay policy, interrupted, etc.)
                        // Only treat as real error if video hasn't started at all
                        if (video.currentTime === 0 || video.readyState < 2) {
                            // Retry once after a short delay — browser may need more buffer
                            setTimeout(() => {
                                video
                                    .play()
                                    .then(() => {
                                        setIsPlaying(true);
                                        setIsLoading(false);
                                        if (!hasInitiallyLoadedRef.current) {
                                            hasInitiallyLoadedRef.current = true;
                                        }
                                    })
                                    .catch(() => {
                                        // Show paused state — user can tap to play
                                        setIsPlaying(false);
                                        setIsLoading(false);
                                    });
                            }, 800);
                        } else {
                            // Video has buffered; rejection was benign (e.g., interrupted by seek)
                            setIsPlaying(false);
                            setIsLoading(false);
                        }
                    });
            } else {
                // Old browser fallback
                setIsPlaying(true);
                setIsLoading(false);
                if (!hasInitiallyLoadedRef.current) {
                    hasInitiallyLoadedRef.current = true;
                }
            }
        }, 300);
        return () => clearTimeout(t);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isVideoLoaded, initialSeekTime, isInitialSeekDone]);

    // Initialize source on mount or stream data update
    // Mirrors native: reset seek flags, look up history, set initialSeekTime BEFORE load
    useEffect(() => {
        failedUrlsRef.current = new Set();
        proxiedUrlsRef.current = new Set();
        setRetryTrigger(0);
        refreshCountRef.current = 0;
        isRecoveringRef.current = false;
        transientRetryCountRef.current = 0;
        preservedTimeRef.current = 0;
        preservedPlayingRef.current = false;
        hasInitiallyLoadedRef.current = false;
        if (autoUpgradeTimerRef.current) {
            clearTimeout(autoUpgradeTimerRef.current);
            autoUpgradeTimerRef.current = null;
        }
        setIsVideoLoaded(false);
        setIsInitialSeekDone(false);
        setIsAutoQuality(true);

        // ─── History resume: look up saved position BEFORE loading source ───
        // Mirrors native VideoPlayer.js lines 1026-1043
        const savedHistory = localStore.getRawHistory();
        let historyItem: (typeof savedHistory)[number] | undefined;

        if (isSeries && season && episode) {
            historyItem = savedHistory.find(
                (h) =>
                    h.detailPath === (seriesDetailPath || detailPath) &&
                    h.season === season &&
                    h.episode === episode,
            );
        } else {
            historyItem = savedHistory.find(
                (h) => h.detailPath === (seriesDetailPath || detailPath),
            );
        }
        if (!historyItem) {
            historyItem = savedHistory.find(
                (h) =>
                    h.title === title &&
                    (!isSeries ||
                        (h.season === season && h.episode === episode)),
            );
        }

        const resumeTime =
            historyItem &&
            historyItem.progress < 95 &&
            historyItem.currentTime > 5
                ? historyItem.currentTime
                : 0;
        setInitialSeekTime(resumeTime);

        if (sortedDownloads.length > 0) {
            // Start at 1080p directly for high quality playback.
            // If 1080p isn't available, fall back to the highest available.
            const defaultQuality =
                sortedDownloads.find((d) => d.resolution === 1080) ||
                sortedDownloads[0]; // sortedDownloads is sorted highest-first
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

        // Subtitles
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
        setIsHistoryChecked(true);
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [streamData]);

    // Pause player immediately on page navigation
    useEffect(() => {
        if (shouldPause && videoRef.current) {
            videoRef.current.pause();
            setIsPlaying(false);
        }
    }, [shouldPause]);

    // Note: referrerPolicy is no longer forced here. All playback now routes
    // through /api/video (same-origin proxy), which is the only path that can
    // satisfy the CDN's Referer requirement — the browser's own Referer to our
    // proxy endpoint doesn't matter.

    // Check for Picture-in-Picture support
    useEffect(() => {
        if (typeof document !== "undefined") {
            setIsPiPSupported(
                document.pictureInPictureEnabled ||
                    (videoRef.current &&
                        "requestPictureInPicture" in videoRef.current) ||
                    false,
            );
        }
    }, []);

    // Monitor Picture-in-Picture enter/leave events to synchronize isPiPActive state
    useEffect(() => {
        const videoElement = videoRef.current;
        const handleEnterPiP = () => setIsPiPActive(true);
        const handleLeavePiP = () => setIsPiPActive(false);

        if (videoElement) {
            videoElement.addEventListener(
                "enterpictureinpicture",
                handleEnterPiP,
            );
            videoElement.addEventListener(
                "leavepictureinpicture",
                handleLeavePiP,
            );
        }

        return () => {
            if (videoElement) {
                videoElement.removeEventListener(
                    "enterpictureinpicture",
                    handleEnterPiP,
                );
                videoElement.removeEventListener(
                    "leavepictureinpicture",
                    handleLeavePiP,
                );
            }
        };
    }, [activeDownload]);

    // Convert SRT to WebVTT Blob URL
    const loadSubtitleTrack = useCallback(async (srtUrl: string) => {
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
    }, []);

    // Only sets duration — history lookup and seek are handled by the init effect + initial-seek effect
    const handleLoadedMetadata = () => {
        const videoDur = videoRef.current?.duration || 0;
        setDuration(isFinite(videoDur) ? videoDur : 0);
        setPlayerError(false);
        setAutoRetryLabel("");
    };

    const handlePlayerError = (e: unknown) => {
        // Extract a useful error message from whatever was passed:
        // - Error objects have .message
        // - React SyntheticEvents / native Events: check videoRef.current.error (MediaError)
        // - Fallback: stringify to avoid [object Object]
        let errorMsg: string;
        if (e instanceof Error) {
            errorMsg = e.message;
        } else if (videoRef.current?.error) {
            errorMsg = `MediaError code ${videoRef.current.error.code}: ${videoRef.current.error.message || "unknown"}`;
        } else if (typeof e === "object" && e !== null) {
            try {
                errorMsg = JSON.stringify(e).slice(0, 200);
            } catch {
                errorMsg = "Unknown playback error";
            }
        } else {
            errorMsg = String(e);
        }

        // GUARD: If we're already in recovery mode (switching to proxy/next quality),
        // ignore duplicate onError events from the dying previous source.
        if (isRecoveringRef.current) {
            return;
        }

        if (!activeDownload) {
            setPlayerError(true);
            setIsLoading(false);
            return;
        }

        // Recovery path: if the video has already successfully loaded and played a bit,
        // any subsequent error during skip/seek is transient (e.g., network timeout during range request).
        // Try reloading the current URL and restoring time rather than swapping to a new URL/quality/mode.
        if (
            videoRef.current &&
            videoRef.current.currentTime > 2 &&
            transientRetryCountRef.current < 3
        ) {
            transientRetryCountRef.current += 1;
            const restoreTime = videoRef.current.currentTime;

            console.warn(
                `Transient playback error (attempt ${transientRetryCountRef.current}/3):`,
                errorMsg,
            );
            isRecoveringRef.current = true;
            setAutoRetryLabel("Recovering playback...");
            setIsLoading(true);

            setInitialSeekTime(restoreTime);
            setIsInitialSeekDone(false);
            setIsVideoLoaded(false);
            setRetryTrigger((prev) => prev + 1);
            return;
        }

        // All playback goes through the /api/video proxy (see source-loading
        // effect), so a real onError here means the proxy itself failed for
        // this quality — not a "direct CDN" failure. Mark it failed and move on.
        failedUrlsRef.current.add(activeDownload.url);

        // Step 1: Try next available quality (only if in Auto Quality mode)
        const nextQuality = isAutoQuality
            ? sortedDownloads.find((d) => !failedUrlsRef.current.has(d.url))
            : undefined;
        if (nextQuality) {
            setAutoRetryLabel(
                `Auto-switching to ${nextQuality.resolution}p...`,
            );
            setIsLoading(true);
            // Save current position so initial-seek effect restores it after new source loads
            setInitialSeekTime(videoRef.current?.currentTime || 0);
            setIsInitialSeekDone(false);
            setIsVideoLoaded(false);
            setActiveDownload(nextQuality);
        } else if (refreshCountRef.current < 2) {
            // Step 2: All qualities failed — fetch fresh stream URLs from API
            refreshCountRef.current += 1;
            setAutoRetryLabel("Fetching fresh stream links...");
            setIsLoading(true);
            refreshStreamData();
        } else {
            // Step 3: Everything exhausted — show error screen
            console.error(
                "Video player: all stream qualities failed:",
                errorMsg,
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
                // Reset failed and proxied URLs and resume with fresh direct links
                failedUrlsRef.current = new Set();
                proxiedUrlsRef.current = new Set();
                setRetryTrigger(0);
                setAutoRetryLabel("Fresh links found! Resuming...");

                // Notify parent if callback provided
                if (onStreamRefresh) onStreamRefresh(freshStream);

                // Pick best available quality from fresh data (respecting user's choice if manual)
                const freshSorted = [...freshStream.downloads].sort(
                    (a, b) => b.resolution - a.resolution,
                );
                const currentResolution = activeDownload?.resolution;
                const pick =
                    !isAutoQuality && currentResolution
                        ? freshSorted.find(
                              (d) => d.resolution === currentResolution,
                          ) || freshSorted[0]
                        : freshSorted.find((d) => d.resolution === 1080) ||
                          freshSorted[0]; // highest available

                setActiveDownload(null);
                setTimeout(() => setActiveDownload(pick), 10);
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

    // Stall watchdog — if isLoading stays true for too long (initial load OR mid-playback buffer stall),
    // treat it as an error and auto-fallback to the next quality. Catches silent CDN timeouts on mobile.
    useEffect(() => {
        if (stallTimerRef.current) clearTimeout(stallTimerRef.current);

        if (isLoading && activeDownload && !playerError) {
            // Use a shorter timeout for initial load vs mid-playback stalls
            const timeoutMs = isInitialLoadRef.current ? 12_000 : 15_000;
            stallTimerRef.current = setTimeout(() => {
                const video = videoRef.current;
                // Only escalate if the video is genuinely stalled (not just buffering briefly)
                if (!video || video.readyState < 3) {
                    handlePlayerError(new Error("Stream stall timeout"));
                } else {
                    // readyState is fine — just clear the loading spinner
                    setIsLoading(false);
                }
            }, timeoutMs);
        }

        return () => {
            if (stallTimerRef.current) clearTimeout(stallTimerRef.current);
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isLoading, activeDownload, playerError]);

    // Listen to time updates and sync progress with storage
    const handleTimeUpdate = () => {
        if (!videoRef.current || isScrubbing) return;
        const current = videoRef.current.currentTime;
        const videoDuration = videoRef.current.duration;
        setCurrentTime(current);

        // Update buffered percentage
        if (
            videoRef.current.buffered.length > 0 &&
            videoDuration > 0 &&
            isFinite(videoDuration)
        ) {
            const buf = videoRef.current.buffered;
            let maxEnd = 0;
            for (let i = 0; i < buf.length; i++) {
                if (buf.end(i) > maxEnd) maxEnd = buf.end(i);
            }
            setBufferedPercent((maxEnd / videoDuration) * 100);
        }

        // Use the video element's duration directly (more reliable than state)
        const effectiveDuration =
            videoDuration && isFinite(videoDuration) ? videoDuration : duration;

        // Save history progress every ~5 seconds (throttled by integer check)
        if (
            effectiveDuration > 0 &&
            current > 0 &&
            Math.floor(current) % 5 === 0 &&
            Math.floor(current) !== Math.floor(currentTime)
        ) {
            const progressPercent = Math.min(
                Math.round((current / effectiveDuration) * 100),
                100,
            );
            localStore.saveHistoryItem({
                detailPath: seriesDetailPath || detailPath,
                title,
                coverUrl,
                duration: effectiveDuration,
                currentTime: current,
                progress: progressPercent,
                isSeries,
                season,
                episode,
            });
        }

        // Mark episode as "watched" after 30 seconds of playback (once per episode)
        if (isSeries && season && episode && current >= 30) {
            const epKey = `${seriesDetailPath || detailPath}__s${season}__e${episode}`;
            if (!markedEpisodesRef.current.has(epKey)) {
                markedEpisodesRef.current.add(epKey);
                localStore.markEpisodeWatched(
                    seriesDetailPath || detailPath,
                    season,
                    episode,
                );
            }
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
                        detailPath: seriesDetailPath || detailPath,
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
    }, [
        detailPath,
        seriesDetailPath,
        title,
        coverUrl,
        isSeries,
        season,
        episode,
        duration,
    ]);

    // Resolution selector handles video source swapping
    const handleQualityChange = (quality: DownloadLink, keepAuto = false) => {
        if (!videoRef.current) return;
        if (!keepAuto) {
            setIsAutoQuality(false);
        }

        // Save current position and reset seek flags so initial-seek effect restores it after new source loads
        setInitialSeekTime(videoRef.current.currentTime);
        setIsInitialSeekDone(false);
        setIsVideoLoaded(false);

        setIsLoading(true);
        setActiveDownload(quality);
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
    const togglePlay = useCallback(() => {
        if (!videoRef.current) return;
        if (isPlaying) {
            videoRef.current.pause();
            setIsPlaying(false);
        } else {
            videoRef.current.play().catch(() => {});
            setIsPlaying(true);
        }
    }, [isPlaying]);

    // Mute volume toggle
    const toggleMute = useCallback(() => {
        if (!videoRef.current) return;
        const newMutedState = !isMuted;
        videoRef.current.muted = newMutedState;
        setIsMuted(newMutedState);
    }, [isMuted]);

    // Volume slider adjustment
    const handleVolumeChange = useCallback(
        (e: React.ChangeEvent<HTMLInputElement>) => {
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
        },
        [],
    );

    // Playback speeds multiplier
    const handleSpeedChange = useCallback((rate: number) => {
        if (!videoRef.current) return;
        videoRef.current.playbackRate = rate;
        setPlaybackRate(rate);
        setShowSpeedMenu(false);
    }, []);

    // Fullscreen implementation with landscape lock on mobile.
    // iOS Safari doesn't support Fullscreen API on container elements,
    // so we use webkitEnterFullscreen() on the video element directly.
    const toggleFullscreen = () => {
        const video = videoRef.current;
        const container = containerRef.current;

        // Check if we're currently in fullscreen (standard or webkit)
        const isCurrentlyFullscreen =
            !!document.fullscreenElement ||
            !!(document as any).webkitFullscreenElement ||
            !!(video as any)?.webkitDisplayingFullscreen;

        if (!isCurrentlyFullscreen) {
            // Try standard Fullscreen API first (works on Android, desktop)
            if (container?.requestFullscreen) {
                container
                    .requestFullscreen()
                    .then(() => {
                        setIsFullscreen(true);
                        lockLandscape();
                    })
                    .catch(() => {
                        // Standard API failed - try webkit on container
                        tryWebkitFullscreen();
                    });
            } else if ((container as any)?.webkitRequestFullscreen) {
                // Safari desktop
                (container as any).webkitRequestFullscreen();
                setIsFullscreen(true);
                lockLandscape();
            } else if (video && (video as any).webkitEnterFullscreen) {
                // iOS Safari - only video element supports fullscreen
                (video as any).webkitEnterFullscreen();
                setIsFullscreen(true);
            } else if (video && (video as any).webkitRequestFullScreen) {
                (video as any).webkitRequestFullScreen();
                setIsFullscreen(true);
            }
        } else {
            // Exit fullscreen
            if (document.exitFullscreen) {
                document.exitFullscreen();
            } else if ((document as any).webkitExitFullscreen) {
                (document as any).webkitExitFullscreen();
            } else if (video && (video as any).webkitExitFullscreen) {
                (video as any).webkitExitFullscreen();
            }
            setIsFullscreen(false);
            unlockOrientation();
        }
    };

    const tryWebkitFullscreen = () => {
        const video = videoRef.current;
        const container = containerRef.current;
        if ((container as any)?.webkitRequestFullscreen) {
            (container as any).webkitRequestFullscreen();
            setIsFullscreen(true);
            lockLandscape();
        } else if (video && (video as any).webkitEnterFullscreen) {
            (video as any).webkitEnterFullscreen();
            setIsFullscreen(true);
        }
    };

    const lockLandscape = () => {
        const isMobileDevice =
            /Android|iPhone|iPad|iPod/i.test(navigator.userAgent) ||
            window.matchMedia("(max-width: 768px) and (pointer: coarse)")
                .matches;
        if (
            isMobileDevice &&
            screen.orientation &&
            (screen.orientation as any).lock
        ) {
            (screen.orientation as any).lock("landscape").catch(() => {});
        }
    };

    const unlockOrientation = () => {
        if (screen.orientation && (screen.orientation as any).unlock) {
            try {
                (screen.orientation as any).unlock();
            } catch (_) {}
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

    // === MOBILE GESTURE CONTROLS ===
    // Double-tap left/right to seek, vertical swipe right side for volume,
    // vertical swipe left side for brightness (filter overlay)
    const handleGestureTouchStart = (e: React.TouchEvent) => {
        const target = e.target as HTMLElement;

        // ALWAYS mark this as a touch interaction so the synthetic click event
        // fired after touchend is always suppressed — prevents togglePlay() from
        // accidentally firing on mobile.
        lastInteractionWasTouchRef.current = true;

        // If the touch is on an actual control element (button, slider, the
        // controls panel row) just keep the controls visible and bail — we don't
        // want to start gesture tracking or later toggle visibility.
        if (
            target.closest("button") ||
            target.closest("input") ||
            target.closest("[data-controls-panel]") ||
            target.closest("[data-progress-bar]")
        ) {
            triggerControlsVisibility();
            return; // touchStartRef stays null → handleGestureTouchEnd no-ops
        }

        // For all other areas (video surface, title bar, middle dead zone) we
        // track the touch so we can detect taps vs swipe gestures.
        const touch = e.touches[0];
        const rect = (e.currentTarget as HTMLElement).getBoundingClientRect();
        const x = touch.clientX - rect.left;
        const relativeX = x / rect.width;

        let side: "left" | "right" | "center" = "center";
        if (relativeX < 0.35) side = "left";
        else if (relativeX > 0.65) side = "right";

        touchStartRef.current = {
            x: touch.clientX,
            y: touch.clientY,
            time: Date.now(),
            side,
            startVolume: volume,
            startBrightness: brightnessLevel,
            startTime: currentTime,
            isVerticalGesture: false,
            isHorizontalGesture: false,
            moved: false,
        };
    };

    const handleGestureTouchMove = (e: React.TouchEvent) => {
        if (!touchStartRef.current) return;

        const touch = e.touches[0];
        const deltaX = touch.clientX - touchStartRef.current.x;
        const deltaY = touch.clientY - touchStartRef.current.y;
        const absDeltaX = Math.abs(deltaX);
        const absDeltaY = Math.abs(deltaY);

        // Determine gesture direction after a threshold
        if (
            !touchStartRef.current.isVerticalGesture &&
            !touchStartRef.current.isHorizontalGesture
        ) {
            if (absDeltaX < 10 && absDeltaY < 10) return; // Below threshold
            if (absDeltaY > absDeltaX && absDeltaY > 15) {
                touchStartRef.current.isVerticalGesture = true;
            } else if (absDeltaX > absDeltaY && absDeltaX > 20) {
                touchStartRef.current.isHorizontalGesture = true;
            }
        }

        touchStartRef.current.moved = true;

        // === VERTICAL GESTURE (volume / brightness) ===
        if (touchStartRef.current.isVerticalGesture) {
            e.preventDefault();
            const sensitivity = 150; // pixels for full range
            const change = -deltaY / sensitivity; // Swipe up = positive

            if (touchStartRef.current.side === "right") {
                // Right side: Volume control
                const newVolume = Math.max(
                    0,
                    Math.min(1, touchStartRef.current.startVolume + change),
                );
                if (videoRef.current) {
                    videoRef.current.volume = newVolume;
                    videoRef.current.muted = newVolume === 0;
                }
                setVolume(newVolume);
                setIsMuted(newVolume === 0);
                setGestureIndicator({
                    type: "volume",
                    value: Math.round(newVolume * 100),
                });
            } else if (touchStartRef.current.side === "left") {
                // Left side: Brightness control (CSS filter)
                const newBrightness = Math.max(
                    0.2,
                    Math.min(
                        1.5,
                        touchStartRef.current.startBrightness + change,
                    ),
                );
                setBrightnessLevel(newBrightness);
                setGestureIndicator({
                    type: "brightness",
                    value: Math.round(newBrightness * 100),
                });
            }
        }

        // === HORIZONTAL GESTURE (seek) ===
        if (touchStartRef.current.isHorizontalGesture) {
            e.preventDefault();
            const seekSensitivity = 0.5; // seconds per pixel
            const seekDelta = deltaX * seekSensitivity;
            const newTime = Math.max(
                0,
                Math.min(duration, touchStartRef.current.startTime + seekDelta),
            );

            if (videoRef.current) {
                videoRef.current.currentTime = newTime;
            }
            setCurrentTime(newTime);
            setGestureIndicator({ type: "seek", value: Math.round(seekDelta) });
        }
    };

    // Perform a ±10s skip on double-tap and show the skip animation.
    const doubleTapSeek = (side: "left" | "right") => {
        const video = videoRef.current;
        if (!video) return;
        if (side === "left") {
            video.currentTime = Math.max(0, video.currentTime - 10);
            setCurrentTime(video.currentTime);
            setShowLeftSkipAnimation(true);
            if (leftSkipTimeoutRef.current)
                clearTimeout(leftSkipTimeoutRef.current);
            leftSkipTimeoutRef.current = setTimeout(
                () => setShowLeftSkipAnimation(false),
                600,
            );
        } else {
            video.currentTime = Math.min(
                video.duration || 0,
                video.currentTime + 10,
            );
            setCurrentTime(video.currentTime);
            setShowRightSkipAnimation(true);
            if (rightSkipTimeoutRef.current)
                clearTimeout(rightSkipTimeoutRef.current);
            rightSkipTimeoutRef.current = setTimeout(
                () => setShowRightSkipAnimation(false),
                600,
            );
        }
    };

    const handleGestureTouchEnd = () => {
        if (!touchStartRef.current) return;

        const { moved, side } = touchStartRef.current;
        touchStartRef.current = null;

        // Clear gesture indicator after a short delay
        if (gestureTimeoutRef.current) clearTimeout(gestureTimeoutRef.current);
        gestureTimeoutRef.current = setTimeout(() => {
            setGestureIndicator({ type: null, value: 0 });
        }, 600);

        // If the touch moved (gesture like swipe), don't treat as a tap
        if (moved) {
            doubleTapRef.current = null;
            if (singleTapTimeoutRef.current) {
                clearTimeout(singleTapTimeoutRef.current);
                singleTapTimeoutRef.current = null;
            }
            // On a swipe gesture, always keep/show controls and restart timer
            triggerControlsVisibility();
            return;
        }

        const now = Date.now();

        // ─── Left / right zones: double-tap-to-seek, single-tap shows HUD ───
        // Design rule: side zones are for seek gestures only. A single tap on a
        // side zone SHOWS the controls (never hides them — only center-tap hides).
        // A double-tap seeks ±10 s WITHOUT touching controls visibility at all.
        if (side === "left" || side === "right") {
            if (
                doubleTapRef.current &&
                doubleTapRef.current.side === side &&
                now - doubleTapRef.current.time < 350
            ) {
                // ── Double-tap confirmed: seek silently ──
                // Cancel the pending single-tap "show" action so we don't
                // flash the controls, then seek without changing HUD state.
                if (singleTapTimeoutRef.current) {
                    clearTimeout(singleTapTimeoutRef.current);
                    singleTapTimeoutRef.current = null;
                }
                doubleTapRef.current = null;
                doubleTapSeek(side);
                // If controls are already visible, restart their timer.
                if (showControlsRef.current) {
                    scheduleControlsHide();
                }
                return;
            }

            // ── First tap on a side zone ──
            // Record it for double-tap detection but don't show/hide yet.
            doubleTapRef.current = { time: now, side };
            if (singleTapTimeoutRef.current)
                clearTimeout(singleTapTimeoutRef.current);
            // After the double-tap window, treat it as a single tap → show controls.
            singleTapTimeoutRef.current = setTimeout(() => {
                singleTapTimeoutRef.current = null;
                doubleTapRef.current = null;
                // Side-zone single tap: always SHOW controls (never hide).
                // Center tap is the only gesture that hides them.
                if (!showControlsRef.current) {
                    triggerControlsVisibility();
                } else {
                    scheduleControlsHide(); // already visible — just restart timer
                }
            }, 320);
            return;
        }

        // ─── Center zone: single tap TOGGLES controls (show ↔ hide) ───
        doubleTapRef.current = null;
        if (singleTapTimeoutRef.current) {
            clearTimeout(singleTapTimeoutRef.current);
            singleTapTimeoutRef.current = null;
        }
        toggleControlsMobile();
    };

    // Blur any focused controls after click to ensure Spacebar immediately triggers play/pause
    const handlePlayerClickCapture = (e: React.MouseEvent) => {
        const target = e.target as HTMLElement;
        const focusable = target.closest(
            "button, input[type='range'], [role='button']",
        );
        if (focusable) {
            setTimeout(() => {
                (focusable as HTMLElement).blur();
            }, 100);
        }
    };

    // Handle single clicks on the screen
    // Desktop: click toggles play/pause
    // Mobile/Touch: handled by handleMobileTap via onTouchEnd — click is suppressed
    const handleScreenClick = (e: React.MouseEvent) => {
        // Suppress click events that originated from touch (mobile)
        // Touch interactions are handled entirely by handleMobileTap
        if (lastInteractionWasTouchRef.current) {
            lastInteractionWasTouchRef.current = false;
            e.stopPropagation();
            e.preventDefault();
            return;
        }

        const clickTarget = e.target as HTMLElement;
        if (
            clickTarget.closest("button") ||
            clickTarget.closest("input") ||
            clickTarget.closest("select") ||
            clickTarget.closest("[data-controls-panel]") ||
            clickTarget.closest("[data-skip-zone]") ||
            clickTarget.closest(".absolute.bottom-14")
        ) {
            return;
        }

        e.stopPropagation();
        e.preventDefault();

        // Desktop only: click toggles play/pause
        togglePlay();
    };

    // Handle double clicks on the screen to toggle fullscreen or seek
    const handleScreenDoubleClick = (e: React.MouseEvent) => {
        // On touch devices, double-tap is handled entirely by the gesture
        // handlers (onTouchEnd). Ignore any synthetic dblclick so we don't
        // trigger fullscreen/seek twice.
        if (isTouchDeviceRef.current || lastInteractionWasTouchRef.current) {
            return;
        }

        const target = e.currentTarget as HTMLElement;
        const clickTarget = e.target as HTMLElement;
        if (
            clickTarget.closest("button") ||
            clickTarget.closest("input") ||
            clickTarget.closest("select") ||
            clickTarget.closest("[data-controls-panel]")
        ) {
            return;
        }

        e.stopPropagation();
        e.preventDefault();

        const rect = target.getBoundingClientRect();
        const x = e.clientX - rect.left;
        const clickRatio = x / rect.width;

        if (clickRatio < 0.35) {
            // Skip backward 10s
            if (videoRef.current) {
                videoRef.current.currentTime = Math.max(
                    0,
                    videoRef.current.currentTime - 10,
                );
                setCurrentTime(videoRef.current.currentTime);
            }
            setShowLeftSkipAnimation(true);
            if (leftSkipTimeoutRef.current)
                clearTimeout(leftSkipTimeoutRef.current);
            leftSkipTimeoutRef.current = setTimeout(
                () => setShowLeftSkipAnimation(false),
                800,
            );
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
            if (rightSkipTimeoutRef.current)
                clearTimeout(rightSkipTimeoutRef.current);
            rightSkipTimeoutRef.current = setTimeout(
                () => setShowRightSkipAnimation(false),
                800,
            );
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
            if (
                audioMenuRef.current &&
                !audioMenuRef.current.contains(target)
            ) {
                setShowAudioMenu(false);
            }
            if (
                qualityMenuRef.current &&
                !qualityMenuRef.current.contains(target) &&
                (!qualityMenuMobileRef.current ||
                    !qualityMenuMobileRef.current.contains(target))
            ) {
                setShowQualityMenu(false);
            }
            if (
                speedMenuRef.current &&
                !speedMenuRef.current.contains(target)
            ) {
                setShowSpeedMenu(false);
            }
            if (
                subtitleMenuRef.current &&
                !subtitleMenuRef.current.contains(target)
            ) {
                setShowSubtitleMenu(false);
            }
            if (
                ratioMenuRef.current &&
                !ratioMenuRef.current.contains(target)
            ) {
                setShowRatioMenu(false);
            }
        };

        document.addEventListener("mousedown", handleClickOutside);
        return () => {
            document.removeEventListener("mousedown", handleClickOutside);
        };
    }, []);

    // Handle keyboard shortcuts

    // Track fullscreen changes directly on document level (e.g. Escape key presses)
    useEffect(() => {
        const handleFullscreenChange = () => {
            const isNowFullscreen =
                !!document.fullscreenElement ||
                !!(document as any).webkitFullscreenElement;
            setIsFullscreen(isNowFullscreen);
            if (!isNowFullscreen) unlockOrientation();
        };

        // iOS video element fires these events for its native fullscreen
        const handleWebkitBeginFullscreen = () => setIsFullscreen(true);
        const handleWebkitEndFullscreen = () => {
            setIsFullscreen(false);
            unlockOrientation();
        };

        document.addEventListener("fullscreenchange", handleFullscreenChange);
        document.addEventListener(
            "webkitfullscreenchange",
            handleFullscreenChange,
        );

        const video = videoRef.current;
        if (video) {
            video.addEventListener(
                "webkitbeginfullscreen",
                handleWebkitBeginFullscreen,
            );
            video.addEventListener(
                "webkitendfullscreen",
                handleWebkitEndFullscreen,
            );
        }

        return () => {
            document.removeEventListener(
                "fullscreenchange",
                handleFullscreenChange,
            );
            document.removeEventListener(
                "webkitfullscreenchange",
                handleFullscreenChange,
            );
            if (video) {
                video.removeEventListener(
                    "webkitbeginfullscreen",
                    handleWebkitBeginFullscreen,
                );
                video.removeEventListener(
                    "webkitendfullscreen",
                    handleWebkitEndFullscreen,
                );
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [activeDownload]);

    // Keep the refs in sync so tap/timer callbacks read the latest values.
    useEffect(() => {
        showControlsRef.current = showControls;
    }, [showControls]);
    useEffect(() => {
        isPlayingRef.current = isPlaying;
    }, [isPlaying]);
    useEffect(() => {
        isScrubbingRef.current = isScrubbing;
    }, [isScrubbing]);

    // How long the controls stay on screen with no interaction.
    // Touch devices get a longer window (interactions are slower on mobile).
    const CONTROLS_HIDE_DELAY_TOUCH = 3000;
    const CONTROLS_HIDE_DELAY_MOUSE = 2500;

    // Hide controls and close every open menu. Centralised so tap, timer and
    // keyboard paths all behave identically.
    const hideControls = useCallback(() => {
        if (controlsTimeoutRef.current) {
            clearTimeout(controlsTimeoutRef.current);
            controlsTimeoutRef.current = null;
        }
        showControlsRef.current = false;
        setShowControls(false);
        setShowQualityMenu(false);
        setShowSpeedMenu(false);
        setShowAudioMenu(false);
        setShowSubtitleMenu(false);
        setShowRatioMenu(false);
    }, []);

    // Schedule the auto-hide. Never hides while paused or while the user is
    // actively scrubbing — in those cases it simply re-arms itself so the
    // controls stay put until the user is genuinely idle.
    const scheduleControlsHide = useCallback(() => {
        if (controlsTimeoutRef.current) {
            clearTimeout(controlsTimeoutRef.current);
            controlsTimeoutRef.current = null;
        }
        if (!isPlayingRef.current) return; // stay visible while paused
        const hideDelay = isTouchDeviceRef.current
            ? CONTROLS_HIDE_DELAY_TOUCH
            : CONTROLS_HIDE_DELAY_MOUSE;
        controlsTimeoutRef.current = setTimeout(() => {
            if (isScrubbingRef.current) {
                // Still dragging the seek bar — check again shortly.
                scheduleControlsHide();
                return;
            }
            hideControls();
        }, hideDelay);
    }, [hideControls]);

    // Show the controls and (re)start the inactivity countdown.
    const triggerControlsVisibility = useCallback(() => {
        showControlsRef.current = true;
        setShowControls(true);
        scheduleControlsHide();
    }, [scheduleControlsHide]);

    // Mobile single-tap: toggle controls (show if hidden, hide if visible).
    const toggleControlsMobile = () => {
        if (showControlsRef.current) {
            hideControls();
        } else {
            triggerControlsVisibility();
        }
    };

    // Auto hide controls when playing, show them when paused, and clean up timers
    useEffect(() => {
        showControlsRef.current = true;
        setShowControls(true);
        scheduleControlsHide();

        return () => {
            if (controlsTimeoutRef.current) {
                clearTimeout(controlsTimeoutRef.current);
            }
            if (clickTimeoutRef.current) {
                clearTimeout(clickTimeoutRef.current);
            }
            if (singleTapTimeoutRef.current) {
                clearTimeout(singleTapTimeoutRef.current);
            }
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isPlaying]);

    // Keep controls pinned open while any settings menu is open — otherwise the
    // inactivity timer would hide the controls and dismiss the menu mid-use.
    useEffect(() => {
        const anyMenuOpen =
            showQualityMenu ||
            showSpeedMenu ||
            showAudioMenu ||
            showSubtitleMenu ||
            showRatioMenu;
        if (anyMenuOpen) {
            if (controlsTimeoutRef.current) {
                clearTimeout(controlsTimeoutRef.current);
                controlsTimeoutRef.current = null;
            }
            showControlsRef.current = true;
            setShowControls(true);
        } else {
            // Menu just closed while playing — restart the inactivity timer.
            if (isPlaying) {
                triggerControlsVisibility();
            }
        }
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [
        showQualityMenu,
        showSpeedMenu,
        showAudioMenu,
        showSubtitleMenu,
        showRatioMenu,
    ]);

    // formatTime helper is moved to global file scope

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
                // Mark current episode as fully watched
                localStore.markEpisodeWatched(
                    seriesDetailPath || detailPath,
                    season,
                    episode,
                );
                // Save history with 100% progress
                localStore.saveHistoryItem({
                    detailPath: seriesDetailPath || detailPath,
                    title,
                    coverUrl,
                    duration,
                    currentTime: duration,
                    progress: 100,
                    isSeries,
                    season,
                    episode,
                });
            }
            if (onNextEpisode) {
                onNextEpisode();
            }
        }
    };

    const handleNextEpisodeClick = () => {
        if (isSeries && season && episode) {
            // Mark current episode as watched before switching
            localStore.markEpisodeWatched(
                seriesDetailPath || detailPath,
                season,
                episode,
            );
            // Save current progress before switching
            if (videoRef.current && videoRef.current.currentTime > 5) {
                const current = videoRef.current.currentTime;
                const dur = videoRef.current.duration || duration;
                const progressPercent =
                    dur > 0
                        ? Math.min(Math.round((current / dur) * 100), 100)
                        : 0;
                localStore.saveHistoryItem({
                    detailPath: seriesDetailPath || detailPath,
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
        if (onNextEpisode) {
            onNextEpisode();
        }
    };

    // Handle keyboard shortcuts (Space to Play/Pause, Arrows to Seek/Volume, M to Mute, F to Fullscreen)
    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
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

            switch (e.key) {
                case " ":
                case "Spacebar":
                    e.preventDefault();
                    togglePlay();
                    break;
                case "ArrowLeft":
                    e.preventDefault();
                    videoRef.current.currentTime = Math.max(
                        0,
                        videoRef.current.currentTime - 10,
                    );
                    setCurrentTime(videoRef.current.currentTime);
                    triggerControlsVisibility();
                    break;
                case "ArrowRight":
                    e.preventDefault();
                    videoRef.current.currentTime = Math.min(
                        videoRef.current.duration || 0,
                        videoRef.current.currentTime + 10,
                    );
                    setCurrentTime(videoRef.current.currentTime);
                    triggerControlsVisibility();
                    break;
                case "ArrowUp":
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
                case "ArrowDown":
                    e.preventDefault();
                    const newVolDown = Math.max(
                        0,
                        videoRef.current.volume - 0.1,
                    );
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
                case "M":
                    e.preventDefault();
                    toggleMute();
                    triggerControlsVisibility();
                    break;
                case "f":
                case "F":
                    e.preventDefault();
                    toggleFullscreen();
                    break;
                default:
                    break;
            }
        };

        window.addEventListener("keydown", handleKeyDown, { capture: true });
        return () => {
            window.removeEventListener("keydown", handleKeyDown, {
                capture: true,
            });
        };
        // eslint-disable-next-line react-hooks/exhaustive-deps
    }, [isPlaying, isFullscreen, volume, isMuted]);

    return (
        <div
            ref={containerRef}
            onMouseMove={triggerControlsVisibility}
            onMouseLeave={() => isPlaying && setShowControls(false)}
            onClick={handleScreenClick}
            onDoubleClick={handleScreenDoubleClick}
            onClickCapture={handlePlayerClickCapture}
            onTouchStart={handleGestureTouchStart}
            onTouchMove={handleGestureTouchMove}
            onTouchEnd={handleGestureTouchEnd}
            className={`relative w-full h-full bg-black select-none overflow-hidden group/player ${
                isPlaying && !showControls ? "cursor-none" : ""
            }`}
        >
            <style
                dangerouslySetInnerHTML={{
                    __html: `
                video::cue {
                    font-size: ${subtitleSize} !important;
                    background: rgba(0, 0, 0, 0.75) !important;
                    text-shadow: 0 1px 2px rgba(0,0,0,0.9) !important;
                }
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
                .custom-scrollbar {
                    scrollbar-width: none;
                    -ms-overflow-style: none;
                }
                .custom-scrollbar::-webkit-scrollbar {
                    display: none;
                }
            `,
                }}
            />

            {/* Video Node */}
            {activeDownload && !playerError && (
                <video
                    ref={videoRef}
                    onEnded={handleVideoEnded}
                    style={{ filter: `brightness(${brightnessLevel})` }}
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
                        transientRetryCountRef.current = 0;
                    }}
                    onPause={() => setIsPlaying(false)}
                    onLoadedMetadata={handleLoadedMetadata}
                    onDurationChange={() => {
                        if (
                            videoRef.current &&
                            videoRef.current.duration > 0 &&
                            isFinite(videoRef.current.duration)
                        ) {
                            setDuration(videoRef.current.duration);
                        }
                    }}
                    onTimeUpdate={handleTimeUpdate}
                    onProgress={() => {
                        if (
                            videoRef.current &&
                            videoRef.current.buffered.length > 0 &&
                            videoRef.current.duration > 0 &&
                            isFinite(videoRef.current.duration)
                        ) {
                            const buf = videoRef.current.buffered;
                            let maxEnd = 0;
                            for (let i = 0; i < buf.length; i++) {
                                if (buf.end(i) > maxEnd) maxEnd = buf.end(i);
                            }
                            setBufferedPercent(
                                (maxEnd / videoRef.current.duration) * 100,
                            );
                        }
                    }}
                    onWaiting={() => {
                        // Only show loading spinner if video is genuinely stalled,
                        // not for brief buffer gaps during normal playback
                        if (waitingTimeoutRef.current)
                            clearTimeout(waitingTimeoutRef.current);
                        waitingTimeoutRef.current = setTimeout(() => {
                            if (
                                videoRef.current &&
                                videoRef.current.readyState < 3 &&
                                !videoRef.current.paused
                            ) {
                                setIsLoading(true);
                            }
                        }, 300);
                    }}
                    onSeeking={() => {
                        // Don't show spinner immediately — brief seeks clear fast
                        if (waitingTimeoutRef.current)
                            clearTimeout(waitingTimeoutRef.current);
                        waitingTimeoutRef.current = setTimeout(() => {
                            if (
                                videoRef.current &&
                                videoRef.current.readyState < 3
                            ) {
                                setIsLoading(true);
                            }
                        }, 200);
                    }}
                    onSeeked={() => {
                        // Always clear loading after seek completes — video has the frame ready
                        if (waitingTimeoutRef.current)
                            clearTimeout(waitingTimeoutRef.current);
                        setIsLoading(false);
                    }}
                    onCanPlay={() => {
                        // Source is ready — trigger the initial-seek effect which seeks and plays
                        if (waitingTimeoutRef.current)
                            clearTimeout(waitingTimeoutRef.current);
                        setIsVideoLoaded(true);
                        setIsLoading(false);
                        isInitialLoadRef.current = false;
                        isRecoveringRef.current = false;
                    }}
                    onPlaying={() => {
                        if (waitingTimeoutRef.current)
                            clearTimeout(waitingTimeoutRef.current);
                        setIsLoading(false);
                        setAutoRetryLabel("");
                        transientRetryCountRef.current = 0;
                    }}
                    onError={handlePlayerError}
                    autoPlay
                    playsInline
                    preload="auto"
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
                        isPlaying && !showControls
                            ? "cursor-none"
                            : "cursor-pointer"
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

            {/* Mobile Gesture Indicator */}
            {gestureIndicator.type && (
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 z-50 pointer-events-none">
                    <div className="flex flex-col items-center space-y-2 bg-black/70 px-5 py-3 rounded-2xl backdrop-blur-md">
                        {gestureIndicator.type === "volume" && (
                            <>
                                <Volume2 className="w-6 h-6 text-white" />
                                <div className="w-24 h-1.5 bg-white/20 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-white rounded-full transition-all duration-100"
                                        style={{
                                            width: `${gestureIndicator.value}%`,
                                        }}
                                    />
                                </div>
                                <span className="text-xs font-bold text-white">
                                    {gestureIndicator.value}%
                                </span>
                            </>
                        )}
                        {gestureIndicator.type === "brightness" && (
                            <>
                                <Maximize2 className="w-6 h-6 text-yellow-300" />
                                <div className="w-24 h-1.5 bg-white/20 rounded-full overflow-hidden">
                                    <div
                                        className="h-full bg-yellow-300 rounded-full transition-all duration-100"
                                        style={{
                                            width: `${Math.min(100, Math.round((gestureIndicator.value / 150) * 100))}%`,
                                        }}
                                    />
                                </div>
                                <span className="text-xs font-bold text-white">
                                    {gestureIndicator.value}%
                                </span>
                            </>
                        )}
                        {gestureIndicator.type === "seek" && (
                            <>
                                {gestureIndicator.value >= 0 ? (
                                    <SkipForward className="w-6 h-6 text-white" />
                                ) : (
                                    <SkipBack className="w-6 h-6 text-white" />
                                )}
                                <span className="text-xs font-bold text-white">
                                    {gestureIndicator.value >= 0 ? "+" : ""}
                                    {gestureIndicator.value}s
                                </span>
                            </>
                        )}
                    </div>
                </div>
            )}

            {/* Skip Intro Floating Button */}
            {introStart !== null &&
                introEnd !== null &&
                currentTime >= introStart &&
                currentTime <= introEnd && (
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            if (videoRef.current) {
                                videoRef.current.currentTime = introEnd;
                                setCurrentTime(introEnd);
                            }
                            triggerControlsVisibility();
                        }}
                        className="absolute bottom-32 right-6 z-25 bg-zinc-950/80 border border-white/10 hover:bg-zinc-900 hover:border-white/20 text-white font-extrabold text-xs px-4 py-2.5 rounded-xl flex items-center space-x-1.5 shadow-2xl backdrop-blur-md transition-all active:scale-95 animate-fade-in cursor-pointer"
                    >
                        <span>Skip Intro</span>
                        <SkipForward className="w-3.5 h-3.5 fill-white text-white" />
                    </button>
                )}

            {/* Skip Outro / Next Episode Floating Button */}
            {isSeries &&
                onNextEpisode &&
                duration > 0 &&
                (outroStart !== null && outroEnd !== null
                    ? currentTime >= outroStart && currentTime <= outroEnd
                    : currentTime >= duration - 150 &&
                      currentTime < duration - 10) && (
                    <button
                        onClick={(e) => {
                            e.stopPropagation();
                            handleNextEpisodeClick();
                        }}
                        className="absolute bottom-32 right-6 z-25 bg-primary/95 border border-primary/20 hover:bg-primary text-white font-extrabold text-xs px-4 py-2.5 rounded-xl flex items-center space-x-1.5 shadow-2xl backdrop-blur-md transition-all active:scale-95 animate-fade-in cursor-pointer"
                    >
                        <span>Next Episode</span>
                        <SkipForward className="w-3.5 h-3.5 fill-white text-white" />
                    </button>
                )}

            {/* Loading spinner - shows when video is buffering */}
            {isLoading && (
                <div className="absolute inset-0 flex items-center justify-center z-30 pointer-events-none">
                    <Loader2 className="w-10 h-10 text-primary animate-spin" />
                </div>
            )}

            {/* Auto-retry loading */}
            {autoRetryLabel && !playerError && !isPlaying && (
                <div className="absolute inset-0 bg-black/50 flex items-center justify-center z-30 pointer-events-none">
                    <Loader2 className="w-10 h-10 text-primary animate-spin" />
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
                        be temporarily unavailable - please try again later.
                    </p>
                    <button
                        onClick={() => {
                            // Full reset — clear failed URLs, reset refresh count, restart from highest quality
                            failedUrlsRef.current = new Set();
                            refreshCountRef.current = 0;
                            setPlayerError(false);
                            setAutoRetryLabel("");
                            setIsLoading(true);
                            const best = sortedDownloads[0];
                            if (best) {
                                setActiveDownload(null);
                                setTimeout(() => setActiveDownload(best), 50);
                            } else {
                                // No downloads in current data â€” try fresh fetch
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
                className={`absolute inset-0 z-20 flex flex-col justify-between transition-opacity duration-300 ${
                    showControls
                        ? "opacity-100"
                        : "opacity-0 pointer-events-none"
                } ${isPlaying && !showControls ? "cursor-none" : ""}`}
                onClick={handleScreenClick}
                onDoubleClick={handleScreenDoubleClick}
            >
                {/* ══════════════════════════════════════════════════════
                    MOBILE LAYOUT (hidden on sm+)
                    Mimics YouTube fullscreen: top bar, big center row, bottom seek
                    ══════════════════════════════════════════════════════ */}
                <div className="sm:hidden flex flex-col h-full" data-controls-panel>
                    {/* ── Mobile Top Bar ── */}
                    <div className="flex items-center justify-between px-3 pt-3 pb-2 bg-gradient-to-b from-black/80 to-transparent">
                        <div className="flex-1 min-w-0 pr-2">
                            <h2 className="font-bold text-white text-sm line-clamp-1 drop-shadow">{title}</h2>
                            {isSeries && season && episode && (
                                <p className="text-[11px] text-white/60 font-medium mt-0.5">
                                    S{season} · EP{episode}
                                </p>
                            )}
                        </div>
                        {/* Fullscreen button — top-right, large tap target */}
                        <button
                            onClick={(e) => { e.stopPropagation(); toggleFullscreen(); }}
                            className="w-10 h-10 flex items-center justify-center rounded-xl text-white/80 active:bg-white/15 active:scale-90 transition-all"
                        >
                            {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
                        </button>
                    </div>

                    {/* ── Mobile Center Row: Prev · Play/Pause · Next ── */}
                    <div className="flex-1 flex items-center justify-center space-x-6">
                        {isSeries && onPrevEpisode ? (
                            <button
                                onClick={(e) => { e.stopPropagation(); onPrevEpisode(); }}
                                className="w-12 h-12 flex items-center justify-center rounded-full bg-black/40 backdrop-blur-sm active:scale-90 transition-all"
                            >
                                <SkipBack className="w-6 h-6 fill-white text-white" />
                            </button>
                        ) : (
                            <div className="w-12 h-12" />
                        )}

                        {/* Big Play/Pause — always visible on mobile */}
                        <button
                            onClick={(e) => { e.stopPropagation(); togglePlay(); }}
                            className="w-16 h-16 flex items-center justify-center rounded-full bg-primary/90 shadow-2xl active:scale-90 transition-transform"
                        >
                            {isPlaying
                                ? <Pause className="w-7 h-7 fill-white text-white" />
                                : <Play  className="w-7 h-7 fill-white text-white translate-x-0.5" />
                            }
                        </button>

                        {isSeries && onNextEpisode ? (
                            <button
                                onClick={(e) => { e.stopPropagation(); handleNextEpisodeClick(); }}
                                className="w-12 h-12 flex items-center justify-center rounded-full bg-black/40 backdrop-blur-sm active:scale-90 transition-all"
                            >
                                <SkipForward className="w-6 h-6 fill-white text-white" />
                            </button>
                        ) : (
                            <div className="w-12 h-12" />
                        )}
                    </div>

                    {/* ── Mobile Bottom: Settings Row + Seek Bar + Time ── */}
                    <div className="bg-gradient-to-t from-black/80 to-transparent px-3 pb-4 space-y-1.5">
                        {/* Settings / utility row */}
                        <div className="flex items-center justify-between">
                            {/* Left: Mute */}
                            <button
                                onClick={(e) => { e.stopPropagation(); toggleMute(); }}
                                className="w-10 h-10 flex items-center justify-center rounded-xl text-white/70 active:bg-white/15 active:scale-90 transition-all"
                            >
                                {isMuted || volume === 0
                                    ? <VolumeX className="w-5 h-5 text-primary" />
                                    : <Volume2 className="w-5 h-5" />
                                }
                            </button>

                            {/* Right: Sub, Audio, Quality, Ratio */}
                            <div className="flex items-center space-x-0.5">
                                {captions.length > 0 && (
                                    <div className="relative">
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setShowSubtitleMenu(!showSubtitleMenu); setShowQualityMenu(false); setShowSpeedMenu(false); setShowAudioMenu(false); setShowRatioMenu(false); }}
                                            className={`w-10 h-10 flex items-center justify-center rounded-xl active:scale-90 transition-all ${showSubtitleMenu || showSubtitles ? "text-primary bg-primary/10" : "text-white/60"}`}
                                        >
                                            <Subtitles className="w-5 h-5" />
                                        </button>
                                        {showSubtitleMenu && (
                                            <div className="absolute bottom-12 right-0 border border-zinc-800 rounded-xl p-2 min-w-[130px] flex flex-col z-50 shadow-2xl animate-fade-in bg-zinc-950">
                                                <p className="text-[10px] text-white/40 px-2 py-1 font-bold shrink-0">Subtitles</p>
                                                <div className="max-h-[140px] overflow-y-auto space-y-0.5 pr-1 custom-scrollbar">
                                                    <button onClick={() => handleSubtitleChange(null)} className={`w-full text-left text-xs font-semibold px-2.5 py-1.5 rounded-lg hover:bg-white/5 transition-colors ${!activeCaption ? "text-primary bg-primary/10" : "text-white/80"}`}>Off</button>
                                                    {captions.map((caption) => (
                                                        <button key={caption.id || caption.url} onClick={() => handleSubtitleChange(caption)} className={`w-full text-left text-xs font-semibold px-2.5 py-1.5 rounded-lg hover:bg-white/5 transition-colors ${activeCaption?.id === caption.id ? "text-primary bg-primary/10" : "text-white/80"}`}>{caption.lanName}</button>
                                                    ))}
                                                </div>
                                                <div className="h-px bg-zinc-800 my-1 shrink-0" />
                                                <p className="text-[10px] text-white/40 px-2 py-0.5 font-bold shrink-0">Size</p>
                                                <div className="flex items-center justify-between px-1 py-1 shrink-0">
                                                    {["16px","22px","28px","36px"].map((size, i) => (
                                                        <button key={size} onClick={() => setSubtitleSize(size)} className={`text-[9px] font-black px-1.5 py-1 rounded transition-colors ${subtitleSize === size ? "text-primary bg-primary/10" : "text-white/60"}`}>
                                                            {["SM","MD","LG","XL"][i]}
                                                        </button>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {dubs && dubs.length > 0 && (
                                    <div className="relative">
                                        <button
                                            onClick={(e) => { e.stopPropagation(); setShowAudioMenu(!showAudioMenu); setShowQualityMenu(false); setShowSpeedMenu(false); setShowSubtitleMenu(false); setShowRatioMenu(false); }}
                                            className={`w-10 h-10 flex items-center justify-center rounded-xl active:scale-90 transition-all ${showAudioMenu ? "text-primary bg-primary/10" : "text-white/60"}`}
                                        >
                                            <Headphones className="w-5 h-5" />
                                        </button>
                                        {showAudioMenu && (
                                            <div className="absolute bottom-12 right-0 border border-zinc-800 rounded-xl p-2 min-w-[130px] flex flex-col z-50 shadow-2xl animate-fade-in bg-zinc-950">
                                                <p className="text-[10px] text-white/40 px-2 py-1 font-bold shrink-0">Audio</p>
                                                <div className="max-h-[160px] overflow-y-auto space-y-0.5 pr-1 custom-scrollbar">
                                                    {dubs.map((dub, idx) => (
                                                        <button key={idx} onClick={() => { setShowAudioMenu(false); const ep = isSeries && season && episode ? `?season=${season}&episode=${episode}` : ""; window.location.href = `/watch/${dub.detailPath}${ep}`; }} className={`w-full text-left text-xs font-semibold px-2.5 py-1.5 rounded-lg hover:bg-white/5 transition-colors ${detailPath === dub.detailPath ? "text-primary bg-primary/10" : "text-white/80"}`}>{dub.lanName}{dub.original ? " (Orig)" : ""}</button>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>
                                )}

                                {/* Quality badge */}
                                <div className="relative" ref={qualityMenuMobileRef}>
                                    <button
                                        onClick={(e) => { e.stopPropagation(); setShowQualityMenu(!showQualityMenu); setShowSpeedMenu(false); setShowAudioMenu(false); setShowSubtitleMenu(false); setShowRatioMenu(false); }}
                                        className={`h-10 px-2.5 flex items-center font-bold text-[11px] rounded-xl border transition-all active:scale-90 ${showQualityMenu ? "bg-primary/20 text-primary-light border-primary/30" : "bg-white/5 border-white/10 text-white/70"}`}
                                    >
                                        {activeDownload ? `${activeDownload.resolution}p` : "Auto"}
                                    </button>
                                    {showQualityMenu && sortedDownloads.length > 0 && (
                                        <div className="absolute bottom-12 right-0 border border-zinc-800 rounded-xl p-2 min-w-[110px] flex flex-col z-50 shadow-2xl animate-fade-in bg-zinc-950">
                                            <p className="text-[10px] text-white/40 px-2 py-1 font-bold shrink-0">Quality</p>
                                            <div className="max-h-[150px] overflow-y-auto space-y-0.5 pr-1 custom-scrollbar">
                                                <button onClick={() => { setIsAutoQuality(true); setShowQualityMenu(false); const dq = sortedDownloads.find(d=>d.resolution===720)||sortedDownloads[0]; if(dq&&activeDownload?.id!==dq.id) handleQualityChange(dq,true); }} className={`w-full text-left text-xs font-semibold px-2.5 py-1.5 rounded-lg hover:bg-white/5 transition-colors ${isAutoQuality ? "text-primary bg-primary/10" : "text-white/80"}`}>Auto</button>
                                                {sortedDownloads.map((link, idx) => (
                                                    <button key={`${link.id||"q"}-${idx}`} onClick={() => { handleQualityChange(link); setShowQualityMenu(false); }} className={`w-full text-left text-xs font-semibold px-2.5 py-1.5 rounded-lg hover:bg-white/5 transition-colors ${!isAutoQuality && activeDownload?.id===link.id ? "text-primary bg-primary/10" : "text-white/80"}`}>{link.resolution}p</button>
                                                ))}
                                            </div>
                                        </div>
                                    )}
                                </div>

                                {/* Aspect Ratio */}
                                <div className="relative">
                                    <button
                                        onClick={(e) => { e.stopPropagation(); setShowRatioMenu(!showRatioMenu); setShowQualityMenu(false); setShowSpeedMenu(false); setShowAudioMenu(false); setShowSubtitleMenu(false); }}
                                        className={`w-10 h-10 flex items-center justify-center rounded-xl active:scale-90 transition-all ${showRatioMenu ? "text-primary bg-primary/10" : "text-white/60"}`}
                                    >
                                        <Scan className="w-5 h-5" />
                                    </button>
                                    {showRatioMenu && (
                                        <div className="absolute bottom-12 right-0 border border-zinc-800 rounded-xl p-2 min-w-[120px] flex flex-col space-y-0.5 z-50 shadow-2xl animate-fade-in bg-zinc-950">
                                            <p className="text-[10px] text-white/40 px-2 py-1 font-bold">Screen</p>
                                            {[{value:"contain" as const,label:"Fit"},{value:"fill" as const,label:"Stretch"},{value:"cover" as const,label:"Zoom"}].map(({value,label})=>(
                                                <button key={value} onClick={() => { setAspectRatio(value); setShowRatioMenu(false); }} className={`text-left text-xs font-semibold px-2.5 py-1.5 rounded-lg hover:bg-white/5 transition-colors ${aspectRatio===value?"text-primary bg-primary/10":"text-white/80"}`}>{label}</button>
                                            ))}
                                        </div>
                                    )}
                                </div>
                            </div>
                        </div>

                        {/* Seek bar row */}
                        <div className="flex items-center space-x-2">
                            <span className="text-white/70 font-mono text-[11px] select-none min-w-[36px] text-right">{formatTime(currentTime)}</span>

                            {/* Seek track */}
                            <div
                                className="flex-1 relative h-8 flex items-center cursor-pointer"
                                data-progress-bar
                                onTouchStart={(e) => {
                                    e.stopPropagation();
                                    setIsScrubbing(true);
                                    const track = e.currentTarget;
                                    if (videoRef.current) scrubbingTimeRef.current = videoRef.current.currentTime;
                                    const seek = (ev: TouchEvent) => {
                                        if (!videoRef.current || !duration || !ev.touches[0]) return;
                                        const rect = track.getBoundingClientRect();
                                        const x = Math.max(0, Math.min(ev.touches[0].clientX - rect.left, rect.width));
                                        const seekTime = (x / rect.width) * duration;
                                        scrubbingTimeRef.current = seekTime;
                                        setCurrentTime(seekTime);
                                    };
                                    const onEnd = () => {
                                        document.removeEventListener("touchmove", seek);
                                        document.removeEventListener("touchend", onEnd);
                                        setIsScrubbing(false);
                                        if (videoRef.current) {
                                            videoRef.current.currentTime = scrubbingTimeRef.current;
                                            if (!videoRef.current.paused) videoRef.current.play().catch(()=>{});
                                        }
                                        triggerControlsVisibility();
                                    };
                                    document.addEventListener("touchmove", seek);
                                    document.addEventListener("touchend", onEnd);
                                }}
                                onClick={(e) => {
                                    e.stopPropagation();
                                    if (!videoRef.current || !duration) return;
                                    const rect = e.currentTarget.getBoundingClientRect();
                                    const seekTime = Math.max(0, Math.min((e.clientX - rect.left) / rect.width, 1)) * duration;
                                    videoRef.current.currentTime = seekTime;
                                    setCurrentTime(seekTime);
                                    triggerControlsVisibility();
                                }}
                            >
                                <div className="relative w-full h-1.5 rounded-full bg-white/20">
                                    <div className="absolute top-0 left-0 h-full bg-white/35 rounded-full" style={{width:`${bufferedPercent}%`}} />
                                    <div className="absolute top-0 left-0 h-full bg-primary rounded-full shadow-[0_0_6px_var(--primary-glow)]" style={{width: duration>0 ? `${(currentTime/duration)*100}%` : "0%"}} />
                                    {/* Thumb */}
                                    <div className="absolute top-1/2 -translate-y-1/2 w-4 h-4 bg-white rounded-full shadow-lg border-2 border-primary pointer-events-none" style={{left: duration>0 ? `calc(${(currentTime/duration)*100}% - 8px)` : "0px"}} />
                                </div>
                            </div>

                            <span
                                onClick={() => setShowRemaining(prev => !prev)}
                                className="text-white/50 font-mono text-[11px] select-none min-w-[36px] text-left cursor-pointer"
                            >
                                {showRemaining ? `-${formatTime(Math.max(0, duration - currentTime))}` : formatTime(duration)}
                            </span>
                        </div>
                    </div>
                </div>

                {/* ══════════════════════════════════════════════════════
                    DESKTOP LAYOUT (hidden on mobile, shown sm+)
                    ══════════════════════════════════════════════════════ */}
                <div className="hidden sm:flex flex-col h-full from-black/50 via-transparent to-black/20">
                    {/* Top bar info */}
                    <div className="flex items-center justify-between p-8 w-full bg-gradient-to-b from-black/85 to-transparent">
                        <div className="text-white drop-shadow-md">
                            <h2 className="font-extrabold text-base line-clamp-1">{title}</h2>
                            {isSeries && season && episode && (
                                <p className="text-xs text-white/70 font-semibold mt-0.5">Season {season} • Episode {episode}</p>
                            )}
                        </div>
                    </div>

                    {/* Play/Pause center overlay (shows only on pause, hidden when any menu is open) */}
                    {!isPlaying && !isLoading && !showSubtitleMenu && !showAudioMenu && !showQualityMenu && !showSpeedMenu && !showRatioMenu && (
                        <button
                            onClick={togglePlay}
                            className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-16 h-16 rounded-full bg-primary/95 text-white flex items-center justify-center shadow-2xl transition-transform hover:scale-105 active:scale-95 z-10"
                        >
                            <Play className="w-7 h-7 fill-white translate-x-0.5" />
                        </button>
                    )}

                    {/* Bottom controls panel wrapped in a premium floating glass panel */}
                    <div className="w-full max-w-6xl mx-auto px-6 pb-6" data-controls-panel>
                        <div className="bg-zinc-950/85 backdrop-blur-md border border-white/10 rounded-2xl p-4 md:p-5 shadow-2xl space-y-4 transition-all duration-300 hover:border-white/15">
                            {/* Timeline Seek Scrubber Track */}
                            <div className="flex items-center space-x-3">
                                <span className="text-white/80 font-mono text-xs select-none min-w-[45px] text-right">{formatTime(currentTime)}</span>

                                {/* Custom progress bar with buffer indicator */}
                                <div
                                    className="grow relative h-5 flex items-center cursor-pointer group/scrub select-none"
                                    onClick={(e) => {
                                        e.stopPropagation();
                                        if (!videoRef.current || !duration) return;
                                        const rect = e.currentTarget.getBoundingClientRect();
                                        const x = e.clientX - rect.left;
                                        const seekTime = Math.max(0, Math.min(x / rect.width, 1)) * duration;
                                        videoRef.current.currentTime = seekTime;
                                        setCurrentTime(seekTime);
                                        triggerControlsVisibility();
                                        if (!videoRef.current.paused) videoRef.current.play().catch(()=>{});
                                    }}
                                    onMouseDown={(e) => {
                                        e.preventDefault(); e.stopPropagation();
                                        setIsScrubbing(true);
                                        const track = e.currentTarget;
                                        if (videoRef.current) scrubbingTimeRef.current = videoRef.current.currentTime;
                                        const seek = (ev: MouseEvent) => {
                                            if (!videoRef.current || !duration) return;
                                            const rect = track.getBoundingClientRect();
                                            const x = Math.max(0, Math.min(ev.clientX - rect.left, rect.width));
                                            const seekTime = (x / rect.width) * duration;
                                            scrubbingTimeRef.current = seekTime;
                                            setCurrentTime(seekTime);
                                        };
                                        const onUp = () => {
                                            document.removeEventListener("mousemove", seek);
                                            document.removeEventListener("mouseup", onUp);
                                            setIsScrubbing(false);
                                            if (videoRef.current) {
                                                videoRef.current.currentTime = scrubbingTimeRef.current;
                                                if (!videoRef.current.paused) videoRef.current.play().catch(()=>{});
                                            }
                                            triggerControlsVisibility();
                                        };
                                        document.addEventListener("mousemove", seek);
                                        document.addEventListener("mouseup", onUp);
                                    }}
                                    onTouchStart={(e) => {
                                        e.stopPropagation();
                                        setIsScrubbing(true);
                                        const track = e.currentTarget;
                                        if (videoRef.current) scrubbingTimeRef.current = videoRef.current.currentTime;
                                        const seek = (ev: TouchEvent) => {
                                            if (!videoRef.current || !duration || !ev.touches[0]) return;
                                            const rect = track.getBoundingClientRect();
                                            const x = Math.max(0, Math.min(ev.touches[0].clientX - rect.left, rect.width));
                                            scrubbingTimeRef.current = (x / rect.width) * duration;
                                            setCurrentTime(scrubbingTimeRef.current);
                                        };
                                        const onEnd = () => {
                                            document.removeEventListener("touchmove", seek);
                                            document.removeEventListener("touchend", onEnd);
                                            setIsScrubbing(false);
                                            if (videoRef.current) {
                                                videoRef.current.currentTime = scrubbingTimeRef.current;
                                                if (!videoRef.current.paused) videoRef.current.play().catch(()=>{});
                                            }
                                            triggerControlsVisibility();
                                        };
                                        document.addEventListener("touchmove", seek);
                                        document.addEventListener("touchend", onEnd);
                                    }}
                                >
                                    {/* Visual track */}
                                    <div className="relative w-full h-1 group-hover/scrub:h-2 transition-all rounded-full bg-white/20 overflow-hidden">
                                        <div className="absolute top-0 left-0 h-full bg-white/40 rounded-full" style={{width:`${bufferedPercent}%`}} />
                                        <div className="absolute top-0 left-0 h-full bg-primary rounded-full shadow-[0_0_6px_var(--primary-glow)]" style={{width: duration>0 ? `${(currentTime/duration)*100}%` : "0%"}} />
                                    </div>
                                    {/* Scrub thumb indicator */}
                                    <div
                                        className="absolute top-1/2 -translate-y-1/2 w-3.5 h-3.5 bg-primary rounded-full shadow-lg opacity-0 group-hover/scrub:opacity-100 transition-opacity pointer-events-none border-2 border-white"
                                        style={{left: duration>0 ? `calc(${(currentTime/duration)*100}% - 7px)` : "0px"}}
                                    />
                                </div>

                                <span
                                    onClick={() => setShowRemaining(prev => !prev)}
                                    className="text-white/60 font-mono text-xs select-none min-w-[45px] text-left cursor-pointer hover:text-white transition-colors"
                                    title={showRemaining ? "Click to show duration" : "Click to show remaining time"}
                                >
                                    {showRemaining ? `-${formatTime(Math.max(0, duration - currentTime))}` : formatTime(duration)}
                                </span>
                            </div>

                            {/* Controls Bar Row */}
                            <div className="flex items-center justify-between">
                                {/* Left Controls: Prev, Play, Next, Volume */}
                                <div className="flex items-center space-x-3">
                                    {isSeries && onPrevEpisode && (
                                        <button onClick={onPrevEpisode} className="p-2 rounded-xl text-white/80 hover:text-white hover:bg-white/10 transition-all focus:outline-none cursor-pointer flex items-center justify-center active:scale-90" title="Previous Episode">
                                            <SkipBack className="w-4 h-4 fill-white text-white" />
                                        </button>
                                    )}
                                    <button onClick={togglePlay} className="p-2 rounded-xl text-white/80 hover:text-white hover:bg-white/10 transition-all focus:outline-none cursor-pointer flex items-center justify-center active:scale-90">
                                        {isPlaying ? <Pause className="w-4.5 h-4.5 fill-white" /> : <Play className="w-4.5 h-4.5 fill-white" />}
                                    </button>
                                    {isSeries && onNextEpisode && (
                                        <button onClick={handleNextEpisodeClick} className="p-2 rounded-xl text-white/80 hover:text-white hover:bg-white/10 transition-all focus:outline-none cursor-pointer flex items-center justify-center active:scale-90" title="Next Episode">
                                            <SkipForward className="w-4 h-4 fill-white text-white" />
                                        </button>
                                    )}
                                    {/* Volume */}
                                    <div className="flex items-center space-x-2">
                                        <button onClick={toggleMute} className="p-2 rounded-xl text-white/80 hover:text-white hover:bg-white/10 transition-all focus:outline-none cursor-pointer flex items-center justify-center">
                                            {isMuted || volume === 0 ? <VolumeX className="w-4.5 h-4.5 text-primary" /> : volume < 0.5 ? <Volume1 className="w-4.5 h-4.5" /> : <Volume2 className="w-4.5 h-4.5" />}
                                        </button>
                                        <input type="range" min="0" max="1" step="0.05" value={isMuted ? 0 : volume} onChange={handleVolumeChange} className="w-20 accent-primary cursor-pointer h-1 bg-white/20 rounded-lg outline-none hover:bg-white/30 transition-all" />
                                    </div>
                                </div>

                                {/* Right Controls: Subtitle, Audio, Quality, Speed, Ratio, PiP, Fullscreen */}
                                <div className="flex items-center space-x-2 relative">
                                    {captions.length > 0 && (
                                        <div ref={subtitleMenuRef} className="relative">
                                            <button onClick={() => { setShowSubtitleMenu(!showSubtitleMenu); setShowQualityMenu(false); setShowSpeedMenu(false); setShowAudioMenu(false); setShowRatioMenu(false); }} className={`p-2 rounded-xl transition-all focus:outline-none cursor-pointer flex items-center justify-center hover:bg-white/10 ${showSubtitleMenu || showSubtitles ? "text-primary bg-primary/10" : "text-white/70 hover:text-white"}`} title="Subtitles">
                                                <Subtitles className="w-4.5 h-4.5" />
                                            </button>
                                            {showSubtitleMenu && (
                                                <div className="absolute bottom-14 right-0 border border-zinc-800 rounded-2xl p-2.5 min-w-[140px] flex flex-col z-50 shadow-2xl animate-fade-in bg-zinc-950 bg-linear-to-b from-zinc-900 to-black">
                                                    <p className="text-[10px] text-white/40 px-2 py-1 font-bold shrink-0">Subtitles</p>
                                                    <div className="max-h-[160px] overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                                                        <button onClick={() => handleSubtitleChange(null)} className={`w-full text-left text-xs font-semibold px-2.5 py-1.5 rounded-lg hover:bg-white/5 transition-colors ${!activeCaption ? "text-primary bg-primary/10" : "text-white/80"}`}>Off</button>
                                                        {captions.map((caption) => (
                                                            <button key={caption.id || caption.url} onClick={() => handleSubtitleChange(caption)} className={`w-full text-left text-xs font-semibold px-2.5 py-1.5 rounded-lg hover:bg-white/5 transition-colors ${activeCaption?.id === caption.id ? "text-primary bg-primary/10" : "text-white/80"}`}>{caption.lanName}</button>
                                                        ))}
                                                    </div>
                                                    <div className="h-px bg-zinc-800 my-1 shrink-0" />
                                                    <p className="text-[10px] text-white/40 px-2 py-1 font-bold shrink-0">Size</p>
                                                    <div className="flex items-center justify-between px-1 py-1 shrink-0">
                                                        {["16px","22px","28px","36px"].map((size, i) => (
                                                            <button key={size} onClick={() => setSubtitleSize(size)} className={`text-[9px] font-black px-1.5 py-1 rounded transition-colors ${subtitleSize === size ? "text-primary bg-primary/10" : "text-white/60"}`}>{["SM","MD","LG","XL"][i]}</button>
                                                        ))}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    {dubs && dubs.length > 0 && (
                                        <div ref={audioMenuRef} className="relative">
                                            <button onClick={() => { setShowAudioMenu(!showAudioMenu); setShowQualityMenu(false); setShowSpeedMenu(false); setShowSubtitleMenu(false); setShowRatioMenu(false); }} className={`p-2 rounded-xl transition-all focus:outline-none cursor-pointer flex items-center justify-center hover:bg-white/10 ${showAudioMenu ? "text-primary bg-primary/10" : "text-white/70 hover:text-white"}`} title="Change Audio Track">
                                                <Headphones className="w-4.5 h-4.5" />
                                            </button>
                                            {showAudioMenu && (
                                                <div className="absolute bottom-14 right-0 border border-zinc-800 rounded-2xl p-2.5 min-w-[140px] flex flex-col z-50 shadow-2xl animate-fade-in bg-zinc-950 bg-linear-to-b from-zinc-900 to-black">
                                                    <p className="text-[10px] text-white/40 px-2 py-1 font-bold shrink-0">Audio Track</p>
                                                    <div className="max-h-[180px] overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                                                        {dubs.map((dub, idx) => {
                                                            const isCurrent = detailPath === dub.detailPath;
                                                            return (
                                                                <button key={idx} onClick={() => { setShowAudioMenu(false); const ep = isSeries && season && episode ? `?season=${season}&episode=${episode}` : ""; window.location.href = `/watch/${dub.detailPath}${ep}`; }} className={`w-full text-left text-xs font-semibold px-2.5 py-1.5 rounded-lg hover:bg-white/5 transition-colors ${isCurrent ? "text-primary bg-primary/10" : "text-white/80"}`}>{dub.lanName}{dub.original ? " (Original)" : ""}</button>
                                                            );
                                                        })}
                                                    </div>
                                                </div>
                                            )}
                                        </div>
                                    )}

                                    <div ref={qualityMenuRef} className="relative">
                                        <button onClick={() => { setShowQualityMenu(!showQualityMenu); setShowSpeedMenu(false); setShowAudioMenu(false); setShowSubtitleMenu(false); setShowRatioMenu(false); }} className={`flex items-center space-x-1.5 font-bold text-xs px-3 py-1.5 rounded-xl border transition-all cursor-pointer ${showQualityMenu ? "bg-primary/20 text-primary-light border-primary/30" : "bg-white/5 border-white/10 text-white/80 hover:text-white hover:bg-white/10 hover:border-white/20"}`}>
                                            <span>{activeDownload ? isAutoQuality ? `Auto (${activeDownload.resolution}p)` : `${activeDownload.resolution}p` : "Auto"}</span>
                                            <Settings className="w-3.5 h-3.5" />
                                        </button>
                                        {showQualityMenu && sortedDownloads.length > 0 && (
                                            <div className="absolute bottom-14 right-0 border border-zinc-800 rounded-2xl p-2.5 min-w-[130px] flex flex-col z-50 shadow-2xl animate-fade-in bg-zinc-950 bg-linear-to-b from-zinc-900 to-black">
                                                <p className="text-[10px] text-white/40 px-2 py-1 font-bold shrink-0">Quality</p>
                                                <div className="max-h-[180px] overflow-y-auto space-y-1 pr-1 custom-scrollbar">
                                                    <button onClick={() => { setIsAutoQuality(true); setShowQualityMenu(false); const dq = sortedDownloads.find(d=>d.resolution===720)||sortedDownloads.find(d=>d.resolution===1080)||sortedDownloads[0]; if(dq&&activeDownload?.id!==dq.id) handleQualityChange(dq,true); }} className={`w-full text-left text-xs font-semibold px-2.5 py-1.5 rounded-lg hover:bg-white/5 transition-colors ${isAutoQuality ? "text-primary bg-primary/10" : "text-white/80"}`}>Auto</button>
                                                    {sortedDownloads.map((link, idx) => (
                                                        <button key={`${link.id||"quality"}-${idx}`} onClick={() => { handleQualityChange(link); setShowQualityMenu(false); }} className={`w-full text-left text-xs font-semibold px-2.5 py-1.5 rounded-lg hover:bg-white/5 transition-colors ${!isAutoQuality && activeDownload?.id===link.id ? "text-primary bg-primary/10" : "text-white/80"}`}>{link.resolution}p</button>
                                                    ))}
                                                </div>
                                            </div>
                                        )}
                                    </div>

                                    <div ref={speedMenuRef} className="relative">
                                        <button onClick={() => { setShowSpeedMenu(!showSpeedMenu); setShowQualityMenu(false); setShowAudioMenu(false); setShowSubtitleMenu(false); setShowRatioMenu(false); }} className={`text-xs font-bold px-3 py-1.5 rounded-xl transition-all cursor-pointer hover:bg-white/10 ${showSpeedMenu ? "text-primary bg-primary/10" : "text-white/80 hover:text-white"}`}>{playbackRate}x</button>
                                        {showSpeedMenu && (
                                            <div className="absolute bottom-14 right-0 border border-zinc-800 rounded-2xl p-2.5 min-w-[100px] flex flex-col space-y-1 z-50 shadow-2xl animate-fade-in bg-zinc-950 bg-linear-to-b from-zinc-900 to-black">
                                                <p className="text-[10px] text-white/40 px-2 py-1 font-bold">Speed</p>
                                                {[0.5,0.75,1.0,1.25,1.5,2.0].map((rate) => (
                                                    <button key={rate} onClick={() => handleSpeedChange(rate)} className={`text-left text-xs font-semibold px-2.5 py-1.5 rounded-lg hover:bg-white/5 transition-colors ${playbackRate===rate ? "text-primary bg-primary/10" : "text-white/80"}`}>{rate.toFixed(1)}x</button>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    <div ref={ratioMenuRef} className="relative">
                                        <button onClick={() => { setShowRatioMenu(!showRatioMenu); setShowQualityMenu(false); setShowSpeedMenu(false); setShowAudioMenu(false); setShowSubtitleMenu(false); }} className={`p-2 rounded-xl transition-all focus:outline-none cursor-pointer flex items-center justify-center hover:bg-white/10 ${showRatioMenu ? "text-primary bg-primary/10" : "text-white/70 hover:text-white"}`} title="Aspect Ratio">
                                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="w-4.5 h-4.5"><rect x="3" y="5" width="18" height="14" rx="2"/><path d="M 9 15 L 15 9"/><path d="M 12 9 L 15 9 L 15 12"/><path d="M 12 15 L 9 15 L 9 12"/></svg>
                                        </button>
                                        {showRatioMenu && (
                                            <div className="absolute bottom-14 right-0 border border-zinc-800 rounded-2xl p-2.5 min-w-[130px] flex flex-col space-y-1 z-50 shadow-2xl animate-fade-in bg-zinc-950 bg-linear-to-b from-zinc-900 to-black">
                                                <p className="text-[10px] text-white/40 px-2 py-1 font-bold">Screen Size</p>
                                                {[{value:"contain" as const,label:"Fit Screen"},{value:"fill" as const,label:"Stretch Screen"},{value:"cover" as const,label:"Zoom / Fill"}].map(({value,label})=>(
                                                    <button key={value} onClick={() => { setAspectRatio(value); setShowRatioMenu(false); }} className={`text-left text-xs font-semibold px-2.5 py-1.5 rounded-lg hover:bg-white/5 transition-colors ${aspectRatio===value ? "text-primary bg-primary/10" : "text-white/80"}`}>{label}</button>
                                                ))}
                                            </div>
                                        )}
                                    </div>

                                    {isPiPSupported && (
                                        <button onClick={togglePiP} className={`p-2 rounded-xl transition-all focus:outline-none cursor-pointer flex items-center justify-center hover:bg-white/10 ${isPiPActive ? "text-primary bg-primary/10" : "text-white/70 hover:text-white"}`} title="Picture-in-Picture">
                                            <PictureInPicture2 className="w-4.5 h-4.5" />
                                        </button>
                                    )}

                                    <button onClick={toggleFullscreen} className="p-2 rounded-xl text-white/70 hover:text-white hover:bg-white/10 transition-all focus:outline-none cursor-pointer flex items-center justify-center active:scale-90" title={isFullscreen ? "Exit Fullscreen" : "Fullscreen"}>
                                        {isFullscreen ? <Minimize className="w-4.5 h-4.5" /> : <Maximize className="w-4.5 h-4.5" />}
                                    </button>
                                </div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
