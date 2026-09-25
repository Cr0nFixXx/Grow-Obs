import type { Metadata, Viewport } from "next";
import "../src/index.css";

export const metadata: Metadata = {
  // Öffentliche Basis-URL für OG-/Twitter-Bilder; in Produktion NEXT_PUBLIC_SITE_URL setzen.
  metadataBase: new URL(process.env.NEXT_PUBLIC_SITE_URL || "http://localhost:3000"),
  title: "Grow|Observer — Community Grow Dashboard",
  description:
    "Community-getriebenes Cannabis-Grow-Dashboard mit persönlichem Tagebuch, Kostenoptimierung und KI-Assistenz.",
  manifest: "/manifest.webmanifest",
  applicationName: "Grow Observer",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "Grow Observer" },
  icons: {
    icon: [{ url: "/icon.svg", type: "image/svg+xml" }, { url: "/icon-192.png", sizes: "192x192", type: "image/png" }],
    apple: [{ url: "/icon-192.png", sizes: "192x192" }, { url: "/icon-512.png", sizes: "512x512" }],
  },
  openGraph: {
    type: "website",
    title: "Grow|Observer — Community Grow Dashboard",
    description: "Community-getriebenes Cannabis-Grow-Dashboard mit Tagebuch, Kostenoptimierung und KI-Assistenz.",
    images: ["/images/og.jpg"],
  },
};

export const viewport: Viewport = {
  themeColor: [{ media: "(prefers-color-scheme: dark)", color: "#090c09" }, { media: "(prefers-color-scheme: light)", color: "#f4f6f0" }],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

/** No-FOUC: Theme vor dem ersten Paint setzen (wie zuvor im index.html inline). */
const themeScript = `(function(){try{var t=localStorage.getItem("go-theme")||"dark";document.documentElement.setAttribute("data-theme",t)}catch(e){document.documentElement.setAttribute("data-theme","dark")}})()`;

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="de" data-theme="dark" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link
          href="https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700&family=Space+Grotesk:wght@500;600;700&display=swap"
          rel="stylesheet"
        />
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body>{children}</body>
    </html>
  );
}
