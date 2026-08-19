"use client";

import { motion } from "framer-motion";

const orbs = [
    {
        size: 600,
        color: "rgba(225, 29, 72, 0.04)",
        animation: "orbMove1",
        duration: 20,
        top: "-10%",
        left: "-5%",
    },
    {
        size: 500,
        color: "rgba(244, 63, 94, 0.025)",
        animation: "orbMove2",
        duration: 25,
        top: "30%",
        right: "-10%",
        left: undefined,
    },
    {
        size: 400,
        color: "rgba(251, 113, 133, 0.03)",
        animation: "orbMove3",
        duration: 30,
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
                <div
                    key={i}
                    className="absolute rounded-full"
                    style={{
                        width: orb.size,
                        height: orb.size,
                        background: `radial-gradient(circle, ${orb.color} 0%, transparent 65%)`,
                        top: orb.top,
                        left: orb.left,
                        right: (orb as any).right,
                        opacity: 0.9,
                    }}
                />
            ))}
        </div>
    );
}
