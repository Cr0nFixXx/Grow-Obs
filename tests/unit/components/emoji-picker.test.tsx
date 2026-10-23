// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { EmojiPicker } from "@/components/media";

afterEach(cleanup);

describe("Emoji-Auswahl im Chat (B-80)", () => {
  it("öffnet nach oben und rechtsbündig, damit sie am unteren Rand nicht aus dem Bild ragt, und fügt das Emoji ein", async () => {
    const onPick = vi.fn();
    render(<EmojiPicker onPick={onPick} side="top" align="end" />);
    fireEvent.click(screen.getByLabelText("Emoji einfügen"));
    const menu = screen.getByRole("menu");
    expect(menu.className).toContain("bottom-full");
    expect(menu.className).toContain("right-0");
    fireEvent.click(screen.getAllByRole("option")[0]!);
    expect(onPick).toHaveBeenCalledTimes(1);
    await waitFor(() => expect(screen.queryByRole("menu")).toBeNull());
  });
  it("öffnet standardmäßig nach unten (andere Stellen unverändert)", () => {
    render(<EmojiPicker onPick={() => undefined} />);
    fireEvent.click(screen.getByLabelText("Emoji einfügen"));
    expect(screen.getByRole("menu").className).toContain("mt-2");
  });
});
