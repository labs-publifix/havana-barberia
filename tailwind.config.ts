import type { Config } from 'tailwindcss'
import tokens from './docs/design/havana-tokens-v2.json'

const c = tokens.color
const v = (name: string) => `var(--${name})`

// Raw palette comes from the tokens JSON; semantic colors point at the CSS
// variables so light/dark themes switch without touching components.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    screens: { sm: '480px', md: '768px', lg: '1024px', xl: '1280px' },
    extend: {
      colors: {
        ink: c.ink,
        gray: c.gray,
        aqua: c.aqua,
        red: c.red,
        success: c.success,
        warning: c.warning,
        info: c.info,
        page: v('sem-bg-page'),
        surface: v('sem-bg-surface'),
        raised: v('sem-bg-raised'),
        inverse: v('sem-bg-inverse'),
        line: { DEFAULT: v('sem-border-subtle'), strong: v('sem-border-strong'), inverse: v('sem-border-inverse') },
        fg: {
          DEFAULT: v('sem-text-primary'),
          muted: v('sem-text-secondary'),
          inverse: v('sem-text-inverse'),
          accent: v('sem-text-accent'),
          danger: v('sem-text-danger'),
        },
        primary: { DEFAULT: v('sem-action-primary-bg'), hover: v('sem-action-primary-hover'), fg: v('sem-action-primary-text') },
        accent: { DEFAULT: v('sem-action-accent-bg'), hover: v('sem-action-accent-hover'), fg: v('sem-action-accent-text') },
        danger: { DEFAULT: v('sem-action-danger-bg'), hover: v('sem-action-danger-hover'), fg: v('sem-action-danger-text') },
        selected: { DEFAULT: v('sem-selected-bg'), border: v('sem-selected-border') },
        disabled: { DEFAULT: v('sem-disabled-bg'), fg: v('sem-disabled-text') },
        focus: v('sem-focus-ring'),
      },
      fontFamily: {
        sans: [v('font-body')],
        display: [v('font-display')],
      },
      borderRadius: {
        sm: v('radius-sm'),
        md: v('radius-md'),
        lg: v('radius-lg'),
        xl: v('radius-xl'),
        full: v('radius-full'),
      },
      boxShadow: { sm: v('shadow-sm'), md: v('shadow-md'), lg: v('shadow-lg'), glow: v('shadow-glow') },
      height: { 'btn-sm': v('btn-h-sm'), 'btn-md': v('btn-h-md'), 'btn-lg': v('btn-h-lg'), input: v('input-h') },
      minHeight: { tap: v('tap-min') },
      minWidth: { tap: v('tap-min') },
      maxWidth: { booking: v('container-booking') },
      transitionDuration: { fast: v('motion-fast'), base: v('motion-base'), slow: v('motion-slow') },
      transitionTimingFunction: { brand: v('motion-ease') },
      zIndex: { sticky: '10', dropdown: '20', overlay: '30', modal: '40', toast: '50' },
    },
  },
  plugins: [],
} satisfies Config
