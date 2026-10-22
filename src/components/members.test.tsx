// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  toast: vi.fn(), navigate: vi.fn(),
  members: { follow: vi.fn(), unfollow: vi.fn(), requests: vi.fn(), accept: vi.fn(), decline: vi.fn(), followers: vi.fn(), following: vi.fn(), removeFollower: vi.fn() },
}));
const services = { members: mocks.members };
vi.mock("@/data/DataContext", () => ({ useServices: () => services }));
vi.mock("@/components/Toast", () => ({ useToast: () => ({ push: mocks.toast }) }));
vi.mock("@/lib/nav", () => ({ useNav: () => ({ navigate: mocks.navigate }) }));
import { atHandle, FollowButton, FollowListModal, FollowRequestsCard } from "./members";

beforeEach(() => { vi.clearAllMocks(); });
afterEach(cleanup);

describe("FollowButton (B-73)", () => {
  it("beschriftet je nach Stand und Genehmigungspflicht", () => {
    const { rerender } = render(<FollowButton handle="anna" state="none" needsApproval={false} onChange={() => undefined} />);
    expect(screen.getByRole("button", { name: /Folgen/ })).toBeTruthy();
    rerender(<FollowButton handle="anna" state="none" needsApproval onChange={() => undefined} />);
    expect(screen.getByRole("button", { name: /Anfrage senden/ })).toBeTruthy();
    rerender(<FollowButton handle="anna" state="pending" needsApproval onChange={() => undefined} />);
    expect(screen.getByRole("button", { name: /Angefragt/ })).toBeTruthy();
    rerender(<FollowButton handle="anna" state="accepted" needsApproval={false} onChange={() => undefined} />);
    expect(screen.getByRole("button", { name: /Gefolgt/ })).toBeTruthy();
  });
  it("meldet das Ergebnis des Servers (angenommen/angefragt) und das Entfolgen", async () => {
    const onChange = vi.fn();
    mocks.members.follow.mockResolvedValue("pending");
    const { rerender } = render(<FollowButton handle="anna" state="none" needsApproval onChange={onChange} />);
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith("pending"));
    expect(mocks.members.follow).toHaveBeenCalledWith("anna");
    mocks.members.unfollow.mockResolvedValue(undefined);
    rerender(<FollowButton handle="anna" state="accepted" needsApproval={false} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(onChange).toHaveBeenCalledWith("none"));
  });
  it("zeigt den Serverfehler als Hinweis und ändert den Stand nicht", async () => {
    const onChange = vi.fn();
    mocks.members.follow.mockRejectedValue(new Error("Dieses Profil ist privat."));
    render(<FollowButton handle="anna" state="none" needsApproval={false} onChange={onChange} />);
    fireEvent.click(screen.getByRole("button"));
    await waitFor(() => expect(mocks.toast).toHaveBeenCalledWith(expect.objectContaining({ desc: "Dieses Profil ist privat." })));
    expect(onChange).not.toHaveBeenCalled();
  });
});

describe("FollowRequestsCard", () => {
  const request = { id: "u1", name: "Anna", handle: "anna", avatar: "", title: "Grower", requestedAt: "2026-10-23T10:00:00Z" };
  it("bleibt ohne offene Anfragen unsichtbar", async () => {
    mocks.members.requests.mockResolvedValue([]);
    const { container } = render(<FollowRequestsCard />);
    await waitFor(() => expect(mocks.members.requests).toHaveBeenCalled());
    expect(container.innerHTML).toBe("");
  });
  it("nimmt an bzw. lehnt ab und entfernt die Zeile", async () => {
    mocks.members.requests.mockResolvedValue([request, { ...request, id: "u2", name: "Ben", handle: "ben" }]);
    mocks.members.accept.mockResolvedValue(undefined); mocks.members.decline.mockResolvedValue(undefined);
    const onChanged = vi.fn();
    render(<FollowRequestsCard onChanged={onChanged} />);
    await screen.findByText("Anna");
    fireEvent.click(screen.getAllByRole("button", { name: "Annehmen" })[0]!);
    await waitFor(() => expect(mocks.members.accept).toHaveBeenCalledWith("u1"));
    await waitFor(() => expect(screen.queryByText("Anna")).toBeNull());
    expect(onChanged).toHaveBeenCalled();
    fireEvent.click(screen.getByRole("button", { name: "Ablehnen" }));
    await waitFor(() => expect(mocks.members.decline).toHaveBeenCalledWith("u2"));
  });
});

describe("FollowListModal", () => {
  it("listet Follower, öffnet ein Profil und erlaubt eigenen Followern das Entfernen", async () => {
    const onClose = vi.fn();
    mocks.members.followers.mockResolvedValue([{ id: "u1", name: "Anna", handle: "anna", avatar: "", title: "Grower" }]);
    mocks.members.removeFollower.mockResolvedValue(undefined);
    render(<FollowListModal open onClose={onClose} handle="max" kind="followers" mine />);
    fireEvent.click(await screen.findByRole("button", { name: "Profil von Anna öffnen" }));
    expect(mocks.navigate).toHaveBeenCalledWith("member", { handle: "anna" });
    fireEvent.click(screen.getByRole("button", { name: "Entfernen" }));
    await waitFor(() => expect(mocks.members.removeFollower).toHaveBeenCalledWith("u1"));
    await waitFor(() => expect(screen.getByText("Noch keine Follower.")).toBeTruthy());
  });
  it("zeigt einen Fehler, wenn die Liste nicht sichtbar ist", async () => {
    mocks.members.following.mockRejectedValue(new Error("Diese Liste ist nicht sichtbar."));
    render(<FollowListModal open onClose={() => undefined} handle="anna" kind="following" />);
    expect((await screen.findByRole("alert")).textContent).toContain("nicht sichtbar");
  });
});

describe("atHandle", () => {
  it("setzt genau ein @", () => { expect(atHandle("max")).toBe("@max"); expect(atHandle("@max")).toBe("@max"); });
});
