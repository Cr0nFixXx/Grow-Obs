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
import { ApiError, http, SESSION_EXPIRED_EVENT, setSessionHeaderToken } from "./api";
import { clearLegacyPrivateStorage, readHeaderToken, readSessionMarker, sessionKey, writeHeaderToken, writeSessionMarker } from "./session-storage";
import { currentUser } from "@/mocks/data";
import type { User } from "@/types";
import type { ProfileUpdate } from "@/services/interfaces";

interface AuthValue {
  user: User | null;
  /** `true`, wenn dieser Browser eine Sitzung erwartet (das Token selbst ist ein HttpOnly-Cookie und für JS unsichtbar). */
  signedIn: boolean;
  loading: boolean;
  sessionError: string | null;
  retrySession: () => void;
  login: (email: string, password: string, remember?: boolean) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  /** Meldet lokal sofort ab und beendet die Sitzung serverseitig (best effort). */
  logout: () => void;
  /** Beendet alle Sitzungen dieses Kontos auf allen Geräten, danach lokal abmelden. */
  logoutAll: () => Promise<void>;
  /** Eigenes Profil ändern (Name, Titel, Avatar). Mock: nur Session. */
  updateProfile: (patch: ProfileUpdate) => Promise<void>;
  /** Eigenes Profil/Rolle leise neu laden (Pull-to-Refresh). */
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthValue | null>(null);
const mockUser: User = { ...currentUser, id: "u-me", role: "platform_admin" };

/**
 * Session state is fail-closed while restoring. API mode: Die Sitzung ist ein HttpOnly-Cookie (B-54, widerrufbar,
 * serverseitig gespeichert); im Browser liegt nur ein nicht geheimer Marker. Mock-Modus: Login/Register liefern sofort
 * den Mock-User. API-Modus: `/auth/*`.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [signedIn, setSignedIn] = useState(() => {
    const expected = readSessionMarker();
    setSessionHeaderToken(expected ? readHeaderToken() : null); // nur im Header-Fallback-Modus belegt
    return expected;
  });
  const [loading, setLoading] = useState(true);
  const [sessionError, setSessionError] = useState<string | null>(null);
  const [retry, setRetry] = useState(0);
  const revision = useRef(0);
  const verified = useRef(false);
  const signedInRef = useRef(signedIn);
  signedInRef.current = signedIn;
  const retrySession = useCallback(() => setRetry((value) => value + 1), []);

  useEffect(() => {
    const request = ++revision.current;
    const controller = new AbortController();
    setSessionError(null);
    if (!signedIn) {
      setUser(null);
      setLoading(false);
      return;
    }
    if (verified.current) { setLoading(false); return; }
    setLoading(true);
    const restore = config.useMock
      ? Promise.resolve<User>(mockUser)
      : http.get<User>("/auth/me", controller.signal);
    restore
      .then((u) => {
        if (request !== revision.current || controller.signal.aborted) return;
        setUser(u);
        verified.current = true;
      })
      .catch((error: unknown) => {
        if (request !== revision.current || controller.signal.aborted) return;
        setUser(null);
        if (error instanceof ApiError && error.status === 401) {
          setSessionHeaderToken(null);
          setSignedIn(false);
          writeSessionMarker(false);
          void clearLegacyPrivateStorage();
        } else {
          setSessionError("Die Sitzung konnte nicht geprüft werden. Bitte Verbindung prüfen und erneut versuchen.");
        }
      })
      .finally(() => { if (request === revision.current && !controller.signal.aborted) setLoading(false); });
    return () => { controller.abort(); revision.current += 1; };
  }, [signedIn, retry]);

  const acceptSession = useCallback((result: { user: User; token?: string }, remember = true) => {
    // `token` liefert der Server nur im Header-Fallback-Modus (Proxy ohne Cookie-Durchreichung); sonst bleibt alles im Cookie.
    setSessionHeaderToken(result.token ?? null);
    writeHeaderToken(result.token ?? null, remember);
    verified.current = true;
    setSignedIn(true);
    setUser(result.user);
    writeSessionMarker(true, remember);
    setLoading(false);
    setSessionError(null);
  }, []);

  const login = useCallback(async (email: string, password: string, remember = true) => {
    const request = ++revision.current;
    const res = config.useMock
      ? { user: mockUser }
      : await http.post<{ user: User; token?: string }>("/auth/login", { email, password, remember });
    if (request === revision.current) acceptSession(res, remember);
  }, [acceptSession]);

  const register = useCallback(
    async (name: string, email: string, password: string) => {
      const request = ++revision.current;
      const res = config.useMock
        ? { user: { ...mockUser, name } }
        : await http.post<{ user: User; token?: string }>("/auth/register", { name, email, password });
      if (request === revision.current) acceptSession(res);
    },
    [acceptSession]
  );

  /** Lokale Abmeldung ohne Server-Aufruf (z. B. wenn der Server die Sitzung bereits beendet hat). */
  const endLocalSession = useCallback(() => {
    revision.current += 1;
    verified.current = false;
    setSessionHeaderToken(null);
    setSignedIn(false);
    setUser(null);
    setSessionError(null);
    setLoading(false);
    writeSessionMarker(false);
    void clearLegacyPrivateStorage();
  }, []);

