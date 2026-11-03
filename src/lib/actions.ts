import { db, uid, updateSettings, getSettings } from './db';
import type { Category, Offset, Project, Recipe, Task } from './types';
import { showSnack, toast } from './ui';
import { guessCategory, stepTitle } from './recipe';
import { scaleIngredient } from './ingredients';
import { moveOffsetToDay, taskStart } from './time';

/* ---------- projekt ---------- */

export async function createProject(name: string, deadline: string, emoji: string, templateId?: string | null): Promise<string> {
  const now = Date.now();
  const p: Project = { id: uid(), name, deadline, emoji, archivedAt: null, templateOf: templateId || null, createdAt: now, updatedAt: now };
  await db.transaction('rw', db.projects, db.tasks, async () => {
    await db.projects.add(p);
    if (templateId) {
      const src = await db.tasks.where('projectId').equals(templateId).toArray();
      await db.tasks.bulkAdd(
        src.map((t) => ({ ...t, id: uid(), projectId: p.id, doneAt: null, timerEndsAt: null, createdAt: now, checklist: t.checklist.map((c) => ({ ...c, checked: false })) }))
      );
    }
  });
  return p.id;
}

export async function updateProject(id: string, patch: Partial<Project>) {
  await db.projects.update(id, { ...patch, updatedAt: Date.now() });
}

export async function setArchived(id: string, archived: boolean) {
  await updateProject(id, { archivedAt: archived ? Date.now() : null });
  if (archived) showSnack('Projektet arkiverat', { label: 'Ångra', run: () => setArchived(id, false) });
}

export async function deleteProject(id: string) {
  const p = await db.projects.get(id);
  if (!p) return;
  const tasks = await db.tasks.where('projectId').equals(id).toArray();
  await db.transaction('rw', db.projects, db.tasks, async () => {
    await db.tasks.bulkDelete(tasks.map((t) => t.id));
    await db.projects.delete(id);
  });
  showSnack(`"${p.name}" togs bort`, {
    label: 'Ångra',
    run: async () => {
      await db.transaction('rw', db.projects, db.tasks, async () => {
        await db.projects.put(p);
        await db.tasks.bulkPut(tasks);
      });
    }
  });
}

/* ---------- moment ---------- */

export function newTask(projectId: string, categoryId: string, offset: Offset, title = ''): Task {
  return { id: uid(), projectId, title, categoryId, offset, durationMin: null, sortKey: Date.now(), notes: '', checklist: [], timerMin: null, timerEndsAt: null, remind: false, doneAt: null, recipeId: null, createdAt: Date.now() };
}

export async function saveTask(t: Task) {
  await db.tasks.put(t);
}

export async function toggleDone(t: Task) {
  const doneAt = t.doneAt ? null : Date.now();
  await db.tasks.update(t.id, { doneAt, timerEndsAt: doneAt ? null : t.timerEndsAt });
  showSnack(doneAt ? `✓ "${t.title}" klar` : `"${t.title}" ej klar`, {
    label: 'Ångra',
    run: () => db.tasks.update(t.id, { doneAt: t.doneAt ?? null, timerEndsAt: t.timerEndsAt ?? null })
  });
}

export async function deleteTask(t: Task) {
  await db.tasks.delete(t.id);
  showSnack('Momentet togs bort', { label: 'Ångra', run: () => db.tasks.put(t) });
}

export async function moveTaskToDay(t: Task, deadline: string, day: Date) {
  const offset = moveOffsetToDay(deadline, t.offset, day);
  const before = t.offset;
  await db.tasks.update(t.id, { offset, sortKey: Date.now() });
  showSnack(`"${t.title}" flyttad`, { label: 'Ångra', run: () => db.tasks.update(t.id, { offset: before }) });
}

export async function startTimer(t: Task, minutes: number) {
  await db.tasks.update(t.id, { timerMin: minutes, timerEndsAt: Date.now() + minutes * 60000 });
}

