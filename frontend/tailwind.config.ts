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
      fontSize: {
        // V2 type scale (mirrors --t-* CSS vars in globals.css)
        xs:  ["10px", { lineHeight: "1.4" }],
        sm:  ["13px", { lineHeight: "1.45" }],
        md:  ["16px", { lineHeight: "1.5" }],
        lg:  ["20px", { lineHeight: "1.35" }],
        xl:  ["28px", { lineHeight: "1.2" }],
        "2xl": ["40px", { lineHeight: "1.05" }],
        "3xl": ["72px", { lineHeight: "1" }],
      },
      borderRadius: {
        DEFAULT: "var(--r)",
        lg: "var(--r2)",
      },
      animation: {
        twinkle:     "tw var(--d, 3s) ease-in-out infinite var(--dl, 0s)",
        moonPulse:   "moonP 4.5s ease-in-out infinite",
        legs:        "legs .45s steps(2) infinite var(--ld, 0s)",
        timerPulse:  "timerP 1s ease-in-out infinite",
        fadeUp:      "fadeUp .9s ease both",
        airplane:    "airplane var(--ap-dur, 22s) linear var(--ap-delay, 0s) infinite",
        airplaneBlink: "airplane-blink 1.6s steps(2, end) infinite",
        flicker:     "flicker 8s linear infinite",
        bigPulse:    "bigPulse 2.8s ease-in-out infinite",
        windowBlink: "windowBlink var(--wb-dur, 4s) ease-in-out var(--wb-delay, 0s) infinite",
        shimmerSweep:"shimmerSweep 2.4s ease-in-out infinite",
        crownBounce: "crownBounce 1.4s ease-in-out infinite",
        statusPop:   "statusBubblePop .25s ease both",
        carDrive:    "carDrive var(--car-dur, 8s) linear var(--car-delay, 0s) infinite",
        pedWalk:     "pedWalk .9s ease-in-out infinite",
        ringRotate:  "ringRotate 6s linear infinite",
        gifBounce:   "gifBounce var(--gif-dur, 1.6s) ease-in-out var(--gif-delay, 0s) infinite",
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
