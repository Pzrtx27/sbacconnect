/** @type {import('tailwindcss').Config} */

// สีที่ผูกกับ CSS variable จะสลับค่าเองตาม light/dark (ดู :root และ .dark ใน index.css)
// ทำแบบนี้เพื่อให้ contrast ผ่าน WCAG AA ทั้งสองธีมโดยไม่ต้องเขียน ternary isDark ทุกจุด
const v = (name) => `rgb(var(${name}) / <alpha-value>)`;

export default {
  darkMode: 'class',
  content: [
    "./index.html",
    "./src/**/*.{js,ts,jsx,tsx}",
  ],
  theme: {
    extend: {
      colors: {
        /* เฉพาะปลายอ่อนของสเกล slate (50-300) ที่โค้ดใช้เป็น "พื้นผิวรอง" ในโหมดสว่าง
           แปลงเป็นครีมให้เข้าชุดกับ surface ด้านล่าง — แก้ที่นี่ที่เดียว
           ได้ครบทั้ง bg-slate-50 / bg-slate-100 / border-slate-200 ทั้ง 223 จุด
           โดยไม่ต้องไล่แก้ทีละไฟล์ และไม่กระทบโหมดมืดซึ่งใช้ slate-800/900/950 */
        slate: {
          50:  '#f2ece2',
          100: '#e8e0d3',
          200: '#dbd0be',
          300: '#c9bca6',
          400: '#94a3b8',
          500: '#64748b',
          600: '#475569',
          700: '#334155',
          800: '#1e293b',
          900: '#0f172a',
          950: '#020617',
        },

        /* ---- Brand (ค่าคงที่ ใช้เป็นพื้นหลัง/เส้นขอบ) ---- */
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

        /* ---- Semantic text tokens (สลับค่าตามธีมอัตโนมัติ) ----
           ใช้กับ "ตัวอักษร/ไอคอน" เท่านั้น เช่น text-brand, text-accent-amber
           ทุกค่าผ่าน contrast ratio >= 4.5:1 บนพื้นหลังของธีมนั้น ๆ           */
        brand: {
          DEFAULT: v('--c-brand'),        // light #1a3cc8 (6.7:1) / dark #8ab4ff (9.0:1)
          strong: v('--c-brand-strong'),  // หัวข้อ
        },
        accent: {
          amber: v('--c-amber'),          // light #a34a08 (4.7:1) / dark #fbbf24 (11.5:1)
          emerald: v('--c-emerald'),      // light #05664c (5.6:1) / dark #34d399 (10.0:1)
          cyan: v('--c-cyan'),            // light #0d6178 (5.6:1) / dark #22d3ee (11.6:1)
          rose: v('--c-rose'),            // light #be123c (5.0:1) / dark #fb7185 (7.1:1)
          violet: v('--c-violet'),        // light #6d28d9 (5.7:1) / dark #c4b5fd (10.9:1)
        },
        content: {
          DEFAULT: v('--c-text'),         // ตัวอักษรหลัก
          secondary: v('--c-text-2'),     // ตัวอักษรรอง
          muted: v('--c-text-3'),         // คำอธิบาย/แคปชัน (>= 4.5:1 เสมอ)
        },

        /* ---- Surfaces ---- */
        /* โหมดสว่างเดิมเป็นขาวล้วน (#ffffff) บนพื้นหลัง #f8fafc แทบไม่ต่างกัน
           ทั้งจอกลายเป็นแผ่นขาวแผ่นเดียว จ้าตาเมื่อใช้นาน ๆ
           ตอนนี้เป็นโทนครีมอุ่น หม่นลงชัดเจนแต่ยังแยกชั้นการ์ดกับพื้นหลังได้
           ตรวจคอนทราสต์ใหม่ทั้งชุดแล้ว ทุก token ยังผ่าน WCAG AA (ดูตัวเลขใน index.css)
           ตัวที่ตกต้องปรับคือ emerald กับ cyan ซึ่งแก้ไปแล้ว */
        surface: {
          DEFAULT: '#ece5da',   // พื้นหลังหน้า — ครีมอุ่น หม่นพอให้จ้องนาน ๆ ได้
          card: '#f5f0e8',      // การ์ด — สว่างกว่าพื้นหลังชัดเจนแต่ไม่ใช่ขาว
          dark: '#0b0f19',        // ให้ตรงกับ .dark body (เดิม #0a1628 ไม่ตรงกัน)
          'dark-elev': '#141a28', // การ์ดยกระดับในโหมดมืด
          'dark-card': 'rgba(255,255,255,0.06)',
        },
        ink: {
          DEFAULT: '#0f172a',   // 15.6:1 บนการ์ดครีม
          secondary: '#334155', // 10.4:1
          muted: '#556274',     // 5.9:1 (เดิม #64748b = 4.55:1 ตึงเกินไปกับตัวอักษร 10px)
          light: '#5b6675',     // 5.1:1 บนการ์ดครีม (#64748b เดิมเหลือ 4.2:1 = ตก AA)
          inverse: '#ffffff',
        },
        border: {
          DEFAULT: '#ded4c5',   // เส้นขอบโทนเดียวกับครีม ไม่ใช่เทาอมฟ้าที่ตัดกับพื้น
          light: '#e9e1d5',
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
