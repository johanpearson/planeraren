import type { Category, Recipe } from './types';
import { parseIngredient, parseYield } from './ingredients';
import { uid } from './db';

/** structured = läst ur schema.org/Recipe (JSON-LD), annars tolkat ur text. */
export type ParsedRecipe = Omit<Recipe, 'id' | 'createdAt' | 'updatedAt' | 'tags'> & { structured?: boolean };

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
      totalTime: r.totalTime || r.cookTime || null,
      structured: true
    };
  }
  return null;
}

const ING_HEAD = /^(ingredienser|du behöver|ingredients)\b/i;
const STEP_HEAD = /^(gör så här|instruktioner|tillagning|så här gör du|beskrivning|instructions|method)\b/i;
/** Rubriker/rader som avslutar ett receptavsnitt på en hel webbsida. */
const END_HEAD = /^(tips|näringsvärde|näring|relaterade|liknande|fler recept|kommentarer|betyg|recensioner|dela|spara|annons|du kanske också|populära|nutrition|related|reviews)\b/i;
/** Knappar och notiser som receptsajter lägger efter ingredienslistan (ICA, Köket, Arla, Coop …). */
const END_CTA = /^(lägg (till )?i (min )?inköpslista|lägg till alla|handla (ingredienserna|ingredienser|varorna)|köp ingredienserna|beställ (varorna|ingredienserna)|ha med dig inköpslistan|läs mer om|klimatanpassa|receptet (är )?uppdaterat|uppdaterad|skriv ut|betygsätt|ge betyg|spara recept|dela recept|för alla$|annons)/i;
/** En rad som bara anger portioner, t.ex. "4 portioner" eller "12 bitar". */
const SERVINGS_LINE = /^(ca\.?\s*)?\d+([-–]\d+)?\s*(portioner|port\.?|bitar|st|personer|pers\.?)$/i;

/** Steg som börjar med numrering ("1.", "2)", "Steg 3:") eller punkt ("•", "-"). */
const STEP_MARK = /^\s*(?:\d+[.):]\s+|steg\s+\d+\s*[.:)]?\s*|[•\-*–]\s+)/i;
const SENTENCE_END = /[.!?:)"”»]$/;

/**
 * Slår ihop radbrytningar mitt i ett steg. Är stegen numrerade (eller punktade) börjar ett nytt steg
 * bara vid en ny numrering eller tomrad; annars när föregående rad slutar en mening och nästa börjar med versal.
 */
export function mergeStepLines(lines: { text: string; mark: boolean; gap: boolean }[]): string[] {
  const anyMark = lines.some((l) => l.mark);
  const out: string[] = [];
  for (const l of lines) {
    const prev = out[out.length - 1];
    const cont =
      prev !== undefined && !l.mark && !l.gap && (anyMark || /^[a-zåäöé]/.test(l.text) || (!/^[A-ZÅÄÖÉ]/.test(l.text) && !SENTENCE_END.test(prev)));
    if (cont) out[out.length - 1] = `${prev} ${l.text}`;
    else out.push(l.text);
  }
  return out;
}

