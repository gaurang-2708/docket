/** Luxury tokens: values live as CSS variables in src/index.css. */
const c = (v) => `rgb(var(--${v}) / <alpha-value>)`;
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        obsidian: c('obsidian'), onyx: c('onyx'), graphite: c('graphite'), stone: c('stone'),
        ivory: c('ivory'), pearl: c('pearl'), linen: c('linen'), paper: c('paper'),
        ink: c('ink'), muted: { DEFAULT: c('muted'), dark: c('muted-dark') },
        gold: { DEFAULT: c('gold'), deep: c('gold-deep'), soft: c('gold-soft') },
        danger: { DEFAULT: c('danger'), tint: c('danger-tint') },
        warning: c('warning'), watch: c('watch'), ok: c('ok'),
      },
      fontFamily: {
        serif: ['"Playfair Display"', 'Georgia', 'serif'],
        sans: ['Inter', 'system-ui', 'sans-serif'],
        mono: ['"IBM Plex Mono"', 'ui-monospace', 'monospace'],
      },
      fontSize: { xs: ['12px', '1.45'], sm: ['14px', '1.5'], base: ['15.5px', '1.55'], lg: ['20px', '1.35'], xl: ['25px', '1.2'], '2xl': ['32px', '1.12'], '3xl': ['42px', '1.06'] },
      borderRadius: { DEFAULT: '6px' },
      boxShadow: { soft: '0 1px 2px rgb(var(--obsidian) / .04), 0 12px 32px -16px rgb(var(--obsidian) / .18)' },
    },
  },
};
