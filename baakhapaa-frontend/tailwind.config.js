module.exports = {
  content: ["./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        // Deep cool slate background & surfaces
        bg: "#0B0F19",
        bgDeep: "#070A10",
        surface: "#141A29",
        elevated: "#1E2538",
        border: "rgba(148, 163, 184, 0.12)",
        borderSoft: "rgba(148, 163, 184, 0.06)",

        // Indigo accent mappings (aliased to legacy gold names for compatibility)
        gold: "#6366F1",
        goldBright: "#818CF8",
        goldHover: "#4338CA",
        goldDim: "rgba(99, 102, 241, 0.12)",

        // Accent tokens
        accent: "#4F46E5",
        accentLight: "#6366F1",
        accentDim: "rgba(79, 70, 229, 0.12)",
        skyAccent: "#38BDF8",
        skyDim: "rgba(56, 189, 248, 0.12)",

        // Cool text ramp
        ink: "#F8FAFC",
        inkSoft: "#E2E8F0",
        inkMuted: "#94A3B8",
      },
      fontFamily: {
        display: ['Fraunces', 'Georgia', 'serif'],
        sans: ['Inter', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"Courier New"', 'Courier', 'monospace'],
      },
      letterSpacing: {
        brand: '0.28em',
      },
      boxShadow: {
        card: '0 1px 0 rgba(255,255,255,0.03) inset, 0 20px 40px -24px rgba(0,0,0,0.9)',
        gold: '0 0 0 1px rgba(99, 102, 241, 0.4), 0 18px 40px -18px rgba(99, 102, 241, 0.35)',
        glow: '0 0 60px -12px rgba(99, 102, 241, 0.25)',
      },
      backgroundImage: {
        'gold-sheen': 'linear-gradient(135deg, #818CF8 0%, #6366F1 45%, #4F46E5 100%)',
        'vignette': 'radial-gradient(120% 120% at 50% 0%, rgba(99, 102, 241, 0.05) 0%, rgba(11, 15, 25, 0) 55%)',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(12px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
      },
      animation: {
        'fade-up': 'fade-up 0.5s cubic-bezier(0.16,1,0.3,1) both',
      },
    },
  },
  plugins: [],
};
