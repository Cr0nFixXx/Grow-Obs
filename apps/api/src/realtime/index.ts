import { handleUpgrade } from "./ws.ts";

export { publish, shutdownRealtime, type RealtimeEvent } from "./hub.ts";
export { handleUpgrade } from "./ws.ts";

/** Haken für den eingebetteten Betrieb: das Next-Serverskript (scripts/server.mjs) leitet WebSocket-Upgrades hierher. */
export type UpgradeHandler = typeof handleUpgrade;
export function registerGlobalUpgradeHandler(): void {
  (globalThis as unknown as { __growRealtimeUpgrade?: UpgradeHandler }).__growRealtimeUpgrade = handleUpgrade;
}
registerGlobalUpgradeHandler();
