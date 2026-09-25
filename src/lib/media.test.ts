import { describe, expect, it } from "vitest";
import { resolveMedia } from "./media";
import { insertAtCursor } from "@/components/media";
import { config } from "./config";

describe("media helpers", () => {
  it("resolves only internal upload paths against the API base", () => {
    expect(resolveMedia("/media/0b8c6a52-3f6e-4c2a-9a55-2b5c1d7e9f10")).toBe(`${config.apiBaseUrl}/media/0b8c6a52-3f6e-4c2a-9a55-2b5c1d7e9f10`);
    expect(resolveMedia("https://images.pexels.com/x.jpg")).toBe("https://images.pexels.com/x.jpg");
    expect(resolveMedia("blob:http://localhost/abc")).toBe("blob:http://localhost/abc");
    expect(resolveMedia(undefined)).toBe("");
  });

  it("inserts emoji at the caret or appends without an element", () => {
    const el = { selectionStart: 5, selectionEnd: 5 } as HTMLInputElement;
    expect(insertAtCursor(el, "Hallo Welt", "🌱")).toEqual({ next: "Hallo🌱 Welt", caret: 7 });
    expect(insertAtCursor(null, "Hi", "!")).toEqual({ next: "Hi!", caret: 3 });
  });
});