export async function stopTimer(t: Task) {
  await db.tasks.update(t.id, { timerEndsAt: null });
}

/* ---------- kategorier ---------- */

export async function saveCategory(c: Category) {
  await db.categories.put(c);
}

export async function createCategory(name: string, color: Category['color'], icon: string): Promise<string> {
  const all = await db.categories.toArray();
  const c: Category = { id: uid(), name, color, icon, order: all.reduce((m, x) => Math.max(m, x.order), -1) + 1, archivedAt: null };
  await db.categories.add(c);
  return c.id;
}

export async function archiveCategory(c: Category) {
  await db.categories.update(c.id, { archivedAt: Date.now() });
  showSnack(`"${c.name}" arkiverad med alla moment`, { label: 'Ångra', run: () => db.categories.update(c.id, { archivedAt: null }) });
}

export async function restoreCategory(c: Category) {
  await db.categories.update(c.id, { archivedAt: null });
  toast(`"${c.name}" återställd`);
}

export async function deleteCategoryWithTasks(c: Category) {
  const tasks = await db.tasks.where('categoryId').equals(c.id).toArray();
  await db.transaction('rw', db.categories, db.tasks, async () => {
    await db.tasks.bulkDelete(tasks.map((t) => t.id));
    await db.categories.delete(c.id);
  });
  showSnack(`"${c.name}" och ${tasks.length} moment raderade`, {
    label: 'Ångra',
    run: () =>
      db.transaction('rw', db.categories, db.tasks, async () => {
        await db.categories.put(c);
        await db.tasks.bulkPut(tasks);
      })
  });
}

