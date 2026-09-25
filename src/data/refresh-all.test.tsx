// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { refreshAllResources, useResource } from "./useResource";

afterEach(cleanup);

describe("pull-to-refresh: refreshAllResources (B-49)", () => {
  it("reloads every mounted resource in the background without a loading flash", async () => {
    let version = 1;
    const load = async () => `v${version}`;
    const { result } = renderHook(() => useResource(load));
    await waitFor(() => expect(result.current.data).toBe("v1"));
    version = 2;
    const seen: boolean[] = [];
    let summary = { ok: 0, failed: 0 };
    await act(async () => {
      const pending = refreshAllResources();
      seen.push(result.current.loading);
      summary = await pending;
    });
    expect(seen).toEqual([false]);
    expect(result.current.data).toBe("v2");
    expect(summary).toEqual({ ok: 1, failed: 0 });
  });

  it("keeps visible content and reports failures instead of showing an error page", async () => {
    let fail = false;
    const load = async () => { if (fail) throw new Error("offline"); return ["item"]; };
    const { result } = renderHook(() => useResource(load));
    await waitFor(() => expect(result.current.data).toEqual(["item"]));
    fail = true;
    let summary = { ok: 0, failed: 0 };
    await act(async () => { summary = await refreshAllResources(); });
    expect(summary).toEqual({ ok: 0, failed: 1 });
    expect(result.current.data).toEqual(["item"]);
    expect(result.current.error).toBeNull();
  });

  it("stops refreshing resources after unmount", async () => {
    const { unmount, result } = renderHook(() => useResource(async () => 1));
    await waitFor(() => expect(result.current.data).toBe(1));
    unmount();
    expect(await refreshAllResources()).toEqual({ ok: 0, failed: 0 });
  });
});
