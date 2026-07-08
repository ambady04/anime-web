import type { Metadata } from "next";
import { Inter, Geist_Mono } from "next/font/google";
import "./globals.css";
import Navbar from "@/components/navbar";
import BottomNav from "@/components/bottom-nav";
import ScrollHandler from "@/components/scroll-handler";
import PageTransition from "@/components/page-transition";
import InspectGuard from "@/components/inspect-guard";
import { AuthProvider } from "@/lib/auth-context";

const inter = Inter({
    variable: "--font-inter",
    subsets: ["latin"],
});

const geistMono = Geist_Mono({
    variable: "--font-geist-mono",
    subsets: ["latin"],
});

export const metadata: Metadata = {
    metadataBase: new URL("https://kixo.to"),
    title: "KIXO - Premium Movie & Series Stream Hub",
    description:
        "Watch and discover trending movies, TV shows, and subbed anime in high quality.",
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
            className={`${inter.variable} ${geistMono.variable} h-full antialiased`}
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
                    {/* Global protection guard */}
                    <InspectGuard />

                    {/* Scroll handler updating global styles dynamically */}
                    <ScrollHandler />

                    {/* Glow backgrounds */}
                    <div className="radial-glow" />
                    <div className="radial-glow-secondary" />

                    {/* Global Navigation */}
                    <Navbar />

                    {/* Main Content Area with transition */}
                    <main className="grow z-10 pt-16 md:pt-20 pb-20 md:pb-0">
                        <PageTransition>{children}</PageTransition>
                    </main>

                    {/* Fixed Bottom Navigation for Mobile */}
                    <BottomNav />
                </AuthProvider>
            </body>
        </html>
    );
}
