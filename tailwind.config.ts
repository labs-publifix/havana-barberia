import type { Config } from 'tailwindcss'
import tokens from './docs/design/havana-tokens-v2.json'

const c = tokens.color
const v = (name: string) => `var(--${name})`
/** Semantic color that still supports Tailwind opacity modifiers (bg-fg/5). */
const sem = (name: string) => `color-mix(in srgb, var(--${name}) calc(<alpha-value> * 100%), transparent)`

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
        page: sem('sem-bg-page'),
        surface: sem('sem-bg-surface'),
        raised: sem('sem-bg-raised'),
        inverse: sem('sem-bg-inverse'),
        line: {
          DEFAULT: sem('sem-border-subtle'),
          strong: sem('sem-border-strong'),
          inverse: sem('sem-border-inverse'),
        },
        fg: {
          DEFAULT: sem('sem-text-primary'),
          muted: sem('sem-text-secondary'),
          inverse: sem('sem-text-inverse'),
          accent: sem('sem-text-accent'),
          danger: sem('sem-text-danger'),
        },
        primary: {
          DEFAULT: sem('sem-action-primary-bg'),
          hover: sem('sem-action-primary-hover'),
          fg: sem('sem-action-primary-text'),
        },
        accent: {
          DEFAULT: sem('sem-action-accent-bg'),
          hover: sem('sem-action-accent-hover'),
          fg: sem('sem-action-accent-text'),
        },
        danger: {
          DEFAULT: sem('sem-action-danger-bg'),
          hover: sem('sem-action-danger-hover'),
          fg: sem('sem-action-danger-text'),
        },
        selected: { DEFAULT: sem('sem-selected-bg'), border: sem('sem-selected-border') },
        disabled: { DEFAULT: sem('sem-disabled-bg'), fg: sem('sem-disabled-text') },
        focus: sem('sem-focus-ring'),
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
      spacing: { tap: v('tap-min') },
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
