import type { Config } from "tailwindcss";

const config: Config = {
  content: ["./index.html", "./src/**/*.{ts,tsx}"],
  theme: {
    extend: {
      colors: {
        // Primary brand colors (from design tokens)
        primary: {
          DEFAULT: "#1E3A8A",
          light: "#3B7FFF",
          tint: "#EEF2FF",
          surface: "#F0F4FF",
        },
        // Secondary brand colors
        secondary: {
          DEFAULT: "#3B7FFF",
          dark: "#1E40AF",
          light: "#60A5FA",
        },
        // Success state
        success: {
          DEFAULT: "#10B981",
          bright: "#34D399",
          tint: "#D1FAE5",
          dark: "#059669",
        },
        // Warning state
        warning: {
          DEFAULT: "#F97316",
          bright: "#FB923C",
          tint: "#FFF1E7",
          dark: "#EA580C",
        },
        // Neutral scale
        neutral: {
          50: "#F9FAFB",
          100: "#F3F4F6",
          200: "#E5E7EB",
          300: "#D1D5DB",
          400: "#9CA3AF",
          500: "#6B7280",
          600: "#4B5563",
          700: "#374151",
          800: "#1F2937",
          900: "#111827",
        },
        // Semantic UI colors
        surface: "#FFFFFF",
        paper: "#F9F9F9",
        background: "#F3F4F6",
        border: "#E5E7EB",
        divider: "#F3F4F6",
        overlay: "rgba(0, 0, 0, 0.5)",

        // Legacy aliases for backward compatibility
        brand: "#1E40AF",
        "brand-light": "#3B63DE",
        "brand-tint": "#EEF2FF",
        orange: "#F97316",
        "orange-tint": "#FFF1E7",
        muted: "#6B7280",
        subtle: "#9CA3AF",

        // ── Soft UI ───────────────────────────────────────────────────────
        // Neumorphism needs the control and the surface behind it to be the
        // same colour — the shape is made entirely of light, not of fill. So
        // this is a ground, not a button colour, and the shadows below are
        // calculated against it.
        soft: {
          DEFAULT: "#EDEFF3",
          deep: "#E4E7ED",
          raised: "#F2F4F7",
          // The selected/active fill. Bright enough that text on it has to be
          // dark — white would land at about 1.3:1, which is unreadable.
          active: "#05F2F5",
          "active-deep": "#04C9CC",
          // Text and glyphs that sit on `active`.
          "active-ink": "#08272B",
        },
      },
      fontFamily: {
        sans: ["Manrope", "Inter", "SF Pro Display", "system-ui", "sans-serif"],
      },
      fontSize: {
        // Heading scale
        "h1": ["3.5rem", { lineHeight: "1.1", fontWeight: "700" }],
        "h2": ["2.75rem", { lineHeight: "1.15", fontWeight: "700" }],
        "h3": ["2rem", { lineHeight: "1.25", fontWeight: "700" }],
        "h4": ["1.5rem", { lineHeight: "1.33", fontWeight: "600" }],
        "h5": ["1.25rem", { lineHeight: "1.4", fontWeight: "600" }],
        "h6": ["1rem", { lineHeight: "1.5", fontWeight: "600" }],
        // Subtitle scale
        "subtitle-lg": ["1.125rem", { lineHeight: "1.5", fontWeight: "600" }],
        "subtitle-md": ["1rem", { lineHeight: "1.5", fontWeight: "600" }],
        "subtitle-sm": ["0.875rem", { lineHeight: "1.5", fontWeight: "600" }],
        // Body scale
        "body-lg": ["1.125rem", { lineHeight: "1.75", fontWeight: "400" }],
        "body-md": ["1rem", { lineHeight: "1.5", fontWeight: "400" }],
        "body-sm": ["0.875rem", { lineHeight: "1.5", fontWeight: "400" }],
        "body-xs": ["0.75rem", { lineHeight: "1.5", fontWeight: "400" }],
      },
      spacing: {
        0: "0",
        1: "0.25rem",
        2: "0.5rem",
        3: "0.75rem",
        4: "1rem",
        5: "1.25rem",
        6: "1.5rem",
        7: "1.75rem",
        8: "2rem",
        9: "2.25rem",
        10: "2.5rem",
        12: "3rem",
        14: "3.5rem",
        16: "4rem",
      },
      borderRadius: {
        none: "0",
        sm: "0.375rem",
        md: "0.5rem",
        lg: "1rem",
        xl: "1.375rem",
        xxl: "1.75rem",
        chip: "1.25rem",
        full: "9999px",
        // Legacy names
        card: "1rem",
        "card-lg": "1.375rem",
        sheet: "1.75rem",
      },
      boxShadow: {
        none: "none",
        subtle: "0 2px 4px rgba(17, 24, 39, 0.06)",
        card: "0 8px 20px -12px rgba(17, 24, 39, 0.16)",
        "card-hero": "0 18px 40px -18px rgba(30, 64, 175, 0.28)",
        nav: "0 -10px 26px rgba(17, 24, 39, 0.06)",
        fab: "0 14px 26px -6px rgba(30, 64, 175, 0.6)",
        btn: "0 14px 28px -10px rgba(30, 64, 175, 0.55)",
        hover: "0 12px 24px -8px rgba(17, 24, 39, 0.12)",
        active: "0 4px 8px -4px rgba(17, 24, 39, 0.08)",

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
        // Filled controls cast rather than catch the light; see soft-lift note.
        "soft-lift":
          "0 7px 16px -7px rgba(163,177,198,.7), 3px 3px 9px rgba(163,177,198,.4), -3px -3px 8px rgba(255,255,255,.85)",
        "soft-accent": "0 10px 22px -8px rgba(59,99,222,.55), -2px -2px 6px rgba(255,255,255,.4)",
        "soft-teal": "0 10px 22px -8px rgba(30,158,140,.5), 0 0 22px rgba(43,182,163,.35)",
        "soft-focus": "0 0 0 3px rgba(255,255,255,.9), 0 0 0 5px rgba(91,124,240,.55)",
      },
      transitionDuration: {
        instant: "0ms",
        fast: "150ms",
        normal: "300ms",
        slow: "500ms",
        slower: "700ms",
      },
      transitionTimingFunction: {
        "ease-out": "cubic-bezier(0.16, 1, 0.3, 1)",
        "ease-in": "cubic-bezier(0.4, 0, 1, 1)",
        "ease-in-out": "cubic-bezier(0.4, 0, 0.2, 1)",
        "out-expo": "cubic-bezier(0.16, 1, 0.3, 1)",
        "out-quad": "cubic-bezier(0.25, 0.46, 0.45, 0.94)",
        "out-bounce": "cubic-bezier(0.34, 1.56, 0.64, 1)",
      },
      zIndex: {
        hide: "-1",
        base: "0",
        docked: "10",
        dropdown: "100",
        sticky: "110",
        fixed: "120",
        "modal-backdrop": "130",
        modal: "140",
        popover: "150",
        toast: "160",
        tooltip: "170",
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
