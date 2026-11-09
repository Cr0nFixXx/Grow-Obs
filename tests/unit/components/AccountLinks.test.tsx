// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import { AccountLinkPage, EmailCard, EmailVerificationGate, ForgotPasswordForm, parseAccountLink } from "@/components/AccountLinks";

const mocks = vi.hoisted(() => ({
  post: vi.fn(), push: vi.fn(), refreshUser: vi.fn(async () => undefined), logout: vi.fn(),
  user: { id: "u1", name: "Mia", email: "mia@example.invalid", emailVerified: false } as Record<string, unknown>,
}));
vi.mock("@/lib/config", () => ({ config: { useMock: false, apiBaseUrl: "https://api.example.test" } }));
vi.mock("@/lib/api", async (original) => {
  const actual = await original<typeof import("@/lib/api")>();
  return { ...actual, http: { get: vi.fn(), post: mocks.post, delete: vi.fn() } };
});
vi.mock("@/components/Toast", () => ({ useToast: () => ({ push: mocks.push }) }));
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ user: mocks.user, refreshUser: mocks.refreshUser, logout: mocks.logout }) }));

const TOKEN = "A".repeat(43);
beforeEach(() => { vi.clearAllMocks(); mocks.user = { id: "u1", name: "Mia", email: "mia@example.invalid", emailVerified: false }; });
afterEach(cleanup);

const fieldFor = (label: string) => screen.getByLabelText(new RegExp(`^${label}`)) as HTMLInputElement;
const fill = (label: string, value: string) => fireEvent.change(fieldFor(label), { target: { value } });

describe("parseAccountLink", () => {
  it("erkennt nur Bestätigungs- und Reset-Fragmente mit plausiblem Token", () => {
    expect(parseAccountLink(`#verify=${TOKEN}`)).toEqual({ kind: "verify", token: TOKEN });
    expect(parseAccountLink(`#reset=${TOKEN}`)).toEqual({ kind: "reset", token: TOKEN });
    expect(parseAccountLink("#reset=kurz")).toBeNull();
    expect(parseAccountLink(`#other=${TOKEN}`)).toBeNull();
    expect(parseAccountLink(`#verify=${TOKEN}&x=1`)).toBeNull();
    expect(parseAccountLink("")).toBeNull();
  });
});

describe("Bestätigungslink", () => {
  it("löst den Token genau einmal per POST ein und meldet den Erfolg", async () => {
    mocks.post.mockResolvedValue({ kind: "verify_email" });
    const onDone = vi.fn();
    render(<AccountLinkPage link={{ kind: "verify", token: TOKEN }} onDone={onDone} />);
    await waitFor(() => expect(screen.getByTestId("verify-ok").textContent).toMatch(/bestätigt/));
    expect(mocks.post).toHaveBeenCalledTimes(1);
    expect(mocks.post).toHaveBeenCalledWith("/auth/verify-email", { token: TOKEN });
    expect(mocks.refreshUser).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Weiter" }));
    expect(onDone).toHaveBeenCalled();
  });

  it("zeigt bei Adresswechsel den passenden Text und bei ungültigem Link die Fehlermeldung", async () => {
    mocks.post.mockResolvedValueOnce({ kind: "change_email" });
    const { unmount } = render(<AccountLinkPage link={{ kind: "verify", token: TOKEN }} onDone={vi.fn()} />);
    await waitFor(() => expect(screen.getByTestId("verify-ok").textContent).toMatch(/neue Adresse/));
    unmount();
    mocks.post.mockRejectedValueOnce(new ApiError(400, "Der Link ist ungültig oder abgelaufen. Bitte fordere einen neuen an."));
    render(<AccountLinkPage link={{ kind: "verify", token: TOKEN }} onDone={vi.fn()} />);
    await waitFor(() => expect(screen.getByTestId("verify-error").textContent).toMatch(/ungültig oder abgelaufen/));
  });
});

