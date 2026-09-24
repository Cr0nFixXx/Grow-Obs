import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import {
  STORAGE_KEY,
  defaultFeatures,
  featureMeta,
  resolveFeatureFlags,
  type FeatureKey,
} from "./features";
import { useAuth } from "@/lib/auth";

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

interface Ctx {
  flags: FlagMap;
  isEnabled: (key: FeatureKey) => boolean;
  setFlag: (key: FeatureKey, value: boolean) => void;
  reset: () => void;
}

const FeatureContext = createContext<Ctx | null>(null);

export function FeatureProvider({ children }: { children: ReactNode }) {
  const { user } = useAuth();
  const [flags, setFlags] = useState<FlagMap>(() => resolveFeatureFlags(loadOverrides()));

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
    if (user?.role !== "platform_admin" || featureMeta.find((feature) => feature.key === key)?.core) return;
    setFlags((prev) => {
      const next = { ...prev, [key]: value };
      return next;
    });
  }, [user?.role]);

  useEffect(() => { persist(flags); }, [flags]);

  const reset = useCallback(() => {
    if (user?.role !== "platform_admin") return;
    setFlags({ ...defaultFeatures });
    try {
      localStorage.removeItem(STORAGE_KEY);
    } catch {
      /* ignore */
    }
  }, [user?.role]);

  const isEnabled = useCallback((key: FeatureKey) =>
    flags[key] === true && (key !== "devAdmin" || user?.role === "platform_admin"), [flags, user?.role]);

  const value = useMemo(() => ({ flags, isEnabled, setFlag, reset }), [flags, isEnabled, setFlag, reset]);
  return <FeatureContext.Provider value={value}>{children}</FeatureContext.Provider>;
}

export function useFeatures() {
  const ctx = useContext(FeatureContext);
  if (!ctx) throw new Error("useFeatures must be used within FeatureProvider");
  return ctx;
}
