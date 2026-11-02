import { useEffect, useState } from 'preact/hooks';
import { db, useLive } from '../lib/db';
import { ICONS, PALETTE, PALETTE_KEYS } from '../lib/palette';
import { describeOffset, fmtDateTime, formatDuration, parseDuration, parseLocal, taskStart, toLocalInput } from '../lib/time';
import { closeSheet, go, openSheet, sheet, toast } from '../lib/ui';
import {
  archiveCategory,
  copyArchivedIntoProject,
  createCategory,
  createProject,
  deleteCategoryWithTasks,
  deleteProject,
  newTask,
  planRecipe,
  saveCategory,
  saveRecipe,
  saveTask,
  setArchived,
  updateProject
} from '../lib/actions';
import { parseIngredient } from '../lib/ingredients';
import { guessCategory } from '../lib/recipe';
import { Field, Sheet, catStyle } from '../components/common';
import type { Category, Offset, PaletteKey, Task } from '../lib/types';

const EMOJIS = ['🎂', '🧁', '🍰', '🥐', '🍽️', '🎄', '🦞', '🎉', '📦', '🏡', '🌿', '✈️', '🎁', '⭐'];

export function SheetHost() {
  const s = sheet.use();
  if (!s) return null;
  const p = (s.props || {}) as Record<string, any>;
  switch (s.kind) {
    case 'project-form':
      return <ProjectForm id={p.id} />;
    case 'project-menu':
      return <ProjectMenu id={p.id} exportCal={p.exportCal} />;
    case 'task-form':
      return <TaskForm projectId={p.projectId} taskId={p.taskId} />;
    case 'category-form':
      return <CategoryForm id={p.id} />;
    case 'category-delete':
      return <CategoryDelete id={p.id} />;
    case 'recipe-plan':
      return <RecipePlan id={p.id} servings={p.servings} />;
    case 'recipe-form':
      return <RecipeForm id={p.id} />;
    case 'pick-project':
      return <PickProject categoryId={p.categoryId} />;
  }
  return null;
}

/* ---------- projekt ---------- */

function ProjectForm({ id }: { id?: string }) {
  const existing = useLive(async () => (id ? (await db.projects.get(id)) ?? null : null), [id]);
  const templates = useLive(() => db.projects.toArray());
  const def = new Date(Date.now() + 3 * 86400000);
  def.setHours(15, 0, 0, 0);
  const [name, setName] = useState('');
  const [deadline, setDeadline] = useState(toLocalInput(def));
  const [emoji, setEmoji] = useState('🗓️');
  const [tpl, setTpl] = useState('');
  useEffect(() => {
    if (existing) {
      setName(existing.name);
      setDeadline(existing.deadline);
      setEmoji(existing.emoji || '🗓️');
    }
  }, [existing?.id]);
  if (id && existing === undefined) return null;
  const changed = existing && existing.deadline !== deadline;
  const save = async (e: Event) => {
    e.preventDefault();
    if (!name.trim() || !deadline) return;
    if (existing) {
      await updateProject(existing.id, { name: name.trim(), deadline, emoji });
      closeSheet();
      if (changed) toast(`Klar-tid ändrad till ${fmtDateTime(parseLocal(deadline))} – alla moment flyttades med`);
    } else {
      const pid = await createProject(name.trim(), deadline, emoji, tpl || null);
      go(`p/${pid}`);
    }
  };
  return (
    <Sheet title={existing ? 'Redigera projekt' : 'Nytt projekt'}>
      <form onSubmit={save}>
        <Field label="Namn">
          <input required value={name} placeholder="t.ex. Prinsesstårta – Elsas kalas" onInput={(e) => setName((e.target as HTMLInputElement).value)} />
        </Field>
        <Field label="Ska vara klart" hint={existing ? 'Alla moment flyttas med lika mycket.' : 'Alla moment planeras baklänges från den här tiden.'}>
          <input required type="datetime-local" value={deadline} onInput={(e) => setDeadline((e.target as HTMLInputElement).value)} />
        </Field>
        <div class="field">
          <span class="lbl">Symbol</span>
          <div class="emoji-pick">
            {EMOJIS.map((x) => (
              <button type="button" class={emoji === x ? 'on' : ''} aria-pressed={emoji === x} onClick={() => setEmoji(x)}>
                {x}
              </button>
            ))}
          </div>
        </div>
        {!existing && templates && templates.length > 0 && (
          <Field label="Utgå från" hint="Mall: alla moment kopieras oavbockade och räknas från den nya klar-tiden.">
            <select value={tpl} onChange={(e) => setTpl((e.target as HTMLSelectElement).value)}>
              <option value="">Tomt projekt</option>
              {templates.map((t) => (
                <option value={t.id}>Mall: {t.name}</option>
              ))}
            </select>
          </Field>
        )}
        <div class="btn-row">
          <button type="button" class="btn ghost" onClick={closeSheet}>
            Avbryt
          </button>
          <button class="btn primary">{existing ? 'Spara' : 'Skapa'}</button>
        </div>
      </form>
    </Sheet>
  );
}

