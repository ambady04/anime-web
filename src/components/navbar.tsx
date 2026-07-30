"use client";

import { useState, useEffect, useRef } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Search, History, Heart, Home, User, X } from "lucide-react";
import { useAuth } from "@/lib/auth-context";
import dynamic from "next/dynamic";

const ProfileModal = dynamic(() => import("./profile-modal"), {
    ssr: false,
    loading: () => null,
});

const navLinks = [
    { href: "/", label: "Home", icon: Home },
    { href: "/history", label: "History", icon: History },
    { href: "/favorites", label: "Watchlist", icon: Heart },
];

export default function Navbar() {
    const { user } = useAuth();
    const pathname = usePathname();
    const router = useRouter();
    const [searchQuery, setSearchQuery] = useState("");
    const [showProfileModal, setShowProfileModal] = useState(false);
    const [scrolled, setScrolled] = useState(false);
    const [searchOpen, setSearchOpen] = useState(false);
    const searchInputRef = useRef<HTMLInputElement>(null);

    // Clear search on route change
    useEffect(() => {
        setSearchQuery("");
        setSearchOpen(false);
    }, [pathname]);

    // Track scroll for navbar transparency → glass
    useEffect(() => {
        const onScroll = () => setScrolled(window.scrollY > 40);
        window.addEventListener("scroll", onScroll, { passive: true });
        return () => window.removeEventListener("scroll", onScroll);
    }, []);

    // Focus search input when opened
    useEffect(() => {
        if (searchOpen) {
            setTimeout(() => searchInputRef.current?.focus(), 150);
        }
    }, [searchOpen]);

    const handleSearchSubmit = (e: React.FormEvent) => {
        e.preventDefault();
        if (searchQuery.trim()) {
            router.push(`/search?q=${encodeURIComponent(searchQuery.trim())}`);
            setSearchQuery("");
            setSearchOpen(false);
        }
    };

    return (
        <>
            <motion.header
            className={`fixed top-0 left-0 right-0 z-50 transition-all duration-300 ${scrolled ? 'backdrop-blur-2xl' : ''}`}
                animate={{
                    backgroundColor: scrolled ? "rgba(6,6,6,0.88)" : "rgba(6,6,6,0)",
                    borderBottomColor: scrolled ? "rgba(255,255,255,0.05)" : "rgba(255,255,255,0)",
                    boxShadow: scrolled ? "0 1px 0 rgba(255,255,255,0.04), 0 4px 40px rgba(0,0,0,0.9)" : "none",
                }}
                transition={{ duration: 0.4, ease: [0.16, 1, 0.3, 1] }}
                style={{ borderBottomWidth: 1, borderBottomStyle: "solid" }}
            >
                <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 h-16 sm:h-18 flex items-center justify-between gap-4">

                    {/* ── Logo ── */}
                    <Link href="/" className="flex items-center gap-2.5 group shrink-0 relative z-10">
                        <motion.div
                            whileHover={{ scale: 1.08 }}
                            transition={{ type: "spring", stiffness: 400, damping: 20 }}
                            className="relative"
                        >
                            <svg className="w-7 h-7" viewBox="0 0 28 28" fill="none">
                                <path d="M14 2L6 10L14 18L22 10L14 2Z" fill="#FF2D55" fillOpacity="0.95" />
                                <path d="M14 10L6 18L14 26L22 18L14 10Z" fill="#1A0008" fillOpacity="0.9" />
                            </svg>
                            {/* Logo ambient glow */}
                            <motion.div
                                className="absolute inset-0 rounded-full"
                                style={{ background: "radial-gradient(circle, rgba(255,45,85,0.3), transparent 70%)", filter: "blur(8px)" }}
                                animate={{ opacity: [0.4, 0.8, 0.4] }}
                                transition={{ duration: 2.5, repeat: Infinity, ease: "easeInOut" }}
                            />
                        </motion.div>
                        <span className="text-xl font-black tracking-[0.12em] leading-none select-none">
                            KI<span className="text-[#FF2D55]">XO</span>
                        </span>
                    </Link>

                    {/* ── Desktop Nav Links ── */}
                    <nav className="hidden md:flex items-center gap-1 relative">
                        {navLinks.map((link) => {
                            const Icon = link.icon;
                            const isActive = pathname === link.href;
                            return (
                                <Link
                                    key={link.href}
                                    href={link.href}
                                    className={`relative flex items-center gap-1.5 px-4 py-2 rounded-2xl text-xs font-semibold uppercase tracking-widest transition-colors duration-300 select-none ${
                                        isActive ? "text-white" : "text-[#9CA3AF] hover:text-white"
                                    }`}
                                >
                                    {isActive && (
                                        <motion.span
                                            layoutId="nav-pill"
                                            className="absolute inset-0 rounded-2xl"
                                            style={{
                                                background: "rgba(255,45,85,0.12)",
                                                border: "1px solid rgba(255,45,85,0.25)",
                                                boxShadow: "0 0 16px rgba(255,45,85,0.12), inset 0 1px 0 rgba(255,255,255,0.06)",
                                            }}
                                            transition={{ type: "spring", stiffness: 500, damping: 35 }}
                                        />
                                    )}
                                    <Icon className="w-3.5 h-3.5 relative z-10" />
                                    <span className="relative z-10">{link.label}</span>
                                </Link>
                            );
                        })}
                    </nav>

                    {/* ── Right Actions ── */}
                    <div className="flex items-center gap-2 sm:gap-3">

                        {/* Search — desktop inline */}
                        <div className="hidden sm:block relative">
                            <AnimatePresence mode="wait">
                                {searchOpen ? (
                                    <motion.form
                                        key="search-open"
                                        onSubmit={handleSearchSubmit}
                                        initial={{ width: 40, opacity: 0 }}
                                        animate={{ width: 240, opacity: 1 }}
                                        exit={{ width: 40, opacity: 0 }}
                                        transition={{ type: "spring", stiffness: 400, damping: 30 }}
                                        className="relative flex items-center"
                                    >
                                        <Search className="absolute left-3.5 w-3.5 h-3.5 text-[#9CA3AF] pointer-events-none" />
                                        <input
                                            ref={searchInputRef}
                                            type="text"
                                            placeholder="Search titles..."
                                            value={searchQuery}
                                            onChange={(e) => setSearchQuery(e.target.value)}
                                            className="w-full h-9 pl-9 pr-9 rounded-2xl text-xs font-medium placeholder-[rgba(255,255,255,0.3)] text-white focus:outline-none transition-all"
                                            style={{
                                                background: "rgba(255,255,255,0.07)",
                                                border: "1px solid rgba(255,255,255,0.08)",
                                            }}
                                            onFocus={(e) => {
                                                e.target.style.borderColor = "rgba(255,45,85,0.4)";
                                                e.target.style.boxShadow = "0 0 0 3px rgba(255,45,85,0.1), 0 0 20px rgba(255,45,85,0.06)";
                                            }}
                                            onBlur={(e) => {
                                                e.target.style.borderColor = "rgba(255,255,255,0.08)";
                                                e.target.style.boxShadow = "none";
                                            }}
                                        />
                                        <button
                                            type="button"
                                            onClick={() => { setSearchOpen(false); setSearchQuery(""); }}
                                            className="absolute right-3 text-[rgba(255,255,255,0.4)] hover:text-white transition-colors"
                                        >
                                            <X className="w-3.5 h-3.5" />
                                        </button>
                                    </motion.form>
                                ) : (
                                    <motion.button
                                        key="search-icon"
                                        onClick={() => setSearchOpen(true)}
                                        initial={{ opacity: 0 }}
                                        animate={{ opacity: 1 }}
                                        exit={{ opacity: 0 }}
                                        className="w-9 h-9 rounded-2xl flex items-center justify-center text-[#9CA3AF] hover:text-white transition-all duration-200 cursor-pointer"
                                        style={{
                                            background: "rgba(255,255,255,0.05)",
                                            border: "1px solid rgba(255,255,255,0.07)",
                                        }}
                                        whileHover={{ scale: 1.08, backgroundColor: "rgba(255,255,255,0.09)" }}
                                        whileTap={{ scale: 0.94 }}
                                        aria-label="Open search"
                                    >
                                        <Search className="w-4 h-4" />
                                    </motion.button>
                                )}
                            </AnimatePresence>
                        </div>

                        {/* Mobile search icon */}
                        <Link
                            href="/search"
                            className="sm:hidden w-9 h-9 rounded-2xl flex items-center justify-center text-[#9CA3AF] hover:text-white transition-colors"
                            style={{ background: "rgba(255,255,255,0.05)", border: "1px solid rgba(255,255,255,0.07)" }}
                        >
                            <Search className="w-4 h-4" />
                        </Link>

                        {/* Profile avatar */}
                        <motion.button
                            onClick={() => setShowProfileModal(true)}
                            className="relative w-9 h-9 rounded-full overflow-hidden cursor-pointer focus:outline-none shrink-0"
                            style={{
                                border: user ? "2px solid rgba(255,45,85,0.5)" : "2px solid rgba(255,255,255,0.1)",
                            }}
                            whileHover={{
                                scale: 1.08,
                                borderColor: "rgba(255,45,85,0.8)",
                                boxShadow: "0 0 16px rgba(255,45,85,0.4)",
                            }}
                            whileTap={{ scale: 0.94 }}
                            transition={{ type: "spring", stiffness: 400, damping: 20 }}
                            aria-label="Open profile"
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
                                    <div className="w-full h-full flex items-center justify-center text-xs font-black text-white" style={{ background: "rgba(255,45,85,0.25)" }}>
                                        {(user.displayName || "U")[0].toUpperCase()}
                                    </div>
                                )
                            ) : (
                                <div className="w-full h-full flex items-center justify-center" style={{ background: "rgba(255,255,255,0.06)" }}>
                                    <User className="w-4 h-4 text-[#9CA3AF]" />
                                </div>
                            )}
                        </motion.button>
                    </div>
                </div>
            </motion.header>

            <ProfileModal isOpen={showProfileModal} onClose={() => setShowProfileModal(false)} />
        </>
    );
}
