import eslint from "@eslint/js";
import tseslint from "typescript-eslint";
import reactHooks from "eslint-plugin-react-hooks";

/** Flat-Config. Ausführen: `npm run lint` (CI: blockierend). */
export default tseslint.config(
  {
    ignores: [
      "dist/**", ".next/**", "public/**", "node_modules/**", "apps/api/dist/**",
      "next-env.d.ts", "*.config.ts", "*.config.js", "*.config.mjs",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  {
    // Nur die klassischen Hook-Regeln; die v7-Compiler-Regeln sind bewusst (noch) nicht aktiv.
    plugins: { "react-hooks": reactHooks },
    rules: {
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",
    },
  },
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