function ProjectMenu({ id, exportCal }: { id: string; exportCal: () => void }) {
  const p = useLive(() => db.projects.get(id), [id]);
  if (!p) return null;
  return (
    <Sheet title={p.name}>
      <div class="menu">
        <button onClick={() => { closeSheet(); exportCal(); }}>📅 Lägg i kalender</button>
        <button onClick={() => openSheet('project-form', { id })}>✎ Redigera projekt och klar-tid</button>
        <button onClick={() => go('recipes')}>📖 Planera in ett recept</button>
        <button onClick={() => { setArchived(id, !p.archivedAt); go(p.archivedAt ? `p/${id}` : '', true); }}>{p.archivedAt ? '↩ Återställ från arkiv' : '🗄️ Arkivera'}</button>
        <button class="danger-text" onClick={() => { go('', true); deleteProject(id); }}>🗑 Ta bort projekt</button>
      </div>
    </Sheet>
  );
}

/* ---------- moment ---------- */

function TaskForm({ projectId, taskId }: { projectId: string; taskId?: string }) {
  const project = useLive(() => db.projects.get(projectId), [projectId]);
  const existing = useLive(async () => (taskId ? (await db.tasks.get(taskId)) ?? null : null), [taskId]);
  const cats = useLive(() => db.categories.orderBy('order').toArray());
  const [t, setT] = useState<Task | null>(null);
  const [durText, setDurText] = useState('');
  const [listText, setListText] = useState('');
  const [newCat, setNewCat] = useState<{ name: string; color: PaletteKey } | null>(null);

  useEffect(() => {
    if (!cats || existing === undefined || t) return;
    if (existing) {
      setT(existing);
      setDurText(existing.durationMin ? formatDuration(existing.durationMin) : '');
      setListText(existing.checklist.map((c) => c.text).join('\n'));
    } else {
      const first = cats.find((c) => !c.archivedAt);
      setT(newTask(projectId, first?.id ?? '', { kind: 'dayAt', days: 1, time: '10:00' }));
    }
  }, [cats, existing]);

  if (!project || !cats || !t) return null;
  const active = cats.filter((c) => !c.archivedAt || c.id === t.categoryId);
  const set = (patch: Partial<Task>) => setT({ ...t, ...patch });
  const setOffset = (o: Offset) => set({ offset: o });
  const start = taskStart(project.deadline, t.offset);

  const switchKind = (kind: Offset['kind']) => {
    if (kind === t.offset.kind) return;
    const dl = parseLocal(project.deadline);
    if (kind === 'before') setOffset({ kind, minutes: Math.max(0, Math.round((dl.getTime() - start.getTime()) / 60000)) });
    else {
      const days = Math.round((new Date(dl.getFullYear(), dl.getMonth(), dl.getDate()).getTime() - new Date(start.getFullYear(), start.getMonth(), start.getDate()).getTime()) / 86400000);
      setOffset({ kind, days, time: `${String(start.getHours()).padStart(2, '0')}:${String(start.getMinutes()).padStart(2, '0')}` });
    }
  };

  const addCategory = async () => {
    if (!newCat?.name.trim()) return;
    const id = await createCategory(newCat.name.trim(), newCat.color, ICONS[Math.floor(Math.random() * ICONS.length)]);
    set({ categoryId: id });
    setNewCat(null);
  };

  const save = async (e: Event) => {
    e.preventDefault();
    if (!t.title.trim()) return;
    const old = new Map((existing?.checklist || []).map((c) => [c.text, c.checked]));
    const checklist = listText.split('\n').map((x) => x.trim()).filter(Boolean).map((text) => ({ text, checked: !!old.get(text) }));
    await saveTask({ ...t, title: t.title.trim(), durationMin: parseDuration(durText), checklist });
    closeSheet();
    toast(`Moment sparat – ${fmtDateTime(start)}`);
  };

  const beforeH = t.offset.kind === 'before' ? Math.floor(t.offset.minutes / 60) : 0;
  const beforeM = t.offset.kind === 'before' ? t.offset.minutes % 60 : 0;

  return (
    <Sheet title={existing ? 'Redigera moment' : 'Nytt moment'}>
      <form onSubmit={save}>
        <Field label="Vad ska göras?">
          <input required value={t.title} placeholder="t.ex. Baka sockerkaksbottnar" onInput={(e) => set({ title: (e.target as HTMLInputElement).value })} />
        </Field>
        <div class="field">
          <span class="lbl">Kategori</span>
          <div class="cat-pick">
            {active.map((c) => (
              <button type="button" class={`legend-chip ${t.categoryId === c.id ? 'on' : ''}`} style={catStyle(c)} aria-pressed={t.categoryId === c.id} onClick={() => set({ categoryId: c.id })}>
                {c.icon} {c.name}
              </button>
            ))}
            {!newCat && (
              <button type="button" class="legend-chip add" onClick={() => setNewCat({ name: '', color: PALETTE_KEYS[active.length % PALETTE_KEYS.length] })}>
                ＋ Ny
              </button>
            )}
          </div>
          {newCat && (
            <div class="newcat">
              <input placeholder="Namn, t.ex. Packa" value={newCat.name} onInput={(e) => setNewCat({ ...newCat, name: (e.target as HTMLInputElement).value })} />
              <div class="swatches small">
                {PALETTE_KEYS.map((k) => (
                  <button type="button" aria-label={PALETTE[k].name} class={newCat.color === k ? 'on' : ''} style={{ background: PALETTE[k].bg, borderColor: PALETTE[k].edge }} onClick={() => setNewCat({ ...newCat, color: k })} />
                ))}
              </div>
              <div class="btn-row">
                <button type="button" class="btn ghost" onClick={() => setNewCat(null)}>
                  Avbryt
                </button>
                <button type="button" class="btn primary" onClick={addCategory}>
                  Lägg till
                </button>
              </div>
            </div>
          )}
        </div>
        <div class="field">
          <span class="lbl">När</span>
          <div class="seg">
            <button type="button" class={t.offset.kind === 'dayAt' ? 'on' : ''} onClick={() => switchKind('dayAt')}>
              Dagar före + klockslag
            </button>
            <button type="button" class={t.offset.kind === 'before' ? 'on' : ''} onClick={() => switchKind('before')}>
              Tid före klar-tid
            </button>
          </div>
        </div>
        {t.offset.kind === 'dayAt' ? (
          <div class="row2">
            <Field label="Dagar före">
              <input type="number" inputMode="numeric" min={0} value={t.offset.days} onInput={(e) => setOffset({ kind: 'dayAt', days: parseInt((e.target as HTMLInputElement).value || '0', 10), time: (t.offset as { time: string }).time })} />
            </Field>
            <Field label="Klockslag">
              <input type="time" value={t.offset.time} onInput={(e) => setOffset({ kind: 'dayAt', days: (t.offset as { days: number }).days, time: (e.target as HTMLInputElement).value || '00:00' })} />
            </Field>
          </div>
        ) : (
          <div class="row2">
            <Field label="Timmar före">
              <input type="number" inputMode="numeric" min={0} value={beforeH} onInput={(e) => setOffset({ kind: 'before', minutes: parseInt((e.target as HTMLInputElement).value || '0', 10) * 60 + beforeM })} />
            </Field>
            <Field label="Minuter">
              <input type="number" inputMode="numeric" min={0} max={59} value={beforeM} onInput={(e) => setOffset({ kind: 'before', minutes: beforeH * 60 + Math.min(59, parseInt((e.target as HTMLInputElement).value || '0', 10)) })} />
            </Field>
          </div>
        )}
        <div class="alert info">
          → <b>{fmtDateTime(start).replace(/^./, (c) => c.toUpperCase())}</b> ({describeOffset(t.offset)}, klar-tid {fmtDateTime(parseLocal(project.deadline))})
        </div>
        <div class="row2">
          <Field label="Tar ungefär">
            <input value={durText} placeholder="t.ex. 45 min" onInput={(e) => setDurText((e.target as HTMLInputElement).value)} />
          </Field>
          <Field label="Timer (min)">
            <input type="number" inputMode="numeric" min={1} value={t.timerMin ?? ''} placeholder="valfritt" onInput={(e) => set({ timerMin: parseInt((e.target as HTMLInputElement).value, 10) || null })} />
          </Field>
        </div>
        <Field label="Checklista (en per rad)" hint="t.ex. ingredienser eller saker att packa">
          <textarea rows={3} value={listText} onInput={(e) => setListText((e.target as HTMLTextAreaElement).value)} />
        </Field>
        <Field label="Anteckning">
          <textarea rows={2} value={t.notes || ''} onInput={(e) => set({ notes: (e.target as HTMLTextAreaElement).value })} />
        </Field>
        <label class="toggle">
          <span>Påminn mig innan (notis i appen)</span>
          <input type="checkbox" role="switch" checked={t.remind} onChange={(e) => set({ remind: (e.target as HTMLInputElement).checked })} />
        </label>
        <div class="btn-row">
          <button type="button" class="btn ghost" onClick={closeSheet}>
            Avbryt
          </button>
          <button class="btn primary">Spara</button>
        </div>
      </form>
    </Sheet>
  );
}

