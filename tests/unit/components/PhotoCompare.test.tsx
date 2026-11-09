// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { PhotoCompareModal } from "@/components/PhotoCompare";
import type { Grow } from "@/types";

const photos = [
  { id: "p1", url: "/media/a", caption: "Keimling", cover: true, date: "2026-09-01", day: 0 },
  { id: "p2", url: "/media/b", caption: "", cover: false, date: "2026-09-29", day: 28 },
  { id: "p3", url: "/media/c", caption: "Blüte", cover: false, date: "2026-10-20", day: 49 },
];
const grow = { id: "g1", name: "Run", photos } as Grow;

beforeEach(() => {
  window.matchMedia ??= ((query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined, addListener: () => undefined, removeListener: () => undefined, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
});
afterEach(cleanup);

describe("PhotoCompareModal (B-88)", () => {
  it("startet mit dem ältesten und dem neuesten Foto, zeigt Tag und Datum und die Spanne dazwischen", () => {
    render(<PhotoCompareModal grow={grow} open onClose={() => undefined} />);
    expect((screen.getByTestId("compare-before") as HTMLSelectElement).value).toBe("p1");
    expect((screen.getByTestId("compare-after") as HTMLSelectElement).value).toBe("p3");
    const slider = screen.getByTestId("compare-slider");
    expect(slider.textContent).toContain("Vorher · Tag 0 · 01.09.2026");
    expect(slider.textContent).toContain("Nachher · Tag 49 · 20.10.2026");
    expect(screen.getByTestId("compare-between").textContent).toBe("49 Tage zwischen den Aufnahmen");
    expect(screen.getByAltText("Vorher: Tag 0 · 01.09.2026").getAttribute("src")).toContain("/media/a");
  });

  it("Auswahl ändert die Bilder; gleiches Foto bekommt einen Hinweis, gleicher Tag eine eigene Meldung", () => {
    render(<PhotoCompareModal grow={grow} open onClose={() => undefined} />);
    fireEvent.change(screen.getByTestId("compare-after"), { target: { value: "p2" } });
    expect(screen.getByAltText("Nachher: Tag 28 · 29.09.2026").getAttribute("src")).toContain("/media/b");
    expect(screen.getByTestId("compare-between").textContent).toBe("28 Tage zwischen den Aufnahmen");
    fireEvent.change(screen.getByTestId("compare-after"), { target: { value: "p1" } });
    expect(screen.getByTestId("compare-between").textContent).toBe("Wähle zwei verschiedene Fotos.");
  });

  it("Regler: echtes Bereichsfeld mit Beschriftung; der Wert verschiebt den Ausschnitt des Nachher-Bildes", () => {
    render(<PhotoCompareModal grow={grow} open onClose={() => undefined} />);
    const range = screen.getByTestId("compare-range") as HTMLInputElement;
    expect(range.type).toBe("range");
    expect(range.getAttribute("aria-label")).toContain("Vergleichsregler");
    expect(range.value).toBe("50");
    fireEvent.change(range, { target: { value: "20" } });
    expect(range.getAttribute("aria-valuetext")).toBe("20 Prozent Vorher");
    expect((screen.getByTestId("compare-after-image") as HTMLElement).style.clipPath).toBe("inset(0 0 0 20%)");
  });

  it("Nebeneinander: beide Fotos mit Beschriftung inklusive Unterschrift", () => {
    render(<PhotoCompareModal grow={grow} open onClose={() => undefined} />);
    fireEvent.click(screen.getByRole("button", { name: "Nebeneinander" }));
    const side = screen.getByTestId("compare-side");
    expect(side.textContent).toContain("Vorher · Tag 0 · 01.09.2026 · Keimling");
    expect(side.textContent).toContain("Nachher · Tag 49 · 20.10.2026 · Blüte");
    expect(screen.queryByTestId("compare-slider")).toBeNull();
  });

  it("Fotos ohne Datum (ältere Daten) werden ohne Spanne gezeigt", () => {
    const old = { ...grow, photos: [{ id: "a", url: "/media/a", caption: "", cover: true }, { id: "b", url: "/media/b", caption: "", cover: false }] } as Grow;
    render(<PhotoCompareModal grow={old} open onClose={() => undefined} />);
    expect(screen.getByTestId("compare-slider").textContent).toContain("Vorher · Aufnahme");
    expect(screen.getByTestId("compare-between").textContent).toBe("");
  });
});
