import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      // CSS variables defined in app/globals.css — keeping these as Tailwind
      // tokens lets components compose with `bg-bg`, `text-accent-2`, etc.
      colors: {
        bg: "var(--bg)",
        text: "var(--text)",
        muted: "var(--muted)",
        dim: "var(--dim)",
        card: "var(--card)",
        glass: "var(--glass)",
        border: "var(--border)",
        border2: "var(--border2)",
        accent: {
          1: "var(--a1)",
          2: "var(--a2)",
          3: "var(--a3)",
          4: "var(--a4)",
        },
        teal: "var(--teal)",
        amber: "var(--amber)",
        pink: "var(--pink)",
        coral: "var(--coral)",
        blue: "var(--blue)",
        green: "var(--green)",
      },
      fontFamily: {
        pixel: ["'Press Start 2P'", "monospace"],
        japan: ["'DotGothic16'", "monospace"],
        mono: ["'VT323'", "monospace"],
        body: ["'Noto Sans TC'", "sans-serif"],
      },
      borderRadius: {
        DEFAULT: "var(--r)",
        lg: "var(--r2)",
      },
      animation: {
        twinkle: "tw var(--d, 3s) ease-in-out infinite var(--dl, 0s)",
        moonPulse: "moonP 4.5s ease-in-out infinite",
        legs: "legs .45s steps(2) infinite var(--ld, 0s)",
        timerPulse: "timerP 1s ease-in-out infinite",
        fadeUp: "fadeUp .9s ease both",
      },
      keyframes: {
        tw: {
          "0%,100%": { opacity: "0.1" },
          "50%": { opacity: "0.95" },
        },
        moonP: {
          "0%,100%": { boxShadow: "0 0 28px #fcd34d66, 0 0 80px #fcd34d1a" },
          "50%": { boxShadow: "0 0 50px #fcd34d99, 0 0 140px #fcd34d33" },
        },
        legs: {
          "0%": { gap: "1px" },
          "50%": { gap: "3px" },
        },
        timerP: {
          "0%,100%": { textShadow: "0 0 24px var(--a1), 0 0 60px var(--a3)" },
          "50%": {
            textShadow:
              "0 0 38px var(--a2), 0 0 100px var(--a1), 0 0 130px var(--a3)",
          },
        },
        fadeUp: {
          from: { opacity: "0", transform: "translateY(22px)" },
          to: { opacity: "1", transform: "translateY(0)" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