/* ---------- kategorier ---------- */

function CategoryForm({ id }: { id?: string }) {
  const existing = useLive(async () => (id ? (await db.categories.get(id)) ?? null : null), [id]);
  const count = useLive(() => (id ? db.tasks.where('categoryId').equals(id).count() : 0), [id]);
  const [c, setC] = useState<{ name: string; color: PaletteKey; icon: string } | null>(null);
  useEffect(() => {
    if (existing === undefined || c) return;
    setC(existing ? { name: existing.name, color: existing.color, icon: existing.icon } : { name: '', color: 'aprikos', icon: '⭐' });
  }, [existing]);
  if (!c) return null;
  const save = async (e: Event) => {
    e.preventDefault();
    if (!c.name.trim()) return;
    if (existing) {
      await saveCategory({ ...existing, ...c, name: c.name.trim() });
      toast(count ? `${c.name} uppdaterad – ${count} moment fick ändringen` : `${c.name} uppdaterad`);
    } else {
      await createCategory(c.name.trim(), c.color, c.icon);
      toast(`Kategorin ${c.name} skapad`);
    }
    closeSheet();
  };
  return (
    <Sheet title={existing ? 'Redigera kategori' : 'Ny kategori'}>
      <form onSubmit={save}>
        <div class="cat-row static preview" style={catStyle({ ...c, id: '', order: 0 } as Category)}>
          <span class="task-ico">{c.icon}</span>
          <span class="grow">{c.name || 'Förhandsvisning'}</span>
        </div>
        <Field label="Namn">
          <input required value={c.name} placeholder="t.ex. Packa" onInput={(e) => setC({ ...c, name: (e.target as HTMLInputElement).value })} />
        </Field>
        <div class="field">
          <span class="lbl">Färg</span>
          <div class="swatches">
            {PALETTE_KEYS.map((k) => (
              <button type="button" aria-label={PALETTE[k].name} aria-pressed={c.color === k} class={c.color === k ? 'on' : ''} style={{ background: PALETTE[k].bg, borderColor: PALETTE[k].edge }} onClick={() => setC({ ...c, color: k })} />
            ))}
          </div>
        </div>
        <div class="field">
          <span class="lbl">Ikon</span>
          <div class="emoji-pick">
            {ICONS.map((x) => (
              <button type="button" class={c.icon === x ? 'on' : ''} aria-pressed={c.icon === x} onClick={() => setC({ ...c, icon: x })}>
                {x}
              </button>
            ))}
          </div>
        </div>
        {existing && <p class="hint">Används av {count} moment – ändringen gäller alla.</p>}
        <div class="btn-row">
          {existing ? (
            <button type="button" class="btn ghost danger-text" onClick={() => openSheet('category-delete', { id: existing.id })}>
              Ta bort …
            </button>
          ) : (
            <button type="button" class="btn ghost" onClick={closeSheet}>
              Avbryt
            </button>
          )}
          <button class="btn primary">Spara</button>
        </div>
      </form>
    </Sheet>
  );
}

