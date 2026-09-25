import js from "@eslint/js";
import tseslint from "typescript-eslint";
import globals from "globals";
import prettier from "eslint-config-prettier";

/**
 * Backend lint rules.
 *
 * Type-aware linting is deliberately not enabled: it needs a full program per
 * run and roughly triples lint time, and `tsc -p tsconfig.json` already runs
 * in CI right beside this, so the type errors it would catch are caught
 * anyway. What this adds on top of tsc is the unused/any/shadowing class of
 * problem that the compiler is configured to tolerate.
 */
export default tseslint.config(
  { ignores: ["dist/**", "node_modules/**", "prisma/migrations/**", "*.config.js"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ["**/*.ts"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: { ...globals.node },
    },
    rules: {
      // A leading underscore is the established way to say "required by the
      // signature, deliberately unused" — Express handlers do this constantly.
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
      "no-console": ["error", { allow: ["warn", "error"] }],
      eqeqeq: ["error", "smart"],
    },
  },
  {
    // Fixtures reach into raw SQL and partially-built objects on purpose, and
    // scripts/ are one-shot CLI entrypoints where stdout is the interface.
    files: ["tests/**/*.ts", "prisma/**/*.ts", "scripts/**/*.ts"],
    rules: {
      "@typescript-eslint/no-explicit-any": "off",
      "no-console": "off",
    },
  },
  // LAST: switches off every stylistic rule that would fight Prettier.
  prettier
);
