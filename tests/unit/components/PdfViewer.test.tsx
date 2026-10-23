// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
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
    expect((screen.getAllByTestId("pdf-page")[0] as HTMLElement).style.width).toBe("2328px"); // (800 − 24 Rand) × 3
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
});
