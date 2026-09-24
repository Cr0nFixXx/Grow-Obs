import {
  createContext,
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

/**
 * ThemeProvider — persists theme + particle preference, applies data-theme on <html>,
 * and briefly enables a global color transition for a smooth toggle.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  const [theme, setThemeState] = useState<Theme>(getInitialTheme);
  const [particles, setParticlesState] = useState<boolean>(getInitialParticles);

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

  const value = useMemo(
    () => ({ theme, toggle, setTheme, particles, setParticles }),
    [theme, toggle, setTheme, particles, setParticles]
  );

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme() {
  const ctx = useContext(ThemeContext);
  if (!ctx) throw new Error("useTheme must be used within ThemeProvider");
  return ctx;
}
