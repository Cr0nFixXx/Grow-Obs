// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

// pdf.js selbst läuft hier nicht (Worker/Canvas): ein Ersatz liefert Seiten und merkt sich, was gezeichnet wird.
const pdf = vi.hoisted(() => ({
  pages: 3,
  fail: false,
  rendered: [] as number[],
  destroyed: 0,
  loaded: [] as Uint8Array[],
}));
vi.mock("pdfjs-dist/legacy/build/pdf.mjs", () => ({
  GlobalWorkerOptions: {},
  getDocument: ({ data }: { data: Uint8Array }) => {
    pdf.loaded.push(data);
    return {
      promise: pdf.fail
        ? Promise.reject(new Error("kaputt"))
        : Promise.resolve({
            numPages: pdf.pages,
            destroy: async () => { pdf.destroyed++; },
            getPage: async (n: number) => ({
              getViewport: ({ scale }: { scale: number }) => ({ width: 600 * scale, height: 800 * scale }),
              render: () => { pdf.rendered.push(n); return { cancel() {}, promise: Promise.resolve() }; },
            }),
          }),
    };
  },
}));

import { PdfViewer, pdfSource } from "@/components/PdfViewer";

const fetchMock = vi.fn();
beforeEach(() => {
  Object.assign(pdf, { pages: 3, fail: false, rendered: [], destroyed: 0, loaded: [] });
  fetchMock.mockReset().mockResolvedValue(new Response(new Uint8Array([37, 80, 68, 70]), { status: 200 }));
  vi.stubGlobal("fetch", fetchMock);
  HTMLCanvasElement.prototype.getContext = vi.fn(() => ({})) as never;
  Object.defineProperty(HTMLElement.prototype, "clientWidth", { configurable: true, get: () => 800 });
});
afterEach(() => { cleanup(); vi.unstubAllGlobals(); });

const view = (props: Partial<Parameters<typeof PdfViewer>[0]> = {}) =>
  render(<PdfViewer open path="/media/abc" name="Plan.pdf" downloadUrl="/api/media/abc" onClose={vi.fn()} {...props} />);

