import eslint from "@eslint/js";
import tseslint from "typescript-eslint";

/** Flat-Config (ESLint v9). Ausführen: `npx eslint .` (CI: non-blocking). */
export default tseslint.config(
  { ignores: ["dist/**", "public/**", "node_modules/**", "*.config.ts", "vitest.config.ts"] },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-unused-vars": "off",
      "@typescript-eslint/no-empty-object-type": "off",
      "@typescript-eslint/ban-ts-comment": "off",
      "no-empty": "off",
      "no-undef": "off",
    },
  }
);
