import nextCoreWebVitals from "eslint-config-next/core-web-vitals";
import noUnlocalizedJsxText from "./eslint-rules/no-unlocalized-jsx-text.mjs";

const localI18nPlugin = {
  rules: {
    "no-unlocalized-jsx-text": noUnlocalizedJsxText
  }
};

const eslintConfig = [
  ...nextCoreWebVitals,
  {
    files: ["src/app/**/*.tsx", "src/components/**/*.tsx"],
    plugins: {
      i18n: localI18nPlugin
    },
    rules: {
      "i18n/no-unlocalized-jsx-text": ["warn", { minLength: 12 }]
    }
  },
  {
    ignores: [
      ".next/**",
      ".tmp/**",
      ".cache/**",
      ".playwright-cli/**",
      "output/**",
      "node_modules/**",
      "public/**",
      "tsconfig.tsbuildinfo"
    ]
  }
];

export default eslintConfig;
