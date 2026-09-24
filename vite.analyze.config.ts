import { defineConfig, mergeConfig } from "vite";
import base from "./vite.config";
import { visualizer } from "rollup-plugin-visualizer";

/**
 * Separate Analyse-Config (die Basis `vite.config.ts` bleibt unangetastet).
 * Bundle-Report erzeugen:  `npx vite build --config vite.analyze.config.ts`
 * → schreibt `bundle-stats.html` (interaktiver Baumanalyse-Report).
 */
export default mergeConfig(
  base,
  defineConfig({
    plugins: [
      visualizer({
        filename: "bundle-stats.html",
        gzipSize: true,
        brotliSize: true,
        open: false,
      }),
    ],
  })
);
