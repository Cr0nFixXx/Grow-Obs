import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type Locale = "de" | "en";
export type Currency = "EUR" | "USD";

type Dict = Record<string, string>;

const de: Dict = {
  "settings.title": "Profil & Einstellungen",
  "settings.appearance": "Darstellung",
  "settings.theme": "Design",
  "settings.theme.light": "Hell",
  "settings.theme.dark": "Dunkel",
  "settings.notifications": "Benachrichtigungen",
  "settings.account": "Konto",
  "settings.language": "Sprache",
  "settings.currency": "Währung",
  "settings.reduceMotion": "Animationen reduzieren",
  "settings.particles": "Partikel-Effekte",
  "greeting.hello": "Hallo",
  "common.save": "Speichern",
  "common.back": "Zurück",
  "common.follow": "Folgen",
  "demo.cost": "Monatliche Kosten",
};

const en: Dict = {
  "settings.title": "Profile & Settings",
  "settings.appearance": "Appearance",
  "settings.theme": "Theme",
  "settings.theme.light": "Light",
  "settings.theme.dark": "Dark",
  "settings.notifications": "Notifications",
  "settings.account": "Account",
  "settings.language": "Language",
  "settings.currency": "Currency",
  "settings.reduceMotion": "Reduce motion",
  "settings.particles": "Particle effects",
  "greeting.hello": "Hello",
  "common.save": "Save",
  "common.back": "Back",
  "common.follow": "Follow",
  "demo.cost": "Monthly cost",
};

const currencyFmt: Record<Currency, { locale: string; code: string; rate: number }> = {
  EUR: { locale: "de-DE", code: "EUR", rate: 1 },
  USD: { locale: "en-US", code: "USD", rate: 1.08 },
};

interface I18nValue {
  locale: Locale;
  setLocale: (l: Locale) => void;
  currency: Currency;
  setCurrency: (c: Currency) => void;
  t: (key: string) => string;
  money: (amount: number, decimals?: boolean) => string;
}

const I18nContext = createContext<I18nValue | null>(null);

function read<T extends string>(key: string, fallback: T): T {
  try {
    return (localStorage.getItem(key) as T) || fallback;
  } catch {
    return fallback;
  }
}

/**
 * I18n-/Währungs-Provider. Liefert `t()` (de/en) und `money()` (EUR/USD, mit Mock-Umrechnung).
 * Vorbereitung für eine spätere Voll-Internationalisierung.
 */
export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale>(() => read<Locale>("go-locale", "de"));
  const [currency, setCurrencyState] = useState<Currency>(() => read<Currency>("go-currency", "EUR"));

  const setLocale = useCallback((l: Locale) => {
    setLocaleState(l);
    try {
      localStorage.setItem("go-locale", l);
      document.documentElement.lang = l;
    } catch {
      /* ignore */
    }
  }, []);

  const setCurrency = useCallback((c: Currency) => {
    setCurrencyState(c);
    try {
      localStorage.setItem("go-currency", c);
    } catch {
      /* ignore */
    }
  }, []);

  const dict = locale === "en" ? en : de;

  const t = useCallback((key: string) => dict[key] ?? key, [dict]);

  const money = useCallback(
    (amount: number, decimals = false) => {
      const { locale: loc, code, rate } = currencyFmt[currency];
      return new Intl.NumberFormat(loc, {
        style: "currency",
        currency: code,
        minimumFractionDigits: decimals ? 2 : 0,
        maximumFractionDigits: decimals ? 2 : 0,
      }).format(amount * rate);
    },
    [currency]
  );

  const value = useMemo(
    () => ({ locale, setLocale, currency, setCurrency, t, money }),
    [locale, setLocale, currency, setCurrency, t, money]
  );

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n() {
  const ctx = useContext(I18nContext);
  if (!ctx) throw new Error("useI18n must be used within I18nProvider");
  return ctx;
}
