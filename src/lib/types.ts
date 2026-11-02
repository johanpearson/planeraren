export type Offset =
  | { kind: 'dayAt'; days: number; time: string } // N dagar före klar-dagen, vid klockslag HH:MM
  | { kind: 'before'; minutes: number }; // minuter före klar-tiden

export interface Project {
  id: string;
  name: string;
  /** Klar-tid, lokal tid 'YYYY-MM-DDTHH:MM' */
  deadline: string;
  emoji?: string;
  archivedAt?: number | null;
  templateOf?: string | null;
  createdAt: number;
  updatedAt: number;
}

export interface ChecklistItem {
  text: string;
  checked?: boolean;
}

export interface Task {
  id: string;
  projectId: string;
  title: string;
  categoryId: string;
  offset: Offset;
  durationMin?: number | null;
  sortKey: number;
  notes?: string;
  checklist: ChecklistItem[];
  timerMin?: number | null;
  timerEndsAt?: number | null;
  remind: boolean;
  doneAt?: number | null;
  recipeId?: string | null;
  createdAt: number;
}

export type PaletteKey =
  | 'mint' | 'citron' | 'aprikos' | 'himmel' | 'lavendel' | 'hallon' | 'mandel' | 'rosa' | 'is' | 'gra';

export interface Category {
  id: string;
  name: string;
  color: PaletteKey;
  icon: string;
  order: number;
  archivedAt?: number | null;
}

export interface Ingredient {
  raw: string;
  qty?: number;
  qtyMax?: number;
  unit?: string;
  name: string;
}

export interface Recipe {
  id: string;
  title: string;
  sourceUrl?: string | null;
  imageUrl?: string | null;
  servings: { amount: number; unit: string } | null;
  ingredients: Ingredient[];
  steps: string[];
  totalTime?: string | null;
  tags: string[];
  createdAt: number;
  updatedAt: number;
}

export type ThemePref = 'light' | 'dark' | 'system';

export interface Settings {
  id: 'settings';
  onboarded: boolean;
  theme: ThemePref;
  notificationsEnabled: boolean;
  remindMin: number;
  calendarAlarmMin: number;
  lastSeenAppVersion?: string;
  lastBackupAt?: number | null;
}
