'use client';

import { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Heart, Star, Calendar, Volume2, UserCheck, Play, ArrowLeft, Loader2 } from 'lucide-react';
import { ItemDetails, StreamData } from '@/lib/api';
import { localStore } from '@/lib/storage';
import VideoPlayer from '@/components/video-player';
import MovieShelf from '@/components/movie-shelf';
import Link from 'next/link';

interface WatchClientProps {
  path: string;
  details: ItemDetails;
  stream: StreamData;
  activeSeason: number;
  activeEpisode: number;
}

export default function WatchClient({
  path,
  details,
  stream,
  activeSeason,
  activeEpisode,
}: WatchClientProps) {
  const router = useRouter();
  const [isPageLoading, setIsPageLoading] = useState(false);

  // Destructure details object properties correctly
  const { subject, stars, resource, related, metadata } = details;

  // Reset loading state when page data updates
  useEffect(() => {
    setIsPageLoading(false);
  }, [path, stream]);

  // Watchlist status
  const [isInWatchlist, setIsInWatchlist] = useState(false);

  useEffect(() => {
    setIsInWatchlist(localStore.isInWatchlist(subject.detailPath));
  }, [subject.detailPath]);

  const handleWatchlistToggle = () => {
    const added = localStore.toggleWatchlist({
      detailPath: subject.detailPath,
      title: subject.title,
      coverUrl: subject.cover?.url || '',
      subjectType: subject.subjectType,
      imdbRatingValue: subject.imdbRatingValue,
      releaseDate: subject.releaseDate || '',
      corner: subject.corner || '',
    });
    setIsInWatchlist(added);
  };

  // Series identification logic
  const isSeries = subject.subjectType === 2 || subject.subjectType === 7 || (resource?.seasons && resource.seasons.length > 0);
  const [selectedSeason, setSelectedSeason] = useState(activeSeason || 1);

  // Find max episodes in the current selected season
  const currentSeasonData = resource?.seasons?.find((s) => s.se === selectedSeason);
  const totalEpisodes = currentSeasonData?.maxEp || 0;

  const handleEpisodeClick = (epNum: number) => {
    setIsPageLoading(true);
    router.push(`/watch/${path}?season=${selectedSeason}&episode=${epNum}`);
  };

  const handleAudioClick = (detailPath: string) => {
    setIsPageLoading(true);
    router.push(`/watch/${detailPath}${isSeries ? `?season=${selectedSeason}&episode=${activeEpisode}` : ''}`);
  };

  return (
    <div className="max-w-[95rem] mx-auto px-4 sm:px-6 lg:px-8 py-6 animate-fade-in relative z-20">
      {/* Back to Catalog button */}
      <button
        onClick={() => router.back()}
        className="flex items-center space-x-2 text-foreground/50 hover:text-primary transition-colors mb-6 text-xs font-black uppercase tracking-wider group focus:outline-none cursor-pointer"
      >
        <ArrowLeft className="w-4 h-4 group-hover:-translate-x-1 transition-transform" />
        <span>Back to Catalog</span>
      </button>

      {/* Video Player Display */}
      <div className="w-full mb-8 rounded-3xl overflow-hidden shadow-card border border-glass-border relative">
        <VideoPlayer
          streamData={stream}
          detailPath={path}
          title={subject.title}
          coverUrl={subject.cover?.url || ''}
          isSeries={isSeries}
          season={isSeries ? activeSeason : undefined}
          episode={isSeries ? activeEpisode : undefined}
          dubs={subject.dubs}
        />
        {isPageLoading && (
          <div className="absolute inset-0 bg-black/75 backdrop-blur-md flex flex-col items-center justify-center z-40 animate-fade-in">
            <Loader2 className="w-10 h-10 text-primary animate-spin mb-3.5" />
            <p className="text-xs text-white font-bold uppercase tracking-widest">Loading Audio Stream...</p>
          </div>
        )}
      </div>

      {/* Metadata & Guide columns */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Left Col - Details */}
        <div className="lg:col-span-2 space-y-6">
          <div className="p-6 sm:p-8 rounded-3xl glass-panel border border-glass-border shadow-card space-y-6">
            <div>
              {isSeries && (
                <span className="text-[9px] font-black uppercase tracking-widest text-primary bg-primary/10 border border-primary/20 px-3 py-1.5 rounded-full select-none">
                  TV Series • Season {activeSeason} Episode {activeEpisode}
                </span>
              )}
              <h1 className="text-xl sm:text-2xl md:text-3.5xl font-black text-foreground tracking-tight mt-3">
                {subject.title}
              </h1>
            </div>

            {/* Icons indicators row */}
            <div className="flex flex-wrap items-center gap-3 text-xs font-bold">
              {subject.imdbRatingValue && (
                <div className="flex items-center space-x-1.5 bg-yellow-500/10 border border-yellow-500/20 px-3 py-1.5 rounded-xl text-yellow-600 select-none">
                  <Star className="w-3.5 h-3.5 fill-yellow-500 text-yellow-500" />
                  <span>{subject.imdbRatingValue.toFixed(1)} IMDB</span>
                </div>
              )}
              {subject.releaseDate && (
                <div className="flex items-center space-x-1.5 bg-glass-card border border-glass-border px-3 py-1.5 rounded-xl text-foreground/75 select-none">
                  <Calendar className="w-3.5 h-3.5 text-primary" />
                  <span>{subject.releaseDate.split('-')[0]}</span>
                </div>
              )}

              {/* Bookmark Watchlist Button */}
              <button
                onClick={handleWatchlistToggle}
                className={`flex items-center space-x-1.5 px-4 py-1.5 rounded-xl border transition-all cursor-pointer select-none text-xs font-bold uppercase tracking-wider ${
                  isInWatchlist
                    ? 'bg-primary border-primary/20 text-white shadow-lg shadow-primary-glow'
                    : 'bg-glass-card hover:bg-glass-panel border-glass-border text-foreground/75 shadow-sm'
                }`}
              >
                <Heart className={`w-3.5 h-3.5 ${isInWatchlist ? 'fill-white text-white' : ''}`} />
                <span>{isInWatchlist ? 'Saved' : 'Bookmark'}</span>
              </button>
            </div>

            {/* Categories and Taglines */}
            {subject.genre && subject.genre.length > 0 && (
              <div className="flex flex-wrap gap-2 pt-4 border-t border-glass-border">
                {subject.genre.map((gen, idx) => (
                  <span
                    key={idx}
                    className="text-[9px] font-black uppercase tracking-wider bg-glass-card text-foreground/70 border border-glass-border px-3 py-1.5 rounded-full shadow-sm select-none"
                  >
                    {gen}
                  </span>
                ))}
              </div>
            )}

            {/* Synopsis Description */}
            <div className="space-y-2 border-t border-glass-border pt-4">
              <h3 className="font-black text-foreground text-sm uppercase tracking-wider">Synopsis</h3>
              <p className="text-foreground/70 text-xs sm:text-sm leading-relaxed">
                {metadata?.description || subject.description || 'No description summary available.'}
              </p>
            </div>

            {/* Audio Languages Selector (Dubs) */}
            {subject.dubs && subject.dubs.length > 0 && (
              <div className="space-y-3 pt-4 border-t border-glass-border">
                <h3 className="font-black text-foreground text-sm uppercase tracking-wider flex items-center space-x-2">
                  <Volume2 className="w-4 h-4 text-primary" />
                  <span>Available Audio Tracks</span>
                </h3>
                <div className="flex flex-wrap gap-2">
                  {subject.dubs.map((dub, idx) => {
                    const isCurrent = decodeURIComponent(path) === decodeURIComponent(dub.detailPath);
                    return (
                      <button
                        key={idx}
                        onClick={() => handleAudioClick(dub.detailPath)}
                        className={`px-4 py-2.5 rounded-xl text-xs font-bold border transition-all duration-200 cursor-pointer ${
                          isCurrent
                            ? 'bg-primary text-white border-primary/20 shadow-lg shadow-primary-glow'
                            : 'bg-glass-card hover:bg-glass-panel border-glass-border text-foreground/70 hover:text-foreground'
                        }`}
                      >
                        {dub.lanName} {dub.original ? '(Original)' : ''}
                      </button>
                    );
                  })}
                </div>
              </div>
            )}

            {/* Cast & Crew Section */}
            {stars && stars.length > 0 && (
              <div className="space-y-3 pt-4 border-t border-glass-border">
                <h3 className="font-black text-foreground text-sm uppercase tracking-wider flex items-center space-x-2">
                  <UserCheck className="w-4 h-4 text-primary" />
                  <span>Cast & Staff Members</span>
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {stars.slice(0, 8).map((star, idx) => (
                    <div
                      key={`${star.staffId}-${idx}`}
                      className="p-3 bg-glass-card border border-glass-border rounded-2xl flex flex-col items-center text-center shadow-sm"
                    >
                      {star.avatarUrl ? (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          src={star.avatarUrl}
                          alt={star.name}
                          className="w-12 h-12 rounded-full object-cover mb-2 border border-glass-border"
                          loading="lazy"
                        />
                      ) : (
                        <div className="w-12 h-12 rounded-full bg-foreground/10 flex items-center justify-center text-[10px] font-black text-foreground/60 mb-2">
                          {star.name.slice(0, 2).toUpperCase()}
                        </div>
                      )}
                      <span className="text-xs font-bold text-foreground line-clamp-1">
                        {star.name}
                      </span>
                      <span className="text-[9px] text-foreground/45 line-clamp-1 uppercase font-bold tracking-wide mt-0.5">
                        {star.character || (star.staffType === 2 ? 'Director' : 'Cast')}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Right Col - Episodes Guide list for series */}
        <div className="lg:col-span-1">
          {isSeries && totalEpisodes > 0 ? (
            <div className="p-6 rounded-3xl glass-panel border border-glass-border shadow-card space-y-4">
              <div className="flex items-center justify-between pb-3 border-b border-glass-border">
                <h2 className="font-black text-foreground text-sm uppercase tracking-wider flex items-center space-x-2">
                  <Play className="w-4 h-4 text-primary fill-primary animate-pulse" />
                  <span>Episode Guide</span>
                </h2>

                {/* Season selector dropdown */}
                {resource?.seasons && resource.seasons.length > 1 && (
                  <select
                    value={selectedSeason}
                    onChange={(e) => setSelectedSeason(Number(e.target.value))}
                    className="text-[10px] font-black bg-glass-card hover:bg-glass-panel border border-glass-border rounded-xl px-2.5 py-1.5 text-foreground focus:outline-none shadow-sm cursor-pointer uppercase tracking-wider"
                  >
                    {resource.seasons.map((se) => (
                      <option key={se.se} value={se.se} className="bg-background text-foreground">
                        Season {se.se}
                      </option>
                    ))}
                  </select>
                )}
              </div>

              {/* Grid lists of episodes buttons */}
              <div className="grid grid-cols-4 sm:grid-cols-6 lg:grid-cols-4 gap-2 max-h-[480px] overflow-y-auto pr-1 no-scrollbar">
                {Array.from({ length: totalEpisodes }).map((_, idx) => {
                  const epNum = idx + 1;
                  const isActive = epNum === activeEpisode;
                  return (
                    <button
                      key={epNum}
                      onClick={() => handleEpisodeClick(epNum)}
                      className={`py-3.5 rounded-xl text-xs font-black border transition-all cursor-pointer ${
                        isActive
                          ? 'bg-primary text-white border-primary/20 shadow-lg shadow-primary-glow scale-105'
                          : 'bg-glass-card hover:bg-glass-panel border-glass-border text-foreground/60 hover:text-foreground shadow-sm'
                      }`}
                    >
                      {epNum}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            /* Movie/standalone badge details */
            <div className="p-6 rounded-3xl glass-panel border border-glass-border shadow-card text-center py-10 space-y-2 select-none">
              <span className="inline-flex bg-primary/10 border border-primary/20 text-primary px-3 py-1 rounded-full text-[10px] font-black uppercase tracking-wider">
                Feature Film
              </span>
              <p className="text-xs text-foreground/50 font-medium">This item is a standalone feature film and does not contain episodes.</p>
            </div>
          )}
        </div>
      </div>

      {/* Related Content Shelf */}
      {related && related.length > 0 && (
        <div className="mt-12 border-t border-glass-border pt-8">
          <MovieShelf title="You May Also Like" subjects={related} />
        </div>
      )}
    </div>
  );
}