/** Kopierar en arkiverad kategoris moment in i ett projekt; tiderna räknas från projektets klar-tid. Kategorin återställs. */
export async function copyArchivedIntoProject(c: Category, projectId: string) {
  const tasks = await db.tasks.where('categoryId').equals(c.id).toArray();
  const seen = new Set<string>();
  const unique = tasks.filter((t) => {
    const k = t.title.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  const now = Date.now();
  await db.transaction('rw', db.categories, db.tasks, async () => {
    await db.categories.update(c.id, { archivedAt: null });
    await db.tasks.bulkAdd(unique.map((t, i) => ({ ...t, id: uid(), projectId, doneAt: null, timerEndsAt: null, createdAt: now, sortKey: now + i, checklist: t.checklist.map((x) => ({ ...x, checked: false })) })));
  });
  toast(`${unique.length} moment inlagda`);
}

/* ---------- recept ---------- */

export async function saveRecipe(r: Recipe) {
  await db.recipes.put({ ...r, updatedAt: Date.now() });
}

export async function deleteRecipe(r: Recipe) {
  await db.recipes.delete(r.id);
  showSnack('Receptet togs bort', { label: 'Ångra', run: () => db.recipes.put(r) });
}

/** Ingredienslistan (skalad) som text för ett moments anteckning. */
function ingredientNotes(recipe: Recipe, factor: number): string {
  if (!recipe.ingredients.length) return '';
  const amount = recipe.servings ? Math.round(recipe.servings.amount * factor * 100) / 100 : null;
  const head = `Ingredienser – ${recipe.title}${amount && recipe.servings ? ` (${String(amount).replace('.', ',')} ${recipe.servings.unit})` : ''}:`;
  return [head, ...recipe.ingredients.map((i) => `• ${scaleIngredient(i, factor).text}`)].join('\n');
}

/**
 * Lägger ett recept som ETT moment: stegen blir delmoment (checklista) att bocka av och ingredienserna
 * hamnar i anteckningen. Med `taskId` läggs stegen till i ett befintligt moment.
 */
export async function planRecipeAsTask(
  recipe: Recipe,
  projectId: string,
  opts: { taskId?: string | null; title: string; categoryId: string; factor: number; steps: string[] }
): Promise<string> {
  const items = opts.steps.map((text) => ({ text, checked: false }));
  const notes = ingredientNotes(recipe, opts.factor);
  const existing = opts.taskId ? await db.tasks.get(opts.taskId) : undefined;
  if (existing) {
    await db.tasks.update(existing.id, {
      checklist: [...existing.checklist, ...items],
      notes: [existing.notes?.trim(), notes].filter(Boolean).join('\n\n'),
      recipeId: existing.recipeId || recipe.id,
      doneAt: null
    });
    return existing.id;
  }
  const t: Task = {
    ...newTask(projectId, opts.categoryId, { kind: 'dayAt', days: 1, time: '10:00' }, opts.title),
    checklist: items,
    notes,
    recipeId: recipe.id
  };
  await db.tasks.add(t);
  return t.id;
}

/**
 * Gör receptsteg till egna moment. Förslagstider: stegen läggs i ordning med 1 h mellanrum
 * och sista steget 1 h före klar-tiden – justeras sedan i tidslinjen.
 */
export async function planRecipe(recipe: Recipe, projectId: string, steps: { text: string; categoryId: string }[], factor: number) {
  const cats = await db.categories.toArray();
  const fallback = cats.find((c) => !c.archivedAt)?.id ?? '';
  const ingredients = recipe.ingredients.map((i) => scaleIngredient(i, factor).text);
  const n = steps.length;
  const now = Date.now();
  const tasks: Task[] = steps.map((s, k) => {
    const text = s.text;
    const mentioned = recipe.ingredients
      .map((ing, j) => ({ ing, j }))
      .filter(({ ing }) => ing.name && ing.name.length > 2 && text.toLowerCase().includes(ing.name.toLowerCase().split(/[ ,]/)[0]))
      .map(({ j }) => ({ text: ingredients[j], checked: false }));
    return {
      ...newTask(projectId, s.categoryId || guessCategory(text, cats, fallback), { kind: 'before', minutes: (n - k) * 60 }, stepTitle(text)),
      notes: text,
      checklist: k === 0 && !mentioned.length ? ingredients.map((x) => ({ text: x, checked: false })) : mentioned,
      recipeId: recipe.id,
      sortKey: now + k
    };
  });
  await db.tasks.bulkAdd(tasks);
  return tasks.length;
}

/* ---------- säkerhetskopia ---------- */

export interface Backup {
  app: 'planeraren';
  version: 1;
  exportedAt: string;
  projects: Project[];
  tasks: Task[];
  categories: Category[];
  recipes: Recipe[];
  settings: unknown;
}

export async function exportBackup(): Promise<Backup> {
  const [projects, tasks, categories, recipes, settings] = await Promise.all([
    db.projects.toArray(),
    db.tasks.toArray(),
    db.categories.toArray(),
    db.recipes.toArray(),
    getSettings()
  ]);
  await updateSettings({ lastBackupAt: Date.now() });
  return { app: 'planeraren', version: 1, exportedAt: new Date().toISOString(), projects, tasks, categories, recipes, settings };
}

export async function importBackup(b: Backup) {
  if (b?.app !== 'planeraren' || !Array.isArray(b.projects)) throw new Error('Filen är ingen säkerhetskopia från Planeraren.');
  await db.transaction('rw', [db.projects, db.tasks, db.categories, db.recipes, db.settings], async () => {
    await Promise.all([db.projects.clear(), db.tasks.clear(), db.categories.clear(), db.recipes.clear()]);
    await db.projects.bulkAdd(b.projects);
    await db.tasks.bulkAdd(b.tasks || []);
    await db.categories.bulkAdd(b.categories || []);
    await db.recipes.bulkAdd(b.recipes || []);
    if (b.settings && typeof b.settings === 'object') await db.settings.put({ ...(b.settings as object), id: 'settings', onboarded: true } as never);
  });
}

/* ---------- hjälp ---------- */

export function sortTasks(tasks: Task[], deadline: string) {
  return tasks
    .map((t) => ({ t, start: taskStart(deadline, t.offset) }))
    .sort((a, b) => a.start.getTime() - b.start.getTime() || a.t.sortKey - b.t.sortKey);
}
