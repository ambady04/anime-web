"use client";

import { motion } from "framer-motion";

const orbs = [
    {
        size: 600,
        color: "rgba(255, 45, 85, 0.12)",
        animation: "orbMove1",
        duration: 18,
        top: "-10%",
        left: "-5%",
    },
    {
        size: 500,
        color: "rgba(255, 45, 85, 0.07)",
        animation: "orbMove2",
        duration: 22,
        top: "30%",
        right: "-10%",
        left: undefined,
    },
    {
        size: 400,
        color: "rgba(120, 20, 50, 0.09)",
        animation: "orbMove3",
        duration: 26,
        top: "65%",
        left: "25%",
    },
];

export default function AmbientOrbs() {
    return (
        <div
            className="fixed inset-0 pointer-events-none overflow-hidden"
            style={{ zIndex: 0 }}
            aria-hidden="true"
        >
            {orbs.map((orb, i) => (
                <motion.div
                    key={i}
                    className="absolute rounded-full"
                    style={{
                        width: orb.size,
                        height: orb.size,
                        background: `radial-gradient(circle, ${orb.color} 0%, rgba(255,45,85,0.02) 40%, transparent 80%)`,
                        filter: "blur(24px)",
                        top: orb.top,
                        left: orb.left,
                        right: (orb as any).right,
                    }}
                    animate={{
                        x: [0, i % 2 === 0 ? 60 : -80, i % 2 === 0 ? -30 : 40, 0],
                        y: [0, i % 2 === 0 ? -80 : 60, i % 2 === 0 ? 40 : -30, 0],
                        scale: [1, 1.15, 0.95, 1],
                    }}
                    transition={{
                        duration: orb.duration,
                        repeat: Infinity,
                        ease: "easeInOut",
                        delay: i * 3,
                    }}
                />
            ))}
        </div>
    );
}
