import type { Ingredient } from './types';

const UNITS = [
  'kg', 'hg', 'g', 'mg', 'l', 'dl', 'cl', 'ml', 'msk', 'tsk', 'krm', 'st', 'förp', 'paket', 'pkt', 'burk', 'burkar',
  'klyfta', 'klyftor', 'kruka', 'krukor', 'nypa', 'skivor', 'skiva', 'påse', 'påsar', 'flaska', 'knippe', 'port', 'portioner'
];
const FRACTIONS: Record<string, number> = { '½': 0.5, '¼': 0.25, '¾': 0.75, '⅓': 1 / 3, '⅔': 2 / 3 };

const NUM = String.raw`(?:\d+\s*[½¼¾⅓⅔]|\d+\s+\d+\/\d+|\d+\/\d+|\d+(?:[.,]\d+)?|[½¼¾⅓⅔])`;
const RE = new RegExp(
  String.raw`^\s*(?:ca\.?\s*|cirka\s+)?(${NUM})(?:\s*[-–]\s*(${NUM}))?\s*(${UNITS.join('|')})?\.?(?=\s|$)\s*(.*)$`,
  'i'
);

function num(s: string): number {
  s = s.trim();
  const mixed = /^(\d+)\s*([½¼¾⅓⅔])$/.exec(s);
  if (mixed) return +mixed[1] + FRACTIONS[mixed[2]];
  if (FRACTIONS[s] !== undefined) return FRACTIONS[s];
  const mixFrac = /^(\d+)\s+(\d+)\/(\d+)$/.exec(s);
  if (mixFrac) return +mixFrac[1] + +mixFrac[2] / +mixFrac[3];
  const frac = /^(\d+)\/(\d+)$/.exec(s);
  if (frac) return +frac[1] / +frac[2];
  return parseFloat(s.replace(',', '.'));
}

export function parseIngredient(raw: string): Ingredient {
  const clean = raw.replace(/\s+/g, ' ').trim();
  const m = RE.exec(clean);
  if (!m) return { raw: clean, name: clean };
  const qty = num(m[1]);
  if (!isFinite(qty)) return { raw: clean, name: clean };
  const unit = m[3]?.toLowerCase();
  const name = (m[4] || '').trim();
  return { raw: clean, qty, qtyMax: m[2] ? num(m[2]) : undefined, unit, name: name || clean };
}

const COARSE = new Set(['msk', 'tsk', 'krm', 'st', 'nypa', 'klyfta', 'klyftor', 'förp', 'paket', 'pkt', 'burk', 'burkar']);

function round(q: number, unit?: string): number {
  if (q < 1) return Math.round(q * 4) / 4 || 0.25;
  if (q < 10) return !unit || COARSE.has(unit) ? Math.round(q * 2) / 2 : Math.round(q * 10) / 10;
  if (q < 100) return Math.round(q);
  return Math.round(q / 5) * 5;
}

function fmtNum(q: number, unit?: string): string {
  const r = round(q, unit);
  return (Number.isInteger(r) ? String(r) : r.toFixed(2).replace(/0+$/, '').replace(/\.$/, '')).replace('.', ',');
}

function upgrade(q: number, unit?: string): [number, string | undefined] {
  if (unit === 'dl' && q >= 10) return [q / 10, 'l'];
  if (unit === 'ml' && q >= 1000) return [q / 1000, 'l'];
  if (unit === 'g' && q >= 1000) return [q / 1000, 'kg'];
  return [q, unit];
}

/** Text för en ingrediens skalad med faktor. Rader utan mängd returneras oförändrade. */
export function scaleIngredient(ing: Ingredient, factor: number): { text: string; scaled: boolean; qtyText?: string } {
  if (ing.qty === undefined) return { text: ing.raw, scaled: false };
  const [q, u] = upgrade(ing.qty * factor, ing.unit);
  let qtyText = fmtNum(q, u);
  if (ing.qtyMax !== undefined) {
    const [q2] = upgrade(ing.qtyMax * factor, ing.unit);
    qtyText += `–${fmtNum(q2, u)}`;
  }
  if (u) qtyText += ` ${u}`;
  return { text: `${qtyText} ${ing.name}`.trim(), scaled: true, qtyText };
}

/** Försöker läsa antal portioner ur t.ex. "12 bitar", "4 portioner", 6, ["8", "8 portioner"] */
export function parseYield(y: unknown): { amount: number; unit: string } | null {
  const cands = Array.isArray(y) ? y : [y];
  for (const c of cands) {
    if (typeof c === 'number' && c > 0) return { amount: c, unit: 'portioner' };
    if (typeof c === 'string') {
      const m = /(\d+(?:[.,]\d+)?)\s*([a-zåäö]+)?/i.exec(c);
      if (m) {
        const unit = (m[2] || 'portioner').toLowerCase();
        return { amount: parseFloat(m[1].replace(',', '.')), unit: unit === 'port' ? 'portioner' : unit };
      }
    }
  }
  return null;
}
