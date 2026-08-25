module.exports = {
  content: ["./src/**/*.{js,jsx}"],
  theme: {
    extend: {
      colors: {
        // Warm near-black background & surfaces (Baakhapaa turn-2 system)
        bg: "#0B0B0A",
        bgDeep: "#080807",
        surface: "#141311",
        elevated: "#191813",
        border: "rgba(255, 255, 255, 0.08)",
        borderSoft: "rgba(255, 255, 255, 0.05)",

        // True gold accent (token names unchanged — no component edits needed)
        gold: "#D4A843",
        goldBright: "#E4BE64",
        goldHover: "#C79A35",
        goldDim: "rgba(212, 168, 67, 0.10)",

        // Accent tokens now map to the same gold system
        accent: "#D4A843",
        accentLight: "#E4BE64",
        accentDim: "rgba(212, 168, 67, 0.10)",
        skyAccent: "#D4A843",
        skyDim: "rgba(212, 168, 67, 0.10)",

        // Warm text ramp
        ink: "#EDEAE3",
        inkSoft: "#9B968A",
        inkMuted: "#7E7A6F",
      },
      fontFamily: {
        // Spectral has no Devanagari. Without Mukta next in the stack a Nepali
        // heading falls through to whatever the OS happens to provide, so the
        // display face changes with the machine. Mukta covers both scripts.
        display: ['Spectral', 'Mukta', 'Georgia', 'serif'],
        sans: ['Mukta', 'ui-sans-serif', 'system-ui', 'sans-serif'],
        mono: ['"Courier Prime"', '"Courier New"', 'Courier', 'monospace'],
      },
      letterSpacing: {
        brand: '0.22em',
      },
      boxShadow: {
        // Flat system: no glows. Kept as near-invisible values so existing
        // shadow-card / shadow-gold / shadow-glow usages render calmly.
        card: '0 1px 0 rgba(255,255,255,0.03) inset',
        gold: '0 0 0 1px rgba(212, 168, 67, 0.4)',
        glow: 'none',
      },
      backgroundImage: {
        // Gradients retired — solid gold. Names kept for compatibility.
        'gold-sheen': 'linear-gradient(135deg, #D4A843 0%, #D4A843 100%)',
        'vignette': 'none',
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