function CategoryDelete({ id }: { id: string }) {
  const c = useLive(() => db.categories.get(id), [id]);
  const tasks = useLive(() => db.tasks.where('categoryId').equals(id).toArray(), [id]);
  const projects = useLive(() => db.projects.toArray());
  const [choice, setChoice] = useState<'archive' | 'delete'>('archive');
  if (!c || !tasks || !projects) return null;
  const nProj = new Set(tasks.map((t) => t.projectId)).size;
  const run = async () => {
    if (choice === 'archive' && !c.archivedAt) await archiveCategory(c);
    else await deleteCategoryWithTasks(c);
    go('settings', true);
  };
  return (
    <Sheet title={`Ta bort ${c.name}?`}>
      <p class="muted">
        Kategorin har {tasks.length} moment i {nProj} projekt.
      </p>
      {!c.archivedAt && (
        <label class={`choice ${choice === 'archive' ? 'on' : ''}`}>
          <input type="radio" name="del" checked={choice === 'archive'} onChange={() => setChoice('archive')} />
          <span>
            <b>📦 Arkivera</b> – spara kategorin och alla {tasks.length} moment. De försvinner från tidslinjerna men kan återställas eller läggas in i ett nytt projekt senare.
          </span>
        </label>
      )}
      <label class={`choice ${choice === 'delete' || c.archivedAt ? 'on' : ''}`}>
        <input type="radio" name="del" checked={choice === 'delete' || !!c.archivedAt} onChange={() => setChoice('delete')} />
        <span>
          <b>🗑 Radera</b> kategorin och alla {tasks.length} moment.
        </span>
      </label>
      <div class="btn-row">
        <button class="btn ghost" onClick={closeSheet}>
          Avbryt
        </button>
        <button class={`btn ${choice === 'delete' || c.archivedAt ? 'danger' : 'primary'}`} onClick={run}>
          {choice === 'delete' || c.archivedAt ? 'Radera allt' : 'Arkivera'}
        </button>
      </div>
    </Sheet>
  );
}

