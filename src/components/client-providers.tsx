"use client";

import dynamic from "next/dynamic";

// These components use browser APIs and must be dynamically imported with ssr:false.
// This wrapper is a Client Component, so dynamic() with ssr:false is allowed here.
const AmbientOrbs = dynamic(() => import("./ambient-orbs"), { ssr: false });
const InspectGuard = dynamic(() => import("./inspect-guard"), { ssr: false });

export default function ClientProviders() {
    return (
        <>
            <AmbientOrbs />
            <InspectGuard />
        </>
    );
}

