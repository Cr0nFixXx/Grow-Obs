// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import { LoginHistoryCard, PasswordCard, validatePasswordChange } from "@/components/AccountSecurity";

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), push: vi.fn() }));
vi.mock("@/lib/config", () => ({ config: { useMock: false, apiBaseUrl: "https://api.example.test" } }));
vi.mock("@/lib/api", async (original) => {
  const actual = await original<typeof import("@/lib/api")>();
  return { ...actual, http: { get: mocks.get, post: mocks.post, delete: vi.fn() } };
});
vi.mock("@/components/Toast", () => ({ useToast: () => ({ push: mocks.push }) }));

beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

const fieldFor = (label: string) => screen.getByLabelText(new RegExp(`^${label}`)) as HTMLInputElement;
const fill = (label: string, value: string) => fireEvent.change(fieldFor(label), { target: { value } });

describe("validatePasswordChange", () => {
  it("prüft Pflichtfeld, Länge, Unterschied und Bestätigung", () => {
    expect(validatePasswordChange("", "x".repeat(12), "x".repeat(12))).toMatch(/aktuelles/i);
    expect(validatePasswordChange("alt-passwort-123", "kurz", "kurz")).toMatch(/mindestens 12/);
    expect(validatePasswordChange("gleiches-passwort", "gleiches-passwort", "gleiches-passwort")).toMatch(/unterscheiden/);
    expect(validatePasswordChange("alt-passwort-123", "neues-passwort-123", "anderes-passwort")).toMatch(/stimmen nicht/);
    expect(validatePasswordChange("alt-passwort-123", "neues-passwort-123", "neues-passwort-123")).toBeNull();
  });
});

describe("PasswordCard", () => {
  it("sendet nichts, wenn die Bestätigung abweicht", () => {
    render(<PasswordCard />);
    fill("Aktuelles Passwort", "alt-passwort-123");
    fill("Neues Passwort(?! wiederholen)", "neues-passwort-123");
    fill("Neues Passwort wiederholen", "tippfehler-passwort");
    fireEvent.click(screen.getByRole("button", { name: "Passwort ändern" }));
    expect(screen.getByRole("alert").textContent).toMatch(/stimmen nicht überein/);
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it("ändert das Passwort, leert die Felder und meldet den Erfolg", async () => {
    mocks.post.mockResolvedValue(undefined);
    const onChanged = vi.fn();
    render(<PasswordCard onChanged={onChanged} />);
    fill("Aktuelles Passwort", "alt-passwort-123");
    fill("Neues Passwort(?! wiederholen)", "neues-passwort-123");
    fill("Neues Passwort wiederholen", "neues-passwort-123");
    fireEvent.click(screen.getByRole("button", { name: "Passwort ändern" }));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
    expect(mocks.post).toHaveBeenCalledWith("/auth/password", { currentPassword: "alt-passwort-123", newPassword: "neues-passwort-123" });
    expect(mocks.push).toHaveBeenCalledWith(expect.objectContaining({ title: "Passwort geändert" }));
    expect(fieldFor("Aktuelles Passwort").value).toBe("");
  });

  it("zeigt die Serverantwort bei falschem aktuellem Passwort an", async () => {
    mocks.post.mockRejectedValue(new ApiError(403, "Aktuelles Passwort ist falsch"));
    render(<PasswordCard />);
    fill("Aktuelles Passwort", "falsch-falsch-falsch");
    fill("Neues Passwort(?! wiederholen)", "neues-passwort-123");
    fill("Neues Passwort wiederholen", "neues-passwort-123");
    fireEvent.click(screen.getByRole("button", { name: "Passwort ändern" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/Aktuelles Passwort ist falsch/));
  });
});

describe("LoginHistoryCard", () => {
  it("listet Ereignisse mit Gerät und markiert Fehlversuche", async () => {
    mocks.get.mockResolvedValue([
      { id: "1", event: "login_failed", device: "Firefox auf Linux", createdAt: "2026-10-17T10:00:00Z" },
      { id: "2", event: "login", device: "Chrome auf Windows", createdAt: "2026-10-16T10:00:00Z" },
    ]);
    render(<LoginHistoryCard />);
    await waitFor(() => expect(screen.getAllByTestId("login-event-row")).toHaveLength(2));
    expect(screen.getByText("Anmeldung fehlgeschlagen")).toBeTruthy();
    expect(screen.getByText(/Chrome auf Windows/)).toBeTruthy();
    expect(screen.getByText(/keine IP-Adresse/)).toBeTruthy();
  });
});

describe("ForcedPasswordChange", () => {
  it("zeigt nur die Passwortänderung (mit Abmelden) und lädt nach Erfolg das Konto neu", async () => {
    const refreshUser = vi.fn();
    const logout = vi.fn();
    vi.doMock("@/lib/auth", () => ({ useAuth: () => ({ user: { name: "Chef" }, refreshUser, logout }) }));
    vi.resetModules();
    const { ForcedPasswordChange } = await import("@/components/AccountSecurity");
    mocks.post.mockResolvedValue(undefined);
    render(<ForcedPasswordChange />);
    expect(screen.getByRole("heading", { name: "Neues Passwort festlegen" })).toBeTruthy();
    expect(screen.getByText(/Einmalpasswort/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Abmelden" }));
    expect(logout).toHaveBeenCalled();
    fill("Aktuelles Passwort", "einmal-passwort-24-zeichen");
    fill("Neues Passwort(?! wiederholen)", "mein-eigenes-passwort-1");
    fill("Neues Passwort wiederholen", "mein-eigenes-passwort-1");
    fireEvent.click(screen.getByRole("button", { name: "Passwort ändern" }));
    await waitFor(() => expect(refreshUser).toHaveBeenCalled());
    vi.doUnmock("@/lib/auth");
  });
});
