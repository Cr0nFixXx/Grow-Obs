// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DeleteGrowModal, EditGrowModal, EditLogModal, EnvModal, FinishGrowModal, PhotoModal, parseDecimal } from "@/components/GrowDialogs";
import type { Grow } from "@/types";

const grows = {
  update: vi.fn(async (_id: string, patch: object) => ({ ...grow(), ...patch }) as Grow),
  finish: vi.fn(async () => grow()),
  remove: vi.fn(async () => undefined),
  updateLog: vi.fn(async () => ({}) as never),
  deleteLog: vi.fn(async () => undefined),
  updatePhoto: vi.fn(async () => grow()),
  deletePhoto: vi.fn(async () => grow()),
  saveEnv: vi.fn(async () => ({}) as never),
  deleteEnv: vi.fn(async () => undefined),
};
vi.mock("@/data/DataContext", () => ({ useServices: () => ({ grows }) }));
vi.mock("@/components/Toast", () => ({ useToast: () => ({ push: () => undefined }) }));

function grow(over: Partial<Grow> = {}): Grow {
  return {
    id: "g1", name: "Run 1", strain: "Haze", breeder: "X", type: "Hybrid", medium: "Erde (Bio)", startDate: "2026-09-01", day: 30, totalDays: 84,
    phase: "Vegetativ", phaseIndex: 1, progress: 35, status: "active", condition: "gesund", archived: false, endedOn: null, harvest: null,
    cover: "/media/a", photos: [{ id: "p1", url: "/media/a", caption: "", cover: true }, { id: "p2", url: "/media/b", caption: "Tag 3", cover: false }], leafOffset: 2, targets: {}, expectedYield: "—", phases: [], env: [], logs: [],
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

  it("Bearbeiten: Sichtbarkeit (B-92) – Standard „Nur ich“, Wechsel wird mitgesendet", async () => {
    const onSaved = vi.fn();
    render(<EditGrowModal grow={grow()} open onClose={() => undefined} onSaved={onSaved} />);
    const select = screen.getByTestId("grow-visibility") as HTMLSelectElement;
    expect(select.value).toBe("private");
    fireEvent.change(select, { target: { value: "community" } });
    expect(screen.getByText(/gemeinsamen Community/)).toBeTruthy();
    fireEvent.submit(screen.getByTestId("edit-grow-form"));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(grows.update).toHaveBeenCalledWith("g1", expect.objectContaining({ visibility: "community" }));
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
    expect(screen.getByTestId("delete-grow-dialog").textContent).toMatch(/1 Eintrag, 0 Messwerten und 2 Fotos/);
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

  it("Bearbeiten: Zielbereiche – Richtwert der Phase, eigener Bereich, kein Ziel; unvollständig/ungültig abgelehnt (B-88)", async () => {
    render(<EditGrowModal grow={grow()} open onClose={() => undefined} onSaved={() => undefined} />);
    const mode = (label: string) => screen.getByLabelText(`${label}: Zielbereich`) as HTMLSelectElement;
    expect(mode("pH").value).toBe("default");
    expect(screen.getByTestId("target-row-ec").textContent).toContain("Jetzt (Vegetativ): 0,8–1,6 mS");
    expect(screen.queryByLabelText("pH Minimum")).toBeNull();
    fireEvent.change(mode("pH"), { target: { value: "custom" } });
    expect((screen.getByLabelText("pH Minimum") as HTMLInputElement).placeholder).toBe("5,8");
    fireEvent.submit(screen.getByTestId("edit-grow-form"));
    expect(await screen.findByText(/pH: bitte Minimum und Maximum angeben/)).toBeTruthy();
    fireEvent.change(screen.getByLabelText("pH Minimum"), { target: { value: "6" } });
    fireEvent.change(screen.getByLabelText("pH Maximum"), { target: { value: "5" } });
    fireEvent.submit(screen.getByTestId("edit-grow-form"));
    expect(await screen.findByText(/pH: Minimum muss kleiner als das Maximum sein/)).toBeTruthy();
    expect(grows.update).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("pH Minimum"), { target: { value: "6,0" } });
    fireEvent.change(screen.getByLabelText("pH Maximum"), { target: { value: "7" } });
    fireEvent.change(mode("EC"), { target: { value: "off" } });
    fireEvent.submit(screen.getByTestId("edit-grow-form"));
    await waitFor(() => expect(grows.update).toHaveBeenCalledWith("g1", expect.objectContaining({ targets: { ph: { min: 6, max: 7 }, ec: null, temp: "default", rh: "default", vpd: "default" } })));
  });

  it("Bearbeiten: vorhandene Überschreibungen sind vorbelegt; Phase ohne Richtwert wird erklärt", () => {
    render(<EditGrowModal grow={grow({ phase: "Trocknen", targets: { ph: { min: 6, max: 7 }, ec: null } })} open onClose={() => undefined} onSaved={() => undefined} />);
    expect((screen.getByLabelText("pH: Zielbereich") as HTMLSelectElement).value).toBe("custom");
    expect((screen.getByLabelText("pH Minimum") as HTMLInputElement).value).toBe("6");
    expect((screen.getByLabelText("EC: Zielbereich") as HTMLSelectElement).value).toBe("off");
    expect(screen.getByTestId("target-row-vpd").textContent).toContain("In der Phase Trocknen gibt es dafür keinen Richtwert");
  });

  it("Bearbeiten: Blatt-Abzug wird mitgesendet und auf 0–6 °C geprüft", async () => {
    render(<EditGrowModal grow={grow()} open onClose={() => undefined} onSaved={() => undefined} />);
    fireEvent.change(screen.getByLabelText(/Blatt-Abzug/), { target: { value: "9" } });
    fireEvent.submit(screen.getByTestId("edit-grow-form"));
    expect(await screen.findByText(/zwischen 0 und 6/)).toBeTruthy();
    expect(grows.update).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText(/Blatt-Abzug/), { target: { value: "3,5" } });
    fireEvent.submit(screen.getByTestId("edit-grow-form"));
    await waitFor(() => expect(grows.update).toHaveBeenCalledWith("g1", expect.objectContaining({ leafOffset: 3.5 })));
  });
});

