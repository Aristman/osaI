/** @type {import('prettier').Config} */
export default {
  semi: true,
  singleQuote: false,
  tabWidth: 2,
  trailingComma: "all",
  printWidth: 100,
  arrowParens: "always",
  endOfLine: "lf",
  bracketSpacing: true,
  overrides: [
    {
      files: ["*.json"],
      options: {
        tabWidth: 2,
      },
    },
  ],
};
