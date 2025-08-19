/** @type {import("@ianvs/prettier-plugin-sort-imports").PrettierConfig} */

export default {
  arrowParens: "always",
  semi: true,
  jsxSingleQuote: false,
  printWidth: 120,
  singleQuote: false,
  quoteProps: "as-needed",
  endOfLine: "lf",
  plugins: [
    "@ianvs/prettier-plugin-sort-imports",
  ],
  // @ianvs/prettier-plugin-sort-imports plugin's options
  // https://github.com/IanVS/prettier-plugin-sort-imports#options
  importOrderParserPlugins: ["typescript", "jsx", "decorators-legacy"],
  importOrderTypeScriptVersion: "5.4.5",
};
