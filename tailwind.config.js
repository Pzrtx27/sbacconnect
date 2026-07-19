/** @type {import('tailwindcss').Config} */
export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        sbac: {
          navy: '#0f1d5e',
          'navy-light': '#1a2d7a',
          blue: '#1a3cc8',
          'blue-light': '#2563eb',
          'blue-50': '#eff6ff',
          'blue-100': '#dbeafe',
          red: '#c8102e',
          'red-light': '#e11d48',
          'red-50': '#fff1f2',
        },
        surface: {
          DEFAULT: '#f8fafc',
          card: '#ffffff',
          dark: '#0a1628',
          'dark-card': 'rgba(255,255,255,0.06)',
        },
        ink: {
          DEFAULT: '#0f172a',
          secondary: '#334155',
          muted: '#64748b',
          light: '#94a3b8',
          inverse: '#ffffff',
        },
        border: {
          DEFAULT: '#e2e8f0',
          light: '#f1f5f9',
          glass: 'rgba(255,255,255,0.12)',
        },
        success: '#10b981',
        warning: '#f59e0b',
        danger: '#ef4444',
      },
      fontFamily: {
        sans: ['Sarabun', 'IBM Plex Sans Thai', 'system-ui', 'sans-serif'],
        display: ['Sarabun', 'sans-serif'],
      },
      borderRadius: {
        '2xl': '16px',
        '3xl': '24px',
        '4xl': '32px',
      },
      boxShadow: {
        'glass': '0 8px 32px rgba(15, 29, 94, 0.08)',
        'glass-lg': '0 16px 48px rgba(15, 29, 94, 0.12)',
        'card': '0 4px 18px rgba(15, 29, 94, 0.05)',
        'card-hover': '0 12px 30px rgba(15, 29, 94, 0.12)',
        'nav': '0 -4px 20px rgba(0, 0, 0, 0.06)',
        'button': '0 4px 14px rgba(26, 60, 200, 0.25)',
        'button-hover': '0 6px 18px rgba(26, 60, 200, 0.35)',
        'glow-blue': '0 0 20px rgba(26, 60, 200, 0.3)',
        'glow-red': '0 0 20px rgba(200, 16, 46, 0.3)',
      },
      backgroundImage: {
        'sbac-gradient': 'linear-gradient(135deg, #0f1d5e 0%, #1a3cc8 50%, #c8102e 100%)',
        'sbac-gradient-soft': 'linear-gradient(135deg, #0f1d5e 0%, #1a3cc8 100%)',
        'glass-gradient': 'linear-gradient(135deg, rgba(255,255,255,0.1) 0%, rgba(255,255,255,0.05) 100%)',
        'dark-gradient': 'linear-gradient(145deg, #050d1a 0%, #0a1628 50%, #050d1a 100%)',
      },
      animation: {
        'float': 'float 6s ease-in-out infinite',
        'pulse-slow': 'pulse 3s ease-in-out infinite',
        'slide-up': 'slideUp 0.5s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'slide-down': 'slideDown 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards',
        'fade-in': 'fadeIn 0.4s ease-out forwards',
        'scale-in': 'scaleIn 0.3s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
        'shimmer': 'shimmer 2s linear infinite',
        'bounce-in': 'bounceIn 0.6s cubic-bezier(0.34, 1.56, 0.64, 1) forwards',
      },
      keyframes: {
        float: {
          '0%, 100%': { transform: 'translateY(0px)' },
          '50%': { transform: 'translateY(-20px)' },
        },
        slideUp: {
          from: { transform: 'translateY(30px)', opacity: '0' },
          to: { transform: 'translateY(0)', opacity: '1' },
        },
        slideDown: {
          from: { transform: 'translateY(-10px)', opacity: '0' },
          to: { transform: 'translateY(0)', opacity: '1' },
        },
        fadeIn: {
          from: { opacity: '0' },
          to: { opacity: '1' },
        },
        scaleIn: {
          from: { transform: 'scale(0.9)', opacity: '0' },
          to: { transform: 'scale(1)', opacity: '1' },
        },
        shimmer: {
          '0%': { backgroundPosition: '-200% 0' },
          '100%': { backgroundPosition: '200% 0' },
        },
        bounceIn: {
          '0%': { transform: 'scale(0)', opacity: '0' },
          '50%': { transform: 'scale(1.1)' },
          '100%': { transform: 'scale(1)', opacity: '1' },
        },
      },
    },
  },
  plugins: [],
}