describe("Reset-Link", () => {
  it("prüft Länge und Übereinstimmung, ohne den Link zu verbrauchen", () => {
    render(<AccountLinkPage link={{ kind: "reset", token: TOKEN }} onDone={vi.fn()} />);
    fill("Neues Passwort(?! wiederholen)", "kurz");
    fireEvent.click(screen.getByRole("button", { name: "Passwort speichern" }));
    expect(screen.getByTestId("reset-error").textContent).toMatch(/mindestens 12/);
    fill("Neues Passwort(?! wiederholen)", "ein-langes-passwort-1");
    fill("Neues Passwort wiederholen", "ein-anderes-passwort-2");
    fireEvent.click(screen.getByRole("button", { name: "Passwort speichern" }));
    expect(screen.getByTestId("reset-error").textContent).toMatch(/stimmen nicht/);
    expect(mocks.post).not.toHaveBeenCalled();
  });

  it("setzt das Passwort, meldet lokal ab und führt zur Anmeldung", async () => {
    mocks.post.mockResolvedValue(undefined);
    const onDone = vi.fn();
    render(<AccountLinkPage link={{ kind: "reset", token: TOKEN }} onDone={onDone} />);
    fill("Neues Passwort(?! wiederholen)", "ein-langes-passwort-1");
    fill("Neues Passwort wiederholen", "ein-langes-passwort-1");
    fireEvent.click(screen.getByRole("button", { name: "Passwort speichern" }));
    await waitFor(() => expect(screen.getByTestId("reset-ok")).toBeTruthy());
    expect(mocks.post).toHaveBeenCalledWith("/auth/reset-password", { token: TOKEN, newPassword: "ein-langes-passwort-1" });
    expect(mocks.logout).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Zur Anmeldung" }));
    expect(onDone).toHaveBeenCalled();
  });

  it("zeigt den Serverfehler bei abgelaufenem Link", async () => {
    mocks.post.mockRejectedValue(new ApiError(400, "Der Link ist ungültig oder abgelaufen. Bitte fordere einen neuen an."));
    render(<AccountLinkPage link={{ kind: "reset", token: TOKEN }} onDone={vi.fn()} />);
    fill("Neues Passwort(?! wiederholen)", "ein-langes-passwort-1");
    fill("Neues Passwort wiederholen", "ein-langes-passwort-1");
    fireEvent.click(screen.getByRole("button", { name: "Passwort speichern" }));
    await waitFor(() => expect(screen.getByTestId("reset-error").textContent).toMatch(/abgelaufen/));
    expect(mocks.logout).not.toHaveBeenCalled();
  });
});

