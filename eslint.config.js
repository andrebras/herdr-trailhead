// Lint rules: ESLint's recommended set. The mod runs in Herdr's JavaScript runtime
// (QuickJS), which has no browser or Node.js globals; the tests run under Node.js.
import js from "@eslint/js";
import globals from "globals";

export default [
  { ignores: ["node_modules/", "**/*.d.ts"] },
  js.configs.recommended,
  {
    files: ["mods/**/*.js"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { console: "readonly", localStorage: "readonly" },
    },
  },
  {
    files: ["tests/**/*.mjs", "*.js"],
    languageOptions: { ecmaVersion: 2022, sourceType: "module", globals: globals.node },
  },
  {
    rules: {
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", caughtErrors: "none" }],
      eqeqeq: ["error", "always"],
      "prefer-const": "error",
      "no-var": "error",
    },
  },
];
