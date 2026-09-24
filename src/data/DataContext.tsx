import { createContext, useContext, type ReactNode } from "react";
import { services, type Services } from "@/services";

const DataContext = createContext<Services | null>(null);

/** Stellt die Service-Registry (Mock oder API) app-weit via Context bereit. */
export function DataProvider({ children }: { children: ReactNode }) {
  return <DataContext.Provider value={services}>{children}</DataContext.Provider>;
}

export function useServices(): Services {
  const ctx = useContext(DataContext);
  if (!ctx) throw new Error("useServices must be used within DataProvider");
  return ctx;
}
