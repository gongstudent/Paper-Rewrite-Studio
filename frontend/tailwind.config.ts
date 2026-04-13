import type { Config } from "tailwindcss";

export default {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        primary: {
          50: "#eef4ff",
          500: "#1e5eff",
          600: "#1849d6"
        },
        success: "#18b26b",
        warning: "#f59e0b",
        danger: "#e5484d",
        aigc: "#d14d72",
        page: "#f6f8fb",
        border: "#dde3ea",
        text: {
          900: "#101828",
          600: "#475467"
        }
      },
      boxShadow: {
        soft: "0 12px 32px rgba(16, 24, 40, 0.06)"
      },
      borderRadius: {
        xl2: "20px"
      }
    }
  },
  plugins: []
} satisfies Config;
