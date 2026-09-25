/**
 * Vite-Legacy-Einstieg (`npm run dev:vite` / `npm run build:vite`).
 * Primärer Einstieg ist app/page.tsx (Next.js).
 */
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./index.css";
import App from "./App";
import { ErrorBoundary } from "@/components/ErrorBoundary";
import { registerServiceWorker } from "@/lib/pwa";

createRoot(document.getElementById("root")!).render(
  <StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </StrictMode>
);

if (import.meta.env.PROD) registerServiceWorker();
