/** @type {import('eslint').Linter.Config} */
module.exports = {
  extends: ["@remix-run/eslint-config", "@remix-run/eslint-config/node"],
  rules: {
    "no-useless-constructor": "off",
    "@typescript-eslint/no-useless-constructor": "warn"
  }
};
