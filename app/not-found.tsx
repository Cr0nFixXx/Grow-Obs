import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "Seite nicht gefunden · Grow|Observer",
  robots: { index: false, follow: false },
};

/** Serverseitige 404-Seite (HTTP 404, B-62) – bewusst ohne App-Shell/JS, damit sie immer lädt. */
export default function NotFoundPage() {
  return (
    <main className="grid min-h-dvh place-items-center bg-bg p-6 text-fg">
      <div className="max-w-md text-center">
        <div className="select-none font-display text-[120px] font-bold leading-none tracking-tighter text-accent/25 sm:text-[160px]">404</div>
        <h1 className="-mt-4 text-2xl font-bold">Seite nicht gefunden</h1>
        <p className="mt-2 text-fg-muted">Diese Adresse gibt es bei Grow|Observer nicht – vielleicht ein Tippfehler oder ein alter Link.</p>
        <a href="/" className="mt-6 inline-flex min-h-11 items-center justify-center rounded-xl bg-accent px-5 text-sm font-semibold text-accent-fg">Zur Startseite</a>
      </div>
    </main>
  );
}
