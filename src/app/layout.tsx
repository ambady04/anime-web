import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/navbar";
import BottomNav from "@/components/bottom-nav";
import ScrollHandler from "@/components/scroll-handler";
import PageTransition from "@/components/page-transition";
import InspectGuard from "@/components/inspect-guard";
import { AuthProvider } from "@/lib/auth-context";
import PWARegister from "@/components/pwa-register";

const inter = Inter({
    variable: "--font-inter",
    subsets: ["latin"],
    display: "swap",
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
            suppressHydrationWarning
            data-scroll-behavior="smooth"
            className={`${inter.variable} h-full antialiased`}
        >
            <head>
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
            <body className="min-h-full bg-background text-foreground flex flex-col relative transition-colors duration-300">
                <AuthProvider>
                    {/* Register service worker */}
                    <PWARegister />

                    {/* Global protection guard */}
                    {/* <InspectGuard /> */}

                    {/* Scroll handler updating global styles dynamically */}
                    <ScrollHandler />

                    {/* Glow backgrounds */}
                    <div className="radial-glow" />
                    <div className="radial-glow-secondary" />

                    {/* Global Navigation */}
                    <Navbar />

                    {/* Main Content Area with transition */}
                    <main className="grow z-10 pt-14 md:pt-20 pb-16 md:pb-0">
                        <PageTransition>{children}</PageTransition>
                    </main>

                    {/* Fixed Bottom Navigation for Mobile */}
                    <BottomNav />
                </AuthProvider>
            </body>
        </html>
    );
}
