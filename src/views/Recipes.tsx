import { useEffect, useState } from 'preact/hooks';
import { db, useLive } from '../lib/db';
import { scaleIngredient } from '../lib/ingredients';
import { ImportError, extractUrl, fetchRecipe, parseRecipeText, toRecipe, type ParsedRecipe } from '../lib/recipe';
import { formatDuration, isoDurationToMin } from '../lib/time';
import { go, openSheet, route, toast } from '../lib/ui';
import { deleteRecipe, saveRecipe } from '../lib/actions';
import { Empty, Fab, Header } from '../components/common';
import { StepEditor, cleanSteps } from '../components/StepEditor';
import type { Recipe } from '../lib/types';

function host(u?: string | null) {
  try {
    return u ? new URL(u).hostname.replace(/^www\./, '') : 'Eget recept';
  } catch {
    return 'Eget recept';
  }
}

export function RecipesView() {
  const recipes = useLive(() => db.recipes.toArray());
  const tasks = useLive(() => db.tasks.toArray());
  const [q, setQ] = useState('');
  if (!recipes || !tasks) return null;
  const ql = q.trim().toLowerCase();
  const list = recipes
    .filter((r) => !ql || r.title.toLowerCase().includes(ql) || r.ingredients.some((i) => i.raw.toLowerCase().includes(ql)))
    .sort((a, b) => b.updatedAt - a.updatedAt);
  return (
    <>
      <Header title="Receptbok" sub={`${recipes.length} recept`} />
      <main class="content">
        {recipes.length > 0 && <input class="search" type="search" placeholder="Sök recept eller ingrediens …" value={q} onInput={(e) => setQ((e.target as HTMLInputElement).value)} aria-label="Sök" />}
        {recipes.length === 0 && (
          <Empty icon="📖" text="Inga recept än. Dela en receptsida från Chrome till Planeraren, eller klistra in ett recept.">
            <button class="btn primary" onClick={() => go('import')}>
              ＋ Importera från länk
            </button>
          </Empty>
        )}
        {list.map((r) => {
          const planned = new Set(tasks.filter((t) => t.recipeId === r.id).map((t) => t.projectId)).size;
          return (
            <button class="card recipe-card" onClick={() => go(`r/${r.id}`)}>
              {r.imageUrl ? <img src={r.imageUrl} alt="" loading="lazy" referrerPolicy="no-referrer" /> : <div class="recipe-ph">🍽️</div>}
              <div>
                <h3>{r.title}</h3>
                <div class="muted small">
                  {host(r.sourceUrl)}
                  {r.servings ? ` · ${r.servings.amount} ${r.servings.unit}` : ''}
                  {planned ? ` · planerad ${planned} ${planned === 1 ? 'gång' : 'gånger'}` : ''}
                </div>
              </div>
            </button>
          );
        })}
        {ql && list.length === 0 && <p class="hint">Inga recept matchar "{q}".</p>}
      </main>
      <Fab label="＋ Importera" onClick={() => go('import')} />
    </>
  );
}

