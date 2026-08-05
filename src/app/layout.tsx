import type { Metadata } from "next";
import { Geist } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/navbar";
import BottomNav from "@/components/bottom-nav";
import PageTransition from "@/components/page-transition";
import { AuthProvider } from "@/lib/auth-context";
import PWARegister from "@/components/pwa-register";
import ClientProviders from "@/components/client-providers";

const geist = Geist({
    variable: "--font-geist",
    subsets: ["latin"],
    display: "swap",
    weight: ["400", "500", "600", "700", "800", "900"],
});

export const metadata: Metadata = {
    metadataBase: new URL("https://kixo.to"),
    title: {
        default: "KIXO — Stream Anime, Movies & Series",
        template: "%s | KIXO",
    },
    description:
        "Watch and discover trending movies, TV shows, and subbed/dubbed anime in high definition. Free streaming, no sign-up required.",
    keywords: [
        "anime",
        "movies",
        "series",
        "streaming",
        "watch online",
        "dubbed",
        "subbed",
        "HD",
    ],
    authors: [{ name: "KIXO" }],
    creator: "KIXO",
    appleWebApp: {
        capable: true,
        statusBarStyle: "default",
        title: "KIXO",
    },
    openGraph: {
        type: "website",
        locale: "en_US",
        url: "https://kixo.to",
        siteName: "KIXO",
        title: "KIXO — Stream Anime, Movies & Series",
        description:
            "Watch and discover trending movies, TV shows, and subbed/dubbed anime in high definition.",
        images: [
            {
                url: "/opengraph-image",
                width: 1200,
                height: 630,
                alt: "KIXO — Stream Anime, Movies & Series",
            },
        ],
    },
    twitter: {
        card: "summary_large_image",
        title: "KIXO — Stream Anime, Movies & Series",
        description:
            "Watch and discover trending movies, TV shows, and subbed/dubbed anime in high definition.",
        images: ["/opengraph-image"],
        creator: "@kixo",
    },
    robots: {
        index: true,
        follow: true,
    },
};

export default function RootLayout({
    children,
}: Readonly<{
    children: React.ReactNode;
}>) {
    return (
        <html
            lang="en"
            data-scroll-behavior="smooth"
            suppressHydrationWarning
            className={`${geist.variable} h-full antialiased`}
            style={{ fontFamily: "var(--font-geist), -apple-system, BlinkMacSystemFont, sans-serif" }}
        >
            <head>
                <link rel="preconnect" href="https://img.aoneroom.com" crossOrigin="anonymous" />
                <link rel="preconnect" href="https://h5-api.aoneroom.com" crossOrigin="anonymous" />
                <link rel="preconnect" href="https://api.abisolutions.online" crossOrigin="anonymous" />
                <script
                    dangerouslySetInnerHTML={{
                        __html: `
              (function() {
                try {
                  var theme = localStorage.getItem('kixo_theme') || 'dark';
                  if (theme === 'light') {
                    document.documentElement.classList.add('light');
                  } else {
                    document.documentElement.classList.remove('light');
                  }
                } catch (e) {}
              })();
            `,
                    }}
                />
            </head>
            <body
                className="min-h-full text-white flex flex-col relative"
                style={{ backgroundColor: "#000000", fontFamily: "var(--font-geist), -apple-system, BlinkMacSystemFont, sans-serif" }}
            >
                <AuthProvider>
                    {/* Client-only providers: smooth scroll + ambient orbs */}
                    <ClientProviders />
                    <PWARegister />


                    {/* CSS noise texture overlay for premium cinematic feel */}
                    <div className="noise-overlay" aria-hidden="true" />



                    {/* Global Navigation */}
                    <Navbar />

                    {/* Main Content */}
                    <main className="grow relative z-10 pt-16 pb-16 md:pb-0">
                        <PageTransition>{children}</PageTransition>
                    </main>

                    {/* Fixed Bottom Navigation for Mobile */}
                    <BottomNav />
                </AuthProvider>
            </body>
        </html>
    );
}
