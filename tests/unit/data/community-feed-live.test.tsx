// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { RealtimeContext } from "@/lib/realtime-context";
import type { RealtimeEvent } from "@/lib/realtime";

const social = { listPosts: vi.fn(async () => []) };
const services = { social, communities: {} }; // stabil wie die echte Service-Registry
vi.mock("@/data/DataContext", () => ({ useServices: () => services }));
const hooksPromise = import("@/data/hooks");

const listeners = new Set<(e: RealtimeEvent) => void>();
const unsubscribe = vi.fn();
const realtime = { status: "ws" as const, subscribe: vi.fn(() => unsubscribe), typing: vi.fn(), on: (l: (e: RealtimeEvent) => void) => { listeners.add(l); return () => listeners.delete(l); } };
const emit = (event: Record<string, unknown>) => act(async () => { for (const l of [...listeners]) l(event as unknown as RealtimeEvent); await Promise.resolve(); });
const wrapper = ({ children }: { children: ReactNode }) => <RealtimeContext.Provider value={realtime}>{children}</RealtimeContext.Provider>;

beforeEach(() => { listeners.clear(); social.listPosts.mockClear(); realtime.subscribe.mockClear(); });
afterEach(cleanup);

describe("useCommunityFeed live (B-89)", () => {
  it("abonniert community:<id> und lädt bei community.feed der eigenen Community neu", async () => {
    const { useCommunityFeed } = await hooksPromise;
    renderHook(() => useCommunityFeed("c1"), { wrapper });
    await waitFor(() => expect(social.listPosts).toHaveBeenCalledTimes(1));
    expect(realtime.subscribe).toHaveBeenCalledWith("community:c1");
    await emit({ type: "community.feed", communityId: "c1" });
    await waitFor(() => expect(social.listPosts).toHaveBeenCalledTimes(2));
  });
  it("ignoriert Ereignisse anderer Communities, lädt aber bei resync/poll neu", async () => {
    const { useCommunityFeed } = await hooksPromise;
    renderHook(() => useCommunityFeed("c1"), { wrapper });
    await waitFor(() => expect(social.listPosts).toHaveBeenCalledTimes(1));
    await emit({ type: "community.feed", communityId: "c2" });
    expect(social.listPosts).toHaveBeenCalledTimes(1);
    await emit({ type: "resync" });
    await waitFor(() => expect(social.listPosts).toHaveBeenCalledTimes(2));
    await emit({ type: "poll" });
    await waitFor(() => expect(social.listPosts).toHaveBeenCalledTimes(3));
  });
});