describe("Passwort vergessen", () => {
  it("antwortet neutral und übernimmt die bereits eingegebene Adresse", async () => {
    mocks.post.mockResolvedValue(undefined);
    render(<ForgotPasswordForm initialEmail="mia@example.invalid" onBack={vi.fn()} />);
    expect(fieldFor("E-Mail").value).toBe("mia@example.invalid");
    fireEvent.click(screen.getByRole("button", { name: "Link senden" }));
    await waitFor(() => expect(screen.getByTestId("forgot-sent").textContent).toMatch(/Wenn zu dieser Adresse ein Konto existiert/));
    expect(mocks.post).toHaveBeenCalledWith("/auth/forgot-password", { email: "mia@example.invalid" });
  });

  it("prüft die Adresse und meldet, wenn der Server keine Mails versendet", async () => {
    render(<ForgotPasswordForm initialEmail="" onBack={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Link senden" }));
    expect(screen.getByTestId("forgot-error").textContent).toMatch(/gültige E-Mail/);
    expect(mocks.post).not.toHaveBeenCalled();
    mocks.post.mockRejectedValue(new ApiError(503, "E-Mail-Versand ist auf diesem Server nicht eingerichtet. Bitte wende dich an den Betreiber."));
    fill("E-Mail", "mia@example.invalid");
    fireEvent.click(screen.getByRole("button", { name: "Link senden" }));
    await waitFor(() => expect(screen.getByTestId("forgot-error").textContent).toMatch(/nicht eingerichtet/));
  });
});

describe("Bestätigungs-Sperre", () => {
  it("zeigt die Adresse, sendet erneut und sperrt den Knopf kurz", async () => {
    mocks.post.mockResolvedValue(undefined);
    render(<EmailVerificationGate />);
    expect(screen.getByTestId("gate-email").textContent).toBe("mia@example.invalid");
    fireEvent.click(screen.getByRole("button", { name: "Link erneut senden" }));
    await waitFor(() => expect(screen.getByTestId("gate-info").textContent).toMatch(/mia@example.invalid/));
    expect(mocks.post).toHaveBeenCalledWith("/auth/resend-verification");
    expect((screen.getByRole("button", { name: /Erneut senden in/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("lässt eine falsche Adresse korrigieren (mit Passwort) und meldet ab", async () => {
    mocks.post.mockResolvedValue(undefined);
    render(<EmailVerificationGate />);
    fireEvent.click(screen.getByRole("button", { name: "Falsche Adresse ändern" }));
    fill("Neue E-Mail-Adresse", "richtig@example.invalid");
    fill("Passwort zur Bestätigung", "mein-passwort-1234");
    fireEvent.click(screen.getByRole("button", { name: "Bestätigungslink senden" }));
    await waitFor(() => expect(mocks.post).toHaveBeenCalledWith("/auth/email", { newEmail: "richtig@example.invalid", password: "mein-passwort-1234" }));
    await waitFor(() => expect(screen.getByTestId("gate-info").textContent).toMatch(/richtig@example.invalid/));
    fireEvent.click(screen.getByRole("button", { name: "Abmelden" }));
    expect(mocks.logout).toHaveBeenCalled();
  });

  it("zeigt Serverfehler beim erneuten Senden", async () => {
    mocks.post.mockRejectedValue(new ApiError(429, "Zu viele Anfragen"));
    render(<EmailVerificationGate />);
    fireEvent.click(screen.getByRole("button", { name: "Link erneut senden" }));
    await waitFor(() => expect(screen.getByTestId("gate-error").textContent).toMatch(/Zu viele Versuche/));
  });
});

describe("E-Mail-Karte im Profil", () => {
  it("zeigt Adresse und Status; Fehler des Servers (Adresse vergeben) bleiben sichtbar", async () => {
    mocks.user = { id: "u1", name: "Mia", email: "mia@example.invalid", emailVerified: true };
    mocks.post.mockRejectedValue(new ApiError(409, "Diese Adresse wird bereits verwendet."));
    render(<EmailCard />);
    expect(screen.getByTestId("current-email").textContent).toBe("mia@example.invalid");
    expect(screen.getByTestId("email-card").textContent).toMatch(/bestätigt/);
    fill("Neue E-Mail-Adresse", "belegt@example.invalid");
    fill("Passwort zur Bestätigung", "mein-passwort-1234");
    fireEvent.click(screen.getByRole("button", { name: "Bestätigungslink senden" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/bereits verwendet/));
  });

  it("nach dem Versand erscheint der Hinweis mit der neuen Adresse", async () => {
    mocks.post.mockResolvedValue(undefined);
    const onChanged = vi.fn();
    render(<EmailCard onChanged={onChanged} />);
    fill("Neue E-Mail-Adresse", "neu@example.invalid");
    fill("Passwort zur Bestätigung", "mein-passwort-1234");
    fireEvent.click(screen.getByRole("button", { name: "Bestätigungslink senden" }));
    await waitFor(() => expect(screen.getByTestId("email-change-sent").textContent).toMatch(/neu@example.invalid/));
    expect(onChanged).toHaveBeenCalled();
  });
});
