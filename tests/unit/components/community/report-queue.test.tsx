// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ReportQueue } from "@/components/community/ReportQueue";
import type { ReportGroup } from "@/types";

vi.mock("@/components/Toast", () => ({ useToast: () => ({ push: vi.fn() }) }));
afterEach(cleanup);

const group = (n: number): ReportGroup => ({
  kind: "post", targetId: `p${n}`, status: "open", count: 1,
  preview: { text: `Inhalt ${n}`, image: null, author: "A", handle: "@a", hidden: false },
  reports: [{ id: `r${n}`, reporter: "B", reason: "spam", details: "", ago: "vor 1 Min." }],
});

describe("ReportQueue Paginierung (B-89)", () => {
  it("„Mehr laden“ hängt die nächste Seite an und verschwindet am Ende", async () => {
    const load = vi.fn(async (_s: "open" | "closed", offset: number) => offset === 0
      ? { items: [group(1), group(2)], hasMore: true }
      : { items: [group(3)], hasMore: false });
    render(<ReportQueue scope="c1" load={load} act={vi.fn(async () => undefined)} />);
    await screen.findByText("Inhalt 1");
    expect(screen.getAllByTestId("report-group")).toHaveLength(2);
    fireEvent.click(screen.getByTestId("queue-more"));
    await screen.findByText("Inhalt 3");
    expect(screen.getAllByTestId("report-group")).toHaveLength(3);
    expect(load).toHaveBeenLastCalledWith("open", 2);
    expect(screen.queryByTestId("queue-more")).toBeNull();
  });

  it("Wechsel der Quelle (scope) lädt von vorn", async () => {
    const load = vi.fn(async () => ({ items: [group(1)], hasMore: false }));
    const act = vi.fn(async () => undefined);
    const { rerender } = render(<ReportQueue scope="c1" load={load} act={act} />);
    await screen.findByText("Inhalt 1");
    rerender(<ReportQueue scope="platform" load={load} act={act} />);
    await waitFor(() => expect(load.mock.calls.length).toBeGreaterThanOrEqual(2));
    expect(load.mock.calls.every((c) => (c as unknown[])[1] === 0)).toBe(true);
  });

  it("Ausblenden ruft act mit hide und nimmt die Gruppe aus der offenen Liste", async () => {
    const load = vi.fn(async () => ({ items: [group(1)], hasMore: false }));
    const act = vi.fn(async () => undefined);
    const onChanged = vi.fn();
    render(<ReportQueue scope="platform" load={load} act={act} onChanged={onChanged} />);
    await screen.findByText("Inhalt 1");
    fireEvent.click(screen.getByRole("button", { name: /Ausblenden/ }));
    await waitFor(() => expect(act).toHaveBeenCalledWith("post", "p1", "hide"));
    await waitFor(() => expect(onChanged).toHaveBeenCalled());
  });
});