export function RecipeView() {
  const r = route.use();
  const id = r.path[1];
  const recipe = useLive(() => db.recipes.get(id).then((x) => x ?? null), [id]);
  const [serv, setServ] = useState<number | null>(null);
  if (recipe === undefined) return null;
  if (!recipe) {
    return (
      <>
        <Header title="Recept saknas" backTo="recipes" />
        <main class="content">
          <Empty icon="🤷" text="Receptet finns inte längre." />
        </main>
      </>
    );
  }
  const base = recipe.servings?.amount || 1;
  const cur = serv ?? base;
  const factor = cur / base;
  const step = base >= 8 ? 2 : 1;
  const time = isoDurationToMin(recipe.totalTime);
  return (
    <>
      <Header
        title={recipe.title}
        sub={`${host(recipe.sourceUrl)}${time ? ` · ca ${formatDuration(time)}` : ''}`}
        backTo="recipes"
        actions={
          <button class="icon-btn" aria-label="Redigera" onClick={() => openSheet('recipe-form', { id: recipe.id })}>
            ✎
          </button>
        }
      />
      <main class="content">
        {recipe.imageUrl ? <img class="hero-img" src={recipe.imageUrl} alt="" referrerPolicy="no-referrer" /> : <div class="hero">🍽️</div>}
        <div class="stepper">
          <button aria-label="Färre" onClick={() => setServ(Math.max(step, cur - step))}>
            −
          </button>
          <div class="v">
            <b>{Math.round(cur * 100) / 100}</b>
            <span>
              {recipe.servings?.unit ?? 'portioner'} · {factor === 1 ? 'original' : `×${String(Math.round(factor * 100) / 100).replace('.', ',')}`}
            </span>
          </div>
          <button aria-label="Fler" onClick={() => setServ(cur + step)}>
            ＋
          </button>
        </div>
        {!recipe.servings && <p class="hint">Receptet saknar antal portioner – skalningen utgår från 1. Ange portioner under ✎.</p>}
        <section class="card ing">
          <h2 class="card-title">Ingredienser</h2>
          {recipe.ingredients.map((i) => {
            const s = scaleIngredient(i, factor);
            return s.scaled ? (
              <div class="ing-row">
                <span>{i.name}</span>
                <span class="q">{s.qtyText}</span>
              </div>
            ) : (
              <div class="ing-row unk">
                <span>{i.raw}</span>
                {factor !== 1 && <span title="Ingen mängd att skala">oförändrad</span>}
              </div>
            );
          })}
        </section>
        <section class="card">
          <h2 class="card-title">Gör så här</h2>
          <ol class="steps">
            {recipe.steps.map((s) => (
              <li>{s}</li>
            ))}
          </ol>
        </section>
        {recipe.sourceUrl && (
          <a class="link-btn" href={recipe.sourceUrl} target="_blank" rel="noopener noreferrer">
            Öppna originalet ({host(recipe.sourceUrl)}) ↗
          </a>
        )}
        <div class="btn-row">
          <button class="btn ghost danger-text" onClick={() => deleteRecipe(recipe).then(() => go('recipes', true))}>
            Ta bort
          </button>
          <button class="btn primary" onClick={() => openSheet('recipe-plan', { id: recipe.id, servings: cur })}>
            Lägg till i projekt
          </button>
        </div>
      </main>
    </>
  );
}

type ImportState = { st: 'idle' } | { st: 'loading' } | { st: 'error'; msg: string } | { st: 'result'; r: ParsedRecipe };

