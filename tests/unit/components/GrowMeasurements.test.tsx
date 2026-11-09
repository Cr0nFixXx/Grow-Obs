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
    id: "g1", name: "Run", startDate: "2026-09-01", leafOffset: 2, targets: { ph: { min: 5.8, max: 6.5 }, ec: { min: 1, max: 2 } },
    env: [point("2026-09-20", 19, { ph: 6.1, ec: 1.4 }), point("2026-09-22", 21, { ph: 7.2, ec: 2.6 })], ...over,
  } as Grow;
}

afterEach(cleanup);

describe("GrowMeasurements: Zielbereiche (B-86)", () => {
  it("zeigt Hinweise für Werte außerhalb, markiert sie in der Liste und blendet Bänder ein", () => {
    const { container } = render(<GrowMeasurements grow={grow()} onChanged={() => undefined} />);
    const alerts = screen.getByTestId("range-alerts");
    expect(alerts.querySelector('[data-alert="ph"]')?.textContent).toContain("über dem Zielbereich (5,8–6,5)");
    expect(alerts.querySelector('[data-alert="ec"]')?.textContent).toContain("über dem Zielbereich (1–2 mS)");
    const rows = screen.getAllByTestId("env-row");
    expect(rows[0]!.querySelectorAll("[data-out]").length).toBe(2); // neueste Zeile: pH und EC zu hoch
    expect(rows[1]!.querySelectorAll("[data-out]").length).toBe(0);
    expect(container.querySelectorAll('rect[data-band="ph"]')).toHaveLength(1);
    expect(container.querySelectorAll('rect[data-band="ec"]')).toHaveLength(1);
  });

  it("ohne Zielbereich: kein Band, keine pH/EC-Hinweise", () => {
    const { container } = render(<GrowMeasurements grow={grow({ targets: { ph: null, ec: null } })} onChanged={() => undefined} />);
    expect(screen.queryByTestId("range-alerts")).toBeNull();
    expect(container.querySelectorAll('rect[data-band="ph"], rect[data-band="ec"]')).toHaveLength(0);
  });

  it("alles im Bereich: kein Hinweis", () => {
    render(<GrowMeasurements grow={grow({ env: [point("2026-09-20", 19, { ph: 6.1, ec: 1.4 })] })} onChanged={() => undefined} />);
    expect(screen.queryByTestId("range-alerts")).toBeNull();
  });
});
