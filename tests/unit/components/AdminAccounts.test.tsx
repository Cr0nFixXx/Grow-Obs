// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ADMIN_DELETE_CHOICES, actionLabel, BanDialog, DeleteUserDialog, ModerationLog } from "@/components/AdminAccounts";
import { toDeleteOptions } from "@/components/AccountData";
import type { AdminUser } from "@/services/interfaces";

const admin = {
  ban: vi.fn(async () => undefined), deleteUser: vi.fn(async () => undefined),
  moderationLog: vi.fn(async (offset: number) => offset === 0
    ? { hasMore: true, items: [{ id: "1", action: "ban", actor: "Boss", target: "Max", targetKind: "user", reason: "Spam", details: null, createdAt: "2026-10-01T10:00:00Z" }] }
    : { hasMore: false, items: [{ id: "2", action: "delete_account", actor: "Boss", target: "Eva", targetKind: "user", reason: null, details: null, createdAt: "2026-10-01T11:00:00Z" }] }),
};
const services = { admin };
vi.mock("@/data/DataContext", () => ({ useServices: () => services }));
vi.mock("@/components/Toast", () => ({ useToast: () => ({ push: vi.fn() }) }));

const user = { id: "u1", name: "Max", email: "max@example.invalid", role: "member" } as AdminUser;
beforeEach(() => vi.clearAllMocks());
afterEach(cleanup);

describe("BanDialog", () => {
  it("sperrt mit Grund und meldet onDone", async () => {
    const onDone = vi.fn();
    render(<BanDialog user={user} onClose={vi.fn()} onDone={onDone} />);
    fireEvent.change(screen.getByPlaceholderText(/Spam in mehreren/), { target: { value: "  Spam  " } });
    fireEvent.click(screen.getByRole("button", { name: "Sperren" }));
    await waitFor(() => expect(admin.ban).toHaveBeenCalledWith("u1", "Spam"));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });
  it("ohne Grund wird undefined gesendet; Fehler bleiben sichtbar", async () => {
    admin.ban.mockRejectedValueOnce(new Error("Nicht erlaubt"));
    const onDone = vi.fn();
    render(<BanDialog user={user} onClose={vi.fn()} onDone={onDone} />);
    fireEvent.click(screen.getByRole("button", { name: "Sperren" }));
    await screen.findByText("Nicht erlaubt");
    expect(admin.ban).toHaveBeenCalledWith("u1", undefined);
    expect(onDone).not.toHaveBeenCalled();
  });
});

describe("DeleteUserDialog", () => {
  it("Vorauswahl: alles löschen", () => {
    expect(toDeleteOptions(ADMIN_DELETE_CHOICES)).toEqual({ forum: "delete", feed: "delete", comments: "delete", chat: "delete", media: "remove" });
  });
  it("braucht Passwort und LÖSCHEN, sendet Optionen und Grund", async () => {
    const onDone = vi.fn();
    render(<DeleteUserDialog user={user} onClose={vi.fn()} onDone={onDone} />);
    const submit = screen.getByRole("button", { name: "Konto löschen" }) as HTMLButtonElement;
    expect(submit.disabled).toBe(true);
    const inputs = screen.getByTestId("admin-delete-form").querySelectorAll("input[type=text], input:not([type])");
    const [reason, word] = [inputs[inputs.length - 2], inputs[inputs.length - 1]] as HTMLInputElement[];
    fireEvent.change(reason, { target: { value: "Missbrauch" } });
    fireEvent.change(screen.getByLabelText("Dein Passwort"), { target: { value: "geheim" } });
    fireEvent.change(word, { target: { value: "LÖSCHEN" } });
    expect(submit.disabled).toBe(false);
    fireEvent.click(submit);
    await waitFor(() => expect(admin.deleteUser).toHaveBeenCalledWith("u1", { password: "geheim", options: toDeleteOptions(ADMIN_DELETE_CHOICES), reason: "Missbrauch" }));
    await waitFor(() => expect(onDone).toHaveBeenCalled());
  });
});

describe("ModerationLog", () => {
  it("zeigt Einträge und lädt mehr", async () => {
    render(<ModerationLog />);
    await screen.findByText(/Konto gesperrt/);
    expect(screen.getByText(/Spam/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /Mehr laden/ }));
    await screen.findByText(/Konto gelöscht/);
    expect(admin.moderationLog).toHaveBeenLastCalledWith(1);
  });
  it("actionLabel kennt unbekannte Aktionen", () => {
    expect(actionLabel("unban")).toBe("Sperre aufgehoben");
    expect(actionLabel("foo")).toBe("foo");
  });
});
