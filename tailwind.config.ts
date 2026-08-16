import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        blush: {
          50: "#fdf4f5",
          100: "#fbe8ea",
          200: "#f5cdd3",
          300: "#eea7b1",
          400: "#e17185",
          500: "#d24b64",
          600: "#b8324f",
          700: "#98263f",
          800: "#7f2338",
          900: "#6d2033",
        },
        ink: {
          900: "#1c1917",
        },
      },
      fontFamily: {
        serif: ["Georgia", "Cambria", "Times New Roman", "serif"],
      },
    },
  },
  plugins: [],
};

export default config;
