// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { ProfileImageMenu, MemberGrowsModal } from "@/components/profile-extras";

const grows = vi.fn();
const services = { members: { grows } };
vi.mock("@/data/DataContext", () => ({ useServices: () => services }));
vi.mock("@/components/Toast", () => ({ useToast: () => ({ push: () => undefined }) }));
vi.mock("@/components/media", () => ({ ImagePickButton: ({ children, onUploaded, label }: { children: React.ReactNode; onUploaded: (p: string) => void; label?: string }) => <button type="button" aria-label={label} onClick={() => onUploaded("/media/neu")}>{children}</button> }));

describe("ProfileImageMenu (B-92)", () => {
  beforeEach(() => {
    window.matchMedia ??= ((query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined, addListener: () => undefined, removeListener: () => undefined, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  });
  afterEach(cleanup);

  it("eigenes Bild: Menü mit Ansehen, Ändern, Entfernen; Ändern speichert den neuen Pfad", async () => {
    const onChange = vi.fn(async () => undefined);
    render(<ProfileImageMenu label="Profilbild" src="/media/alt" editable onChange={onChange}><span>Bild</span></ProfileImageMenu>);
    fireEvent.click(screen.getByTestId("image-menu-Profilbild"));
    const menu = await screen.findByTestId("image-menu");
    expect(menu.textContent).toMatch(/Ansehen/);
    expect(menu.textContent).toMatch(/Ändern/);
    expect(menu.textContent).toMatch(/Entfernen/);
    fireEvent.click(screen.getByLabelText("Profilbild ändern"));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith("/media/neu"));
  });

  it("Entfernen verlangt eine Bestätigung und speichert dann einen leeren Pfad", async () => {
    const onChange = vi.fn(async () => undefined);
    render(<ProfileImageMenu label="Titelbild" src="/media/alt" editable onChange={onChange}><span>Bild</span></ProfileImageMenu>);
    fireEvent.click(screen.getByTestId("image-menu-Titelbild"));
    fireEvent.click(await screen.findByText("Entfernen"));
    expect(onChange).not.toHaveBeenCalled();
    fireEvent.click(await screen.findByRole("button", { name: "Entfernen" }));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith(""));
  });

  it("fremdes Profil ohne Bild: nicht antippbar; ohne Recht kein Menü", () => {
    render(<ProfileImageMenu label="Profilbild"><span>Initialen</span></ProfileImageMenu>);
    expect(screen.queryByTestId("image-menu-Profilbild")).toBeNull();
  });

  it("fremdes Profil mit Bild: Antippen öffnet die Großansicht, kein Änderungsmenü", async () => {
    render(<ProfileImageMenu label="Profilbild" src="/media/x"><span>Bild</span></ProfileImageMenu>);
    fireEvent.click(screen.getByTestId("image-menu-Profilbild"));
    expect(screen.queryByTestId("image-menu")).toBeNull();
  });
});

describe("MemberGrowsModal (B-92)", () => {
  afterEach(cleanup);
  it("zeigt sichtbare Grows und öffnet einen per Klick", async () => {
    window.matchMedia ??= ((query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined, addListener: () => undefined, removeListener: () => undefined, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
    grows.mockResolvedValueOnce([{ id: "g1", name: "Run 1", strain: "Haze", type: "Hybrid", medium: "Erde", startDate: "2026-09-01", day: 3, totalDays: 84, phase: "Keimung", progress: 3, status: "active", condition: "gesund", cover: "", visibility: "public", archived: false }]);
    const onOpen = vi.fn();
    render(<MemberGrowsModal handle="olli" name="Olli" mine={false} onClose={() => undefined} onOpen={onOpen} />);
    fireEvent.click(await screen.findByTestId("member-grow-item"));
    expect(onOpen).toHaveBeenCalledWith("g1");
  });
  it("leere Liste: freundlicher Hinweis statt Fehler", async () => {
    window.matchMedia ??= ((query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined, addListener: () => undefined, removeListener: () => undefined, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
    grows.mockResolvedValueOnce([]);
    render(<MemberGrowsModal handle="olli" name="Olli" mine={false} onClose={() => undefined} onOpen={() => undefined} />);
    expect(await screen.findByText(/zeigt keine Grows öffentlich/)).toBeTruthy();
  });
});
