import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./src/pages/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/components/**/*.{js,ts,jsx,tsx,mdx}",
    "./src/app/**/*.{js,ts,jsx,tsx,mdx}"
  ],
  theme: {
    extend: {
      colors: {
        ink: "#18202f",
        field: "#f5f7fb"
      },
      boxShadow: {
        soft: "0 16px 50px rgba(24, 32, 47, 0.08)"
      }
    }
  },
  plugins: []
};

export default config;
