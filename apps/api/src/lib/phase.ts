import type { Context, MiddlewareHandler } from "hono";

/**
 * Diagnose (B-80): merkt sich je Anfrage die zuletzt erreichte Stufe. Die 12-s-Klammer (embedded-api) hängt sie an die
 * 503-Antwort, damit ein Hänger ohne Laufzeitprotokoll einer Stufe zugeordnet werden kann. Enthält nur feste Stufennamen.
 * Der Halter hängt am ursprünglichen Request; Middleware wie `bodyLimit` darf `c.req.raw` austauschen.
 */
type Holder = { name: string };
const holders = new WeakMap<Request, Holder>();
const KEY = "__phase";

export const markPhase = (c: Context, name: string): void => {
  const loose = c as unknown as { get(k: string): Holder | undefined; set(k: string, v: Holder): void };
  let holder = loose.get(KEY);
  if (!holder) {
    holder = holders.get(c.req.raw) ?? { name };
    holders.set(c.req.raw, holder);
    loose.set(KEY, holder);
  }
  holder.name = name;
};
export const phaseMark = (name: string): MiddlewareHandler => async (c, next) => { markPhase(c, name); await next(); };
export const phaseOf = (request: Request): string | undefined => holders.get(request)?.name;
