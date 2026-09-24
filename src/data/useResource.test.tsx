// @vitest-environment jsdom
import { act, cleanup, renderHook, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { useResource } from "./useResource";

afterEach(cleanup);
describe("useResource", () => {
  it("ignores late responses from a previous request", async () => {
    let resolveFirst!: (value: string) => void;
    const first = () => new Promise<string>((resolve) => { resolveFirst = resolve; });
    const second = async () => "new";
    const { result, rerender } = renderHook(({ load }) => useResource(load), { initialProps: { load: first } });
    rerender({ load: second });
    await waitFor(() => expect(result.current.data).toBe("new"));
    await act(async () => resolveFirst("stale"));
    expect(result.current.data).toBe("new");
  });
  it("retains data during refresh and reports a failed refresh without dropping content", async () => {
    let fail = false;
    const load = async () => { if (fail) throw new Error("Offline"); return ["existing"]; };
    const { result } = renderHook(() => useResource(load));
    await waitFor(() => expect(result.current.data).toEqual(["existing"]));
    fail = true;
    await act(async () => result.current.refresh());
    expect(result.current.data).toEqual(["existing"]);
    expect(result.current.error).toBe("Offline");
    expect(result.current.loading).toBe(false);
  });
});