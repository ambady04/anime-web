"use client";

import { ReactNode } from "react";

interface PageTransitionProps {
    children: ReactNode;
}

// Replaced framer-motion with CSS animation to reduce bundle size (~40KB saved)
// and eliminate re-renders on every page navigation
export default function PageTransition({ children }: PageTransitionProps) {
    return <div className="animate-fade-in">{children}</div>;
}
