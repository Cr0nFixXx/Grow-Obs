export type SoundKind = "message" | "notification" | "preview";

let context: AudioContext | null = null;

/** Tonfolge je Art: [Frequenz in Hz, Dauer in s]. Kurz und leise, kein Audio-Asset nötig. */
const TONES: Record<SoundKind, [number, number][]> = {
  message: [[784, 0.09], [1047, 0.14]],
  notification: [[659, 0.09], [880, 0.09], [1175, 0.14]],
  preview: [[784, 0.09], [1047, 0.14]],
};

/** True, wenn der Zähler gegenüber dem letzten bekannten Stand gestiegen ist (`null` = noch nicht geladen → nie). */
export function increased(previous: number | null, next: number | null): boolean {
  return previous !== null && next !== null && next > previous;
}

/** Spielt einen kurzen Ton über die Web Audio API. Gibt `false` zurück, wenn der Browser es (noch) nicht erlaubt. */
export function playSound(kind: SoundKind): boolean {
  if (typeof window === "undefined") return false;
  try {
    const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
    if (!Ctor) return false;
    context ??= new Ctor();
    if (context.state === "suspended") void context.resume();
    if (context.state === "closed") return false;
    let t = context.currentTime + 0.01;
    for (const [frequency, seconds] of TONES[kind]) {
      const osc = context.createOscillator();
      const gain = context.createGain();
      osc.type = "sine";
      osc.frequency.value = frequency;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.12, t + 0.015);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + seconds);
      osc.connect(gain).connect(context.destination);
      osc.start(t);
      osc.stop(t + seconds + 0.02);
      t += seconds * 0.9;
    }
    return true;
  } catch {
    return false;
  }
}
