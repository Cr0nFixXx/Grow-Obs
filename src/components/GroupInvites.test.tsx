// @vitest-environment jsdom
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { InviteBanner } from "./GroupInvites";
import type { MyGroupInvite } from "@/services/interfaces";

const invite = (over: Partial<MyGroupInvite> = {}): MyGroupInvite => ({ id: "i1", conversationId: "c1", groupName: "Growfreunde", groupAvatar: "", inviterName: "Anna", memberCount: 3, createdAt: "2026-10-20T10:00:00Z", expiresAt: new Date(Date.now() + 3 * 86_400_000 + 3600_000).toISOString(), ...over });

describe("InviteBanner (B-65)", () => {
  afterEach(cleanup);

  it("zeigt nichts ohne Einladungen", () => {
    const { container } = render(<InviteBanner invites={[]} onAccept={async () => undefined} onDecline={async () => undefined} />);
    expect(container.innerHTML).toBe("");
  });

  it("zeigt Gruppe, Einladende, Mitglieder und Ablauf; Annehmen und Ablehnen rufen mit der Einladungs-ID", async () => {
    const onAccept = vi.fn(async () => undefined);
    const onDecline = vi.fn(async () => undefined);
    render(<InviteBanner invites={[invite(), invite({ id: "i2", groupName: "Zweite", memberCount: 1 })]} onAccept={onAccept} onDecline={onDecline} />);
    expect(screen.getByText("2 Einladungen")).toBeTruthy();
    expect(screen.getByText(/Anna lädt dich ein · 3 Mitglieder · läuft in 4 Tagen ab/)).toBeTruthy();
    expect(screen.getByText(/1 Mitglied ·/)).toBeTruthy();
    fireEvent.click(screen.getAllByRole("button", { name: "Annehmen" })[0]!);
    await waitFor(() => expect(onAccept).toHaveBeenCalledWith("i1"));
    fireEvent.click(screen.getAllByRole("button", { name: "Ablehnen" })[1]!);
    await waitFor(() => expect(onDecline).toHaveBeenCalledWith("i2"));
  });

  it("zeigt Fehler (z. B. abgelaufen) statt still zu scheitern", async () => {
    render(<InviteBanner invites={[invite()]} onAccept={async () => { throw new Error("Einladung abgelaufen"); }} onDecline={async () => undefined} />);
    fireEvent.click(screen.getByRole("button", { name: "Annehmen" }));
    expect((await screen.findByRole("alert")).textContent).toContain("Einladung abgelaufen");
  });
});
