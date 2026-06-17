// Minimal flat ESLint config.
//
// The project currently only has the bare `eslint` package installed (no
// `eslint-config-next` and no TypeScript parser). Espree (ESLint's default
// parser) cannot parse TypeScript syntax, so we scope linting to plain
// JS/MJS/CJS files and ignore TS/TSX to avoid spurious parse errors.
//
// Rules are intentionally lenient (warn, not error) so `npm run lint` runs
// real rules and surfaces signal without breaking any pre-push hook. When
// `eslint-config-next` and `typescript-eslint` are added, extend this config
// to cover `.ts`/`.tsx` with the Next.js + TS presets.

export default [
  {
    ignores: [
      "node_modules/**",
      ".next/**",
      "out/**",
      "build/**",
      "dist/**",
      "coverage/**",
      "next-env.d.ts",
      "**/*.ts",
      "**/*.tsx",
    ],
  },
  {
    files: ["**/*.js", "**/*.mjs", "**/*.cjs"],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
    },
    rules: {
      "no-unused-vars": "warn",
      "no-undef": "off",
      "prefer-const": "warn",
      "no-console": "off",
    },
  },
]
