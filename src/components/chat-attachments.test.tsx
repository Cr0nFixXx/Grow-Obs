// @vitest-environment jsdom
import { act, cleanup, fireEvent, render, renderHook, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ChatAttachment, ChatMessage } from "@/services/interfaces";

const media = {
  upload: vi.fn(async (blob: Blob, options?: { kind: "file"; name: string }) => ({ path: `/media/${Math.random().toString(16).slice(2)}`, kind: options ? "file" as const : "image" as const, name: options?.name ?? "", size: blob.size, contentType: blob.type })),
  config: vi.fn(async () => ({ maxBytes: 4 * 1024 * 1024, hdAllowed: false })),
};
const services = { media }; // stabil wie die echte Service-Registry
vi.mock("@/data/DataContext", () => ({ useServices: () => services }));
const toast = { push: vi.fn() };
vi.mock("@/components/Toast", () => ({ useToast: () => toast }));

import { AttachMenu, MessageAttachments, PendingTray, chatGallery, messageAttachments, useAttachmentTray } from "./chat-attachments";

const img = (path: string): ChatAttachment => ({ path, kind: "image", name: "", size: 10, mime: "image/jpeg" });
const doc = (name: string): ChatAttachment => ({ path: "/media/doc-1", kind: "file", name, size: 1_572_864, mime: "application/pdf" });

beforeEach(() => {
  vi.clearAllMocks();
  localStorage.clear();
  let n = 0;
  Object.assign(URL, { createObjectURL: vi.fn(() => `blob:test/${n++}`), revokeObjectURL: vi.fn() });
});
afterEach(cleanup);

describe("Anhänge in der Nachricht (B-81)", () => {
  it("ein Bild: ein Feld, Tippen öffnet die Vorschau", () => {
    const open = vi.fn();
    render(<MessageAttachments attachments={[img("/media/a")]} mine={false} hasText={false} onOpenImage={open} />);
    fireEvent.click(screen.getByLabelText("Bild vergrößern"));
    expect(open).toHaveBeenCalledWith(0);
  });
  it("mehrere Bilder: Raster mit Nummer; ab dem fünften „+N“", () => {
    const open = vi.fn();
    const many = Array.from({ length: 6 }, (_, i) => img(`/media/${i}`));
    render(<MessageAttachments attachments={many} mine hasText onOpenImage={open} />);
    expect(screen.getAllByRole("button")).toHaveLength(4);
    expect(screen.getByTestId("image-more").textContent).toBe("+2");
    fireEvent.click(screen.getByLabelText("Bild 3 von 6 vergrößern"));
    expect(open).toHaveBeenCalledWith(2);
  });
  it("Datei: Name, Größe, Typ und Download-Link (Name als Vorschlag)", () => {
    render(<MessageAttachments attachments={[doc("Plan Woche 3.pdf")]} mine={false} hasText={false} onOpenImage={() => undefined} />);
    const link = screen.getByLabelText("Plan Woche 3.pdf herunterladen") as HTMLAnchorElement;
    expect(link.getAttribute("download")).toBe("Plan Woche 3.pdf");
    expect(link.getAttribute("href")).toContain("/media/doc-1");
    expect(link.getAttribute("rel")).toContain("noopener");
    expect(within(link).getByText("1,5 MB · PDF")).toBeTruthy();
  });
  it("Bilder und Dateien gemischt", () => {
    render(<MessageAttachments attachments={[img("/media/a"), doc("a.pdf"), doc("b.pdf")]} mine hasText onOpenImage={() => undefined} />);
    expect(screen.getAllByLabelText(/herunterladen/)).toHaveLength(2);
    expect(screen.getByLabelText("Bild vergrößern")).toBeTruthy();
  });
  it("ältere Nachrichten mit nur `image` erscheinen als ein Bild", () => {
    expect(messageAttachments({ image: "/media/x" })).toEqual([{ path: "/media/x", kind: "image", name: "", size: 0, mime: "" }]);
    expect(messageAttachments({})).toEqual([]);
    expect(messageAttachments({ image: "/media/x", attachments: [doc("a.pdf")] })).toHaveLength(1);
  });
});

describe("Galerie über den Chat (B-81)", () => {
  it("sammelt alle Bilder in Reihenfolge und merkt die erste Position je Nachricht", () => {
    const msgs: ChatMessage[] = [
      { id: "1", from: "them", text: "Schau", time: "10:00", senderName: "Anna", attachments: [img("/media/a"), img("/media/b")] },
      { id: "2", from: "me", text: "", time: "10:01", attachments: [doc("x.pdf")] },
      { id: "3", from: "me", text: "", time: "10:02", image: "/media/c" },
      { id: "4", from: "them", text: "System", time: "10:03", kind: "system", attachments: [img("/media/zzz")] },
    ];
    const { images, firstIndex } = chatGallery(msgs, (m) => (m.from === "me" ? "Du" : m.senderName ?? "?"));
    expect(images.map((i) => i.src)).toEqual(["/media/a", "/media/b", "/media/c"]);
    expect(firstIndex.get("1")).toBe(0);
    expect(firstIndex.get("3")).toBe(2);
    expect(firstIndex.has("2")).toBe(false);
    expect(images[0]!.download?.href).toContain("?download=1");
    expect(images[2]!.alt).toBe("Bild von Du");
  });
});

