import type { Config } from 'tailwindcss';
export default {
  content: ['./app/**/*.{ts,tsx}', './components/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        ink: '#26282b',      // gris oscuro (base de confianza)
        lime: '#d1f069',     // verde lima (acento de energía)
        muted: '#7b7f86',
        line: '#e7e8ea',
        cream: '#f4f4f2',
      },
      fontFamily: { sans: ['Hanken Grotesk','system-ui','sans-serif'] },
    },
  },
  plugins: [],
} satisfies Config;
