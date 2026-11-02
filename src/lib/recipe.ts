import type { Category, Recipe } from './types';
import { parseIngredient, parseYield } from './ingredients';
import { uid } from './db';

export type ParsedRecipe = Omit<Recipe, 'id' | 'createdAt' | 'updatedAt' | 'tags'>;

const decoder = () => (typeof document !== 'undefined' ? document.createElement('textarea') : null);
function decode(s: string): string {
  const el = decoder();
  if (!el) return s;
  el.innerHTML = s;
  return el.value.replace(/<[^>]+>/g, '').replace(/\s+/g, ' ').trim();
}

function isRecipe(node: any): boolean {
  const t = node?.['@type'];
  return t === 'Recipe' || (Array.isArray(t) && t.includes('Recipe'));
}

function findRecipe(node: any, depth = 0): any {
  if (!node || depth > 6) return null;
  if (Array.isArray(node)) {
    for (const n of node) {
      const r = findRecipe(n, depth + 1);
      if (r) return r;
    }
    return null;
  }
  if (typeof node !== 'object') return null;
  if (isRecipe(node)) return node;
  for (const key of ['@graph', 'mainEntity', 'itemListElement']) {
    const r = findRecipe(node[key], depth + 1);
    if (r) return r;
  }
  return null;
}

function instructions(x: any): string[] {
  if (!x) return [];
  if (typeof x === 'string') {
    return x
      .split(/\n+|(?<=\.)\s+(?=\d+\.\s)/)
      .map((s) => decode(s).replace(/^\d+[.)]\s*/, ''))
      .filter(Boolean);
  }
  if (Array.isArray(x)) return x.flatMap(instructions);
  if (typeof x === 'object') {
    if (x.itemListElement) return instructions(x.itemListElement);
    if (x.text) return [decode(String(x.text))];
    if (x.name) return [decode(String(x.name))];
  }
  return [];
}

function image(x: any): string | null {
  if (!x) return null;
  if (typeof x === 'string') return x;
  if (Array.isArray(x)) return image(x[0]);
  return x.url || x['@id'] || null;
}

/** Läser schema.org/Recipe (JSON-LD) ur en HTML-sida. */
export function parseRecipeHtml(html: string, sourceUrl?: string): ParsedRecipe | null {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const scripts = Array.from(doc.querySelectorAll('script[type="application/ld+json"]'));
  for (const s of scripts) {
    let data: any;
    try {
      data = JSON.parse(s.textContent || '');
    } catch {
      try {
        data = JSON.parse((s.textContent || '').replace(/[\u0000-\u001f]+/g, ' '));
      } catch {
        continue;
      }
    }
    const r = findRecipe(data);
    if (!r) continue;
    const ingredients = (r.recipeIngredient || r.ingredients || []).map((i: unknown) => parseIngredient(decode(String(i))));
    const steps = instructions(r.recipeInstructions);
    if (!ingredients.length && !steps.length) continue;
    return {
      title: decode(String(r.name || doc.title || 'Recept')),
      sourceUrl: sourceUrl || null,
      imageUrl: image(r.image),
      servings: parseYield(r.recipeYield),
      ingredients,
      steps,
      totalTime: r.totalTime || r.cookTime || null
    };
  }
  return null;
}

const ING_HEAD = /^(ingredienser|du behöver|ingredients)\b/i;
const STEP_HEAD = /^(gör så här|instruktioner|tillagning|så här gör du|beskrivning|instructions|method)\b/i;

