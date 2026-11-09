// @vitest-environment jsdom
import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { GrowMeasurements } from "@/components/GrowMeasurements";
import type { Grow } from "@/types";

vi.mock("@/data/DataContext", () => ({ useServices: () => ({ grows: {} }) }));
vi.mock("@/components/Toast", () => ({ useToast: () => ({ push: () => undefined }) }));

const point = (date: string, day: number, over: Partial<Grow["env"][number]> = {}) => ({ day, date, temp: null, rh: null, vpd: null, ec: null, ph: null, ...over });
function grow(over: Partial<Grow> = {}): Grow {
  return {
    id: "g1", name: "Run", startDate: "2026-09-01", leafOffset: 2, targets: {}, phase: "Vegetativ",
    phases: [{ key: "keimung", label: "Keimung", done: true, startedOn: "2026-09-01" }, { key: "vegetativ", label: "Vegetativ", done: false, active: true, startedOn: "2026-09-10" }],
    env: [point("2026-09-20", 19, { ph: 6.1, ec: 1.4 }), point("2026-09-22", 21, { ph: 7.2, ec: 2.6 })], ...over,
  } as Grow;
}

afterEach(cleanup);

describe("GrowMeasurements: Zielbereiche je Phase (B-86/B-88)", () => {
  it("zeigt Hinweise für Werte außerhalb, markiert sie in der Liste und blendet Bänder ein", () => {
    const { container } = render(<GrowMeasurements grow={grow()} onChanged={() => undefined} />);
    const alerts = screen.getByTestId("range-alerts");
    expect(alerts.querySelector('[data-alert="ph"]')?.textContent).toContain("über dem Zielbereich (5,8–6,5, Vegetativ)");
    expect(alerts.querySelector('[data-alert="ec"]')?.textContent).toContain("über dem Zielbereich (0,8–1,6 mS, Vegetativ)");
    const rows = screen.getAllByTestId("env-row");
    expect(rows[0]!.querySelectorAll("[data-out]").length).toBe(2); // neueste Zeile: pH und EC zu hoch
    expect(rows[1]!.querySelectorAll("[data-out]").length).toBe(0);
    expect(container.querySelectorAll('rect[data-band="ph"]')).toHaveLength(1);
    expect(container.querySelectorAll('rect[data-band="ec"]')).toHaveLength(1);
  });

  it("Band wechselt mit der Phase: Legende „je Phase“, ein Abschnitt je Phase im sichtbaren Zeitraum", () => {
    const env = [point("2026-09-05", 4, { ph: 6.1, ec: 0.6 }), point("2026-09-20", 19, { ph: 6.1, ec: 1.4 })];
    const { container } = render(<GrowMeasurements grow={grow({ env })} onChanged={() => undefined} />);
    const feed = screen.getByTestId("chart-feed");
    expect(feed.textContent).toContain("EC-Ziel je Phase"); // Keimung 0,4–0,8, Vegetativ 0,8–1,6
    expect(feed.textContent).toContain("pH-Ziel 5,8–6,5"); // in beiden Phasen gleich
    expect(feed.querySelectorAll('rect[data-band="ec"]')).toHaveLength(2);
    expect(feed.querySelectorAll('rect[data-band="ph"]')).toHaveLength(1);
    expect(container.querySelectorAll('[data-out]').length).toBe(0); // 0,6 mS in der Keimung und 1,4 mS im Wuchs sind im Bereich
  });

  it("Messwert-Zeilen werden an der Phase ihres Tages gemessen, Temperatur und Luftfeuchte eingeschlossen", () => {
    const env = [point("2026-09-05", 4, { ec: 1.4 }), point("2026-09-20", 19, { ec: 1.4, temp: 31, rh: 80 })];
    render(<GrowMeasurements grow={grow({ env })} onChanged={() => undefined} />);
    const rows = screen.getAllByTestId("env-row");
    expect(rows[0]!.querySelectorAll("[data-out]").length).toBe(2); // Veg: 31 °C zu warm, 80 % zu feucht
    expect(rows[1]!.querySelector('[data-out="high"]')?.textContent).toContain("EC 1,4"); // Keimung: 1,4 mS > 0,8
  });

  it("ohne Zielbereich: kein Band, keine pH/EC-Hinweise", () => {
    const { container } = render(<GrowMeasurements grow={grow({ targets: { ph: null, ec: null, temp: null, rh: null, vpd: null } })} onChanged={() => undefined} />);
    expect(screen.queryByTestId("range-alerts")).toBeNull();
    expect(container.querySelectorAll('rect[data-band="ph"], rect[data-band="ec"]')).toHaveLength(0);
  });

  it("alles im Bereich: kein Hinweis", () => {
    render(<GrowMeasurements grow={grow({ env: [point("2026-09-20", 19, { ph: 6.1, ec: 1.4 })] })} onChanged={() => undefined} />);
    expect(screen.queryByTestId("range-alerts")).toBeNull();
  });
});
