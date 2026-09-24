import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  STORAGE_KEY,
  defaultFeatures,
  type FeatureKey,
} from "./features";

type FlagMap = Record<FeatureKey, boolean>;

function loadOverrides(): Partial<FlagMap> {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return {};
    return JSON.parse(raw) as Partial<FlagMap>;
  } catch {
    return {};
  }
}

function merge(over: Partial<FlagMap>): FlagMap {
  return { ...defaultFeatures, ...over };
}

interface Ctx {
  flags: FlagMap;
  isEnabled: (key: FeatureKey) => boolean;
  setFlag: (key: FeatureKey, value: boolean) => void;
  reset: () => void;
}

const FeatureContext = createContext<Ctx | null>(null);

export function FeatureProvider({ children }: { children: ReactNode }) {
  const [flags, setFlags] = useState<FlagMap>(() => merge(loadOverrides()));

  const persist = (next: FlagMap) => {
    const over: Partial<FlagMap> = {};
    (Object.keys(defaultFeatures) as FeatureKey[]).forEach((k) => {
      if (next[k] !== defaultFeatures[k]) over[k] = next[k];
    });
    try {
      if (Object.keys(over).length) localStorage.setItem(STORAGE_KEY, JSON.stringify(over));
      else localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  };

  const setFlag = useCallback((key: FeatureKey, value: boolean) => {
    setFlags((prev) => {
      const next = { ...prev, [key]: value };
      persist(next);
      return next;
    });
  }, []);

  const reset = useCallback(() => {
    setFlags({ ...defaultFeatures });
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const isEnabled = useCallback((key: FeatureKey) => flags[key] !== false, [flags]);

  const value = useMemo(() => ({ flags, isEnabled, setFlag, reset }), [flags, isEnabled, setFlag, reset]);
  return <FeatureContext.Provider value={value}>{children}</FeatureContext.Provider>;
}

export function useFeatures() {
  const ctx = useContext(FeatureContext);
  if (!ctx) throw new Error("useFeatures must be used within FeatureProvider");
  return ctx;
}
