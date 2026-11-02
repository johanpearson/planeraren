import type { PaletteKey } from './types';

/** Pastellbakgrund + kant i stark ton. Text på raden är alltid mörk (--text) och klarar WCAG AA mot alla bakgrunder. */
export const PALETTE: Record<PaletteKey, { name: string; bg: string; edge: string; bgDark: string }> = {
  mint: { name: 'Mint', bg: '#DDF3E6', edge: '#3FA36F', bgDark: '#1F3A2C' },
  citron: { name: 'Citron', bg: '#FFF2C2', edge: '#D9A80F', bgDark: '#3D3416' },
  aprikos: { name: 'Aprikos', bg: '#FFE2CF', edge: '#EC8446', bgDark: '#45291A' },
  himmel: { name: 'Himmel', bg: '#DCEBFB', edge: '#4C8FD6', bgDark: '#1C2F45' },
  lavendel: { name: 'Lavendel', bg: '#ECE3FA', edge: '#9677D6', bgDark: '#2E2645' },
  hallon: { name: 'Hallon', bg: '#FBDDE4', edge: '#DB5C78', bgDark: '#45202A' },
  mandel: { name: 'Mandel', bg: '#F0E6D8', edge: '#A6825C', bgDark: '#3A2F23' },
  rosa: { name: 'Rosa', bg: '#FCE4F3', edge: '#D86BAE', bgDark: '#442038' },
  is: { name: 'Is', bg: '#DDF4F6', edge: '#3AA5B0', bgDark: '#183A3D' },
  gra: { name: 'Grå', bg: '#ECEAEE', edge: '#8C8592', bgDark: '#2F2D33' }
};

export const PALETTE_KEYS = Object.keys(PALETTE) as PaletteKey[];

export const ICONS = ['🛒', '🔪', '🔥', '❄️', '🥣', '🎂', '📦', '🎉', '🧹', '✉️', '🍽️', '🚚', '🏷️', '🧾', '🌿', '🎁', '📞', '⭐'];

export interface CategorySeed {
  name: string;
  color: PaletteKey;
  icon: string;
}

export const STARTER_SETS: { id: string; label: string; emoji: string; categories: CategorySeed[] }[] = [
  {
    id: 'bake',
    label: 'Bakning & matlagning',
    emoji: '🧁',
    categories: [
      { name: 'Inköp', color: 'mint', icon: '🛒' },
      { name: 'Förberedelse', color: 'citron', icon: '🔪' },
      { name: 'Bakning', color: 'aprikos', icon: '🔥' },
      { name: 'Kylning/vila', color: 'himmel', icon: '❄️' },
      { name: 'Fyllning & kräm', color: 'lavendel', icon: '🥣' },
      { name: 'Montering & dekoration', color: 'hallon', icon: '🎂' }
    ]
  },
  {
    id: 'party',
    label: 'Fest & evenemang',
    emoji: '🎉',
    categories: [
      { name: 'Inbjudan', color: 'rosa', icon: '✉️' },
      { name: 'Inköp', color: 'mint', icon: '🛒' },
      { name: 'Mat', color: 'aprikos', icon: '🍽️' },
      { name: 'Dukning', color: 'lavendel', icon: '🎉' },
      { name: 'Städning', color: 'is', icon: '🧹' }
    ]
  },
  {
    id: 'move',
    label: 'Flytt',
    emoji: '📦',
    categories: [
      { name: 'Sortera', color: 'citron', icon: '🏷️' },
      { name: 'Packa', color: 'mandel', icon: '📦' },
      { name: 'Adressändring', color: 'himmel', icon: '🧾' },
      { name: 'Transport', color: 'aprikos', icon: '🚚' },
      { name: 'Städning', color: 'is', icon: '🧹' }
    ]
  }
];
