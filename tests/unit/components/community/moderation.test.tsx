// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { ReportGroup, SocialPost } from "@/types";
import { ModerationPanel } from "@/components/community/ModerationPanel";
import { CommunityFeed } from "@/components/community/CommunityFeed";
import { ReportSheet } from "@/components/community/ReportSheet";

const toast = { push: vi.fn() };
vi.mock("@/components/Toast", () => ({ useToast: () => toast }));

const group = (over: Partial<ReportGroup> = {}): ReportGroup => ({
  kind: "post", targetId: "p1", status: "open", count: 2,
  preview: { text: "Kaufe jetzt!!!", image: null, author: "Alice", handle: "@alice", hidden: false },
  reports: [
    { id: "r1", reporter: "Bob", reason: "spam", details: "Werbung", ago: "vor 2 Min." },
    { id: "r2", reporter: "Mia", reason: "offtopic", details: "", ago: "vor 1 Min." },
  ],
  ...over,
});
const post = (over: Partial<SocialPost> = {}): SocialPost => ({
  id: "p1", author: "Alice", handle: "@alice", avatar: "", time: "vor 1 Std.", text: "Hallo Community", likes: 1, comments: 0, shares: 0, tags: [], ...over,
});

const reports = vi.fn(async (_id: string, status: string): Promise<ReportGroup[]> => (status === "open" ? [group()] : []));
const resolveReport = vi.fn(async () => undefined);
const bans = vi.fn(async () => [{ id: "u9", name: "Troll", handle: "@troll", avatar: "", bannedAt: "2026-10-01T00:00:00Z" }]);
const unban = vi.fn(async () => undefined);
const listPosts = vi.fn(async (): Promise<SocialPost[]> => []);
const createPost = vi.fn(async () => post());
const setHidden = vi.fn(async () => undefined);
const report = vi.fn(async () => ({ duplicate: false }));
const services = {
  communities: { reports, resolveReport, bans, unban, setHidden, report },
  social: { listPosts, createPost, toggleLike: vi.fn(async () => post()) },
  comments: { list: vi.fn(async () => []), add: vi.fn() },
};
vi.mock("@/data/DataContext", () => ({ useServices: () => services }));

beforeEach(() => {
  window.matchMedia ??= ((query: string) => ({ matches: false, media: query, addEventListener: () => undefined, removeEventListener: () => undefined, addListener: () => undefined, removeListener: () => undefined, onchange: null, dispatchEvent: () => false })) as unknown as typeof window.matchMedia;
  vi.clearAllMocks();
  reports.mockImplementation(async (_id, status) => (status === "open" ? [group()] : []));
  listPosts.mockResolvedValue([]);
});
afterEach(() => { cleanup(); });

describe("ModerationPanel (B-61)", () => {
  it("zeigt die Warteschlange gruppiert mit Gründen und entscheidet: ausblenden bzw. kein Verstoß", async () => {
    render(<ModerationPanel communityId="c1" isAdmin={false} />);
    const card = await screen.findByTestId("report-group");
    expect(within(card).getByText("2 Meldungen")).toBeTruthy();
    expect(within(card).getByText("Kaufe jetzt!!!")).toBeTruthy();
    expect(within(card).getByText(/Spam oder Werbung/)).toBeTruthy();
    expect(within(card).getByText(/„Werbung“/)).toBeTruthy();
    fireEvent.click(within(card).getByRole("button", { name: /Ausblenden/ }));
    await waitFor(() => expect(resolveReport).toHaveBeenCalledWith("c1", "post", "p1", "hide"));
    fireEvent.click(within(card).getByRole("button", { name: "Kein Verstoß" }));
    await waitFor(() => expect(resolveReport).toHaveBeenCalledWith("c1", "post", "p1", "dismiss"));
  });

  it("Moderatoren sehen keine Sperrliste, Admins schon (mit Entsperren)", async () => {
    const { unmount } = render(<ModerationPanel communityId="c1" isAdmin={false} />);
    await screen.findByTestId("report-group");
    expect(screen.queryByTestId("ban-list")).toBeNull();
    unmount();
    render(<ModerationPanel communityId="c1" isAdmin />);
    const list = await screen.findByTestId("ban-list");
    expect(await within(list).findByText("Troll")).toBeTruthy();
    fireEvent.click(within(list).getByRole("button", { name: "Entsperren" }));
    await waitFor(() => expect(unban).toHaveBeenCalledWith("c1", "u9"));
  });

  it("Leerzustand, erledigte Ansicht und gelöschter Inhalt", async () => {
    reports.mockImplementation(async (_id, status) => (status === "open" ? [] : [group({ status: "hidden", resolvedBy: "Lena", resolvedAgo: "vor 1 Std.", preview: null })]));
    render(<ModerationPanel communityId="c1" isAdmin={false} />);
    expect(await screen.findByText("Keine offenen Meldungen")).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Erledigt" }));
    expect(await screen.findByText("Der Inhalt wurde inzwischen gelöscht.")).toBeTruthy();
    expect(screen.getByText(/von Lena/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Ausblenden/ })).toBeNull();
  });

  it("Fehler beim Entscheiden bleibt sichtbar (Toast)", async () => {
    resolveReport.mockRejectedValueOnce(new Error("Inhalte von Admins können Moderatoren nicht ausblenden"));
    render(<ModerationPanel communityId="c1" isAdmin={false} />);
    fireEvent.click(await screen.findByRole("button", { name: /Ausblenden/ }));
    await waitFor(() => expect(toast.push).toHaveBeenCalledWith(expect.objectContaining({ tone: "danger", desc: expect.stringContaining("Admins") })));
  });
});

