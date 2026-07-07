export default function WatchLoading() {
    return (
        <div className="max-w-screen-2xl mx-auto px-3 sm:px-6 lg:px-8 py-4 animate-fade-in relative z-20">

            {/* Back button skeleton */}
            <div className="flex items-center space-x-2 mb-4">
                <div className="w-4 h-4 rounded shimmer-bg" />
                <div className="w-28 h-3 rounded-full shimmer-bg" />
            </div>

            {/* Main two-column layout */}
            <div className="flex flex-col xl:flex-row gap-5">

                {/* LEFT — Video Player + Info */}
                <div className="flex-1 min-w-0 space-y-4">

                    {/* Video Player Skeleton */}
                    <div className="w-full aspect-video rounded-2xl overflow-hidden border border-glass-border relative bg-black/80">
                        {/* Pulsing play button in center */}
                        <div className="absolute inset-0 flex flex-col items-center justify-center gap-4">
                            <div className="w-16 h-16 rounded-full shimmer-bg flex items-center justify-center">
                                <div className="w-0 h-0 border-l-[12px] border-l-white/20 border-y-[8px] border-y-transparent ml-1" />
                            </div>
                            <div className="flex flex-col items-center gap-2">
                                <div className="w-40 h-3 rounded-full shimmer-bg" />
                                <div className="w-56 h-2 rounded-full shimmer-bg opacity-60" />
                            </div>
                        </div>

                        {/* Bottom controls skeleton */}
                        <div className="absolute bottom-0 left-0 right-0 p-4 space-y-3">
                            {/* Progress bar */}
                            <div className="w-full h-1 rounded-full shimmer-bg" />
                            {/* Controls row */}
                            <div className="flex items-center justify-between">
                                <div className="flex items-center space-x-3">
                                    <div className="w-5 h-5 rounded shimmer-bg" />
                                    <div className="w-5 h-5 rounded shimmer-bg" />
                                    <div className="w-16 h-3 rounded-full shimmer-bg" />
                                </div>
                                <div className="flex items-center space-x-3">
                                    <div className="w-10 h-5 rounded shimmer-bg" />
                                    <div className="w-8 h-5 rounded shimmer-bg" />
                                    <div className="w-5 h-5 rounded shimmer-bg" />
                                </div>
                            </div>
                        </div>
                    </div>

                    {/* Title bar skeleton */}
                    <div className="p-4 sm:p-5 rounded-2xl glass-panel border border-glass-border">
                        <div className="flex items-start justify-between gap-4">
                            <div className="min-w-0 flex-1 space-y-3">
                                {/* Badge */}
                                <div className="w-32 h-5 rounded-full shimmer-bg" />
                                {/* Title */}
                                <div className="w-3/4 h-6 rounded-lg shimmer-bg" />
                            </div>
                            <div className="w-9 h-9 rounded-xl shimmer-bg xl:hidden" />
                        </div>

                        {/* Badges row */}
                        <div className="flex flex-wrap items-center gap-2 mt-3">
                            <div className="w-20 h-7 rounded-xl shimmer-bg" />
                            <div className="w-16 h-7 rounded-xl shimmer-bg" />
                            <div className="w-24 h-7 rounded-xl shimmer-bg" />
                        </div>

                        {/* Genres */}
                        <div className="flex flex-wrap gap-1.5 mt-3 pt-3 border-t border-glass-border">
                            {Array.from({ length: 4 }).map((_, i) => (
                                <div key={i} className="w-16 h-5 rounded-full shimmer-bg" />
                            ))}
                        </div>
                    </div>

                    {/* Synopsis skeleton */}
                    <div className="p-4 sm:p-5 rounded-2xl glass-panel border border-glass-border space-y-3">
                        <div className="w-20 h-3 rounded-full shimmer-bg" />
                        <div className="space-y-2">
                            <div className="w-full h-3 rounded-full shimmer-bg" />
                            <div className="w-full h-3 rounded-full shimmer-bg" />
                            <div className="w-3/4 h-3 rounded-full shimmer-bg" />
                        </div>
                    </div>
                </div>

                {/* RIGHT SIDEBAR — Episodes + Audio */}
                <div className="w-full xl:w-[340px] flex-shrink-0 space-y-4">

                    {/* Episode Guide Skeleton */}
                    <div className="p-4 rounded-2xl glass-panel border border-glass-border space-y-3">
                        <div className="flex items-center justify-between">
                            <div className="w-28 h-3 rounded-full shimmer-bg" />
                            <div className="w-20 h-6 rounded-xl shimmer-bg" />
                        </div>

                        {/* Episode grid */}
                        <div className="grid grid-cols-5 sm:grid-cols-8 xl:grid-cols-5 gap-2">
                            {Array.from({ length: 20 }).map((_, i) => (
                                <div
                                    key={i}
                                    className="py-3 rounded-xl shimmer-bg"
                                    style={{
                                        animationDelay: `${i * 50}ms`,
                                    }}
                                />
                            ))}
                        </div>
                    </div>

                    {/* Audio Tracks Skeleton */}
                    <div className="p-4 rounded-2xl glass-panel border border-glass-border space-y-3">
                        <div className="w-36 h-3 rounded-full shimmer-bg" />
                        <div className="flex flex-col gap-1.5">
                            {Array.from({ length: 3 }).map((_, i) => (
                                <div
                                    key={i}
                                    className="w-full h-10 rounded-xl shimmer-bg"
                                    style={{
                                        animationDelay: `${i * 100}ms`,
                                    }}
                                />
                            ))}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
