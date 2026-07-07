'use client';

import { useRef, useState, useEffect } from 'react';
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
  AlertTriangle
} from 'lucide-react';
import { StreamData, DownloadLink, Caption, DubModel } from '@/lib/api';
import { localStore } from '@/lib/storage';

interface VideoPlayerProps {
  streamData: StreamData;
  title: string;
  coverUrl: string;
  detailPath: string;
  isSeries: boolean;
  season?: number;
  episode?: number;
  dubs?: DubModel[];
}

export default function VideoPlayer({
  streamData,
  title,
  coverUrl,
  detailPath,
  isSeries,
  season,
  episode,
  dubs
}: VideoPlayerProps) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  // Stream options
  const downloads = streamData.downloads || [];
  const captions = streamData.captions || [];

  // Sort qualities from highest to lowest
  const sortedDownloads = [...downloads].sort((a, b) => b.resolution - a.resolution);

  // States
  const [activeDownload, setActiveDownload] = useState<DownloadLink | null>(null);
  const [subtitleUrl, setSubtitleUrl] = useState<string>('');
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [volume, setVolume] = useState(1);
  const [isMuted, setIsMuted] = useState(false);
  const [playbackRate, setPlaybackRate] = useState(1);
  const [isFullscreen, setIsFullscreen] = useState(false);
  
  const [showControls, setShowControls] = useState(true);
  const [isLoading, setIsLoading] = useState(true);
  const [showQualityMenu, setShowQualityMenu] = useState(false);
  const [showSpeedMenu, setShowSpeedMenu] = useState(false);
  const [showSubtitles, setShowSubtitles] = useState(true);
  const [playerError, setPlayerError] = useState(false);
  const [showAudioMenu, setShowAudioMenu] = useState(false);

  // Track user inactivity to auto-hide controls
  const controlsTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  // Initialize source on mount or stream data update
  useEffect(() => {
    if (sortedDownloads.length > 0) {
      // Pick 1080p or highest available by default
      const defaultQuality = sortedDownloads.find(d => d.resolution === 1080) || sortedDownloads[0];
      setActiveDownload(defaultQuality);
    } else {
      setActiveDownload(null);
    }

    // Convert SRT to WebVTT if subtitle exists
    if (captions.length > 0) {
      loadSubtitleTrack(captions[0].url);
    } else {
      setSubtitleUrl('');
    }

    setIsPlaying(false);
    setIsLoading(true);
    setPlayerError(false);
    setShowAudioMenu(false);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [streamData]);

  // Set referrerPolicy directly on the video DOM element to bypass TypeScript's type check limit
  useEffect(() => {
    if (videoRef.current) {
      videoRef.current.setAttribute('referrerpolicy', 'no-referrer');
    }
  }, [activeDownload]);

  // Convert SRT to WebVTT Blob URL
  const loadSubtitleTrack = async (srtUrl: string) => {
    try {
      const res = await fetch(srtUrl);
      if (!res.ok) throw new Error('Subtitles failed to load.');
      const srtText = await res.text();
      
      // Simple SRT to WebVTT formatting conversion
      let vttText = 'WEBVTT\n\n';
      // Replace SRT comma decimals with WebVTT periods
      vttText += srtText.replace(/(\d{2}:\d{2}:\d{2}),(\d{3})/g, '$1.$2');
      
      const blob = new Blob([vttText], { type: 'text/vtt' });
      const objectUrl = URL.createObjectURL(blob);
      setSubtitleUrl(objectUrl);
    } catch (e) {
      console.error('Subtitle parse error:', e);
      setSubtitleUrl('');
    }
  };

  // Setup continue watching resume timestamp on load
  const handleLoadedMetadata = () => {
    setDuration(videoRef.current?.duration || 0);
    setIsLoading(false);
    setPlayerError(false);

    // Check history to resume
    const history = localStore.getHistory();
    let currentHistoryItem = history.find(h => h.detailPath === detailPath);

    // Fallback: If not found, find by title/season/episode to support audio track swaps
    if (!currentHistoryItem) {
      currentHistoryItem = history.find(h => 
        h.title === title && 
        (!isSeries || (h.season === season && h.episode === episode))
      );
    }

    if (currentHistoryItem && videoRef.current) {
      // Resume only if watched less than 95% and more than 5 seconds
      if (currentHistoryItem.progress < 95 && currentHistoryItem.currentTime > 5) {
        videoRef.current.currentTime = currentHistoryItem.currentTime;
      }
    }
  };


  const handlePlayerError = (e: any) => {
    console.error('Video player source error:', e);
    setPlayerError(true);
    setIsLoading(false);
  };

  // Listen to time updates and sync progress with storage
  const handleTimeUpdate = () => {
    if (!videoRef.current) return;
    const current = videoRef.current.currentTime;
    setCurrentTime(current);

    // Save history progress every 3 seconds to avoid spamming
    if (duration > 0 && Math.floor(current) % 3 === 0) {
      const progressPercent = Math.min(Math.round((current / duration) * 100), 100);
      localStore.saveHistoryItem({
        detailPath,
        title,
        coverUrl,
        duration,
        currentTime: current,
        progress: progressPercent,
        isSeries,
        season,
        episode
      });
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
          const progressPercent = Math.min(Math.round((current / dur) * 100), 100);
          localStore.saveHistoryItem({
            detailPath,
            title,
            coverUrl,
            duration: dur,
            currentTime: current,
            progress: progressPercent,
            isSeries,
            season,
            episode
          });
        }
      }
    };
  }, [detailPath, title, coverUrl, isSeries, season, episode, duration]);


  // Resolution selector handles video source swapping
  const handleQualityChange = (quality: DownloadLink) => {
    if (!videoRef.current || !activeDownload) return;
    const currentPlayTime = videoRef.current.currentTime;
    const wasPlaying = !videoRef.current.paused;
    
    setIsLoading(true);
    setActiveDownload(quality);
    
    // Swap source and reload
    videoRef.current.src = quality.url;
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
        videoRef.current.removeEventListener('canplay', restoreTime);
      }
    };
    
    videoRef.current.addEventListener('canplay', restoreTime);
    setShowQualityMenu(false);
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
    triggerControlsVisibility();
  };

  // Seek bar scrubber scrubbing
  const handleScrubberChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (!videoRef.current) return;
    const seekTime = Number(e.target.value);
    videoRef.current.currentTime = seekTime;
    setCurrentTime(seekTime);
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
      containerRef.current.requestFullscreen().then(() => {
        setIsFullscreen(true);
      }).catch((err) => {
        console.error('Fullscreen request failed:', err);
      });
    } else {
      document.exitFullscreen();
      setIsFullscreen(false);
    }
  };

  // Track fullscreen changes directly on document level (e.g. Escape key presses)
  useEffect(() => {
    const handleFullscreenChange = () => {
      setIsFullscreen(!!document.fullscreenElement);
    };
    document.addEventListener('fullscreenchange', handleFullscreenChange);
    return () => document.removeEventListener('fullscreenchange', handleFullscreenChange);
  }, []);

  // Controls Visibility Timers
  const triggerControlsVisibility = () => {
    setShowControls(true);
    if (controlsTimeoutRef.current) {
      clearTimeout(controlsTimeoutRef.current);
    }
    
    // Hide controls after 3 seconds of inactivity while playing
    if (isPlaying) {
      controlsTimeoutRef.current = setTimeout(() => {
        setShowControls(false);
        setShowQualityMenu(false);
        setShowSpeedMenu(false);
        setShowAudioMenu(false);
      }, 3000);
    }
  };

  // Auto clean timer
  useEffect(() => {
    return () => {
      if (controlsTimeoutRef.current) clearTimeout(controlsTimeoutRef.current);
    };
  }, [isPlaying]);

  // Format second timestamps to HH:MM:SS text
  const formatTime = (seconds: number) => {
    const hrs = Math.floor(seconds / 3600);
    const mins = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    if (hrs > 0) {
      return `${hrs}:${mins < 10 ? '0' : ''}${mins}:${secs < 10 ? '0' : ''}${secs}`;
    }
    return `${mins}:${secs < 10 ? '0' : ''}${secs}`;
  };

  // Toggle Subtitle track display mode
  useEffect(() => {
    if (videoRef.current && videoRef.current.textTracks.length > 0) {
      videoRef.current.textTracks[0].mode = showSubtitles ? 'showing' : 'disabled';
    }
  }, [showSubtitles, subtitleUrl]);

  return (
    <div
      ref={containerRef}
      onMouseMove={triggerControlsVisibility}
      onMouseLeave={() => isPlaying && setShowControls(false)}
      className="relative w-full h-full bg-black select-none overflow-hidden group/player"
    >
      {/* Video Node */}
      {activeDownload && !playerError && (
        <video
          ref={videoRef}
          src={`/api/video?url=${encodeURIComponent(activeDownload.url)}`}
          className="w-full h-full object-contain cursor-pointer"
          onPlay={() => setIsPlaying(true)}
          onPause={() => setIsPlaying(false)}
          onLoadedMetadata={handleLoadedMetadata}
          onTimeUpdate={handleTimeUpdate}
          onWaiting={() => setIsLoading(true)}
          onPlaying={() => setIsLoading(false)}
          onError={handlePlayerError}
          onClick={togglePlay}
          onDoubleClick={toggleFullscreen}
          autoPlay
          playsInline
        >
          {/* Subtitle track */}
          {subtitleUrl && (
            <track
              kind="subtitles"
              src={subtitleUrl}
              srcLang="en"
              label="English"
              default
            />
          )}
        </video>
      )}

      {/* Loading state spinner */}
      {isLoading && (
        <div className="absolute inset-0 bg-black/60 backdrop-blur-[2px] flex items-center justify-center z-30 pointer-events-none">
          <Loader2 className="w-12 h-12 text-primary animate-spin" />
        </div>
      )}

      {/* Error state overlay */}
      {playerError && (
        <div className="absolute inset-0 bg-zinc-950 flex flex-col items-center justify-center p-6 text-center z-30">
          <AlertTriangle className="w-14 h-14 text-yellow-500 mb-4 animate-pulse" />
          <h3 className="text-white font-extrabold text-lg mb-2">Video playback failed</h3>
          <p className="text-sm text-white/50 max-w-sm mb-6">
            The mirror streaming url failed to resolve. Try switching the resolution or checking other mirrors.
          </p>
          <button
            onClick={() => {
              setPlayerError(false);
              setIsLoading(true);
              if (videoRef.current) {
                videoRef.current.load();
              } else if (activeDownload) {
                // Force state swap to trigger remount
                const curr = activeDownload;
                setActiveDownload(null);
                setTimeout(() => setActiveDownload(curr), 50);
              }
            }}
            className="px-6 py-2.5 rounded-xl bg-primary hover:bg-primary/90 text-white font-bold text-sm transition-all"
          >
            Retry Playing
          </button>
        </div>
      )}

      {/* Custom Overlay Controls HUD */}
      <div
        className={`absolute inset-0 bg-gradient-to-t from-black/80 via-transparent to-black/40 z-20 flex flex-col justify-between p-4 transition-opacity duration-300 ${
          showControls ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
      >
        {/* Top bar info */}
        <div className="flex items-center justify-between">
          <div className="text-white drop-shadow-md">
            <h2 className="font-extrabold text-sm sm:text-base line-clamp-1">{title}</h2>
            {isSeries && season && episode && (
              <p className="text-[10px] sm:text-xs text-white/70 font-semibold">
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

        {/* Bottom controls panel */}
        <div className="space-y-4">
          {/* Timeline Seek Scrubber Track */}
          <div className="flex items-center space-x-3">
            <span className="text-white font-mono text-xs select-none">
              {formatTime(currentTime)}
            </span>
            
            <input
              type="range"
              min="0"
              max={duration || 100}
              value={currentTime}
              onChange={handleScrubberChange}
              className="flex-grow accent-primary cursor-pointer h-1 hover:h-1.5 transition-all bg-white/20 rounded-lg outline-none"
            />
            
            <span className="text-white/60 font-mono text-xs select-none">
              {formatTime(duration)}
            </span>
          </div>

          {/* Controls Bar Row */}
          <div className="flex items-center justify-between">
            {/* Left Controls: Play, Skip/Rewind, Volume */}
            <div className="flex items-center space-x-4">
              {/* Play Pause */}
              <button
                onClick={togglePlay}
                className="text-white hover:text-primary-light transition-colors focus:outline-none"
              >
                {isPlaying ? <Pause className="w-5 h-5 fill-white" /> : <Play className="w-5 h-5 fill-white" />}
              </button>

              {/* Volume Scrubber Panel */}
              <div className="flex items-center space-x-2 group/volume">
                <button
                  onClick={toggleMute}
                  className="text-white hover:text-primary-light transition-colors focus:outline-none"
                >
                  {isMuted || volume === 0 ? (
                    <VolumeX className="w-5 h-5" />
                  ) : volume < 0.5 ? (
                    <Volume1 className="w-5 h-5" />
                  ) : (
                    <Volume2 className="w-5 h-5" />
                  )}
                </button>
                <input
                  type="range"
                  min="0"
                  max="1"
                  step="0.05"
                  value={isMuted ? 0 : volume}
                  onChange={handleVolumeChange}
                  className="w-0 group-hover/volume:w-16 transition-all duration-300 accent-white cursor-pointer h-1 bg-white/30 rounded-lg outline-none"
                />
              </div>
            </div>

            {/* Right Controls: Subtitle, Speed, Quality, Fullscreen */}
            <div className="flex items-center space-x-4 relative">
              {/* Subtitles toggle */}
              {subtitleUrl && (
                <button
                  onClick={() => setShowSubtitles(!showSubtitles)}
                  className={`transition-colors focus:outline-none ${
                    showSubtitles ? 'text-primary-light' : 'text-white/60 hover:text-white'
                  }`}
                  title="Toggle subtitles"
                >
                  <Subtitles className="w-5 h-5" />
                </button>
              )}

              {/* Audio/Dub selector popup */}
              {dubs && dubs.length > 0 && (
                <div className="relative">
                  <button
                    onClick={() => {
                      setShowAudioMenu(!showAudioMenu);
                      setShowQualityMenu(false);
                      setShowSpeedMenu(false);
                    }}
                    className={`transition-colors focus:outline-none flex items-center space-x-1 ${
                      showAudioMenu ? 'text-primary-light' : 'text-white/60 hover:text-white'
                    }`}
                    title="Change Audio Track"
                  >
                    <Volume2 className="w-5 h-5" />
                  </button>

                  {showAudioMenu && (
                    <div className="absolute bottom-10 right-0 glass-panel border border-white/10 rounded-xl p-2 min-w-[125px] flex flex-col space-y-1 z-30 shadow-2xl animate-fade-in bg-zinc-950">
                      <p className="text-[10px] text-white/40 px-2 py-1 font-bold">Audio Track</p>
                      {dubs.map((dub, idx) => {
                        const isCurrent = detailPath === dub.detailPath;
                        return (
                          <button
                            key={idx}
                            onClick={() => {
                              setShowAudioMenu(false);
                              window.location.href = `/watch/${dub.detailPath}`;
                            }}
                            className={`text-left text-xs font-semibold px-2 py-1.5 rounded-lg hover:bg-white/5 transition-colors ${
                              isCurrent ? 'text-primary-light bg-primary/10' : 'text-white/80'
                            }`}
                          >
                            {dub.lanName} {dub.original ? '(Original)' : ''}
                          </button>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}

              {/* Quality Settings Dial Selector */}
              <div className="relative">
                <button
                  onClick={() => {
                    setShowQualityMenu(!showQualityMenu);
                    setShowSpeedMenu(false);
                  }}
                  className={`flex items-center space-x-1 font-bold text-xs px-2 py-1 rounded border transition-colors ${
                    showQualityMenu
                      ? 'bg-primary/20 text-primary-light border-primary/30'
                      : 'bg-white/5 border-white/10 text-white/80 hover:text-white'
                  }`}
                >
                  <span>{activeDownload ? `${activeDownload.resolution}p` : 'Auto'}</span>
                  <Settings className="w-3.5 h-3.5" />
                </button>

                {showQualityMenu && sortedDownloads.length > 0 && (
                  <div className="absolute bottom-10 right-0 glass-panel border border-white/10 rounded-xl p-2 min-w-[100px] flex flex-col space-y-1 z-30 shadow-2xl animate-fade-in">
                    <p className="text-[10px] text-white/40 px-2 py-1 font-bold">Quality</p>
                    {sortedDownloads.map((link) => (
                      <button
                        key={link.id}
                        onClick={() => handleQualityChange(link)}
                        className={`text-left text-xs font-semibold px-2 py-1.5 rounded-lg hover:bg-white/5 transition-colors ${
                          activeDownload?.id === link.id ? 'text-primary-light bg-primary/10' : 'text-white/80'
                        }`}
                      >
                        {link.resolution}p
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Speed Settings Dial Selector */}
              <div className="relative">
                <button
                  onClick={() => {
                    setShowSpeedMenu(!showSpeedMenu);
                    setShowQualityMenu(false);
                  }}
                  className={`text-xs font-bold px-2 py-1.5 rounded transition-colors ${
                    showSpeedMenu
                      ? 'text-primary-light bg-primary/10'
                      : 'text-white/80 hover:text-white'
                  }`}
                >
                  {playbackRate}x
                </button>

                {showSpeedMenu && (
                  <div className="absolute bottom-10 right-0 glass-panel border border-white/10 rounded-xl p-2 min-w-[90px] flex flex-col space-y-1 z-30 shadow-2xl animate-fade-in">
                    <p className="text-[10px] text-white/40 px-2 py-1 font-bold">Speed</p>
                    {[0.5, 0.75, 1.0, 1.25, 1.5, 2.0].map((rate) => (
                      <button
                        key={rate}
                        onClick={() => handleSpeedChange(rate)}
                        className={`text-left text-xs font-semibold px-2 py-1.5 rounded-lg hover:bg-white/5 transition-colors ${
                          playbackRate === rate ? 'text-primary-light bg-primary/10' : 'text-white/80'
                        }`}
                      >
                        {rate.toFixed(1)}x
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* Fullscreen Trigger */}
              <button
                onClick={toggleFullscreen}
                className="text-white hover:text-primary-light transition-colors focus:outline-none"
              >
                {isFullscreen ? <Minimize className="w-5 h-5" /> : <Maximize className="w-5 h-5" />}
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}
