// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { NewChatModal } from "./NewChat";

const searchPeople = vi.fn(async (q: string) => (q === "ann" ? [{ id: "u1", name: "Annika", handle: "annika", avatar: "" }] : []));
const services = { chat: { searchPeople } };
vi.mock("@/data/DataContext", () => ({ useServices: () => services }));

describe("NewChatModal (B-59)", () => {
  beforeEach(() => {
    window.matchMedia ??= ((query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined, addListener: () => undefined, removeListener: () => undefined, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
    searchPeople.mockClear();
  });
  afterEach(() => { cleanup(); });

  it("sucht erst ab 2 Zeichen und mit Verzögerung, zeigt Treffer, wählt Person und schließt", async () => {
    const onPick = vi.fn(async () => undefined);
    const onClose = vi.fn();
    render(<NewChatModal open onClose={onClose} onPick={onPick} />);
    const input = screen.getByLabelText("Person suchen");
    fireEvent.change(input, { target: { value: "a" } });
    await act(async () => { await new Promise((r) => setTimeout(r, 400)); });
    expect(searchPeople).not.toHaveBeenCalled(); // < 2 Zeichen
    fireEvent.change(input, { target: { value: "ann" } });
    expect(searchPeople).not.toHaveBeenCalled(); // entprellt
    await waitFor(() => expect(searchPeople).toHaveBeenCalledWith("ann"));
    fireEvent.click(await screen.findByText("Annika"));
    await waitFor(() => expect(onPick).toHaveBeenCalledWith(expect.objectContaining({ id: "u1" })));
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it("meldet „Niemand gefunden“ und Fehler der Suche", async () => {
    render(<NewChatModal open onClose={() => undefined} onPick={async () => undefined} />);
    fireEvent.change(screen.getByLabelText("Person suchen"), { target: { value: "zzz" } });
    expect(await screen.findByText("Niemand gefunden.")).toBeTruthy();
    searchPeople.mockRejectedValueOnce(new Error("Suche kaputt"));
    fireEvent.change(screen.getByLabelText("Person suchen"), { target: { value: "yyy" } });
    expect((await screen.findByRole("alert")).textContent).toBe("Suche kaputt");
  });

  it("Fehler beim Starten bleibt sichtbar, Dialog bleibt offen", async () => {
    const onClose = vi.fn();
    render(<NewChatModal open onClose={onClose} onPick={async () => { throw new Error("Nicht möglich"); }} />);
    fireEvent.change(screen.getByLabelText("Person suchen"), { target: { value: "ann" } });
    fireEvent.click(await screen.findByText("Annika"));
    expect((await screen.findByRole("alert")).textContent).toBe("Nicht möglich");
    expect(onClose).not.toHaveBeenCalled();
  });
});
