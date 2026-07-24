import type { Metadata } from "next";

// Prevent browser from sending Referer header on video/media requests.
// The CDN rejects requests with unexpected Referer headers. By setting
// no-referrer, the <video> element fetches the CDN URL without any
// Referer, which signed URL tokens allow.
export const metadata: Metadata = {
    referrer: "no-referrer",
};

export default function WatchLayout({
    children,
}: {
    children: React.ReactNode;
}) {
    return <>{children}</>;
}
