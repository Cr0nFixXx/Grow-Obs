import { readFileSync } from "node:fs";
import { runInNewContext } from "node:vm";
import { describe, expect, it } from "vitest";

type RequestLike = { url: string; method: string; headers: Headers; mode: string; cache: string };
type Policy = { classify: (req: RequestLike, origin: string) => string; canStore: (req: RequestLike, res: Response, origin: string) => boolean };
const context: { URL: typeof URL; GrowCachePolicy?: Policy } = { URL };
runInNewContext(readFileSync(new URL("../../public/sw-policy.js", import.meta.url), "utf8"), context);
const policy = context.GrowCachePolicy!;
const origin = "https://app.example.test";
const request = (path: string, changes: Partial<RequestLike> = {}): RequestLike => ({ url: new URL(path, origin).href, method: "GET", headers: new Headers(), mode: "cors", cache: "default", ...changes });

describe("actual service-worker cache policy", () => {
  it.each(["/auth/me", "/admin/users", "/grows", "/communities", "/chat/1/messages", "/api/health", "/unknown.json", "https://images.pexels.com/photos/1/image.jpg", "/icon.svg?token=signed"])("never caches %s", (path) => {
    expect(policy.classify(request(path), origin)).toBe("network");
  });
  it("does not cache authenticated or no-store requests even for known asset paths", () => {
    expect(policy.classify(request("/icon.svg", { headers: new Headers({ Authorization: "Bearer token" }) }), origin)).toBe("network");
    expect(policy.classify(request("/icon.svg", { cache: "no-store" }), origin)).toBe("network");
    expect(policy.classify(request("/", { method: "POST" }), origin)).toBe("network");
  });
  it("only uses the offline HTML shell for known entry navigations", () => {
    expect(policy.classify(request("/", { mode: "navigate" }), origin)).toBe("navigation");
    expect(policy.classify(request("/communities", { mode: "navigate" }), origin)).toBe("network");
  });
  it("stores a public icon but rejects private/HTML/error responses", () => {
    const req = request("/icon.svg");
    expect(policy.canStore(req, new Response("<svg/>", { headers: { "Content-Type": "image/svg+xml" } }), origin)).toBe(true);
    expect(policy.canStore(req, new Response("<svg/>", { headers: { "Content-Type": "image/svg+xml", "Cache-Control": "private, no-store" } }), origin)).toBe(false);
    expect(policy.canStore(req, new Response("<html/>", { headers: { "Content-Type": "text/html" } }), origin)).toBe(false);
    expect(policy.canStore(req, new Response("", { status: 401 }), origin)).toBe(false);
  });
  it("caches hashed Next.js build assets only with the matching MIME type", () => {
    const js = request("/_next/static/chunks/app-abc123.js");
    const css = request("/_next/static/css/app-abc123.css");
    expect(policy.classify(js, origin)).toBe("asset");
    expect(policy.canStore(js, new Response("x", { headers: { "Content-Type": "application/javascript" } }), origin)).toBe(true);
    expect(policy.canStore(js, new Response("<html/>", { headers: { "Content-Type": "text/html" } }), origin)).toBe(false);
    expect(policy.canStore(css, new Response("a{}", { headers: { "Content-Type": "text/css; charset=utf-8" } }), origin)).toBe(true);
  });
  it.each(["/_next/data/build/page.json", "/_next/image?url=%2Fimages%2Fog.jpg", "/_next/static/chunks/app.js?token=x"])("keeps %s network-only", (path) => {
    expect(policy.classify(request(path), origin)).toBe("network");
  });
});