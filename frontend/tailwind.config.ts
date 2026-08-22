import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        brand: "#1E40AF",
        "brand-light": "#3B63DE",
        "brand-tint": "#EEF2FF",
        orange: "#F97316",
        "orange-tint": "#FFF1E7",
        paper: "#EDEFF3",
        surface: "#FFFFFF",
        success: "#159C5B",
        "success-bright": "#34D399",
        muted: "#6B7280",
        subtle: "#9CA3AF",
        border: "#E5E7EB",

        // ── Soft UI ───────────────────────────────────────────────────────
        // Neumorphism needs the control and the surface behind it to be the
        // same colour — the shape is made entirely of light, not of fill. So
        // this is a ground, not a button colour, and the shadows below are
        // calculated against it.
        soft: {
          DEFAULT: "#EDEFF3",
          deep: "#E4E7ED",
          raised: "#F2F4F7",
          ink: "#171A20",
          "ink-soft": "#252932",
        },
      },
      fontFamily: {
        sans: ["Inter", "SF Pro Display", "system-ui", "sans-serif"],
      },
      borderRadius: {
        card: "16px",
        "card-lg": "22px",
        chip: "20px",
        sheet: "28px",
      },
      boxShadow: {
        card: "0 8px 20px -12px rgba(17,24,39,.16)",
        "card-hero": "0 18px 40px -18px rgba(30,64,175,.28)",
        nav: "0 -10px 26px rgba(17,24,39,.06)",
        fab: "0 14px 26px -6px rgba(30,64,175,.6)",
        btn: "0 14px 28px -10px rgba(30,64,175,.55)",

        // ── Soft UI ───────────────────────────────────────────────────────
        // Two shadows to every raised state: a white one up-left where the
        // light comes from, a blue-grey one down-right where it does not.
        // Dropping either half is what makes neumorphism look like a plain
        // drop shadow instead of a moulded surface.
        "soft-raised":
          "-6px -6px 12px rgba(255,255,255,.92), 6px 6px 14px rgba(163,177,198,.44)",
        "soft-raised-sm":
          "-3px -3px 7px rgba(255,255,255,.9), 3px 3px 8px rgba(163,177,198,.4)",
        "soft-raised-lg":
          "-9px -9px 18px rgba(255,255,255,.95), 10px 10px 22px rgba(163,177,198,.5)",
        // Pressed inverts the light: the same two shadows, moved inside.
        "soft-pressed":
          "inset -3px -3px 7px rgba(255,255,255,.82), inset 4px 4px 9px rgba(163,177,198,.5)",
        "soft-pressed-deep":
          "inset -4px -4px 9px rgba(255,255,255,.75), inset 6px 6px 12px rgba(163,177,198,.58)",
        // Filled controls sit *on* the surface rather than being moulded from
        // it, so they cast rather than catch the light.
        "soft-ink": "0 10px 20px -8px rgba(23,26,35,.55), -2px -2px 6px rgba(255,255,255,.45)",
        "soft-accent": "0 10px 22px -8px rgba(59,99,222,.55), -2px -2px 6px rgba(255,255,255,.4)",
        "soft-teal": "0 10px 22px -8px rgba(30,158,140,.5), 0 0 22px rgba(43,182,163,.35)",
        "soft-focus": "0 0 0 3px rgba(255,255,255,.9), 0 0 0 5px rgba(91,124,240,.55)",
      },
      animation: {
        "pop-in": "popIn 0.25s cubic-bezier(0.34,1.56,0.64,1)",
        "fade-slide": "fadeSlide 0.25s ease-out",
        "slide-up": "slideUp 0.28s cubic-bezier(0.16,1,0.3,1)",
        "scan-sweep": "scanSweep 2.6s linear infinite",
        "pulse-ring": "pulseRing 1.4s ease-out infinite",
        "soft-in": "softIn 0.22s cubic-bezier(0.16,1,0.3,1)",
      },
      keyframes: {
        popIn: {
          "0%": { transform: "scale(0.8)", opacity: "0" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
        fadeSlide: {
          "0%": { transform: "translateY(-8px)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        slideUp: {
          "0%": { transform: "translateY(100%)", opacity: "0" },
          "100%": { transform: "translateY(0)", opacity: "1" },
        },
        scanSweep: {
          "0%": { transform: "translateY(-100%)" },
          "100%": { transform: "translateY(600%)" },
        },
        pulseRing: {
          "0%": { transform: "scale(1)", opacity: "0.8" },
          "100%": { transform: "scale(1.8)", opacity: "0" },
        },
        softIn: {
          "0%": { transform: "scale(0.86)", opacity: "0" },
          "100%": { transform: "scale(1)", opacity: "1" },
        },
      },
    },
  },
  plugins: [],
};

export default config;
