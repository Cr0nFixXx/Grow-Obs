import { useEffect, useRef } from "react";
import { useChatUnreadState, useNotifications } from "@/data/hooks";
import { useTheme } from "@/lib/theme";
import { increased, playSound } from "@/lib/sound";

/**
 * Akustische Signale (B-71, Einstellung „Sounds“, nur dieses Gerät): kurzer Ton, wenn die Zahl ungelesener Benachrichtigungen
 * oder Chat-Nachrichten steigt, solange die App sichtbar ist. Beim Laden und Wechseln der Einstellung wird nichts abgespielt.
 */
export function SoundBridge() {
  const { sound } = useTheme();
  const chat = useChatUnreadState(sound);
  const { items, loading } = useNotifications();
  const unread = items.filter((n) => !n.read).length;
  const prevChat = useRef<number | null>(null);
  const prevNotes = useRef<number | null>(null);

  useEffect(() => {
    const next = sound && chat.loaded ? chat.count : null;
    if (increased(prevChat.current, next) && document.visibilityState === "visible") playSound("message");
    prevChat.current = next;
  }, [sound, chat.loaded, chat.count]);

  useEffect(() => {
    const next = sound && !loading ? unread : null;
    if (increased(prevNotes.current, next) && document.visibilityState === "visible") playSound("notification");
    prevNotes.current = next;
  }, [sound, loading, unread]);

  return null;
}
