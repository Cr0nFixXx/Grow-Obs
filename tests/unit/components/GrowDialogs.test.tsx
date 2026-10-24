// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DeleteGrowModal, EditGrowModal, FinishGrowModal } from "@/components/GrowDialogs";
import type { Grow } from "@/types";

const grows = {
  update: vi.fn(async (_id: string, patch: object) => ({ ...grow(), ...patch }) as Grow),
  finish: vi.fn(async () => grow()),
  remove: vi.fn(async () => undefined),
};
vi.mock("@/data/DataContext", () => ({ useServices: () => ({ grows }) }));
vi.mock("@/components/Toast", () => ({ useToast: () => ({ push: () => undefined }) }));

function grow(over: Partial<Grow> = {}): Grow {
  return {
    id: "g1", name: "Run 1", strain: "Haze", breeder: "X", type: "Hybrid", medium: "Erde (Bio)", startDate: "2026-09-01", day: 30, totalDays: 84,
    phase: "Vegetativ", phaseIndex: 1, progress: 35, status: "active", condition: "gesund", archived: false, endedOn: null, harvest: null,
    cover: "", gallery: ["/media/a"], expectedYield: "—", phases: [], env: [], logs: [],
    ...over,
  } as Grow;
}

describe("Grow-Dialoge (B-84)", () => {
  beforeEach(() => {
    window.matchMedia ??= ((query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined, addListener: () => undefined, removeListener: () => undefined, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
    Object.values(grows).forEach((fn) => fn.mockClear());
  });
  afterEach(cleanup);

  it("Bearbeiten: sendet geänderte Felder; leerer Name wird abgelehnt", async () => {
    const onSaved = vi.fn();
    render(<EditGrowModal grow={grow()} open onClose={() => undefined} onSaved={onSaved} />);
    fireEvent.change(screen.getByLabelText(/Name des Grows/), { target: { value: "  " } });
    fireEvent.submit(screen.getByTestId("edit-grow-form"));
    expect(await screen.findByText("Bitte einen Namen angeben.")).toBeTruthy();
    expect(grows.update).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(/Name des Grows/), { target: { value: " Run 2 " } });
    fireEvent.change(screen.getByLabelText(/Geplante Dauer/), { target: { value: "90" } });
    fireEvent.submit(screen.getByTestId("edit-grow-form"));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(grows.update).toHaveBeenCalledWith("g1", expect.objectContaining({ name: "Run 2", totalDays: 90, startDate: "2026-09-01", strain: "Haze" }));
  });

  it("Bearbeiten: Dauer außerhalb 14–400 und Zukunftsdatum werden abgelehnt", async () => {
    render(<EditGrowModal grow={grow()} open onClose={() => undefined} onSaved={() => undefined} />);
    fireEvent.change(screen.getByLabelText(/Geplante Dauer/), { target: { value: "5" } });
    fireEvent.submit(screen.getByTestId("edit-grow-form"));
    expect(await screen.findByText("Zwischen 14 und 400 Tagen.")).toBeTruthy();
    expect(grows.update).not.toHaveBeenCalled();
  });

  it("Ernte: sendet Datum, Gewichte und Notiz; Trocken > Nass wird abgelehnt", async () => {
    const onSaved = vi.fn();
    render(<FinishGrowModal grow={grow()} open initialOutcome="harvested" onClose={() => undefined} onSaved={onSaved} />);
    fireEvent.change(screen.getByLabelText(/Nassgewicht/), { target: { value: "100" } });
    fireEvent.change(screen.getByLabelText(/Trockengewicht/), { target: { value: "150" } });
    fireEvent.submit(screen.getByTestId("finish-grow-form"));
    expect(await screen.findByText(/Trockengewicht kann nicht größer/)).toBeTruthy();
    expect(grows.finish).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(/Trockengewicht/), { target: { value: "25,4" } });
    fireEvent.change(screen.getByLabelText(/Notiz/), { target: { value: " harzig " } });
    fireEvent.submit(screen.getByTestId("finish-grow-form"));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(grows.finish).toHaveBeenCalledWith("g1", expect.objectContaining({ outcome: "harvested", wetG: 100, dryG: 25, note: "harzig" }));
  });

  it("Abbruch: keine Gewichtsfelder, sendet nur Ergebnis, Datum und Notiz", async () => {
    render(<FinishGrowModal grow={grow()} open initialOutcome="aborted" onClose={() => undefined} onSaved={() => undefined} />);
    expect(screen.queryByLabelText(/Nassgewicht/)).toBeNull();
    fireEvent.submit(screen.getByTestId("finish-grow-form"));
    await waitFor(() => expect(grows.finish).toHaveBeenCalled());
    const input = (grows.finish.mock.calls[0] as unknown as [string, Record<string, unknown>])[1];
    expect(input).toMatchObject({ outcome: "aborted" });
    expect("wetG" in input).toBe(false);
  });

  it("Ernte bearbeiten: übernimmt vorhandene Werte", () => {
    const done = grow({ status: "harvested", endedOn: "2026-10-20", harvest: { wetG: 300, dryG: 70, note: "gut" } });
    render(<FinishGrowModal grow={done} open initialOutcome="harvested" onClose={() => undefined} onSaved={() => undefined} />);
    expect((screen.getByLabelText(/Nassgewicht/) as HTMLInputElement).value).toBe("300");
    expect((screen.getByLabelText(/Trockengewicht/) as HTMLInputElement).value).toBe("70");
    expect((screen.getByLabelText(/Notiz/) as HTMLTextAreaElement).value).toBe("gut");
  });

  it("Löschen: nennt, was verloren geht, bietet Archivieren an und löscht erst nach Klick", async () => {
    const onDeleted = vi.fn();
    const onArchive = vi.fn();
    render(<DeleteGrowModal grow={grow({ logs: [{ id: "l1" } as Grow["logs"][number]] })} open onClose={() => undefined} onDeleted={onDeleted} onArchive={onArchive} />);
    expect(screen.getByTestId("delete-grow-dialog").textContent).toMatch(/1 Eintrag, 0 Messwerten und 1 Foto/);
    expect(grows.remove).not.toHaveBeenCalled();
    fireEvent.click(screen.getByText("Lieber archivieren"));
    expect(onArchive).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: /Endgültig löschen/ }));
    await waitFor(() => expect(onDeleted).toHaveBeenCalled());
    expect(grows.remove).toHaveBeenCalledWith("g1");
  });

  it("zeigt Serverfehler im Dialog statt still zu scheitern", async () => {
    grows.finish.mockRejectedValueOnce(new Error("Der Grow ist abgeschlossen"));
    render(<FinishGrowModal grow={grow()} open initialOutcome="harvested" onClose={() => undefined} onSaved={() => undefined} />);
    fireEvent.submit(screen.getByTestId("finish-grow-form"));
    expect((await screen.findByRole("alert")).textContent).toContain("Der Grow ist abgeschlossen");
  });
});