function PickProject({ categoryId }: { categoryId: string }) {
  const c = useLive(() => db.categories.get(categoryId), [categoryId]);
  const projects = useLive(() => db.projects.toArray());
  if (!c || !projects) return null;
  const active = projects.filter((p) => !p.archivedAt);
  return (
    <Sheet title={`Lägg in ${c.name} i projekt`}>
      <p class="muted small">Momenten kopieras in oavbockade och tiderna räknas från projektets klar-tid. Kategorin återställs.</p>
      <div class="menu">
        {active.map((p) => (
          <button
            onClick={async () => {
              await copyArchivedIntoProject(c, p.id);
              go(`p/${p.id}`);
            }}
          >
            {p.emoji} {p.name}
          </button>
        ))}
        <button onClick={() => openSheet('project-form')}>＋ Nytt projekt först</button>
      </div>
    </Sheet>
  );
}

/* ---------- recept ---------- */

function RecipePlan({ id, servings }: { id: string; servings?: number }) {
  const recipe = useLive(() => db.recipes.get(id), [id]);
  const projects = useLive(() => db.projects.toArray());
  const cats = useLive(() => db.categories.orderBy('order').toArray());
  const [pid, setPid] = useState('');
  const [serv, setServ] = useState<number>(servings || 0);
  const [sel, setSel] = useState<Record<number, string | false>>({});
  useEffect(() => {
    if (!recipe || !cats) return;
    const active = cats.filter((c) => !c.archivedAt);
    const fb = active[0]?.id ?? '';
    const init: Record<number, string> = {};
    recipe.steps.forEach((s, i) => (init[i] = guessCategory(s, active, fb)));
    setSel(init);
    if (!serv) setServ(recipe.servings?.amount || 1);
  }, [recipe?.id, cats?.length]);
  useEffect(() => {
    if (projects && !pid) setPid(projects.filter((p) => !p.archivedAt).sort((a, b) => a.deadline.localeCompare(b.deadline))[0]?.id ?? 'new');
  }, [projects]);
  if (!recipe || !projects || !cats) return null;
  const active = cats.filter((c) => !c.archivedAt);
  const chosen = Object.entries(sel).filter(([, v]) => v !== false).map(([k, v]) => ({ index: +k, categoryId: v as string }));
  const factor = serv / (recipe.servings?.amount || 1);
  const run = async () => {
    let target = pid;
    if (target === 'new') {
      const d = new Date(Date.now() + 2 * 86400000);
      d.setHours(15, 0, 0, 0);
      target = await createProject(recipe.title, toLocalInput(d), '🍽️');
    }
    const n = await planRecipe(recipe, target, chosen, factor);
    go(`p/${target}`);
    toast(`${n} moment från ${recipe.title} – justera tiderna i tidslinjen`);
  };
  return (
    <Sheet title="Planera recept">
      <Field label="Projekt">
        <select value={pid} onChange={(e) => setPid((e.target as HTMLSelectElement).value)}>
          {projects.filter((p) => !p.archivedAt).map((p) => (
            <option value={p.id}>{p.name}</option>
          ))}
          <option value="new">＋ Nytt projekt ({recipe.title}, om 2 dagar)</option>
        </select>
      </Field>
      <Field label={`Portioner (${recipe.servings?.unit ?? 'portioner'})`} hint="Mängderna i momentens checklistor skalas.">
        <input type="number" inputMode="numeric" min={1} value={serv} onInput={(e) => setServ(parseFloat((e.target as HTMLInputElement).value) || 1)} />
      </Field>
      <div class="field">
        <span class="lbl">Steg som blir moment</span>
        {recipe.steps.map((s, i) => {
          const on = sel[i] !== false && sel[i] !== undefined;
          const cat = active.find((c) => c.id === sel[i]);
          return (
            <div class={`plan-step ${on ? '' : 'off'}`} style={catStyle(cat)}>
              <input type="checkbox" aria-label={`Ta med steg ${i + 1}`} checked={on} onChange={() => setSel({ ...sel, [i]: on ? false : active[0]?.id ?? '' })} />
              <div class="grow">
                <div class="small">{s}</div>
                {on && (
                  <select class="mini" value={sel[i] as string} onChange={(e) => setSel({ ...sel, [i]: (e.target as HTMLSelectElement).value })} aria-label="Kategori">
                    {active.map((c) => (
                      <option value={c.id}>
                        {c.icon} {c.name}
                      </option>
                    ))}
                  </select>
                )}
              </div>
            </div>
          );
        })}
      </div>
      <p class="hint">Stegen läggs i ordning med en timme emellan, sista steget en timme före klar-tiden. Flytta dem sedan i tidslinjen.</p>
      <div class="btn-row">
        <button class="btn ghost" onClick={closeSheet}>
          Avbryt
        </button>
        <button class="btn primary" disabled={!chosen.length} onClick={run}>
          Skapa {chosen.length} moment
        </button>
      </div>
    </Sheet>
  );
}

