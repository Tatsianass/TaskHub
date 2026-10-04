/**
 * TaskHub's four "Aurora Glass" themes: a dark aurora palette, a light warm-bokeh palette,
 * a cool-white "coral" palette taken from the app icon and a dark "emerald" palette.
 * All share the same glassmorphism structure (blurred background blobs + frosted panels).
 */

import '@/global.css';

import { Platform } from 'react-native';

const dark = {
  scheme: 'dark',
  text: '#F4F2FA',
  background: '#14121F',
  backgroundElement: 'rgba(255,255,255,0.08)',
  backgroundSelected: 'rgba(255,255,255,0.16)',
  textSecondary: 'rgba(244,242,250,0.6)',
  border: 'rgba(255,255,255,0.16)',
  primary: '#B69CFF',
  danger: '#E9A5A5',
  cardText: '#2A2E36',
  glassBg: 'rgba(255,255,255,0.08)',
  glassBgStrong: 'rgba(255,255,255,0.12)',
  glassBorder: 'rgba(255,255,255,0.18)',
  gradientStart: '#7A6AF0',
  gradientEnd: '#B15CD9',
  blobs: ['#6F5CD9', '#2FB8B0', '#D95C9C', '#4C7CE0'],
} as const;

const light = {
  scheme: 'light',
  text: '#35271F',
  background: '#FBF3EA',
  backgroundElement: 'rgba(255,255,255,0.55)',
  backgroundSelected: 'rgba(255,255,255,0.75)',
  textSecondary: 'rgba(53,39,31,0.6)',
  border: 'rgba(53,39,31,0.15)',
  primary: '#C1583A',
  danger: '#B5502E',
  cardText: '#2A2E36',
  glassBg: 'rgba(255,255,255,0.55)',
  glassBgStrong: 'rgba(255,255,255,0.65)',
  glassBorder: 'rgba(255,255,255,0.7)',
  gradientStart: '#E8735A',
  gradientEnd: '#EE8FA6',
  blobs: ['#F3A56B', '#EE8FA6', '#F6CE7A', '#E8735A'],
} as const;

const coral = {
  scheme: 'light',
  text: '#2B1F2A',
  background: '#F6F6FA',
  backgroundElement: 'rgba(255,255,255,0.55)',
  backgroundSelected: 'rgba(255,255,255,0.8)',
  textSecondary: 'rgba(43,31,42,0.62)',
  border: 'rgba(43,31,42,0.15)',
  primary: '#D9244F',
  danger: '#B5233F',
  cardText: '#2A2E36',
  glassBg: 'rgba(255,255,255,0.62)',
  glassBgStrong: 'rgba(255,255,255,0.75)',
  glassBorder: 'rgba(255,255,255,0.85)',
  gradientStart: '#FF9A62',
  gradientEnd: '#FF375F',
  blobs: ['#FF9A62', '#FF375F', '#FFC2A0', '#FF7A8A'],
} as const;

const emerald = {
  scheme: 'dark',
  text: '#E8F5F0',
  background: '#0A1512',
  backgroundElement: 'rgba(255,255,255,0.08)',
  backgroundSelected: 'rgba(255,255,255,0.16)',
  textSecondary: 'rgba(232,245,240,0.6)',
  border: 'rgba(255,255,255,0.16)',
  primary: '#3DDBA4',
  danger: '#F0A0A0',
  cardText: '#2A2E36',
  glassBg: 'rgba(255,255,255,0.08)',
  glassBgStrong: 'rgba(255,255,255,0.12)',
  glassBorder: 'rgba(255,255,255,0.18)',
  gradientStart: '#12A67A',
  gradientEnd: '#2FD6C4',
  blobs: ['#0F8F6B', '#1FB5A8', '#2A6F5C', '#0B5D4B'],
} as const;

export const Colors = { light, dark, coral, emerald } as const;

export type ThemeColor =
  | 'text'
  | 'background'
  | 'backgroundElement'
  | 'backgroundSelected'
  | 'textSecondary'
  | 'border'
  | 'primary'
  | 'danger'
  | 'cardText'
  | 'glassBg'
  | 'glassBgStrong'
  | 'glassBorder';
export type ThemeMode = keyof typeof Colors;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
