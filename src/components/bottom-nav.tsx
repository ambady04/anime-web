"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, Heart, Search, History } from "lucide-react";

export default function BottomNav() {
    const pathname = usePathname();

    const navItems = [
        { href: "/", label: "Home", icon: Home },
        { href: "/favorites", label: "Bookmarks", icon: Heart },
        { href: "/search", label: "Search", icon: Search },
        { href: "/history", label: "History", icon: History },
    ];

    return (
        <div className="fixed bottom-0 left-0 right-0 z-45 md:hidden bg-glass-panel backdrop-blur-xl border-t border-glass-border pb-safe shadow-nav transition-all duration-300">
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
                            className="flex flex-col items-center justify-center flex-1 h-full relative group transition-all duration-200 select-none"
                        >
                            {/* Active indicator - CSS only, no framer-motion */}
                            {isActive && (
                                <span className="absolute top-0 w-8 h-[3px] bg-primary rounded-full shadow-[0_0_10px_rgba(227,28,37,0.8)] transition-all duration-300" />
                            )}

                            <Icon
                                className={`w-5 h-5 mb-0.5 transition-all duration-200 active:scale-75 ${
                                    isActive
                                        ? "text-primary fill-primary/5 drop-shadow-[0_0_4px_rgba(227,28,37,0.3)]"
                                        : "text-foreground/50 group-hover:text-foreground"
                                }`}
                            />
                            <span
                                className={`text-[9px] font-extrabold uppercase tracking-wider transition-colors duration-200 ${
                                    isActive
                                        ? "text-primary"
                                        : "text-foreground/50 group-hover:text-foreground"
                                }`}
                            >
                                {item.label}
                            </span>
                        </Link>
                    );
                })}
            </div>
        </div>
    );
}
