import { defineConfig, globalIgnores } from "eslint/config";
import nextVitals from "eslint-config-next/core-web-vitals";
import nextTs from "eslint-config-next/typescript";

const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,
  {
    rules: {
      // Errors from the server are shown as their message (`catch (e: any)`), as in the phone app.
      "@typescript-eslint/no-explicit-any": "off",
      // Static website: signatures/photos are data URLs or fetched with the login, so plain <img>.
      "@next/next/no-img-element": "off",
      // Pages load their data from the server when they open.
      "react-hooks/set-state-in-effect": "off",
    },
  },
  // Override default ignores of eslint-config-next.
  globalIgnores([
    // Default ignores of eslint-config-next:
    ".next/**",
    "out/**",
    "build/**",
    "next-env.d.ts",
  ]),
]);

export default eslintConfig;
