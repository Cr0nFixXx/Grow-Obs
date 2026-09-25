/**
 * PostCSS nur für Next.js (Tailwind v4 via @tailwindcss/postcss).
 * Vite ignoriert diese Datei: vite.config.ts setzt `css.postcss` inline und nutzt @tailwindcss/vite.
 */
export default {
  plugins: {
    "@tailwindcss/postcss": {},
  },
};
