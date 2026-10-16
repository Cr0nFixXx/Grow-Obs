// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { Avatar, initialsOf } from "./ui";

afterEach(cleanup);

describe("initialsOf", () => {
  it("nimmt Anfangsbuchstaben von Vor- und Nachname", () => {
    expect(initialsOf("Leer Tester")).toBe("LT");
    expect(initialsOf("max_grows")).toBe("MG");
  });
  it("nimmt bei einem Wort die ersten zwei Buchstaben und ignoriert @", () => {
    expect(initialsOf("@anna")).toBe("AN");
    expect(initialsOf("Zoë")).toBe("ZO");
  });
  it("liefert leer bei fehlendem Namen", () => {
    expect(initialsOf(undefined)).toBe("");
    expect(initialsOf("   ")).toBe("");
  });
});

describe("Avatar-Fallback", () => {
  it("zeigt Initialen, wenn kein Bild gesetzt ist", () => {
    render(<Avatar name="Leer Tester" />);
    const el = document.querySelector("[data-avatar-fallback]");
    expect(el).not.toBeNull();
    expect(el!.textContent).toBe("LT");
    expect(document.querySelector("img")).toBeNull();
  });
  it("zeigt ein Icon statt Initialen ohne Namen", () => {
    render(<Avatar />);
    const el = document.querySelector("[data-avatar-fallback]");
    expect(el).not.toBeNull();
    expect(el!.textContent).toBe("");
  });
  it("fällt bei Ladefehler des Bildes auf Initialen zurück", () => {
    render(<Avatar src="https://example.test/kaputt.jpg" name="Ada Lovelace" />);
    const img = screen.getByRole("img", { name: "Ada Lovelace" });
    fireEvent.error(img);
    expect(document.querySelector("[data-avatar-fallback]")!.textContent).toBe("AL");
  });
  it("gleicher Name ergibt gleiche Farbe", () => {
    const { unmount } = render(<Avatar name="Ada Lovelace" />);
    const a = (document.querySelector("[data-avatar-fallback]") as HTMLElement).style.cssText;
    unmount();
    render(<Avatar name="Ada Lovelace" />);
    expect((document.querySelector("[data-avatar-fallback]") as HTMLElement).style.cssText).toBe(a);
  });
});