function RecipeForm({ id }: { id: string }) {
  const r = useLive(() => db.recipes.get(id), [id]);
  const [f, setF] = useState<{ title: string; amount: string; unit: string; ing: string; steps: string } | null>(null);
  useEffect(() => {
    if (r && !f) setF({ title: r.title, amount: String(r.servings?.amount ?? ''), unit: r.servings?.unit ?? 'portioner', ing: r.ingredients.map((i) => i.raw).join('\n'), steps: r.steps.join('\n') });
  }, [r]);
  if (!r || !f) return null;
  const save = async (e: Event) => {
    e.preventDefault();
    const amount = parseFloat(f.amount.replace(',', '.'));
    await saveRecipe({
      ...r,
      title: f.title.trim() || r.title,
      servings: amount > 0 ? { amount, unit: f.unit.trim() || 'portioner' } : null,
      ingredients: f.ing.split('\n').map((x) => x.trim()).filter(Boolean).map(parseIngredient),
      steps: f.steps.split('\n').map((x) => x.trim()).filter(Boolean)
    });
    closeSheet();
    toast('Receptet sparat');
  };
  return (
    <Sheet title="Redigera recept">
      <form onSubmit={save}>
        <Field label="Titel">
          <input value={f.title} onInput={(e) => setF({ ...f, title: (e.target as HTMLInputElement).value })} />
        </Field>
        <div class="row2">
          <Field label="Portioner">
            <input type="number" inputMode="decimal" value={f.amount} onInput={(e) => setF({ ...f, amount: (e.target as HTMLInputElement).value })} />
          </Field>
          <Field label="Enhet">
            <input value={f.unit} onInput={(e) => setF({ ...f, unit: (e.target as HTMLInputElement).value })} />
          </Field>
        </div>
        <Field label="Ingredienser (en per rad)">
          <textarea rows={7} value={f.ing} onInput={(e) => setF({ ...f, ing: (e.target as HTMLTextAreaElement).value })} />
        </Field>
        <Field label="Steg (ett per rad)">
          <textarea rows={7} value={f.steps} onInput={(e) => setF({ ...f, steps: (e.target as HTMLTextAreaElement).value })} />
        </Field>
        <div class="btn-row">
          <button type="button" class="btn ghost" onClick={closeSheet}>
            Avbryt
          </button>
          <button class="btn primary">Spara</button>
        </div>
      </form>
    </Sheet>
  );
}
