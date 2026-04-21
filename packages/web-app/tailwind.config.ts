import type { Config } from 'tailwindcss';

const config: Config = {
  presets: [
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    require('@qwen-code/webui/tailwind.preset'),
  ],
  content: [
    './index.html',
    './src/**/*.{ts,tsx}',
    './node_modules/@qwen-code/webui/dist/**/*.js',
  ],
  theme: {
    extend: {
      colors: {
        // Qwen brand colors
        sidebar: '#0f0f0f',
        surface: '#1a1a1a',
        card: '#242424',
        accent: '#4f6bff',
        'accent-hover': '#3a55e8',
      },
      animation: {
        'fade-up': 'fade-up 150ms ease-out both',
        expand: 'expand 200ms ease-out both',
      },
      keyframes: {
        'fade-up': {
          '0%': { opacity: '0', transform: 'translateY(4px)' },
          '100%': { opacity: '1', transform: 'translateY(0)' },
        },
        expand: {
          '0%': { opacity: '0', maxHeight: '0' },
          '100%': { opacity: '1', maxHeight: '2000px' },
        },
      },
    },
  },
  plugins: [],
};

export default config;
