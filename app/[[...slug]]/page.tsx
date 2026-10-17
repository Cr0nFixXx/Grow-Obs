import { notFound } from "next/navigation";
import { parsePath } from "@/lib/routes";
import Client from "./client";

/**
 * URL-Routing (B-57) + echte 404 (B-62): Diese optionale Catch-All-Route liefert für jeden GÜLTIGEN App-Pfad
 * (/, /grows/123, /forum, /strains/s1 …) dieselbe Client-Shell. Unbekannte Pfade beantwortet der Server mit
 * HTTP 404 und `app/not-found.tsx` (statt stillschweigend das Dashboard zu zeigen) – Gültigkeit definiert
 * `src/lib/routes.ts`. `app/api/*` bleibt unberührt (spezifischere Segmente haben Vorrang).
 */
export const dynamicParams = true;

/** „/“ wird statisch vorgerendert, alle anderen Pfade pro Anfrage geprüft. */
export function generateStaticParams() {
  return [{ slug: [] as string[] }];
}

export default async function Page({ params }: { params: Promise<{ slug?: string[] }> }) {
  const { slug } = await params;
  const decode = (part: string) => { try { return decodeURIComponent(part); } catch { return "%"; } };
  const pathname = `/${(slug ?? []).map(decode).join("/")}`;
  if (!parsePath(pathname)) notFound();
  return <Client />;
}
