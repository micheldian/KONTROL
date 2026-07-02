import type { Config } from 'tailwindcss';

const config: Config = {
  content: ['./src/**/*.{js,ts,jsx,tsx,mdx}'],
  theme: {
    extend: {
      colors: {
        paper: '#F6F4EE',
        ink: '#14241C',
        brand: {
          DEFAULT: '#1F5A38',
          dark: '#16432A'
        },
        amber: '#FFAD0D',
        muted: '#67746C',
        line: '#DDD8CC',
        ok: '#1F8A4C',
        warn: '#C2410C'
      },
      fontFamily: {
        sans: ['var(--font-grotesk)', 'system-ui', 'sans-serif'],
        mono: ['var(--font-jetbrains)', 'monospace']
      },
      borderRadius: {
        card: '14px'
      }
    }
  },
  plugins: []
};
export default config;
