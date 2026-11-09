// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ApiError } from "@/lib/api";
import { AccountData, canConfirmDelete, DEFAULT_CHOICES, DeleteAccountDialog, ExportCard, toDeleteOptions } from "@/components/AccountData";

const mocks = vi.hoisted(() => ({ get: vi.fn(), post: vi.fn(), del: vi.fn(), push: vi.fn(), logout: vi.fn(), useMock: false }));
vi.mock("@/lib/config", () => ({ config: { get useMock() { return mocks.useMock; }, apiBaseUrl: "https://api.example.test" } }));
vi.mock("@/lib/api", async (original) => {
  const actual = await original<typeof import("@/lib/api")>();
  return { ...actual, http: { get: mocks.get, post: mocks.post, delete: mocks.del } };
});
vi.mock("@/components/Toast", () => ({ useToast: () => ({ push: mocks.push }) }));
vi.mock("@/lib/auth", () => ({ useAuth: () => ({ logout: mocks.logout }) }));

const free = { platformAdmin: false, communities: [], groups: [], blocked: false };
beforeEach(() => { vi.clearAllMocks(); mocks.useMock = false; mocks.get.mockResolvedValue(free); });
afterEach(cleanup);

describe("Löschauswahl", () => {
  it("Vorauswahl: Inhalte anonym stehen lassen, Bilder behalten", () => {
    expect(toDeleteOptions(DEFAULT_CHOICES)).toEqual({ forum: "keep", feed: "keep", comments: "keep", chat: "keep", media: "keep" });
    expect(toDeleteOptions({ forum: true, feed: false, comments: true, chat: false, media: false })).toEqual({ forum: "delete", feed: "keep", comments: "delete", chat: "keep", media: "keep" });
  });
  it("Bestätigung braucht Passwort und das Wort LÖSCHEN (Groß-/Kleinschreibung egal)", () => {
    expect(canConfirmDelete("", "LÖSCHEN")).toBe(false);
    expect(canConfirmDelete("pw", "löschen")).toBe(true);
    expect(canConfirmDelete("pw", " LÖSCHEN ")).toBe(true);
    expect(canConfirmDelete("pw", "loeschen")).toBe(false);
  });
});

describe("DeleteAccountDialog", () => {
  it("zeigt Blocker und bietet kein Löschen an", async () => {
    mocks.get.mockResolvedValue({ platformAdmin: false, communities: [{ id: "c", name: "Living Soil" }], groups: [{ id: "g", name: "Beet-Team" }], blocked: true });
    render(<DeleteAccountDialog open onClose={vi.fn()} onDeleted={vi.fn()} />);
    const box = await screen.findByTestId("delete-blockers");
    expect(box.textContent).toMatch(/Living Soil/);
    expect(box.textContent).toMatch(/Beet-Team/);
    expect(screen.queryByRole("button", { name: "Konto löschen" })).toBeNull();
  });

  it("sendet die gewählten Optionen erst, wenn Passwort und Bestätigungswort stimmen", async () => {
    mocks.del.mockResolvedValue({ mode: "anonymized", mediaDeleted: 0 });
    const onDeleted = vi.fn();
    render(<DeleteAccountDialog open onClose={vi.fn()} onDeleted={onDeleted} />);
    await screen.findByText(/sofort und endgültig/);
    const submit = screen.getByRole("button", { name: "Konto löschen" }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    fireEvent.click(screen.getByRole("switch", { name: "Forum löschen" }));
    fireEvent.change(screen.getByLabelText(/^Passwort/), { target: { value: "geheim-geheim-1" } });
    fireEvent.change(screen.getByLabelText(/^Tippe LÖSCHEN/), { target: { value: "LÖSCHEN" } });
    expect(submit.disabled).toBe(false);
    fireEvent.click(submit);
    await waitFor(() => expect(onDeleted).toHaveBeenCalled());
    expect(mocks.del).toHaveBeenCalledWith("/auth/account", undefined, {
      password: "geheim-geheim-1", confirm: "LÖSCHEN", options: { forum: "delete", feed: "keep", comments: "keep", chat: "keep", media: "keep" },
    });
  });

  it("zeigt falsches Passwort als Fehler und bleibt offen", async () => {
    mocks.del.mockRejectedValue(new ApiError(403, "Passwort ist falsch"));
    const onDeleted = vi.fn();
    render(<DeleteAccountDialog open onClose={vi.fn()} onDeleted={onDeleted} />);
    await screen.findByText(/sofort und endgültig/);
    fireEvent.change(screen.getByLabelText(/^Passwort/), { target: { value: "falsch" } });
    fireEvent.change(screen.getByLabelText(/^Tippe LÖSCHEN/), { target: { value: "LÖSCHEN" } });
    fireEvent.click(screen.getByRole("button", { name: "Konto löschen" }));
    expect((await screen.findByRole("alert")).textContent).toBe("Passwort ist falsch");
    expect(onDeleted).not.toHaveBeenCalled();
  });
});

describe("ExportCard", () => {
  it("verlangt das Passwort und meldet das Limit verständlich", async () => {
    render(<ExportCard />);
    fireEvent.click(screen.getByRole("button", { name: "Daten herunterladen" }));
    expect((await screen.findByRole("alert")).textContent).toMatch(/Passwort/);
    expect(mocks.post).not.toHaveBeenCalled();
    mocks.post.mockRejectedValue(new ApiError(429, "x"));
    fireEvent.change(screen.getByLabelText(/^Passwort/), { target: { value: "pw" } });
    fireEvent.click(screen.getByRole("button", { name: "Daten herunterladen" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toMatch(/dreimal/));
    expect(mocks.post).toHaveBeenCalledWith("/auth/export", { password: "pw" });
  });
});

describe("AccountData", () => {
  it("im Demo-Modus gibt es weder Export noch Löschen", () => {
    mocks.useMock = true;
    render(<AccountData onDeleted={vi.fn()} />);
    expect(screen.queryByTestId("export-card")).toBeNull();
    expect(screen.queryByRole("button", { name: /Konto löschen/ })).toBeNull();
    expect(screen.getByTestId("danger-zone").textContent).toMatch(/Demo-Modus/);
  });
});