export function ImportView() {
  const r = route.use();
  const shared = r.query.get('url') || '';
  const [url, setUrl] = useState(shared);
  const [text, setText] = useState(r.query.get('text') || '');
  const [state, setState] = useState<ImportState>({ st: 'idle' });
  const [pasteMode, setPasteMode] = useState(r.query.get('mode') === 'paste');
  const projectId = r.query.get('project');
  const taskId = r.query.get('task') || undefined;
  const intoProject = useLive(async () => (projectId ? (await db.projects.get(projectId)) ?? null : null), [projectId]);

  const run = async (u = url) => {
    const link = extractUrl(u) || u.trim();
    if (!/^https?:\/\//i.test(link)) {
      setState({ st: 'error', msg: 'Ange en länk som börjar med https://' });
      return;
    }
    setState({ st: 'loading' });
    try {
      setState({ st: 'result', r: await fetchRecipe(link) });
    } catch (e) {
      const msg =
        e instanceof ImportError && e.kind === 'norecipe'
          ? 'Sidan saknar strukturerad receptdata. Kopiera ingredienser och steg från sidan och klistra in här nedanför.'
          : 'Kunde inte hämta sidan – kontrollera nätet eller klistra in recepttexten istället.';
      setState({ st: 'error', msg });
      setPasteMode(true);
    }
  };

  useEffect(() => {
    if (shared) run(shared);
  }, [shared]);

  const parseText = () => {
    const p = parseRecipeText(text);
    if (!p) {
      setState({ st: 'error', msg: 'Hittade inga ingredienser eller steg i texten.' });
      return;
    }
    if (extractUrl(url)) p.sourceUrl = extractUrl(url);
    setState({ st: 'result', r: p });
  };

  const removeLine = (field: 'ingredients', k: number) => {
    if (state.st !== 'result') return;
    const r = { ...state.r, [field]: (state.r[field] as unknown[]).filter((_, j) => j !== k) } as ParsedRecipe;
    setState({ st: 'result', r });
  };

  const save = async (plan: boolean) => {
    if (state.st !== 'result') return;
    const rec: Recipe = toRecipe({ ...state.r, steps: cleanSteps(state.r.steps) });
    await saveRecipe(rec);
    if (plan && intoProject) {
      go(`p/${intoProject.id}`, true);
      setTimeout(() => openSheet('recipe-plan', { id: rec.id, servings: rec.servings?.amount ?? 1, projectId: intoProject.id, taskId }), 50);
      return;
    }
    go(`r/${rec.id}`, true);
    if (plan) setTimeout(() => openSheet('recipe-plan', { id: rec.id, servings: rec.servings?.amount ?? 1 }), 50);
    else toast('📖 Sparat i receptboken');
  };

  return (
    <>
      <Header title="Importera recept" sub={intoProject ? `Till ${intoProject.name}` : undefined} backTo={intoProject ? `p/${intoProject.id}` : 'recipes'} />
      <main class="content">
        {state.st !== 'result' && (
          <>
            {shared && state.st === 'loading' && <div class="banner">Länk mottagen från Chrome – hämtar receptet …</div>}
            <p class="muted">
              Dela en receptsida från Chrome → <b>Planeraren</b>, eller klistra in länken här.
            </p>
            <label class="field">
              <span class="lbl">Receptlänk</span>
              <input type="url" inputMode="url" placeholder="https://www.ica.se/recept/…" value={url} onInput={(e) => setUrl((e.target as HTMLInputElement).value)} />
            </label>
            <button class="btn primary wide" disabled={state.st === 'loading'} onClick={() => run()}>
              {state.st === 'loading' ? 'Hämtar …' : 'Hämta recept'}
            </button>
            {state.st === 'loading' && <div class="loader" aria-label="Hämtar" />}
            {state.st === 'error' && (
              <div class="alert error" role="alert">
                {state.msg}
              </div>
            )}
            {!pasteMode ? (
              <button class="link-btn" onClick={() => setPasteMode(true)}>
                Har du recepttext? Klistra in istället
              </button>
            ) : (
              <>
                <label class="field">
                  <span class="lbl">Recepttext</span>
                  <textarea rows={9} placeholder={'Prinsesstårta\n12 bitar\nIngredienser\n6 ägg\n3 dl socker\n…\nGör så här\n1. Vispa ägg och socker …'} value={text} onInput={(e) => setText((e.target as HTMLTextAreaElement).value)} />
                </label>
                <button class="btn ghost wide" disabled={!text.trim()} onClick={parseText}>
                  Tolka text
                </button>
              </>
            )}
          </>
        )}
        {state.st === 'result' && (
          <>
            <div class="card">
              <h2 class="card-title">{state.r.title}</h2>
              <div class="muted small">
                {host(state.r.sourceUrl)}
                {state.r.servings ? ` · ${state.r.servings.amount} ${state.r.servings.unit}` : ''} · {state.r.ingredients.length} ingredienser · {state.r.steps.length} steg
              </div>
            </div>
            {!state.r.structured && <p class="hint">Receptet lästes ur texten. Ta bort rader som inte hör till receptet med ✕ och rätta stegen om de delats konstigt.</p>}
            <section class="card ing">
              <h2 class="card-title">Ingredienser</h2>
              {state.r.ingredients.map((i, k) => (
                <div class="ing-row editable">
                  <span>{i.raw}</span>
                  <button class="row-x" aria-label={`Ta bort ${i.raw}`} onClick={() => removeLine('ingredients', k)}>
                    ✕
                  </button>
                </div>
              ))}
            </section>
            <section class="card">
              <h2 class="card-title">Gör så här</h2>
              <StepEditor steps={state.r.steps} onChange={(steps) => setState({ st: 'result', r: { ...state.r, steps } })} />
            </section>
            <div class="btn-row">
              <button class="btn ghost" onClick={() => save(false)}>
                Spara i receptboken
              </button>
              <button class="btn primary" onClick={() => save(true)}>
                {intoProject ? `Spara och lägg i ${intoProject.name}` : 'Spara och planera'}
              </button>
            </div>
            <button class="link-btn" onClick={() => setState({ st: 'idle' })}>
              ← Börja om
            </button>
          </>
        )}
      </main>
    </>
  );
}
