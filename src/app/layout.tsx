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
    referrer: "no-referrer",
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
                <meta name="referrer" content="no-referrer" />
                <link rel="preconnect" href="https://img.aoneroom.com" crossOrigin="anonymous" />
                <link rel="preconnect" href="https://h5-api.aoneroom.com" crossOrigin="anonymous" />
                <link rel="preconnect" href="https://anime-api-arlv.onrender.com" crossOrigin="anonymous" />
                <script
                    dangerouslySetInnerHTML={{
                        __html: `
(function() {
  if (typeof window === 'undefined') return;

  // 1. Freeze window.open across all global scope references
  var blockOpen = function() {
    console.warn("[Ad Shield] Blocked popup window.open attempt");
    return null;
  };

  try { window.open = blockOpen; } catch(e) {}
  try { if (window.top && window.top !== window) window.top.open = blockOpen; } catch(e) {}
  try { if (window.parent && window.parent !== window) window.parent.open = blockOpen; } catch(e) {}
  try { if (typeof self !== 'undefined') self.open = blockOpen; } catch(e) {}

  // 2. Intercept programmatic anchor clicks (_blank or external domain)
  if (typeof HTMLAnchorElement !== 'undefined') {
    var origClick = HTMLAnchorElement.prototype.click;
    HTMLAnchorElement.prototype.click = function() {
      if (this.target === '_blank' || (this.href && !this.href.includes(location.hostname))) {
        console.warn("[Ad Shield] Blocked anchor click redirect:", this.href);
        return;
      }
      return origClick.apply(this, arguments);
    };
  }

  // 3. Intercept event delegation for links targeting external domains or _blank
  var isInternalClick = false;
  document.addEventListener('click', function(e) {
    isInternalClick = true;
    setTimeout(function() { isInternalClick = false; }, 2500);

    var target = e.target;
    var link = target && target.closest ? target.closest('a') : null;
    if (link && (link.target === '_blank' || (link.href && !link.href.includes(location.hostname)))) {
      console.warn("[Ad Shield] Prevented ad link navigation:", link.href);
      e.preventDefault();
      e.stopPropagation();
    }
  }, true);

  document.addEventListener('pointerdown', function(e) {
    var target = e.target;
    var link = target && target.closest ? target.closest('a') : null;
    if (link && (link.target === '_blank' || (link.href && !link.href.includes(location.hostname)))) {
      console.warn("[Ad Shield] Prevented pointer ad click:", link.href);
      e.preventDefault();
      e.stopPropagation();
    }
  }, true);

  // 4. Trap cross-origin iframe top location redirects
  window.addEventListener('beforeunload', function(e) {
    if (!isInternalClick && document.activeElement && document.activeElement.tagName === 'IFRAME') {
      console.warn("[Ad Shield] Prevented top-level page redirect by iframe ad script");
      e.preventDefault();
      e.returnValue = 'KIXO Stream Protection: Redirect Blocked';
      return 'KIXO Stream Protection: Redirect Blocked';
    }
  });
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
