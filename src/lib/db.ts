import Dexie, { liveQuery, type Table } from 'dexie';
import { useEffect, useState } from 'preact/hooks';
import type { Category, Project, Recipe, Settings, Task } from './types';
import type { CategorySeed } from './palette';

export class PlaneraDB extends Dexie {
  projects!: Table<Project, string>;
  tasks!: Table<Task, string>;
  categories!: Table<Category, string>;
  recipes!: Table<Recipe, string>;
  settings!: Table<Settings, string>;

  constructor(name = 'planeraren') {
    super(name);
    // Version 1. Nya versioner läggs till som this.version(2).stores(...).upgrade(...) – data migreras och bevaras.
    this.version(1).stores({
      projects: 'id, archivedAt, deadline',
      tasks: 'id, projectId, categoryId, recipeId',
      categories: 'id, order, archivedAt',
      recipes: 'id, title, updatedAt',
      settings: 'id'
    });
  }
}

export const db = new PlaneraDB();

export const uid = () =>
  (crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36));

export const DEFAULT_SETTINGS: Settings = {
  id: 'settings',
  onboarded: false,
  theme: 'light',
  notificationsEnabled: false,
  remindMin: 15,
  calendarAlarmMin: 15,
  lastBackupAt: null
};

export async function getSettings(): Promise<Settings> {
  return { ...DEFAULT_SETTINGS, ...((await db.settings.get('settings')) || {}) };
}

export async function updateSettings(patch: Partial<Settings>) {
  const cur = await getSettings();
  await db.settings.put({ ...cur, ...patch, id: 'settings' });
}

export async function addCategories(seeds: CategorySeed[]) {
  const existing = await db.categories.toArray();
  let order = existing.reduce((m, c) => Math.max(m, c.order), -1) + 1;
  const names = new Set(existing.filter((c) => !c.archivedAt).map((c) => c.name.toLowerCase()));
  const add = seeds
    .filter((s) => {
      const k = s.name.toLowerCase();
      if (names.has(k)) return false;
      names.add(k);
      return true;
    })
    .map((s) => ({ id: uid(), name: s.name, color: s.color, icon: s.icon, order: order++, archivedAt: null }));
  await db.categories.bulkAdd(add);
  return add.length;
}

/** Live-uppdaterad Dexie-fråga som Preact-hook. */
export function useLive<T>(query: () => Promise<T> | T, deps: unknown[] = []): T | undefined {
  const [value, setValue] = useState<T | undefined>(undefined);
  useEffect(() => {
    const sub = liveQuery(query).subscribe({ next: (v) => setValue(() => v), error: (e) => console.error(e) });
    return () => sub.unsubscribe();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
  return value;
}

export async function requestPersistence() {
  try {
    if (navigator.storage?.persist && !(await navigator.storage.persisted())) await navigator.storage.persist();
  } catch {
    /* ignoreras */
  }
}