function cleanLine(l: string): string {
  return l
    .replace(/!\[[^\]]*\]\([^)]*\)/g, '') // markdown-bilder
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1') // markdown-länkar → text
    .replace(/^#{1,6}\s*/, '')
    .replace(/^[=]{3,}$/, '')
    .replace(/[*_`]+/g, '')
    .replace(/^[\s•\-*–]+/, '')
    .replace(/^\[\s?[x ]?\s?\]\s*/i, '')
    .trim();
}

/**
 * Tolkar recepttext. `page` = hela webbsidans text (t.ex. från Jina Reader): då används bara
 * avsnitten under "Ingredienser" och "Gör så här", så att menyer och annat brus ignoreras.
 */
export function parseRecipeText(text: string, sourceUrl?: string | null, page = false): ParsedRecipe | null {
  let raw = text;
  let pageTitle = '';
  if (page) {
    const t = /^Title:\s*(.+)$/m.exec(raw);
    if (t) pageTitle = t[1].replace(/\s*[|–-]\s*(ICA|Köket|Arla|Coop|Tasteline|Mathem|Recept).*$/i, '').trim();
    const mc = raw.indexOf('Markdown Content:');
    if (mc >= 0) raw = raw.slice(mc + 'Markdown Content:'.length);
  }
  const lines: { line: string; mark: boolean; gap: boolean }[] = [];
  let gap = false;
  for (const r of raw.split(/\r?\n/)) {
    const line = cleanLine(r);
    if (!line) {
      gap = true;
      continue;
    }
    lines.push({ line, mark: STEP_MARK.test(r.replace(/^[\s>]*(\*\*|__)?/, '')) || STEP_MARK.test(line), gap });
    gap = false;
  }
  if (!lines.length) return null;
  let title = '';
  let servings: ParsedRecipe['servings'] = null;
  const ingredients: string[] = [];
  const stepLines: { text: string; mark: boolean; gap: boolean }[] = [];
  let markNext = false;
  let mode: 'start' | 'ing' | 'step' | 'skip' = page ? 'skip' : 'start';
  for (const { line, mark, gap } of lines) {
    if (ING_HEAD.test(line) && line.length < 40) {
      mode = 'ing';
      const y = parseYield(line.replace(ING_HEAD, ''));
      if (y && !servings) servings = y;
      continue;
    }
    if (STEP_HEAD.test(line) && line.length < 40) {
      mode = 'step';
      continue;
    }
    if (page && ((END_HEAD.test(line) && line.length < 40) || (END_CTA.test(line) && line.length < 70))) {
      mode = 'skip';
      continue;
    }
    if (SERVINGS_LINE.test(line)) {
      if (!servings) servings = parseYield(line);
      continue;
    }
    if (!servings && /\b(\d+)\s*(portioner|port|bitar|st|personer)\b/i.test(line) && line.length < 40) {
      servings = parseYield(line);
      if (mode === 'start' || mode === 'skip') continue;
    }
    if (mode === 'skip') continue;
    const numbered = /^(\d+[.)]|steg\s+\d+)(\s|$)/i.test(line);
    const ing = parseIngredient(line);
    if (mode === 'start') {
      if (!title && ing.qty === undefined && !numbered && line.length < 80) {
        title = line;
        continue;
      }
      mode = ing.qty !== undefined && !numbered ? 'ing' : 'step';
    }
    if (mode === 'ing' && numbered) mode = 'step';
    // Ingen mängd och en hel mening: instruktionerna har börjat utan rubrik.
    if (mode === 'ing' && !page && ing.qty === undefined && (line.length > 45 || (/[.!]$/.test(line) && line.split(/\s+/).length >= 6))) mode = 'step';
    if (mode === 'ing') {
      if (page && line.length > 90) continue; // brödtext, inte en ingrediensrad
      ingredients.push(line);
    } else {
      const text = line.replace(/^(\d+[.):]|steg\s+\d+\s*[.:)]?)\s*/i, '').trim();
      if (!text) {
        markNext = true; // "Steg 1" på egen rad
        continue;
      }
      if (page && text.length <= 12) continue;
      stepLines.push({ text, mark: mark || markNext, gap });
      markNext = false;
    }
  }
  // Hela webbsidor har redan ett steg per rad/listpunkt; inklistrad text kan ha radbrytningar mitt i steg.
  const steps = page ? stepLines.map((l) => l.text) : mergeStepLines(stepLines);
  if (page && (!ingredients.length || !steps.length)) return null;
  if (!ingredients.length && !steps.length) return null;
  return {
    title: title || pageTitle || 'Inklistrat recept',
    sourceUrl: sourceUrl || null,
    imageUrl: null,
    servings,
    ingredients: ingredients.map(parseIngredient),
    steps,
    totalTime: null
  };
}

/**
 * Gratisvägar för att hämta en receptsida från en statisk sida (GitHub Pages saknar server, och
 * receptsajter tillåter inte anrop från andra domäner). corsproxy.io används inte: dess gratisnivå
 * gäller bara localhost, produktionsdomäner kräver betald nyckel.
 */
type Attempt = {
  name: string;
  url: (u: string) => string;
  headers?: Record<string, string>;
  read: (res: Response) => Promise<{ html?: string; text?: string }>;
};

export const ATTEMPTS: Attempt[] = [
  { name: 'direkt', url: (u) => u, read: async (r) => ({ html: await r.text() }) },
  { name: 'allorigins', url: (u) => `https://api.allorigins.win/raw?url=${encodeURIComponent(u)}`, read: async (r) => ({ html: await r.text() }) },
  {
    name: 'allorigins-json',
    url: (u) => `https://api.allorigins.win/get?url=${encodeURIComponent(u)}`,
    read: async (r) => ({ html: ((await r.json()) as { contents?: string }).contents || '' })
  },
  { name: 'codetabs', url: (u) => `https://api.codetabs.com/v1/proxy/?quest=${encodeURIComponent(u)}`, read: async (r) => ({ html: await r.text() }) },
  // Jina Reader renderar sidan och returnerar läsbar text (markdown) – används när HTML-vägarna blockeras.
  // Jina Reader renderar sidan i en riktig webbläsare. Som HTML följer receptdatan (JSON-LD) med om sajten har den …
  { name: 'jina-html', url: (u) => `https://r.jina.ai/${u}`, headers: { 'X-Return-Format': 'html' }, read: async (r) => ({ html: await r.text() }) },
  // … annars som läsbar text, där avsnitten Ingredienser / Gör så här plockas ut.
  { name: 'jina', url: (u) => `https://r.jina.ai/${u}`, read: async (r) => ({ text: await r.text() }) }
];

export class ImportError extends Error {
  constructor(public kind: 'network' | 'norecipe', msg: string) {
    super(msg);
  }
}

async function tryAttempt(a: Attempt, url: string, ms: number): Promise<{ recipe: ParsedRecipe | null; got: boolean }> {
  const ctrl = new AbortController();
  const t = setTimeout(() => ctrl.abort(), ms);
  try {
    const res = await fetch(a.url(url), { signal: ctrl.signal, headers: a.headers });
    if (!res.ok) return { recipe: null, got: false };
    const { html, text } = await a.read(res);
    if (html) {
      const r = parseRecipeHtml(html, url) || parseRecipeText(htmlToText(html), url, true);
      return { recipe: r, got: html.length > 500 };
    }
    if (text) return { recipe: parseRecipeText(text, url, true), got: text.length > 200 };
    return { recipe: null, got: false };
  } catch {
    return { recipe: null, got: false };
  } finally {
    clearTimeout(t);
  }
}

/** Hämtar en receptsida via alla vägar samtidigt och tar första som ger ett recept. Strukturerad data (JSON-LD) föredras. */
export async function fetchRecipe(url: string, ms = 15000): Promise<ParsedRecipe> {
  const results = ATTEMPTS.map((a) => tryAttempt(a, url, ms));
  const first = await new Promise<ParsedRecipe | null>((resolve) => {
    let left = results.length;
    let textFallback: ParsedRecipe | null = null;
    for (const p of results) {
      p.then(({ recipe }) => {
        if (recipe && recipe.structured) return resolve(recipe);
        if (recipe && !textFallback) {
          textFallback = recipe;
          // Vänta en kort stund på strukturerad data från andra vägar, sedan räcker texten.
          setTimeout(() => resolve(textFallback), 4000);
        }
        if (--left === 0) resolve(textFallback);
      });
    }
  });
  if (first) return first;
  const any = (await Promise.all(results)).some((r) => r.got);
  if (any) throw new ImportError('norecipe', 'Sidan saknar receptdata som går att läsa.');
  throw new ImportError('network', 'Kunde inte hämta sidan.');
}

/** Grov HTML → text för sidor utan JSON-LD (rubriker och listpunkter på egna rader). */
export function htmlToText(html: string): string {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('script,style,noscript,svg,nav,header,footer').forEach((e) => e.remove());
  doc.querySelectorAll('br,p,div,li,h1,h2,h3,h4,h5,h6,tr,section,article').forEach((e) => e.append('\n'));
  doc.querySelectorAll('li').forEach((e) => e.prepend('- '));
  return (doc.body?.textContent || '').replace(/[ \t]+/g, ' ').replace(/\n\s*\n+/g, '\n');
}

export function extractUrl(...texts: (string | null | undefined)[]): string | null {
  for (const t of texts) {
    const m = t && /https?:\/\/[^\s<>"']+/i.exec(t);
    if (m) return m[0];
  }
  return null;
}

export function toRecipe({ structured: _s, ...p }: ParsedRecipe): Recipe {
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

/** Förkortningar som slutar med punkt mitt i en mening. */
const ABBR = /(?:^|[\s(])(?:ca|t\.ex|bl\.a|ev|resp|dvs|kl|nr|p\.g\.a|o\.dyl|osv)\.$/i;

/** Första meningen i ett steg – delar inte vid förkortningar som "ca." eller "t.ex.". */
export function firstSentence(step: string): string {
  const re = /[.!?](?=\s+["”»(]?[A-ZÅÄÖÉ0-9])/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(step))) {
    const head = step.slice(0, m.index + 1);
    if (m[0] === '.' && ABBR.test(head)) continue;
    return head;
  }
  return step;
}

/** Kort titel för ett moment av ett receptsteg. */
export function stepTitle(step: string): string {
  const first = firstSentence(step).trim().replace(/[.!]$/, '');
  return first.length > 60 ? first.slice(0, 57).trimEnd() + '…' : first;
}
