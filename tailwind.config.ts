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
        white: "rgb(var(--surface-rgb) / <alpha-value>)",
        ink: "rgb(var(--text-primary-rgb) / <alpha-value>)",
        field: "rgb(var(--canvas-rgb) / <alpha-value>)",
        slate: {
          50: "rgb(var(--surface-hover-rgb) / <alpha-value>)",
          100: "rgb(var(--surface-muted-rgb) / <alpha-value>)",
          200: "rgb(var(--border-default-rgb) / <alpha-value>)",
          300: "rgb(var(--border-strong-rgb) / <alpha-value>)",
          400: "rgb(var(--text-disabled-rgb) / <alpha-value>)",
          500: "rgb(var(--text-tertiary-rgb) / <alpha-value>)",
          600: "rgb(var(--text-secondary-rgb) / <alpha-value>)",
          700: "rgb(var(--text-primary-rgb) / <alpha-value>)",
          800: "rgb(var(--text-primary-rgb) / <alpha-value>)",
          900: "rgb(var(--text-primary-rgb) / <alpha-value>)",
          950: "rgb(var(--text-primary-rgb) / <alpha-value>)"
        },
        brand: {
          DEFAULT: "rgb(var(--action-primary-rgb) / <alpha-value>)",
          50: "rgb(var(--action-primary-soft-rgb) / <alpha-value>)",
          100: "rgb(var(--action-primary-soft-rgb) / <alpha-value>)",
          200: "rgb(var(--action-primary-rgb) / 0.28)",
          300: "rgb(var(--action-primary-rgb) / 0.48)",
          400: "rgb(var(--action-primary-rgb) / 0.72)",
          500: "rgb(var(--action-primary-rgb) / <alpha-value>)",
          600: "rgb(var(--action-primary-rgb) / <alpha-value>)",
          700: "rgb(var(--action-primary-hover-rgb) / <alpha-value>)",
          800: "rgb(var(--action-primary-hover-rgb) / <alpha-value>)",
          900: "rgb(var(--action-primary-hover-rgb) / <alpha-value>)"
        },
        emerald: semanticPalette("success"),
        green: semanticPalette("success"),
        blue: primaryPalette(),
        indigo: primaryPalette(),
        sky: semanticPalette("info"),
        cyan: semanticPalette("info"),
        amber: semanticPalette("warning"),
        orange: semanticPalette("warning"),
        red: semanticPalette("danger"),
        rose: semanticPalette("danger"),
        violet: semanticPalette("experimental"),
        purple: semanticPalette("experimental")
      },
      boxShadow: {
        soft: "var(--shadow-sm)",
        elev: "var(--shadow-md)",
        popover: "var(--shadow-popover)"
      },
      borderRadius: {
        none: "0px",
        xs: "var(--radius-xs)",
        sm: "var(--radius-sm)",
        DEFAULT: "var(--radius-md)",
        md: "var(--radius-md)",
        lg: "var(--radius-lg)",
        xl: "var(--radius-xl)",
        "2xl": "var(--radius-xl)",
        full: "var(--radius-pill)"
      },
      fontFamily: {
        sans: [
          "var(--font-onest)",
          "Onest",
          "Inter",
          "ui-sans-serif",
          "system-ui",
          "-apple-system",
          "Segoe UI",
          "Roboto",
          "Helvetica",
          "Arial",
          "sans-serif"
        ],
        mono: [
          "var(--font-jetbrains-mono)",
          "JetBrains Mono",
          "ui-monospace",
          "SFMono-Regular",
          "Menlo",
          "monospace"
        ]
      }
    }
  },
  plugins: []
};

export default config;

function semanticPalette(name: "info" | "success" | "warning" | "danger" | "experimental") {
  return {
    50: `rgb(var(--${name}-soft-rgb) / <alpha-value>)`,
    100: `rgb(var(--${name}-soft-rgb) / <alpha-value>)`,
    200: `rgb(var(--${name}-rgb) / 0.28)`,
    300: `rgb(var(--${name}-rgb) / 0.45)`,
    400: `rgb(var(--${name}-rgb) / 0.72)`,
    500: `rgb(var(--${name}-rgb) / <alpha-value>)`,
    600: `rgb(var(--${name}-rgb) / <alpha-value>)`,
    700: `rgb(var(--${name}-rgb) / <alpha-value>)`,
    800: `rgb(var(--${name}-rgb) / <alpha-value>)`,
    900: `rgb(var(--${name}-rgb) / <alpha-value>)`,
    950: `rgb(var(--${name}-rgb) / <alpha-value>)`
  };
}

function primaryPalette() {
  return {
    50: "rgb(var(--action-primary-soft-rgb) / <alpha-value>)",
    100: "rgb(var(--action-primary-soft-rgb) / <alpha-value>)",
    200: "rgb(var(--action-primary-rgb) / 0.28)",
    300: "rgb(var(--action-primary-rgb) / 0.45)",
    400: "rgb(var(--action-primary-rgb) / 0.72)",
    500: "rgb(var(--action-primary-rgb) / <alpha-value>)",
    600: "rgb(var(--action-primary-rgb) / <alpha-value>)",
    700: "rgb(var(--action-primary-hover-rgb) / <alpha-value>)",
    800: "rgb(var(--action-primary-hover-rgb) / <alpha-value>)",
    900: "rgb(var(--action-primary-hover-rgb) / <alpha-value>)",
    950: "rgb(var(--action-primary-soft-rgb) / <alpha-value>)"
  };
}
