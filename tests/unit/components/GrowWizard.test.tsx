// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { GrowWizard } from "@/components/GrowWizard";

vi.mock("@/data/DataContext", () => ({ useServices: () => ({ strains: { catalog: async () => [] } }) }));

const next = () => fireEvent.click(screen.getByRole("button", { name: /^Weiter/ }));
const nameInput = () => screen.getByPlaceholderText("z. B. Northern Haze · Run 04");

describe("GrowWizard (B-102)", () => {
  beforeEach(() => {
    window.matchMedia ??= ((query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined, addListener: () => undefined, removeListener: () => undefined, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
    window.scrollTo = (() => undefined) as typeof window.scrollTo;
  });
  afterEach(cleanup);

  it("Weiter ist ohne Namen gesperrt und zeigt einen Hinweis", () => {
    render(<GrowWizard busy={false} onSubmit={vi.fn()} onCancel={vi.fn()} />);
    expect(screen.getByTestId("wizard-progress").textContent).toBe("Neuer Grow · Schritt 1 von 4");
    expect((screen.getByRole("button", { name: /^Weiter/ }) as HTMLButtonElement).disabled).toBe(true);
    expect(screen.getByTestId("wizard-hint").textContent).toMatch(/Namen/);
    fireEvent.change(nameInput(), { target: { value: "Run 7" } });
    expect((screen.getByRole("button", { name: /^Weiter/ }) as HTMLButtonElement).disabled).toBe(false);
    expect(screen.queryByTestId("wizard-hint")).toBeNull();
  });

  it("führt durch alle vier Schritte und sendet die Auswahl (Sorte freiwillig)", () => {
    const onSubmit = vi.fn();
    render(<GrowWizard busy={false} onSubmit={onSubmit} onCancel={vi.fn()} />);
    fireEvent.change(nameInput(), { target: { value: " Run 7 " } });
    next();
    expect(screen.getByTestId("wizard-step-setup")).toBeTruthy();
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Medium" })).getByRole("radio", { name: /Hydro/ }));
    expect(screen.queryByRole("radiogroup", { name: "Typ" })).toBeNull();
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Ort" })).getByRole("radio", { name: /Outdoor/ }));
    next();
    expect(screen.getByTestId("wizard-step-start")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Gestern" }));
    fireEvent.click(within(screen.getByRole("radiogroup", { name: "Sichtbar für" })).getByRole("radio", { name: /Community/ }));
    next();
    const review = screen.getByTestId("wizard-review");
    expect(review.textContent).toContain("Run 7");
    expect(review.textContent).toContain("Keine Sorte angegeben");
    expect(review.textContent).toContain("Hydro / DWC");
    expect(review.textContent).toContain("Outdoor");
    expect(review.textContent).toContain("Community");
    fireEvent.click(screen.getByRole("button", { name: "Grow anlegen" }));
    expect(onSubmit).toHaveBeenCalledTimes(1);
    const input = onSubmit.mock.calls[0][0];
    expect(input).toMatchObject({ name: "Run 7", medium: "Hydro / DWC", site: "outdoor", visibility: "community" });
    expect("type" in input).toBe(false);
    expect(input.strains).toBeUndefined();
    expect(input.startDate).toMatch(/^\d{4}-\d{2}-\d{2}$/);
  });

  it("Sorten: Doppelte sperren Weiter, „Ändern“ springt zurück, Zurück behält die Eingaben", () => {
    render(<GrowWizard busy={false} onSubmit={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.change(nameInput(), { target: { value: "Mix" } });
    fireEvent.change(screen.getByLabelText("Sorte 1", { exact: true }), { target: { value: "Haze" } });
    fireEvent.click(screen.getByTestId("strain-add"));
    fireEvent.change(screen.getByLabelText("Sorte 2", { exact: true }), { target: { value: "haze" } });
    expect(screen.getByRole("alert").textContent).toMatch(/doppelt/);
    expect((screen.getByRole("button", { name: /^Weiter/ }) as HTMLButtonElement).disabled).toBe(true);
    fireEvent.change(screen.getByLabelText("Sorte 2", { exact: true }), { target: { value: "Northern Lights" } });
    next(); next(); next();
    expect(screen.getByTestId("wizard-review").textContent).toContain("Sorten (2)");
    fireEvent.click(screen.getByRole("button", { name: "Medium ändern" }));
    expect(screen.getByTestId("wizard-step-setup")).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "Zurück" })[0]);
    expect((screen.getByLabelText("Sorte 2", { exact: true }) as HTMLInputElement).value).toBe("Northern Lights");
    expect((nameInput() as HTMLInputElement).value).toBe("Mix");
  });

  it("Abbrechen: ohne Eingaben sofort, mit Eingaben erst nach Rückfrage", () => {
    const onCancel = vi.fn();
    render(<GrowWizard busy={false} onSubmit={vi.fn()} onCancel={onCancel} />);
    fireEvent.click(screen.getByTestId("wizard-cancel"));
    expect(onCancel).toHaveBeenCalledTimes(1);
    fireEvent.change(nameInput(), { target: { value: "Etwas" } });
    fireEvent.click(screen.getByTestId("wizard-cancel"));
    expect(onCancel).toHaveBeenCalledTimes(1);
    expect(screen.getByText("Eingaben verwerfen?")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Weiter bearbeiten" }));
    expect(onCancel).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getByTestId("wizard-cancel"));
    fireEvent.click(screen.getByRole("button", { name: "Verwerfen" }));
    expect(onCancel).toHaveBeenCalledTimes(2);
  });

  it("Startdatum in der Zukunft sperrt Weiter", () => {
    render(<GrowWizard busy={false} onSubmit={vi.fn()} onCancel={vi.fn()} />);
    fireEvent.change(nameInput(), { target: { value: "Zukunft" } });
    next(); next();
    fireEvent.change(screen.getByLabelText("Startdatum"), { target: { value: "2999-01-01" } });
    expect(screen.getByRole("alert").textContent).toMatch(/Zukunft/);
    expect((screen.getByRole("button", { name: /^Weiter/ }) as HTMLButtonElement).disabled).toBe(true);
  });

  it("Sorte mit Genetik, Licht und Samen (B-105): Chips wählen und wieder abwählen, Übersicht und Anfrage zeigen sie", () => {
    const onSubmit = vi.fn();
    render(<GrowWizard busy={false} onSubmit={onSubmit} onCancel={vi.fn()} />);
    fireEvent.change(nameInput(), { target: { value: "Run 8" } });
    fireEvent.change(screen.getByLabelText("Sorte 1", { exact: true }), { target: { value: "Haze" } });
    const chip = (group: string, label: string) => within(screen.getByTestId(group)).getByRole("button", { name: label });
    expect(chip("strain-genetics", "Indica").getAttribute("aria-pressed")).toBe("false");
    fireEvent.click(chip("strain-genetics", "Indica"));
    fireEvent.click(chip("strain-genetics", "Sativa"));
    fireEvent.click(chip("strain-light", "Auto"));
    fireEvent.click(chip("strain-light", "Auto"));
    fireEvent.click(chip("strain-light", "Fast"));
    fireEvent.click(chip("strain-seed", "Feminisiert"));
    expect(chip("strain-genetics", "Sativa").getAttribute("aria-pressed")).toBe("true");
    expect(chip("strain-genetics", "Indica").getAttribute("aria-pressed")).toBe("false");
    expect(chip("strain-light", "Auto").getAttribute("aria-pressed")).toBe("false");
    next(); next(); next();
    expect(screen.getByTestId("review-traits").textContent).toBe("Sativa · Fast · Feminisiert");
    expect(screen.getByTestId("wizard-review").textContent).toContain("Keine Angabe");
    fireEvent.click(screen.getByRole("button", { name: "Grow anlegen" }));
    expect(onSubmit.mock.calls[0][0].strains[0]).toMatchObject({ name: "Haze", genetics: "Sativa", light: "fast", seed: "feminized" });
  });
});
