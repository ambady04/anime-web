import { movieApi } from '@/lib/api';
import WatchClient from './watch-client';
import Link from 'next/link';
import { Film, AlertTriangle, ArrowLeft } from 'lucide-react';

interface PageProps {
  params: Promise<{ path: string }>;
  searchParams: Promise<{ season?: string; episode?: string }>;
}

export default async function WatchPage({ params, searchParams }: PageProps) {
  const { path } = await params;
  const { season, episode } = await searchParams;

  let details = null;
  let stream = null;
  let activeSeason = 0;
  let activeEpisode = 0;
  let errorMsg = '';

  try {
    // 1. Fetch main details
    details = await movieApi.getDetails(path);
    
    // 2. Parse season/episode inputs if it is a series
    const isSeries = details.subject.subjectType === 2 || details.subject.subjectType === 7;
    if (isSeries) {
      activeSeason = season ? Number(season) : 1;
      activeEpisode = episode ? Number(episode) : 1;
    } else {
      activeSeason = 0;
      activeEpisode = 0;
    }

    // 3. Fetch playable streams
    stream = await movieApi.getStream(path, activeSeason, activeEpisode);
  } catch (e: any) {
    console.error('Error fetching stream:', e);
    errorMsg = e.message || 'The streaming link was rejected by media hosts.';
  }

  if (errorMsg || !details || !stream) {
    return (
      <div className="max-w-md mx-auto my-32 p-8 rounded-3xl glass-panel border border-white/10 text-center shadow-2xl relative z-20">
        <AlertTriangle className="w-12 h-12 text-yellow-500 mx-auto mb-4 animate-bounce" />
        <h2 className="text-xl font-bold text-white mb-2">Streaming Offline</h2>
        <p className="text-sm text-white/60 mb-6">
          This media link cannot be retrieved. It may be geo-restricted or temporarily unavailable on host mirrors.
        </p>
        {errorMsg && (
          <div className="p-3 bg-red-500/10 border border-red-500/20 rounded-xl text-xs text-red-400 font-mono text-left mb-6 overflow-x-auto">
            {errorMsg}
          </div>
        )}
        <div className="flex flex-col space-y-3">
          <Link
            href="/"
            className="flex items-center justify-center space-x-2 bg-primary hover:bg-primary/95 text-white px-5 py-2.5 rounded-xl font-semibold text-sm transition-all"
          >
            <ArrowLeft className="w-4 h-4" />
            <span>Return Home</span>
          </Link>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen">
      <WatchClient
        path={path}
        details={details}
        stream={stream}
        activeSeason={activeSeason}
        activeEpisode={activeEpisode}
      />
    </div>
  );
}
export const dynamic = 'force-dynamic';
