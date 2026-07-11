export default function Loading() {
    return (
        <div className="min-h-screen w-full relative z-20 animate-fade-in select-none overflow-hidden">
            {/* Hero skeleton */}
            <div className="w-full h-[50vh] sm:h-[65vh] relative">
                <div className="absolute inset-0 shimmer-bg" />
                <div className="absolute bottom-0 left-0 right-0 h-1/2 bg-linear-to-t from-background to-transparent" />
                {/* Title skeleton on hero */}
                <div className="absolute bottom-12 left-6 sm:left-12 space-y-3">
                    <div className="h-6 w-48 sm:w-72 bg-white/10 rounded-lg" />
                    <div className="h-4 w-32 sm:w-56 bg-white/5 rounded-md" />
                </div>
            </div>

            {/* Shelf skeletons */}
            <div className="max-w-[1920px] mx-auto px-3 sm:px-6 lg:px-8 2xl:px-12 space-y-10 -mt-8">
                {[1, 2, 3].map((shelf) => (
                    <div key={shelf}>
                        {/* Shelf title */}
                        <div className="h-5 w-36 bg-white/8 rounded-md mb-5" />
                        {/* Cards row */}
                        <div className="flex space-x-3 sm:space-x-4 overflow-hidden">
                            {Array.from({ length: 8 }).map((_, i) => (
                                <div
                                    key={i}
                                    className="shrink-0 w-[130px] sm:w-[155px] md:w-[175px] lg:w-[195px]"
                                >
                                    <div className="aspect-2/3 rounded-xl sm:rounded-2xl shimmer-bg" />
                                </div>
                            ))}
                        </div>
                    </div>
                ))}
            </div>
        </div>
    );
}