describe("CommunityFeed (B-61)", () => {
  it("Mitglied: kann fremde Beiträge melden, aber nicht ausblenden; eigene Beiträge haben kein Menü", async () => {
    listPosts.mockResolvedValue([post(), post({ id: "p2", text: "Mein Beitrag", mine: true })]);
    render(<CommunityFeed communityId="c1" canModerate={false} />);
    const cards = await screen.findAllByTestId("community-post");
    expect(cards).toHaveLength(2);
    expect(cards[1]!.querySelector('[aria-haspopup="menu"]')).toBeNull(); // eigener Beitrag: nichts zu melden/ausblenden
    expect(cards[0]!.querySelector('[aria-haspopup="menu"]')).not.toBeNull();
    fireEvent.click(within(cards[0]!).getByRole("button", { expanded: false }));
    expect(screen.queryByRole("menuitem", { name: /ausblenden/i })).toBeNull();
    fireEvent.click(await screen.findByRole("menuitem", { name: "Melden" }));
    fireEvent.click(await screen.findByLabelText(/Beleidigung/));
    fireEvent.click(screen.getByRole("button", { name: "Meldung senden" }));
    await waitFor(() => expect(report).toHaveBeenCalledWith("c1", { kind: "post", targetId: "p1", reason: "harassment", details: undefined }));
  });

  it("Moderation: blendet aus und wieder ein; ausgeblendete Beiträge sind markiert", async () => {
    listPosts.mockResolvedValue([post({ hidden: true })]);
    render(<ModerationPanelProxy />);
    const card = await screen.findByTestId("community-post");
    expect(within(card).getByText("Ausgeblendet")).toBeTruthy();
    fireEvent.click(within(card).getByRole("button", { expanded: false }));
    fireEvent.click(await screen.findByRole("menuitem", { name: "Wieder einblenden" }));
    await waitFor(() => expect(setHidden).toHaveBeenCalledWith("c1", "post", "p1", false));
  });

  it("schreibt einen Beitrag in die Community", async () => {
    render(<CommunityFeed communityId="c1" canModerate={false} />);
    fireEvent.change(await screen.findByLabelText("Beitrag schreiben"), { target: { value: "Neu hier" } });
    fireEvent.click(screen.getByRole("button", { name: /Beitrag$/ }));
    await waitFor(() => expect(createPost).toHaveBeenCalledWith({ text: "Neu hier", communityId: "c1" }));
  });
});

function ModerationPanelProxy() { return <CommunityFeed communityId="c1" canModerate />; }

describe("ReportSheet", () => {
  it("meldet doppelte Meldung freundlich", async () => {
    report.mockResolvedValueOnce({ duplicate: true });
    const onClose = vi.fn();
    render(<ReportSheet communityId="c1" target={{ kind: "comment", id: "k1" }} onClose={onClose} />);
    fireEvent.click(screen.getByRole("button", { name: "Meldung senden" }));
    await waitFor(() => expect(report).toHaveBeenCalledWith("c1", { kind: "comment", targetId: "k1", reason: "spam", details: undefined }));
    await waitFor(() => expect(toast.push).toHaveBeenCalledWith(expect.objectContaining({ title: "Bereits gemeldet" })));
    expect(onClose).toHaveBeenCalled();
  });
});