/** Tolkar inklistrad recepttext. */
export function parseRecipeText(text: string): ParsedRecipe | null {
  const lines = text.split(/\r?\n/).map((l) => l.replace(/^[\s•\-*–]+/, '').trim()).filter(Boolean);
  if (!lines.length) return null;
  let title = '';
  let servings: ParsedRecipe['servings'] = null;
  const ingredients: string[] = [];
  const steps: string[] = [];
  let mode: 'start' | 'ing' | 'step' = 'start';
  for (const line of lines) {
    if (ING_HEAD.test(line)) {
      mode = 'ing';
      const y = parseYield(line.replace(ING_HEAD, ''));
      if (y && !servings) servings = y;
      continue;
    }
    if (STEP_HEAD.test(line)) {
      mode = 'step';
      continue;
    }
    if (!servings && /\b(\d+)\s*(portioner|port|bitar|st|personer)\b/i.test(line) && line.length < 40) {
      servings = parseYield(line);
      if (mode === 'start') continue;
    }
    const numbered = /^\d+[.)]\s+/.test(line);
    const ing = parseIngredient(line);
    if (mode === 'start') {
      if (!title && ing.qty === undefined && !numbered && line.length < 80) {
        title = line;
        continue;
      }
      mode = ing.qty !== undefined && !numbered ? 'ing' : 'step';
    }
    if (mode === 'ing' && numbered) mode = 'step';
    if (mode === 'ing') ingredients.push(line);
    else steps.push(line.replace(/^\d+[.)]\s+/, ''));
  }
  if (!ingredients.length && !steps.length) return null;
  return {
    title: title || 'Inklistrat recept',
    sourceUrl: null,
    imageUrl: null,
    servings,
    ingredients: ingredients.map(parseIngredient),
    steps,
    totalTime: null
  };
}

export const CORS_PROXIES = [
  (u: string) => `https://corsproxy.io/?url=${encodeURIComponent(u)}`,
  (u: string) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`
];

async function fetchText(url: string, ms = 10000): Promise<string> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.text();
  } finally {
    clearTimeout(t);
  }
}

export class ImportError extends Error {
  constructor(public kind: 'network' | 'norecipe', msg: string) {
    super(msg);
  }
}

/** Hämtar en receptsida: direkt först (om sajten tillåter), sedan via CORS-proxy, sedan reservproxy. */
export async function fetchRecipe(url: string): Promise<ParsedRecipe> {
  const attempts = [(u: string) => u, ...CORS_PROXIES];
  let gotHtml = false;
  for (const make of attempts) {
    let html: string;
    try {
      html = await fetchText(make(url));
    } catch {
      continue;
    }
    gotHtml = true;
    const r = parseRecipeHtml(html, url);
    if (r) return r;
  }
  if (gotHtml) throw new ImportError('norecipe', 'Sidan saknar strukturerad receptdata.');
  throw new ImportError('network', 'Kunde inte hämta sidan.');
}

export function extractUrl(...texts: (string | null | undefined)[]): string | null {
  for (const t of texts) {
    const m = t && /https?:\/\/[^\s<>"']+/i.exec(t);
    if (m) return m[0];
  }
  return null;
}

export function toRecipe(p: ParsedRecipe): Recipe {
  const now = Date.now();
  return { ...p, id: uid(), tags: [], createdAt: now, updatedAt: now };
}

const GUESS: [RegExp, RegExp][] = [
  [/\b(grädda|baka|ugn|ugnen|stek|steka|koka|koka upp|rosta)\b/i, /bak|tillag|mat|koka/i],
  [/\b(kyl|kylen|kylskåp|svalna|kallna|vila|frys|stelna|jäsa)\b/i, /kyl|vila/i],
  [/\b(vispa|kräm|fyllning|grädde|smörkräm|ganache)\b/i, /fyll|kräm/i],
  [/\b(dekorera|garnera|montera|bygg|lägg på|pudra|servera)\b/i, /monter|dekor|dukn|servering/i],
  [/\b(köp|handla|inköp)\b/i, /inköp|handla/i],
  [/\b(hacka|skala|skär|mät|förbered|blanda|rör|smält|väg|kavla)\b/i, /förber|prep/i]
];

/** Gissar kategori för ett receptsteg utifrån användarens egna kategorinamn. */
export function guessCategory(step: string, cats: Category[], fallback: string): string {
  for (const [stepRe, catRe] of GUESS) {
    if (stepRe.test(step)) {
      const c = cats.find((c) => catRe.test(c.name));
      if (c) return c.id;
    }
  }
  return fallback;
}

/** Kort titel för ett moment av ett receptsteg. */
export function stepTitle(step: string): string {
  const first = step.split(/(?<=[.!])\s/)[0].replace(/[.!]$/, '');
  return first.length > 60 ? first.slice(0, 57).trimEnd() + '…' : first;
}
