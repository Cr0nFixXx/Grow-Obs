import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { config } from "./config";
import { ApiError, http, setAuthToken } from "./api";
import { clearLegacyPrivateStorage, readSessionToken, sessionKey, writeSessionToken } from "./session-storage";
import { currentUser } from "@/mocks/data";
import type { User } from "@/types";

interface AuthValue {
  user: User | null;
  token: string | null;
  loading: boolean;
  sessionError: string | null;
  retrySession: () => void;
  login: (email: string, password: string, remember?: boolean) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
  /** Eigenes Profil ändern (Name, Titel, Avatar). Mock: nur Session. */
  updateProfile: (patch: { name?: string; title?: string; avatar?: string }) => Promise<void>;
  /** Eigenes Profil/Rolle leise neu laden (Pull-to-Refresh). */
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);
const mockUser: User = { ...currentUser, id: "u-me", role: "platform_admin" };

/**
 * Session state is fail-closed while restoring. API mode still uses a bearer token;
 * migration to revocable HttpOnly-cookie sessions is a separate server/API change.
 * Mock-Modus: Login/Register liefern sofort den Mock-User. API-Modus: `/auth/*`.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(readSessionToken);
  const [loading, setLoading] = useState(true);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const revision = useRef(0);
  const verifiedToken = useRef<string | null>(null);
  const retrySession = useCallback(() => setRetry((value) => value + 1), []);

  useEffect(() => {
    const request = ++revision.current;
    const controller = new AbortController();
    setSessionError(null);
    if (!token) {
      setAuthToken(null);
      setUser(null);
      setLoading(false);
      return;
    }
    setAuthToken(token);
    if (verifiedToken.current === token) { setLoading(false); return; }
    setLoading(true);
    const restore = config.useMock
      ? Promise.resolve<User>(mockUser)
      : http.get<User>("/auth/me", controller.signal);
    restore
      .then((u) => {
        if (request !== revision.current || controller.signal.aborted) return;
        setUser(u);
        verifiedToken.current = token;
      })
      .catch((error: unknown) => {
        if (request !== revision.current || controller.signal.aborted) return;
        setUser(null);
        if (error instanceof ApiError && error.status === 401) {
          setAuthToken(null);
          setToken(null);
          writeSessionToken(null);
          void clearLegacyPrivateStorage();
        } else {
          setSessionError("Die Sitzung konnte nicht geprüft werden. Bitte Verbindung prüfen und erneut versuchen.");
        }
      })
      .finally(() => { if (request === revision.current && !controller.signal.aborted) setLoading(false); });
    return () => { controller.abort(); revision.current += 1; };
  }, [token, retry]);

  const acceptSession = useCallback((result: { token: string; user: User }, remember = true) => {
    setAuthToken(result.token);
    verifiedToken.current = result.token;
    setToken(result.token);
    setUser(result.user);
    writeSessionToken(result.token, remember);
    setLoading(false);
    setSessionError(null);
  }, []);

  const login = useCallback(async (email: string, password: string, remember = true) => {
    const request = ++revision.current;
    const res = config.useMock
      ? { token: `mock-${Date.now()}`, user: mockUser }
      : await http.post<{ token: string; user: User }>("/auth/login", { email, password });
    if (request === revision.current) acceptSession(res, remember);
  }, [acceptSession]);

  const register = useCallback(
    async (name: string, email: string, password: string) => {
      const request = ++revision.current;
      const res = config.useMock
        ? { token: `mock-${Date.now()}`, user: { ...mockUser, name } }
        : await http.post<{ token: string; user: User }>("/auth/register", { name, email, password });
      if (request === revision.current) acceptSession(res);
    },
    [acceptSession]
  );

  const logout = useCallback(() => {
    revision.current += 1;
    verifiedToken.current = null;
    setAuthToken(null);
    setToken(null);
    setUser(null);
    setSessionError(null);
    setLoading(false);
    writeSessionToken(null);
    void clearLegacyPrivateStorage();
  }, []);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === sessionKey || event.key === null) {
        revision.current += 1;
        verifiedToken.current = null;
        setUser(null);
        setAuthToken(null);
        setToken(readSessionToken());
        setLoading(true);
        setRetry((value) => value + 1);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const updateProfile = useCallback(async (patch: { name?: string; title?: string; avatar?: string }) => {
    if (config.useMock) {
      setUser((current) => (current ? { ...current, ...patch } : current));
      return;
    }
    const updated = await http.patch<User>("/auth/me", patch);
    setUser(updated);
  }, []);

  const refreshUser = useCallback(async () => {
    if (config.useMock || !token) return;
    try {
      setUser(await http.get<User>("/auth/me"));
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) logout();
    }
  }, [token, logout]);

  const value = useMemo(
    () => ({ user, token, loading, sessionError, retrySession, login, register, logout, updateProfile, refreshUser }),
    [user, token, loading, sessionError, retrySession, login, register, logout, updateProfile, refreshUser]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

/** Anzeige-Platzhalter, solange (noch) keine Session existiert – nie Mock-Personendaten im API-Modus. */
const guestUser: User = { id: "guest", name: "Gast", handle: "@gast", avatar: "", level: 1, title: "Nicht angemeldet", grows: 0, harvests: 0, followers: 0, telegram: false, role: "member" };

/** Aktueller Nutzer für die UI (Session-User; Mock-Modus: Demo-User; sonst Gast). */
export function useCurrentUser(): User {
  const { user } = useAuth();
  return user ?? (config.useMock ? mockUser : guestUser);
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
