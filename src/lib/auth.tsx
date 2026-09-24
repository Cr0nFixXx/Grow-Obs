import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { config } from "./config";
import { http, setAuthToken } from "./api";
import { currentUser } from "@/mocks/data";
import type { User } from "@/types";

interface AuthValue {
  user: User | null;
  token: string | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => void;
}

const AuthContext = createContext<AuthValue | null>(null);
const TOKEN_KEY = "go-token";

const mockUser: User = { ...currentUser, id: "u-me" };

/**
 * AuthProvider – Session-Management (Token in localStorage, Restore bei Reload).
 * Mock-Modus: Login/Register liefern sofort den Mock-User. API-Modus: `/auth/*`.
 */
export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [token, setToken] = useState<string | null>(() => {
    try {
      return localStorage.getItem(TOKEN_KEY);
    } catch {
      return null;
    }
  });
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (!token) {
      setLoading(false);
      return;
    }
    setAuthToken(token);
    const restore = config.useMock
      ? Promise.resolve<User>(mockUser)
      : http.get<User>("/auth/me").catch(() => null);
    restore
      .then((u) => {
        if (u) setUser(u);
        else {
          setAuthToken(null);
          setToken(null);
          try {
            localStorage.removeItem(TOKEN_KEY);
          } catch {
            /* ignore */
          }
        }
      })
      .finally(() => setLoading(false));
  }, [token]);

  const login = useCallback(async (email: string, password: string) => {
    if (config.useMock) {
      const t = `mock-${Date.now()}`;
      setAuthToken(t);
      setToken(t);
      setUser(mockUser);
      try {
        localStorage.setItem(TOKEN_KEY, t);
      } catch {
        /* ignore */
      }
      return;
    }
    const res = await http.post<{ token: string; user: User }>("/auth/login", { email, password });
    setAuthToken(res.token);
    setToken(res.token);
    setUser(res.user);
    try {
      localStorage.setItem(TOKEN_KEY, res.token);
    } catch {
      /* ignore */
    }
  }, []);

  const register = useCallback(
    async (name: string, email: string, password: string) => {
      if (config.useMock) {
        return login(email, password);
      }
      const res = await http.post<{ token: string; user: User }>("/auth/register", {
        name,
        email,
        password,
      });
      setAuthToken(res.token);
      setToken(res.token);
      setUser(res.user);
      try {
        localStorage.setItem(TOKEN_KEY, res.token);
      } catch {
        /* ignore */
      }
    },
    [login]
  );

  const logout = useCallback(() => {
    setAuthToken(null);
    setToken(null);
    setUser(null);
    try {
      localStorage.removeItem(TOKEN_KEY);
    } catch {
      /* ignore */
    }
  }, []);

  const value = useMemo(
    () => ({ user, token, loading, login, register, logout }),
    [user, token, loading, login, register, logout]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within AuthProvider");
  return ctx;
}
