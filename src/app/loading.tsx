import { Loader2, Film } from "lucide-react";

export default function Loading() {
    return (
        <div className="min-h-[70vh] w-full flex flex-col items-center justify-center p-8 relative z-20 animate-fade-in select-none">
            <div className="glass-panel border border-glass-border p-10 rounded-3xl flex flex-col items-center shadow-card space-y-4 max-w-sm">
                <Loader2 className="w-10 h-10 text-primary animate-spin" />
                <div className="text-center">
                    <h3 className="font-black text-foreground text-sm uppercase tracking-wider">
                        Retrieving Catalogs
                    </h3>
                    <p className="text-[10px] text-foreground/45 mt-1 font-bold uppercase tracking-wider">
                        Resolving mirrors from KIXO network...
                    </p>
                </div>
            </div>

            {/* Skeletons block preview in background */}
            <div className="w-full max-w-380 mt-12 grid grid-cols-2 sm:grid-cols-4 lg:grid-cols-6 gap-6 opacity-25 pointer-events-none select-none">
                {Array.from({ length: 6 }).map((_, idx) => (
                    <div
                        key={idx}
                        className="aspect-2/3 rounded-2xl bg-glass-card border border-glass-border flex flex-col justify-end p-4"
                    >
                        <div className="h-4 bg-foreground/10 rounded w-3/4 mb-2 animate-pulse" />
                        <div className="h-3 bg-foreground/10 rounded w-1/2 animate-pulse" />
                    </div>
                ))}
            </div>
        </div>
    );
}
