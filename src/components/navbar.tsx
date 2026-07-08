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
    X,
    ShieldAlert,
    Trash2,
} from "lucide-react";
import { motion, AnimatePresence } from "framer-motion";

export default function Navbar() {
    const pathname = usePathname();
    const router = useRouter();
    const [searchQuery, setSearchQuery] = useState("");
    const [theme, setTheme] = useState<"dark" | "light">("dark");
    const [showResetModal, setShowResetModal] = useState(false);

    const clearAllCookiesAndData = () => {
        // Clear localStorage
        localStorage.clear();
        // Clear sessionStorage
        sessionStorage.clear();
        // Clear cookies
        if (typeof document !== "undefined") {
            const cookies = document.cookie.split(";");
            for (let i = 0; i < cookies.length; i++) {
                const cookie = cookies[i];
                const eqPos = cookie.indexOf("=");
                const name = eqPos > -1 ? cookie.substr(0, eqPos) : cookie;
                document.cookie = name.trim() + "=;expires=Thu, 01 Jan 1970 00:00:00 GMT;path=/";
            }
        }
        // Reload page
        window.location.reload();
    };

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
        <header className="sticky-nav py-3.5 transition-all duration-300">
            <div className="max-w-380 mx-auto px-4 sm:px-6 lg:px-8 flex items-center justify-between gap-4">
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
                                    <motion.span
                                        layoutId="activeDesktopTab"
                                        className="absolute inset-0 bg-primary/10 border border-primary/20 rounded-xl -z-10 shadow-[0_0_12px_rgba(227,28,37,0.15)]"
                                        transition={{
                                            type: "spring",
                                            stiffness: 380,
                                            damping: 30,
                                        }}
                                    />
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

                    {/* Profile Circle Icon */}
                    <button
                        onClick={() => setShowResetModal(true)}
                        className="w-8 h-8 rounded-full border border-glass-border bg-glass-card hover:border-primary/45 transition-colors flex items-center justify-center overflow-hidden cursor-pointer focus:outline-none"
                    >
                        <User className="w-4 h-4 text-foreground/60 hover:text-primary transition-colors" />
                    </button>
                </div>
            </div>

            {/* Reset App Data Modal */}
            <AnimatePresence>
                {showResetModal && (
                    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
                        {/* Backdrop */}
                        <motion.div
                            initial={{ opacity: 0 }}
                            animate={{ opacity: 1 }}
                            exit={{ opacity: 0 }}
                            onClick={() => setShowResetModal(false)}
                            className="absolute inset-0 bg-black/80 backdrop-blur-sm"
                        />

                        {/* Modal Container */}
                        <motion.div
                            initial={{ scale: 0.95, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0.95, opacity: 0 }}
                            transition={{ type: "spring", duration: 0.4 }}
                            className="relative w-full max-w-md bg-zinc-950/90 backdrop-blur-md border border-white/10 p-6 rounded-3xl shadow-2xl space-y-6 z-10"
                        >
                            {/* Close button */}
                            <button
                                onClick={() => setShowResetModal(false)}
                                className="absolute top-4 right-4 p-2 rounded-xl text-foreground/50 hover:text-white hover:bg-white/5 transition-colors focus:outline-none cursor-pointer"
                            >
                                <X className="w-4 h-4" />
                            </button>

                            {/* Icon & Title Header */}
                            <div className="flex flex-col items-center text-center space-y-3 select-none">
                                <div className="w-12 h-12 rounded-2xl bg-primary/10 border border-primary/20 flex items-center justify-center text-primary shadow-lg shadow-primary-glow/10 animate-bounce">
                                    <ShieldAlert className="w-6 h-6" />
                                </div>
                                <h3 className="text-lg font-black text-white uppercase tracking-wider">
                                    Reset Application Data
                                </h3>
                                <p className="text-xs text-foreground/60 font-medium max-w-xs leading-relaxed">
                                    If you are experiencing stream errors, loading issues, or broken player states, clearing your data can help restore the application.
                                </p>
                            </div>

                            {/* Details Table / Alerts */}
                            <div className="bg-white/5 border border-white/5 rounded-2xl p-4 space-y-3 text-xs">
                                <div className="flex items-center justify-between text-white/80">
                                    <span className="font-semibold">Watchlist / Bookmarks</span>
                                    <span className="text-primary font-bold">Will be cleared</span>
                                </div>
                                <div className="flex items-center justify-between text-white/80 border-t border-white/5 pt-3">
                                    <span className="font-semibold">Playback Progress History</span>
                                    <span className="text-primary font-bold">Will be cleared</span>
                                </div>
                                <div className="flex items-center justify-between text-white/80 border-t border-white/5 pt-3">
                                    <span className="font-semibold">Cookies & Storage Cache</span>
                                    <span className="text-primary font-bold">Will be cleared</span>
                                </div>
                            </div>

                            {/* Actions Footer */}
                            <div className="flex flex-col sm:flex-row gap-3 pt-2">
                                <button
                                    onClick={() => setShowResetModal(false)}
                                    className="flex-1 px-4 py-3 rounded-xl border border-glass-border text-foreground/75 hover:text-white hover:bg-white/5 transition-colors text-xs font-bold uppercase tracking-wider cursor-pointer"
                                >
                                    Cancel
                                </button>
                                <button
                                    onClick={clearAllCookiesAndData}
                                    className="flex-1 px-4 py-3 rounded-xl bg-primary hover:bg-primary-light text-white transition-all text-xs font-bold uppercase tracking-wider shadow-lg shadow-primary-glow cursor-pointer flex items-center justify-center space-x-1.5"
                                >
                                    <Trash2 className="w-3.5 h-3.5" />
                                    <span>Reset App</span>
                                </button>
                            </div>
                        </motion.div>
                    </div>
                )}
            </AnimatePresence>
        </header>
    );
}