describe("PDF-Vorschau (B-82)", () => {
  it("lädt die Bytes über die API mit Login und zeigt alle Seiten", async () => {
    view();
    expect(screen.getByRole("status").textContent).toContain("PDF wird geladen");
    await waitFor(() => expect(screen.getAllByTestId("pdf-page")).toHaveLength(3));
    expect(fetchMock).toHaveBeenCalledWith(expect.stringMatching(/\/media\/abc\?raw=1$/), { credentials: "include" });
    expect(pdf.loaded[0]).toEqual(new Uint8Array([37, 80, 68, 70]));
    expect(screen.getByTestId("pdf-pages").textContent).toBe("Seite 1 von 3");
    await waitFor(() => expect(pdf.rendered.sort()).toEqual([1, 2, 3]));
    expect(screen.getByRole("dialog", { name: "PDF-Vorschau: Plan.pdf" })).toBeTruthy();
  });

  it("Zoom ist begrenzt, Download-Link und Schließen funktionieren", async () => {
    const onClose = vi.fn();
    view({ onClose });
    await waitFor(() => screen.getAllByTestId("pdf-page"));
    const zoomIn = screen.getByRole("button", { name: "Vergrößern" }) as HTMLButtonElement;
    const zoomOut = screen.getByRole("button", { name: "Verkleinern" }) as HTMLButtonElement;
    expect(zoomOut.disabled).toBe(true);
    for (let i = 0; i < 6; i++) fireEvent.click(zoomIn);
    expect(zoomIn.disabled).toBe(true);
    expect((screen.getAllByTestId("pdf-page")[0] as HTMLElement).style.width).toBe("3104px"); // (800 − 24 Rand) × 4
    expect(screen.getByRole("link", { name: "PDF herunterladen" }).getAttribute("href")).toBe("/api/media/abc");
    fireEvent.click(screen.getByRole("button", { name: "Vorschau schließen" }));
    expect(onClose).toHaveBeenCalled();
    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(2);
  });

  it("Fehler (HTTP oder beschädigt): freundlicher Hinweis mit Download", async () => {
    fetchMock.mockResolvedValue(new Response("nope", { status: 404 }));
    view();
    expect((await screen.findByRole("alert")).textContent).toContain("Vorschau nicht möglich");
    expect(screen.getByRole("link", { name: /Herunterladen/ })).toBeTruthy();
    cleanup();
    fetchMock.mockResolvedValue(new Response(new Uint8Array([1]), { status: 200 }));
    pdf.fail = true;
    view();
    expect((await screen.findByRole("alert")).textContent).toContain("Vorschau nicht möglich");
  });

  it("gibt das Dokument beim Schließen frei; geschlossen rendert nichts", async () => {
    const { rerender } = view();
    await waitFor(() => screen.getAllByTestId("pdf-page"));
    rerender(<PdfViewer open={false} path="/media/abc" name="Plan.pdf" downloadUrl="" onClose={vi.fn()} />);
    expect(screen.queryByRole("dialog")).toBeNull();
    await waitFor(() => expect(pdf.destroyed).toBeGreaterThan(0));
  });

  it("pdfSource: eigene Medien über ?raw=1, fremde Adressen (Demo) unverändert", () => {
    expect(pdfSource("/media/abc")).toMatch(/\/media\/abc\?raw=1$/);
    expect(pdfSource("blob:http://x/1")).toBe("blob:http://x/1");
  });

  describe("Gesten", () => {
    const touch = (target: Element, type: string, points: Array<[number, number]>) => {
      const event = new Event(type, { bubbles: true, cancelable: true });
      Object.assign(event, { touches: points.map(([clientX, clientY]) => ({ clientX, clientY })) });
      act(() => { target.dispatchEvent(event); });
      return event;
    };
    const pageWidth = () => (screen.getAllByTestId("pdf-page")[0] as HTMLElement).style.width;
    const area = () => screen.getAllByTestId("pdf-page")[0].parentElement!.parentElement!;

    it("Zwei-Finger-Zoom: Vorschau per Skalierung, beim Loslassen scharf neu gezeichnet; begrenzt", async () => {
      view();
      await waitFor(() => screen.getAllByTestId("pdf-page"));
      const content = screen.getAllByTestId("pdf-page")[0].parentElement as HTMLElement;
      expect(pageWidth()).toBe("776px");
      touch(area(), "touchstart", [[300, 400], [400, 400]]);
      const move = touch(area(), "touchmove", [[250, 400], [450, 400]]); // Abstand verdoppelt
      expect(move.defaultPrevented).toBe(true); // kein Browser-Zoom, kein Scrollen
      expect(content.style.transform).toBe("scale(2)");
      touch(area(), "touchend", []);
      await waitFor(() => expect(pageWidth()).toBe("1552px"));
      expect(content.style.transform).toBe("");
      // weit über die Grenze spreizen → bei 4× Schluss, zusammenführen → 1×
      touch(area(), "touchstart", [[300, 400], [310, 400]]);
      touch(area(), "touchmove", [[0, 400], [800, 400]]);
      touch(area(), "touchend", []);
      await waitFor(() => expect(pageWidth()).toBe("3104px"));
      touch(area(), "touchstart", [[100, 400], [700, 400]]);
      touch(area(), "touchmove", [[395, 400], [405, 400]]);
      touch(area(), "touchend", []);
      await waitFor(() => expect(pageWidth()).toBe("776px"));
    });

    it("Doppeltipp zoomt heran und wieder zurück; Wischen ist kein Tipp", async () => {
      view();
      await waitFor(() => screen.getAllByTestId("pdf-page"));
      const tap = () => { touch(area(), "touchstart", [[200, 300]]); touch(area(), "touchend", []); };
      tap(); tap();
      await waitFor(() => expect(pageWidth()).toBe("1940px")); // 776 × 2,5
      tap(); tap();
      await waitFor(() => expect(pageWidth()).toBe("776px"));
      touch(area(), "touchstart", [[200, 300]]);
      touch(area(), "touchmove", [[200, 380]]);
      touch(area(), "touchend", []);
      tap();
      expect(pageWidth()).toBe("776px");
    });

    it("Strg+Mausrad (Touchpad-Pinch) zoomt, normales Rad scrollt weiter", async () => {
      view();
      await waitFor(() => screen.getAllByTestId("pdf-page"));
      const normal = new WheelEvent("wheel", { deltaY: -100, bubbles: true, cancelable: true });
      act(() => { area().dispatchEvent(normal); });
      expect(normal.defaultPrevented).toBe(false);
      const pinch = new WheelEvent("wheel", { deltaY: -69.3, ctrlKey: true, bubbles: true, cancelable: true });
      act(() => { area().dispatchEvent(pinch); });
      expect(pinch.defaultPrevented).toBe(true);
      await waitFor(() => expect(parseInt(pageWidth())).toBeGreaterThan(1500));
      expect(parseInt(pageWidth())).toBeLessThan(1600); // e^0,693 ≈ 2
    });
  });
});