describe("Anhänge auswählen und hochladen (B-81)", () => {
  const png = (name = "foto.png", size = 1000) => new File([new Uint8Array(size)], name, { type: "image/png" });
  const pdf = (name = "Plan.pdf", size = 2000) => new File([new Uint8Array(size)], name, { type: "application/pdf" });

  it("lädt Bilder und Dateien nacheinander hoch und liefert sie sendebereit", async () => {
    const { result } = renderHook(() => useAttachmentTray());
    await waitFor(() => expect(media.config).toHaveBeenCalled());
    act(() => { result.current.add([png(), png("b.png")], "image"); result.current.add([pdf()], "file"); });
    expect(result.current.items).toHaveLength(3);
    expect(result.current.busy).toBe(true);
    await waitFor(() => expect(result.current.ready).toHaveLength(3));
    expect(result.current.busy).toBe(false);
    expect(media.upload).toHaveBeenCalledTimes(3);
    expect(media.upload.mock.calls[2]![1]).toEqual({ kind: "file", name: "Plan.pdf" });
    expect(result.current.ready.map((a) => a.kind)).toEqual(["image", "image", "file"]);
    expect(result.current.ready[2]).toMatchObject({ name: "Plan.pdf", size: 2000 });
  });

  it("lehnt unzulässige und zu große Dateien sofort ab, ohne sie hochzuladen", async () => {
    const { result } = renderHook(() => useAttachmentTray());
    act(() => { result.current.add([new File([new Uint8Array(10)], "setup.exe")], "file"); result.current.add([pdf("gross.pdf", 5 * 1024 * 1024)], "file"); });
    expect(result.current.items.map((i) => i.status)).toEqual(["error", "error"]);
    expect(result.current.items[0]!.error).toMatch(/nicht erlaubt/);
    expect(result.current.items[1]!.error).toMatch(/Zu groß/);
    expect(media.upload).not.toHaveBeenCalled();
    expect(result.current.ready).toEqual([]);
  });

  it("übernimmt höchstens 10 Anhänge und sagt es", async () => {
    const { result } = renderHook(() => useAttachmentTray());
    act(() => { result.current.add(Array.from({ length: 12 }, (_, i) => pdf(`${i}.pdf`)), "file"); });
    expect(result.current.items).toHaveLength(10);
    expect(toast.push).toHaveBeenCalledWith(expect.objectContaining({ title: expect.stringContaining("Höchstens 10") }));
    await waitFor(() => expect(result.current.ready).toHaveLength(10));
  });

  it("Fehler beim Hochladen: bleibt sichtbar, lässt sich wiederholen; nach dem Senden bleibt nur der Fehler", async () => {
    media.upload.mockRejectedValueOnce(new Error("Dateityp nicht erlaubt"));
    const { result } = renderHook(() => useAttachmentTray());
    act(() => { result.current.add([pdf("a.pdf"), pdf("b.pdf")], "file"); });
    await waitFor(() => expect(result.current.busy).toBe(false));
    expect(result.current.items.map((i) => i.status)).toEqual(["error", "done"]);
    act(() => result.current.clearSent());
    expect(result.current.items).toHaveLength(1);
    act(() => result.current.retry(result.current.items[0]!.key));
    await waitFor(() => expect(result.current.ready).toHaveLength(1));
  });

  it("entfernen und zurücksetzen räumen die lokalen Vorschauen auf", async () => {
    const { result } = renderHook(() => useAttachmentTray());
    act(() => { result.current.add([png(), png("b.png")], "image"); });
    await waitFor(() => expect(result.current.ready).toHaveLength(2));
    act(() => result.current.remove(result.current.items[0]!.key));
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(1);
    act(() => result.current.reset());
    expect(result.current.items).toEqual([]);
    expect(URL.revokeObjectURL).toHaveBeenCalledTimes(2);
  });

  it("SD/HD erscheint nur, wenn der Server große Uploads erlaubt; die Wahl wird gemerkt", async () => {
    media.config.mockResolvedValueOnce({ maxBytes: 50 * 1024 * 1024, hdAllowed: true });
    function Harness() { const tray = useAttachmentTray(); return <AttachMenu tray={tray} />; }
    render(<Harness />);
    await waitFor(() => expect(media.config).toHaveBeenCalled());
    fireEvent.click(screen.getByLabelText("Anhang hinzufügen"));
    await screen.findByRole("group", { name: "Bildqualität" });
    expect(screen.getByText(/max\. 50 MB/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "HD" }));
    expect(localStorage.getItem("go-upload-hd")).toBe("1");
    expect(screen.getByText(/HD: bis 4096 px/)).toBeTruthy();
  });

  it("Menü ohne HD auf Vercel-Grenzen; Dateiauswahl füllt die Ablage", async () => {
    function Harness() { const tray = useAttachmentTray(); return <><AttachMenu tray={tray} /><PendingTray tray={tray} /></>; }
    render(<Harness />);
    await waitFor(() => expect(media.config).toHaveBeenCalled());
    fireEvent.click(screen.getByLabelText("Anhang hinzufügen"));
    expect(screen.queryByRole("group", { name: "Bildqualität" })).toBeNull();
    expect(screen.getByText(/max\. 4 MB/)).toBeTruthy();
    fireEvent.change(screen.getByTestId("pick-files"), { target: { files: [pdf("Plan.pdf")] } });
    const tray = await screen.findByTestId("pending-tray");
    expect(within(tray).getByText("Plan.pdf")).toBeTruthy();
    fireEvent.click(within(tray).getByLabelText("Plan.pdf entfernen"));
    await waitFor(() => expect(screen.queryByTestId("pending-tray")).toBeNull());
  });
});
