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
                    background: "rgba(15,15,25,0.85)",
                    backdropFilter: "blur(48px) saturate(160%)",
                    WebkitBackdropFilter: "blur(48px) saturate(160%)",
                    borderTop: "1px solid rgba(255,255,255,0.06)",
                    boxShadow: "0 -8px 32px rgba(0,0,0,0.3)",
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
                                                background:
                                                    "linear-gradient(90deg, var(--primary), var(--primary-light))",
                                                boxShadow:
                                                    "0 0 12px rgba(225,29,72,0.95), 0 0 24px rgba(225,29,72,0.55)",
                                            }}
                                            transition={{
                                                type: "spring",
                                                stiffness: 400,
                                                damping: 35,
                                            }}
                                        />
                                    )}
                                </AnimatePresence>

                                {/* Icon */}
                                <motion.div
                                    animate={{
                                        scale: isActive ? 1.12 : 1,
                                        y: isActive ? -1 : 0,
                                    }}
                                    transition={{
                                        type: "spring",
                                        stiffness: 400,
                                        damping: 25,
                                    }}
                                    className="mb-1"
                                >
                                    <Icon
                                        className="w-5 h-5 transition-colors duration-200"
                                        style={{
                                            color: isActive
                                                ? "var(--primary)"
                                                : "rgba(255,255,255,0.4)",
                                            filter: isActive
                                                ? "drop-shadow(0 0 6px rgba(225,29,72,0.6))"
                                                : "none",
                                        }}
                                    />
                                </motion.div>

                                {/* Label */}
                                <span
                                    className="text-[9px] font-bold uppercase tracking-widest transition-colors duration-200"
                                    style={{
                                        color: isActive
                                            ? "var(--primary)"
                                            : "rgba(255,255,255,0.5)",
                                    }}
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
