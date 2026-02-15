import { defineConfig } from "eslint/config";
import react from "eslint-plugin-react";
import reactHooks from "eslint-plugin-react-hooks";
import importPlugin from "eslint-plugin-import";
import jsxA11yPlugin from "eslint-plugin-jsx-a11y";
import eslintConfigPrettier from "eslint-config-prettier/flat";

export default defineConfig([
    importPlugin.flatConfigs.recommended,
    react.configs.flat.recommended,
    reactHooks.configs.flat.recommended,
    jsxA11yPlugin.flatConfigs.recommended,
    eslintConfigPrettier,
]);
