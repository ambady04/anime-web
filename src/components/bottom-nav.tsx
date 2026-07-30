"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { motion, AnimatePresence } from "framer-motion";
import { Home, Heart, Search, History } from "lucide-react";

const navItems = [
    { href: "/", label: "Home", icon: Home },
    { href: "/favorites", label: "Watchlist", icon: Heart },
    { href: "/search", label: "Search", icon: Search },
    { href: "/history", label: "History", icon: History },
];

export default function BottomNav() {
    const pathname = usePathname();

    return (
        <div
            className="fixed bottom-0 left-0 right-0 md:hidden pb-safe"
            style={{ zIndex: 45 }}
        >
            {/* Frosted glass bar */}
            <div
                className="relative"
                style={{
                    background: "rgba(6,6,6,0.88)",
                    backdropFilter: "blur(32px) saturate(200%)",
                    WebkitBackdropFilter: "blur(32px) saturate(200%)",
                    borderTop: "1px solid rgba(255,255,255,0.06)",
                    boxShadow: "0 -8px 32px rgba(0,0,0,0.6)",
                }}
            >
                <div className="flex items-center justify-around h-[60px] max-w-lg mx-auto px-2 relative">
                    {navItems.map((item) => {
                        const Icon = item.icon;
                        const isActive =
                            item.href === "/"
                                ? pathname === "/"
                                : pathname.startsWith(item.href);

                        return (
                            <Link
                                key={item.href}
                                href={item.href}
                                className="flex flex-col items-center justify-center flex-1 h-full relative select-none"
                            >
                                {/* Active top glow line */}
                                <AnimatePresence>
                                    {isActive && (
                                        <motion.span
                                            layoutId="bottom-nav-indicator"
                                            className="absolute top-0 rounded-full"
                                            style={{
                                                width: 28,
                                                height: 2.5,
                                                background: "linear-gradient(90deg, #FF2D55, #FF6B84)",
                                                boxShadow: "0 0 12px rgba(255,45,85,0.9), 0 0 24px rgba(255,45,85,0.4)",
                                            }}
                                            transition={{ type: "spring", stiffness: 400, damping: 35 }}
                                        />
                                    )}
                                </AnimatePresence>

                                {/* Icon */}
                                <motion.div
                                    animate={{
                                        scale: isActive ? 1.12 : 1,
                                        y: isActive ? -1 : 0,
                                    }}
                                    transition={{ type: "spring", stiffness: 400, damping: 25 }}
                                    className="mb-1"
                                >
                                    <Icon
                                        className="w-5 h-5 transition-colors duration-200"
                                        style={{
                                            color: isActive ? "#FF2D55" : "rgba(255,255,255,0.4)",
                                            filter: isActive ? "drop-shadow(0 0 6px rgba(255,45,85,0.5))" : "none",
                                        }}
                                    />
                                </motion.div>

                                {/* Label */}
                                <span
                                    className="text-[9px] font-bold uppercase tracking-widest transition-colors duration-200"
                                    style={{ color: isActive ? "#FF2D55" : "rgba(255,255,255,0.35)" }}
                                >
                                    {item.label}
                                </span>
                            </Link>
                        );
                    })}
                </div>
            </div>
        </div>
    );
}
