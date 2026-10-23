// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NewGroupModal } from "@/components/NewGroup";

const searchPeople = vi.fn(async (q: string) => (q === "an" ? [{ id: "u1", name: "Annika", handle: "annika", avatar: "" }, { id: "u2", name: "Anton", handle: "anton", avatar: "" }] : []));
const services = { chat: { searchPeople } };
vi.mock("@/data/DataContext", () => ({ useServices: () => services }));
vi.mock("@/components/media", () => ({
  ImagePickButton: ({ onUploaded, label }: { onUploaded: (p: string) => void; label: string }) => <button type="button" aria-label={label} onClick={() => onUploaded("/media/00000000-0000-4000-8000-000000000001")}>Bild</button>,
}));

describe("NewGroupModal (B-65)", () => {
  beforeEach(() => {
    window.matchMedia ??= ((query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined, addListener: () => undefined, removeListener: () => undefined, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
    searchPeople.mockClear();
  });
  afterEach(() => { cleanup(); });

  const pick = async (label: string) => { fireEvent.change(screen.getByLabelText("Personen suchen"), { target: { value: "an" } }); fireEvent.click(await screen.findByText(label)); };

  it("verlangt Namen und mindestens eine Person, bevor „Gruppe erstellen“ aktiv wird", async () => {
    render(<NewGroupModal open onClose={() => undefined} onCreate={async () => undefined} />);
    const create = screen.getByRole("button", { name: "Gruppe erstellen" });
    expect((create as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Gruppenname"), { target: { value: "Growfreunde" } });
    expect((create as HTMLButtonElement).disabled).toBe(true);
    await pick("Annika");
    expect((create as HTMLButtonElement).disabled).toBe(false);
    fireEvent.change(screen.getByLabelText("Gruppenname"), { target: { value: "   " } });
    expect((create as HTMLButtonElement).disabled).toBe(true);
  });

  it("sendet Name, Bild und gewählte Personen; eine gewählte Person verschwindet aus den Treffern und lässt sich entfernen", async () => {
    const onCreate = vi.fn(async () => undefined);
    const onClose = vi.fn();
    render(<NewGroupModal open onClose={onClose} onCreate={onCreate} />);
    fireEvent.change(screen.getByLabelText("Gruppenname"), { target: { value: " Growfreunde " } });
    fireEvent.click(screen.getByRole("button", { name: "Gruppenbild wählen" }));
    await pick("Annika");
    fireEvent.change(screen.getByLabelText("Personen suchen"), { target: { value: "an" } });
    await screen.findByText("Anton");
    expect(screen.queryByRole("button", { name: /^Annika\s*@annika/ })).toBeNull(); // schon gewählt: nicht erneut in den Treffern
    fireEvent.click(screen.getByText("Anton"));
    fireEvent.click(screen.getByRole("button", { name: "Annika entfernen" }));
    fireEvent.click(screen.getByRole("button", { name: "Gruppe erstellen" }));
    await waitFor(() => expect(onCreate).toHaveBeenCalledWith({ name: "Growfreunde", avatar: "/media/00000000-0000-4000-8000-000000000001", userIds: ["u2"] }));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("zeigt Fehler vom Server und bleibt offen", async () => {
    const onClose = vi.fn();
    render(<NewGroupModal open onClose={onClose} onCreate={async () => { throw new Error("Gruppe voll"); }} />);
    fireEvent.change(screen.getByLabelText("Gruppenname"), { target: { value: "G" } });
    await pick("Annika");
    fireEvent.click(screen.getByRole("button", { name: "Gruppe erstellen" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Gruppe voll");
    expect(onClose).not.toHaveBeenCalled();
  });
});
