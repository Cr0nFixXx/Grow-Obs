import { MotionConfig } from "framer-motion";
import {
  createContext,
  useEffect,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

type Theme = "light" | "dark";

interface ThemeContextValue {
  theme: Theme;
  toggle: () => void;
  setTheme: (t: Theme) => void;
  /** Hintergrund-Partikel ein-/ausschalten (Spec: „abschaltbar"), persistiert. */
  particles: boolean;
  setParticles: (v: boolean) => void;
  /** Weniger Bewegung (B-71). Ohne eigene Wahl folgt der Wert der Systemeinstellung; die Wahl wird gespeichert. */
  reduceMotion: boolean;
  setReduceMotion: (v: boolean) => void;
  /** Kurze Töne bei neuen Nachrichten/Benachrichtigungen (B-71), nur dieses Gerät, standardmäßig aus. */
  sound: boolean;
  setSound: (v: boolean) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

function getInitialTheme(): Theme {
  if (typeof document !== "undefined") {
    return (document.documentElement.getAttribute("data-theme") as Theme) || "dark";
  }
  return "dark";
}

function getInitialParticles(): boolean {
  try {
    return localStorage.getItem("go-particles") !== "0";
  } catch {
    return true;
  }
}

function getInitialReduceMotion(): boolean {
  try {
    const stored = localStorage.getItem("go-reduce-motion");
    if (stored === "1") return true;
    if (stored === "0") return false;
    return typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
  } catch {
    return false;
  }
}

function getInitialSound(): boolean {
  try {
    return localStorage.getItem("go-sound") === "1";
  } catch {
    return false;
  }
}

/**
 * ThemeProvider — persists theme + particle preference, applies data-theme on <html>,
 * and briefly enables a global color transition for a smooth toggle.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(getInitialTheme);
  const [particles, setParticlesState] = useState<boolean>(getInitialParticles);
  const [reduceMotion, setReduceMotionState] = useState<boolean>(getInitialReduceMotion);
  const [sound, setSoundState] = useState<boolean>(getInitialSound);

  useEffect(() => {
    document.documentElement.setAttribute("data-reduce-motion", reduceMotion ? "on" : "off");
  }, [reduceMotion]);

  const apply = useCallback((t: Theme) => {
    const el = document.documentElement;
    el.classList.add("theme-anim");
    el.setAttribute("data-theme", t);
    try {
      localStorage.setItem("go-theme", t);
    } catch {
      /* ignore */
    }
    window.setTimeout(() => el.classList.remove("theme-anim"), 520);
  }, []);

  const setTheme = useCallback(
    (t: Theme) => {
      setThemeState(t);
      apply(t);
    },
    [apply]
  );

  const toggle = useCallback(() => {
    setThemeState((prev) => {
      const next = prev === "dark" ? "light" : "dark";
      apply(next);
      return next;
    });
  }, [apply]);

  const setParticles = useCallback((v: boolean) => {
    setParticlesState(v);
    try {
      localStorage.setItem("go-particles", v ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, []);

  const setReduceMotion = useCallback((v: boolean) => {
    setReduceMotionState(v);
    try {
      localStorage.setItem("go-reduce-motion", v ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, []);

  const setSound = useCallback((v: boolean) => {
    setSoundState(v);
    try {
      localStorage.setItem("go-sound", v ? "1" : "0");
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo(
    () => ({ theme, toggle, setTheme, particles, setParticles, reduceMotion, setReduceMotion, sound, setSound }),
    [theme, toggle, setTheme, particles, setParticles, reduceMotion, setReduceMotion, sound, setSound]
  );

  return (
    <ThemeContext.Provider value={value}>
      <MotionConfig reducedMotion={reduceMotion ? "always" : "never"}>{children}</MotionConfig>
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
