import js from "@eslint/js";
import globals from "globals";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import importPlugin from "eslint-plugin-import";

/**
 * Defects, not style.
 *
 * The backend's `ruff.toml` states the rule this follows: a narrow, chosen set,
 * so that a failure always means something is wrong. A linter that reports
 * indentation alongside a real bug trains everyone to skim the output, and then
 * the real bug is skimmed too. Nothing here is about formatting — no quote
 * style, no semicolons, no line length. Prettier is deliberately absent for the
 * same reason: this is a correctness gate, not a formatter.
 *
 * Until 2026-09-17 there was no frontend linter at all. CI linted Python and
 * ran both suites; the 13,000 lines of JSX had nothing checking them but the
 * tests. The rules below are the ones that would have caught a real class of
 * bug in this codebase:
 *
 *   react-hooks/rules-of-hooks   a hook behind a condition. ScriptEditor has
 *                                47 useState calls and three early returns;
 *                                this is the file where that mistake lives.
 *   react-hooks/exhaustive-deps  a stale closure. StoryBible.addCharacter
 *                                reads bible.characters.length from the
 *                                closure while setting state functionally,
 *                                which is exactly this rule's subject.
 *   no-unused-vars               an import left behind by a refactor, which is
 *                                dead weight in a bundle this product ships
 *                                over 3G.
 *   react/jsx-key                a list without keys, which React recovers
 *                                from by re-rendering more than it should.
 *   react/no-unescaped-entities  an apostrophe that silently eats markup.
 *
 * `exhaustive-deps` is a warning rather than an error on purpose. It has real
 * false positives around refs and stable dispatchers, and making it fail the
 * build is how a team ends up disabling the whole linter to ship.
 */
export default [
  {
    ignores: [
      "build/**",
      "node_modules/**",
      "coverage/**",
      // Generated at build time by the virtual-module plugin; not ours to lint.
      "src/**/*.generated.*",
    ],
  },

  js.configs.recommended,

  {
    files: ["**/*.{js,jsx,mjs}"],
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: "module",
      globals: { ...globals.browser, ...globals.es2021 },
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { react, "react-hooks": reactHooks, import: importPlugin },
    settings: { react: { version: "detect" } },
    rules: {
      // --- the hook rules, which are the reason this file exists ------------
      "react-hooks/rules-of-hooks": "error",
      "react-hooks/exhaustive-deps": "warn",

      // --- real JSX defects --------------------------------------------------
      "react/jsx-key": "error",
      "react/jsx-no-duplicate-props": "error",
      "react/jsx-no-undef": "error",
      "react/no-children-prop": "error",
      "react/no-danger-with-children": "error",
      "react/no-direct-mutation-state": "error",
      // Narrowed to the two that actually change what renders. An apostrophe
      // in prose is not a defect, and this product’s copy is full of them;
      // a stray `>` or `}` in JSX text is a markup accident.
      "react/no-unescaped-entities": ["error", { forbid: [">", "}"] }],
      "react/jsx-uses-vars": "error",
      "react/jsx-uses-react": "off", // the new JSX transform
      "react/react-in-jsx-scope": "off",

      // --- plain JavaScript mistakes ----------------------------------------
      // `caughtErrors: "none"`: `catch {}` with an unused binding is how this
      // codebase deliberately swallows an expected failure, and it says so at
      // each site.
      // `React` is exempt: the automatic JSX transform makes the import
      // unnecessary, but it is present in ~98 files and removing it everywhere
      // is churn with no behavioural change. Worth doing one day, not as the
      // price of turning a linter on.
      "no-unused-vars": ["error", {
        argsIgnorePattern: "^_",
        varsIgnorePattern: "^(_|React$)",
        caughtErrors: "none",
      }],

      // The codebase already carries `// eslint-disable-next-line import/first`
      // at every place a `vi.mock` call has to be hoisted above its imports.
      // Those comments were written against an ESLint setup that no longer
      // existed, so they referenced a rule nothing defined. Defining it makes
      // them mean what they say, and catches the next file that puts an import
      // after code WITHOUT saying why.
      "import/first": "error",
      "no-console": "off",        // the scripts/ checks print their findings
      eqeqeq: ["error", "smart"],
      "no-var": "error",
      "prefer-const": ["error", { destructuring: "all" }],
    },
  },

  // Test files run under Vitest's globals and touch Node APIs.
  {
    files: ["**/*.test.{js,jsx}", "src/setupTests.js"],
    languageOptions: {
      globals: { ...globals.browser, ...globals.node, ...globals.vitest },
    },
    rules: {
      // A test may render a component it does not otherwise reference.
      "no-unused-vars": ["error", { argsIgnorePattern: "^_", varsIgnorePattern: "^(_|React$)", caughtErrors: "none" }],
    },
  },

  // The check scripts are Node, not browser, and they are allowed to exit.
  {
    files: ["scripts/**/*.mjs", "vite.config.js", "*.config.{js,cjs,mjs}"],
    languageOptions: {
      globals: { ...globals.node },
      sourceType: "module",
    },
  },
];
