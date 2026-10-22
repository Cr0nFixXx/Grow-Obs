/** Profilfelder (B-73): feste Listen und Grenzen. Das Frontend hält eine gleiche Kopie in `src/lib/profile-fields.ts` (ein Test prüft die Übereinstimmung). */
export const MEDIA = ["Erde", "Coco", "Hydro", "Gemischt"] as const;
export const INTERESTS = [
  "Indoor", "Outdoor", "Gewächshaus", "Living Soil", "Hydroponik", "Coco", "Autoflower", "Fotoperiodisch",
  "LED", "Training (LST/HST)", "Zucht (Breeding)", "Sortenvielfalt",
] as const;
export const VISIBILITIES = ["all", "followers", "nobody"] as const;
export type Visibility = (typeof VISIBILITIES)[number];
export const BIO_MAX = 280;
export const LOCATION_MAX = 60;
export const INTERESTS_MAX = 5;
export const GROW_SINCE_MIN = 1990;
export const HANDLE_COOLDOWN_DAYS = 30;
export const HANDLE_PATTERN = /^[a-zA-Z0-9_]{3,32}$/;
