import eslint from "@eslint/js"
import prettier from "eslint-config-prettier"
import globals from "globals"
import tseslint from "typescript-eslint"

export default tseslint.config(
  {
    ignores: [
      "dist/**",
      "node_modules/**",
      "tmp/**",
      "tools/docx-validate/bin/**",
      "tools/docx-validate/obj/**",
      "src-tauri/**",
      "screenshots/**",
      "public/**",
      "*.tsbuildinfo",
    ],
  },
  eslint.configs.recommended,
  ...tseslint.configs.recommended,
  prettier,
  {
    files: ["**/*.{ts,tsx,js,mjs,cjs}"],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: "module",
      globals: {
        ...globals.browser,
        ...globals.node,
      },
    },
    rules: {
      "@typescript-eslint/no-unused-vars": [
        "error",
        {
          argsIgnorePattern: "^_",
          varsIgnorePattern: "^_",
          caughtErrorsIgnorePattern: "^_",
        },
      ],
      "@typescript-eslint/no-explicit-any": "off",
      "@typescript-eslint/no-empty-object-type": "off",
      "@typescript-eslint/no-unused-expressions": ["error", { allowShortCircuit: true, allowTernary: true }],
      // Intentional in AI parsing / placeholder regexes.
      "no-control-regex": "off",
      "no-useless-escape": "off",
      "preserve-caught-error": "off",
    },
  },
)
