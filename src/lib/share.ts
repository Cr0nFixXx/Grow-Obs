/**
 * Teilen: natives Share-Sheet (Mobil), sonst Link in die Zwischenablage.
 * Liefert, was passiert ist – damit die UI passend reagieren kann.
 */
export async function shareOrCopy(data: { title: string; text?: string; url?: string }): Promise<"shared" | "copied" | "cancelled" | "failed"> {
  const url = data.url ?? (typeof window !== "undefined" ? window.location.href : "");
  const nav = typeof navigator !== "undefined" ? navigator : undefined;
  if (nav?.share) {
    try {
      await nav.share({ title: data.title, text: data.text, url });
      return "shared";
    } catch (error) {
      if (error instanceof DOMException && error.name === "AbortError") return "cancelled";
    }
  }
  return (await copyText(url)) ? "copied" : "failed";
}

export async function copyText(text: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}