  const logout = useCallback(() => {
    // Zuerst den Server-Aufruf anstoßen (das Cookie hängt noch an), die UI wartet nicht darauf.
    if (!config.useMock) void http.post("/auth/logout").catch(() => undefined);
    endLocalSession();
  }, [endLocalSession]);

  const logoutAll = useCallback(async () => {
    if (!config.useMock) await http.post("/auth/logout-all");
    endLocalSession();
  }, [endLocalSession]);

  useEffect(() => {
    const onStorage = (event: StorageEvent) => {
      if (event.key === sessionKey || event.key === null) {
        revision.current += 1;
        verified.current = false;
        setUser(null);
        const expected = readSessionMarker();
        setSessionHeaderToken(expected ? readHeaderToken() : null);
        setSignedIn(expected);
        setLoading(true);
        setRetry((value) => value + 1);
      }
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  // Server meldet 401 auf eine Fach-Anfrage: Sitzung wurde beendet (anderes Gerät, Ablauf) → lokal abmelden.
  useEffect(() => {
    if (config.useMock) return;
    const onExpired = () => { if (signedInRef.current) endLocalSession(); };
    window.addEventListener(SESSION_EXPIRED_EVENT, onExpired);
    return () => window.removeEventListener(SESSION_EXPIRED_EVENT, onExpired);
  }, [endLocalSession]);

  const updateProfile = useCallback(async (patch: ProfileUpdate) => {
    if (config.useMock) {
      setUser((current) => {
        if (!current) return current;
        const { live, statusEmoji, statusText, statusVisibility, ...rest } = patch;
        const status = { emoji: statusEmoji ?? current.status?.emoji ?? "", text: statusText ?? current.status?.text ?? "", visibility: statusVisibility ?? current.status?.visibility ?? "all" };
        const next: User = { ...current, ...rest, status };
        if (live !== undefined) next.live = live ? { text: live.text, image: live.image ?? "", visibility: live.visibility, expiresAt: new Date(Date.now() + 24 * 3_600_000).toISOString() } : null;
        return next;
      });
      return;
    }
    const updated = await http.patch<User>("/auth/me", patch);
    setUser(updated);
  }, []);

  const refreshUser = useCallback(async () => {
    if (config.useMock || !signedInRef.current) return;
    try {
      setUser(await http.get<User>("/auth/me"));
    } catch (error) {
      if (error instanceof ApiError && error.status === 401) endLocalSession();
    }
  }, [endLocalSession]);

  const value = useMemo(
    () => ({ user, signedIn, loading, sessionError, retrySession, login, register, logout, logoutAll, updateProfile, refreshUser }),
    [user, signedIn, loading, sessionError, retrySession, login, register, logout, logoutAll, updateProfile, refreshUser]
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
