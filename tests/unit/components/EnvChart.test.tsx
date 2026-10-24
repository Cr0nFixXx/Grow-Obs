// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { EnvChart } from "@/components/EnvChart";

const dates = ["2026-10-01", "2026-10-02", "2026-10-03", "2026-10-20"];

afterEach(cleanup);

describe("EnvChart (B-85)", () => {
  it("zeichnet je Reihe einen Punkt pro vorhandenem Wert; fehlende Werte erzeugen keinen Punkt", () => {
    const { container } = render(
      <EnvChart label="Klima" testId="c" dates={dates} series={[
        { key: "temp", label: "Temperatur", unit: "°C", color: "red", axis: "left", values: [24, null, 25, 26] },
        { key: "rh", label: "Luftfeuchte", unit: "%", color: "blue", axis: "right", values: [55, 56, null, null] },
      ]} />,
    );
    expect(container.querySelectorAll('[data-series="temp"] circle')).toHaveLength(3);
    expect(container.querySelectorAll('[data-series="rh"] circle')).toHaveLength(2);
    expect(screen.getByRole("img", { name: "Klima" })).toBeTruthy();
  });

  it("Linie reißt bei mehr als 7 Tagen Abstand ab (zwei Teilstücke), sonst nicht", () => {
    const { container } = render(
      <EnvChart label="x" dates={dates} series={[{ key: "ph", label: "pH", unit: "", color: "red", axis: "left", values: [6, 6.1, 6.2, 6.3] }]} />,
    );
    const d = container.querySelector('[data-series="ph"] path')!.getAttribute("d")!;
    expect(d.match(/M /g)).toHaveLength(2); // 01.–03.10. verbunden, 20.10. einzeln
    expect(d.match(/L /g)).toHaveLength(2);
  });

  it("Reihen ohne Werte fehlen in der Legende; ohne jede Messung steht ein Leerzustand da", () => {
    render(<EnvChart label="x" dates={dates} series={[{ key: "ec", label: "EC", unit: "mS", color: "red", axis: "left", values: [null, null, null, null] }]} />);
    expect(screen.getByText("Keine Messwerte im Zeitraum")).toBeTruthy();
    expect(screen.queryByText("EC")).toBeNull();
  });

  it("Zielband erscheint in der Legende; Tippen zeigt die Werte des nächsten Tages", () => {
    const { container } = render(
      <EnvChart
        label="VPD" testId="vpd" dates={dates}
        band={{ min: 0.8, max: 1.2, label: "Ziel 0,8–1,2 kPa" }}
        series={[{ key: "vpd", label: "VPD", unit: "kPa", color: "green", axis: "left", values: [0.9, 1.1, null, 1.4], digits: 2 }]}
      />,
    );
    expect(screen.getByText("Ziel 0,8–1,2 kPa")).toBeTruthy();
    expect(container.querySelectorAll("rect").length).toBe(1);
    const svg = screen.getByRole("img", { name: "VPD" });
    svg.getBoundingClientRect = () => ({ left: 0, top: 0, width: 320, height: 190, right: 320, bottom: 190, x: 0, y: 0, toJSON: () => ({}) });
    fireEvent.pointerDown(svg, { clientX: 36 }); // linker Rand = erster Tag
    const tip = screen.getByTestId("vpd-tip");
    expect(tip.textContent).toContain("01.10.2026");
    expect(tip.textContent).toContain("VPD 0,9 kPa");
  });

  it("feste Zeitachse (from/to) zeigt auch Tage ohne Daten; Datum außerhalb der Daten ändert die Punkte nicht", () => {
    const { container } = render(
      <EnvChart label="x" dates={["2026-10-24"]} from="2026-10-18" to="2026-10-24" series={[{ key: "t", label: "T", unit: "°C", color: "red", axis: "left", values: [24] }]} />,
    );
    expect(container.querySelectorAll("circle")).toHaveLength(1);
    expect(container.textContent).toContain("18.10.");
    expect(container.textContent).toContain("24.10.");
  });
});
