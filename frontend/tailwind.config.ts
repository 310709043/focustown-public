import type { Config } from "tailwindcss";

const config: Config = {
  content: [
    "./app/**/*.{ts,tsx}",
    "./components/**/*.{ts,tsx}",
    "./lib/**/*.{ts,tsx}",
  ],
  theme: {
    extend: {
      screens: {
        // Mobile-first tier: phones <480px, large phones xs:480-767, tablets
        // md:768-1023, laptops lg:1024+. Input-type media queries let us
        // split hover-only visuals from active-press feedback without JS.
        xs: "480px",
        mouse: { raw: "(hover: hover)" },
        touch: { raw: "(hover: none)" },
      },
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
        pixel: ["var(--font-press-start-2p)", "monospace"],
        japan: ["var(--font-dot-gothic-16)", "monospace"],
        mono: ["var(--font-vt323)", "monospace"],
        body: ["var(--font-noto-sans-tc)", "sans-serif"],
        silkscreen: [
          "var(--font-silkscreen)",
          "var(--font-press-start-2p)",
          "monospace",
        ],
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
        carDrive:    "carDrive var(--car-dur, 16s) linear var(--car-delay, 0s) infinite",
        roadDash:    "roadDash 28s linear infinite",
        pedWalk:     "pedWalk .9s ease-in-out infinite",
        ringRotate:  "ringRotate 6s linear infinite",
        gifBounce:   "gifBounce var(--gif-dur, 1.6s) ease-in-out var(--gif-delay, 0s) infinite",
        userPop:     "userPop .42s cubic-bezier(.34,1.56,.64,1) both",
        selfHalo:    "selfHalo 1.8s ease-in-out infinite",
        coinPop:     "coinPop .9s ease-out forwards",
        roomShutterOpen: "roomShutterOpen 600ms cubic-bezier(0.16,1,0.3,1) both",
        themeCrossfade:  "themeCrossfade 300ms ease-out both",
        plaqueFlicker:   "plaqueFlicker 6s infinite",
        drift:           "drift var(--drift-dur, 60s) linear infinite",
        blink:           "blink 1s steps(2) infinite",
        shimmer:         "shimmer 2.5s ease-in-out infinite",
        pixelFloat:      "pixelFloat 2s steps(4) infinite",
        floatMoon:       "floatMoon 8s ease-in-out infinite",
        logoBob:         "logoBob 3.5s ease-in-out infinite",
        floatY:          "floatY 2.2s ease-in-out infinite var(--float-delay, 0s)",
        driftX:          "driftX var(--drift-dur, 38s) linear var(--drift-delay, 0s) infinite",
        driftXRev:       "driftXRev var(--drift-dur, 32s) linear var(--drift-delay, 0s) infinite",
        blinkSoft:       "blinkSoft 2.4s infinite",
        neonFlicker:     "neonFlicker 6s steps(20) infinite",
        caretBlink:      "caretBlink 0.9s steps(2) infinite",
        countUp:         "countUp 0.3s",
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