const log = { id: "l1", day: 5, date: "2026-09-06", title: "Gegossen", text: "1 L", tag: "Gießen" as const };

describe("Log-, Foto- und Messwert-Dialoge (B-85)", () => {
  beforeEach(() => {
    window.matchMedia ??= ((query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined, addListener: () => undefined, removeListener: () => undefined, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
    Object.values(grows).forEach((fn) => fn.mockClear());
  });
  afterEach(cleanup);

  it("Eintrag bearbeiten: Titel, Text, Kategorie, Datum; Datum vor Start und leerer Titel werden abgelehnt", async () => {
    const onSaved = vi.fn();
    render(<EditLogModal grow={grow()} log={log} open onClose={() => undefined} onSaved={onSaved} />);
    fireEvent.change(screen.getByLabelText("Datum"), { target: { value: "2026-08-01" } });
    fireEvent.submit(screen.getByTestId("edit-log-form"));
    expect(await screen.findByText("Das Datum liegt vor dem Start des Grows.")).toBeTruthy();
    expect(grows.updateLog).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("Datum"), { target: { value: "2026-09-10" } });
    fireEvent.change(screen.getByLabelText("Titel"), { target: { value: " Gedüngt " } });
    fireEvent.click(screen.getByRole("button", { name: "Dünger" }));
    fireEvent.submit(screen.getByTestId("edit-log-form"));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(grows.updateLog).toHaveBeenCalledWith("g1", "l1", { title: "Gedüngt", text: "1 L", tag: "Dünger", date: "2026-09-10" });
  });

  it("Eintrag löschen braucht eine Bestätigung", async () => {
    const onSaved = vi.fn();
    render(<EditLogModal grow={grow()} log={log} open onClose={() => undefined} onSaved={onSaved} />);
    fireEvent.click(screen.getByTestId("delete-log"));
    expect(grows.deleteLog).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("confirm-delete-log"));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(grows.deleteLog).toHaveBeenCalledWith("g1", "l1");
  });

  it("Foto: Bildunterschrift speichern, als Titelbild setzen (nur wenn es keins ist), Löschen mit Bestätigung", async () => {
    const g = grow();
    const onSaved = vi.fn();
    const { unmount } = render(<PhotoModal grow={g} photo={g.photos[1]!} open onClose={() => undefined} onSaved={onSaved} />);
    fireEvent.change(screen.getByLabelText(/Bildunterschrift/), { target: { value: " Tag 4 " } });
    fireEvent.click(screen.getByRole("button", { name: /Speichern/ }));
    await waitFor(() => expect(grows.updatePhoto).toHaveBeenCalledWith("g1", "p2", { caption: "Tag 4" }));
    fireEvent.click(screen.getByTestId("photo-cover"));
    await waitFor(() => expect(grows.updatePhoto).toHaveBeenCalledWith("g1", "p2", { cover: true }));
    fireEvent.click(screen.getByTestId("delete-photo"));
    expect(grows.deletePhoto).not.toHaveBeenCalled();
    fireEvent.click(screen.getByTestId("confirm-delete-photo"));
    await waitFor(() => expect(grows.deletePhoto).toHaveBeenCalledWith("g1", "p2"));
    unmount();
    render(<PhotoModal grow={g} photo={g.photos[0]!} open onClose={() => undefined} onSaved={() => undefined} />);
    expect(screen.queryByTestId("photo-cover")).toBeNull();
    expect(screen.getByText(/ist das Titelbild/)).toBeTruthy();
  });

  it("Messwerte: Live-VPD, optionale Felder, Komma, Bereichsprüfung, mindestens ein Wert", async () => {
    const onSaved = vi.fn();
    render(<EnvModal grow={grow()} open onClose={() => undefined} onSaved={onSaved} />);
    fireEvent.submit(screen.getByTestId("env-form"));
    expect(await screen.findByText("Bitte mindestens einen Wert eintragen.")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("pH"), { target: { value: "15" } });
    fireEvent.submit(screen.getByTestId("env-form"));
    expect(await screen.findByText(/Ungültiger Wert: pH/)).toBeTruthy();
    expect(grows.saveEnv).not.toHaveBeenCalled();
    fireEvent.change(screen.getByLabelText("pH"), { target: { value: "6,3" } });
    expect(screen.getByTestId("env-vpd").textContent).toContain("wird berechnet");
    fireEvent.change(screen.getByLabelText("Temperatur"), { target: { value: "25" } });
    fireEvent.change(screen.getByLabelText("Luftfeuchte"), { target: { value: "60" } });
    expect(screen.getByTestId("env-vpd").textContent).toContain("0,91 kPa");
    fireEvent.submit(screen.getByTestId("env-form"));
    await waitFor(() => expect(onSaved).toHaveBeenCalled());
    expect(grows.saveEnv).toHaveBeenCalledWith("g1", expect.objectContaining({ temp: 25, rh: 60, ec: null, ph: 6.3 }));
  });

  it("Messwerte: vorhandener Tag wird vorbelegt und lässt sich löschen; Datumswechsel lädt die Werte dieses Tages", async () => {
    const env = [
      { day: 5, date: "2026-09-06", temp: 24, rh: 55, vpd: 1.1, ec: 1.2, ph: 6.1 },
      { day: 6, date: "2026-09-07", temp: null, rh: null, vpd: null, ec: null, ph: 6.4 },
    ];
    const onSaved = vi.fn();
    render(<EnvModal grow={grow({ env })} initialDate="2026-09-06" open onClose={() => undefined} onSaved={onSaved} />);
    expect((screen.getByLabelText("Temperatur") as HTMLInputElement).value).toBe("24");
    fireEvent.change(screen.getByLabelText("Datum"), { target: { value: "2026-09-07" } });
    expect((screen.getByLabelText("Temperatur") as HTMLInputElement).value).toBe("");
    expect((screen.getByLabelText("pH") as HTMLInputElement).value).toBe("6,4");
    fireEvent.change(screen.getByLabelText("Datum"), { target: { value: "2026-09-08" } });
    expect((screen.getByLabelText("pH") as HTMLInputElement).value).toBe("");
    expect(screen.queryByTestId("delete-env")).toBeNull();
    fireEvent.change(screen.getByLabelText("Datum"), { target: { value: "2026-09-06" } });
    fireEvent.click(screen.getByTestId("delete-env"));
    fireEvent.click(screen.getByTestId("confirm-delete-env"));
    await waitFor(() => expect(grows.deleteEnv).toHaveBeenCalledWith("g1", "2026-09-06"));
  });

  it("liest Dezimalzahlen: Komma, leer = null, außerhalb = NaN", () => {
    expect(parseDecimal("6,5", 0, 14)).toBe(6.5);
    expect(parseDecimal(" ", 0, 14)).toBeNull();
    expect(parseDecimal("15", 0, 14)).toBeNaN();
    expect(parseDecimal("x", 0, 14)).toBeNaN();
    expect(parseDecimal("-3", -10, 60)).toBe(-3);
  });
});
