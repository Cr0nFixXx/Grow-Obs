import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <App />
  </StrictMode>
);

// PWA: register service worker + Background Sync on reconnect (defensive)
if ("serviceWorker" in navigator) {
  window.addEventListener("load", () => {
    navigator.serviceWorker.register("/sw.js").catch(() => {
      /* SW not available in this environment — app still works */
    });
  });
  window.addEventListener("online", () => {
    navigator.serviceWorker.ready
      .then((reg) => {
        const r = reg as ServiceWorkerRegistration & {
          sync?: { register: (tag: string) => Promise<void> };
        };
        r.sync?.register("go-sync").catch(() => {});
      })
      .catch(() => {});
  });
}
