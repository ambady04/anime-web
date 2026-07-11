"use client";

import { useState, useEffect } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import {
    Search,
    History,
    Heart,
    Home,
    User,
    Sun,
    Moon,
    Download,
} from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import dynamic from "next/dynamic";
import { downloadStore } from "@/lib/download-store";
import DownloadManager from "./download-manager";

// Lazy load the heavy profile modal (includes firebase imports)
const ProfileModal = dynamic(() => import("./profile-modal"), {
    ssr: false,
    loading: () => null,
});

export default function Navbar() {
    const { user } = useAuth();
    const pathname = usePathname();
    const router = useRouter();
    const [searchQuery, setSearchQuery] = useState("");
    const [theme, setTheme] = useState<"dark" | "light">("dark");
    const [showProfileModal, setShowProfileModal] = useState(false);
    const [showDownloadManager, setShowDownloadManager] = useState(false);
    const [activeDownloadsCount, setActiveDownloadsCount] = useState(0);

    // Subscribe to download store updates to show active count badge
    useEffect(() => {
        const unsubscribe = downloadStore.subscribe((tasks) => {
            const active = tasks.filter(
                (t) => t.status === "downloading",
            ).length;
            setActiveDownloadsCount(active);
        });
        return unsubscribe;
    }, []);

    // Close download manager dropdown on outside clicks
    useEffect(() => {
        if (!showDownloadManager) return;
        const handleOutsideClick = (event: MouseEvent) => {
            const container = document.getElementById(
                "navbar-download-container",
            );
            if (container && !container.contains(event.target as Node)) {
                setShowDownloadManager(false);
            }
        };
        document.addEventListener("click", handleOutsideClick);
        return () => {
            document.removeEventListener("click", handleOutsideClick);
        };
    }, [showDownloadManager]);

    // Load initial theme from DOM/localStorage
    useEffect(() => {
        const isLight = document.documentElement.classList.contains("light");
        setTheme(isLight ? "light" : "dark");
    }, []);

    // Clear search query whenever the pathname changes
    useEffect(() => {
        setSearchQuery("");
    }, [pathname]);

    const toggleTheme = () => {
        if (theme === "dark") {
            document.documentElement.classList.add("light");
            localStorage.setItem("kixo_theme", "light");
            setTheme("light");
        } else {
            document.documentElement.classList.remove("light");
            localStorage.setItem("kixo_theme", "dark");
            setTheme("dark");
        }
    };

    const handleSearchSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (searchQuery.trim()) {
            router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
            setSearchQuery("");
        }
    };

    const navLinks = [
        { href: "/", label: "Home", icon: Home },
        { href: "/history", label: "History", icon: History },
        { href: "/favorites", label: "Watchlist", icon: Heart },
    ];

    return (
        <header className="sticky-nav py-2.5 sm:py-3.5 transition-all duration-300">
            <div className="max-w-[1920px] mx-auto px-3 sm:px-6 lg:px-8 2xl:px-12 flex items-center justify-between gap-3 sm:gap-4">
                {/* Logo Section */}
                <Link
                    href="/"
                    className="flex items-center space-x-2 group relative z-10"
                >
                    {/* Overlapping diamonds SVG logo - red & black */}
                    <div className="shrink-0 relative w-6 h-6 flex items-center justify-center">
                        <svg
                            className="w-5 h-5 filter drop-shadow-[0_0_2px_var(--primary-glow)]"
                            viewBox="0 0 24 24"
                            fill="none"
                            xmlns="http://www.w3.org/2000/svg"
                        >
                            <path
                                d="M12 2L5 9L12 16L19 9L12 2Z"
                                fill="#E31C25"
                                fillOpacity="0.9"
                            />
                            <path
                                d="M12 8L5 15L12 22L19 15L12 8Z"
                                fill="#1A1A1A"
                                fillOpacity="0.85"
                                className="dark:fill-black"
                            />
                        </svg>
                    </div>
                    <div className="flex flex-col">
                        <div className="flex items-center text-xl font-black tracking-wider leading-none">
                            <span className="text-foreground transition-colors duration-300">
                                KI
                            </span>
                            <span className="text-primary transition-colors duration-300">
                                XO
                            </span>
                        </div>
                    </div>
                </Link>

                {/* Desktop Navigation Links */}
                <nav className="hidden md:flex items-center space-x-2 relative">
                    {navLinks.map((link) => {
                        const Icon = link.icon;
                        const isActive = pathname === link.href;
                        return (
                            <Link
                                key={link.href}
                                href={link.href}
                                className={`relative flex items-center space-x-1.5 px-4 py-2.5 rounded-xl text-xs font-bold uppercase tracking-wider transition-colors duration-300 select-none ${
                                    isActive
                                        ? "text-primary"
                                        : "text-foreground/60 hover:text-foreground"
                                }`}
                            >
                                {isActive && (
                                    <span className="absolute inset-0 bg-primary/10 border border-primary/20 rounded-xl -z-10 shadow-[0_0_12px_rgba(227,28,37,0.15)] transition-all duration-300" />
                                )}
                                <Icon className="w-3.5 h-3.5" />
                                <span>{link.label}</span>
                            </Link>
                        );
                    })}
                </nav>

                {/* Search Bar, Theme Toggle & Profile Icon */}
                <div className="flex items-center space-x-3.5 flex-1 md:flex-initial max-w-xs md:max-w-sm justify-end">
                    {/* Search bar - hidden on small mobile screens */}
                    <form
                        onSubmit={handleSearchSubmit}
                        className="relative w-full hidden sm:block"
                    >
                        <input
                            type="text"
                            placeholder="Search catalog..."
                            value={searchQuery}
                            onChange={(e) => setSearchQuery(e.target.value)}
                            className="w-full glass-input rounded-full py-1.5 pl-4 pr-10 text-xs placeholder-foreground/35 text-foreground focus:outline-none"
                        />
                        <button
                            type="submit"
                            className="absolute right-3 top-1/2 -translate-y-1/2 text-foreground/40 hover:text-primary transition-colors"
                        >
                            <Search className="w-3.5 h-3.5" />
                        </button>
                    </form>

                    {/* Mobile search redirect icon */}
                    <Link
                        href="/search"
                        className="sm:hidden p-2 rounded-xl text-foreground/60 hover:text-primary hover:bg-glass-card border border-transparent hover:border-glass-border transition-all"
                    >
                        <Search className="w-4 h-4" />
                    </Link>

                    {/* Theme Toggle Button */}
                    <button
                        onClick={toggleTheme}
                        className="p-2 rounded-xl border border-glass-border bg-glass-card hover:bg-glass-panel text-foreground/70 hover:text-primary transition-all duration-300 select-none cursor-pointer"
                        aria-label="Toggle Theme"
                    >
                        {theme === "dark" ? (
                            <Sun className="w-4 h-4 animate-pulse" />
                        ) : (
                            <Moon className="w-4 h-4" />
                        )}
                    </button>

                    {/* Downloads Button & Manager */}
                    <div
                        className="relative flex"
                        id="navbar-download-container"
                    >
                        <button
                            onClick={() =>
                                setShowDownloadManager(!showDownloadManager)
                            }
                            className="p-2 rounded-xl border border-glass-border bg-glass-card hover:bg-glass-panel text-foreground/70 hover:text-primary transition-all duration-300 select-none cursor-pointer relative"
                            aria-label="Downloads Manager"
                        >
                            <Download className="w-4 h-4" />
                            {activeDownloadsCount > 0 && (
                                <span className="absolute -top-1 -right-1 w-4 h-4 bg-primary text-white rounded-full text-[8px] font-black flex items-center justify-center animate-pulse">
                                    {activeDownloadsCount}
                                </span>
                            )}
                        </button>
                        <DownloadManager
                            isOpen={showDownloadManager}
                            onClose={() => setShowDownloadManager(false)}
                        />
                    </div>

                    {/* Profile Circle Icon */}
                    <button
                        onClick={() => setShowProfileModal(true)}
                        className={`w-9 h-9 rounded-full border-2 bg-glass-card flex items-center justify-center overflow-hidden cursor-pointer focus:outline-none relative shrink-0 transition-all duration-300 hover:scale-105 hover:shadow-[0_0_12px_rgba(227,28,37,0.4)] active:scale-95 ${
                            user
                                ? "border-primary/50 hover:border-primary"
                                : "border-glass-border hover:border-primary/45"
                        }`}
                    >
                        {user ? (
                            user.photoURL ? (
                                <img
                                    src={user.photoURL}
                                    alt={user.displayName || "Avatar"}
                                    className="w-full h-full object-cover"
                                    referrerPolicy="no-referrer"
                                />
                            ) : (
                                <div className="w-full h-full bg-primary/20 text-primary text-xs font-black flex items-center justify-center">
                                    {(user.displayName || "U")[0].toUpperCase()}
                                </div>
                            )
                        ) : (
                            <User className="w-4 h-4 text-foreground/60 hover:text-primary transition-colors" />
                        )}
                    </button>
                </div>
            </div>

            {/* Profile & Sync Modal */}
            <ProfileModal
                isOpen={showProfileModal}
                onClose={() => setShowProfileModal(false)}
            />
        </header>
    );
}
