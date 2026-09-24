/** Semantic tone helpers — map a token name to consistent Tailwind class groups. */
export type Tone = "leaf" | "soil" | "info" | "warning" | "danger";

export const toneText: Record<Tone, string> = {
  leaf: "text-leaf-600 dark:text-leaf-400",
  soil: "text-soil-600 dark:text-soil-300",
  info: "text-info-500 dark:text-info-400",
  warning: "text-warning-500 dark:text-warning-400",
  danger: "text-danger-500 dark:text-danger-400",
};

export const toneSoft: Record<Tone, string> = {
  leaf: "bg-leaf-500/12 text-leaf-600 dark:text-leaf-300 border-leaf-500/25",
  soil: "bg-soil-500/12 text-soil-600 dark:text-soil-300 border-soil-500/25",
  info: "bg-info-500/12 text-info-500 dark:text-info-400 border-info-500/25",
  warning: "bg-warning-500/12 text-warning-500 dark:text-warning-400 border-warning-500/25",
  danger: "bg-danger-500/12 text-danger-500 dark:text-danger-400 border-danger-500/25",
};

export const toneSolid: Record<Tone, string> = {
  leaf: "bg-leaf-500 text-white",
  soil: "bg-soil-500 text-white",
  info: "bg-info-500 text-white",
  warning: "bg-warning-500 text-white",
  danger: "bg-danger-500 text-white",
};

export const toneDot: Record<Tone, string> = {
  leaf: "bg-leaf-500",
  soil: "bg-soil-500",
  info: "bg-info-500",
  warning: "bg-warning-500",
  danger: "bg-danger-500",
};

/** Resolves a tone to a live CSS color variable (theme-aware) for SVG charts. */
export const toneColor: Record<Tone, string> = {
  leaf: "var(--accent)",
  soil: "var(--accent-2)",
  info: "var(--info)",
  warning: "var(--warning)",
  danger: "var(--danger)",
};
