import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
import unusedImports from "eslint-plugin-unused-imports";
import prettier from "eslint-config-prettier";

export default tseslint.config(
  { ignores: ["dist"] },
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "unused-imports": unusedImports,
      "react-refresh": reactRefresh,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": ["warn", { allowConstantExport: true }],
      // Auto-fixable: strips imports nothing references, which is the bulk of
      // what no-unused-vars would otherwise report by hand.
      "unused-imports/no-unused-imports": "error",
      // A leading underscore is the established opt-out for a binding that
      // must exist but is deliberately unused.
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
          ignoreRestSiblings: true,
        },
      ],
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-empty-object-type": "error",
      "@typescript-eslint/no-require-imports": "error",
    },
  },
  {
    // Test doubles and build config sit at boundaries the app's own types do
    // not describe - a mocked SDK response or a Vite plugin's options object.
    files: ["tests/**/*.{ts,tsx}", "*.config.ts"],
    rules: { "@typescript-eslint/no-explicit-any": "off" },
  },
  // LAST: switches off every stylistic rule that would fight Prettier.
  prettier
);
