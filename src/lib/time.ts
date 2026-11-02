import type { Offset } from './types';

const pad = (n: number) => String(n).padStart(2, '0');

/** 'YYYY-MM-DDTHH:MM' (lokal tid) → Date */
export function parseLocal(s: string): Date {
  const [d, t = '00:00'] = s.split('T');
  const [y, m, day] = d.split('-').map(Number);
  const [hh, mm] = t.split(':').map(Number);
  return new Date(y, m - 1, day, hh || 0, mm || 0, 0, 0);
}

export function toLocalInput(d: Date): string {
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}T${pad(d.getHours())}:${pad(d.getMinutes())}`;
}

export function startOfDay(d: Date): Date {
  return new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

/** Hela kalenderdagar mellan två datum (b − a), oberoende av sommartid. */
export function dayDiff(a: Date, b: Date): number {
  const ua = Date.UTC(a.getFullYear(), a.getMonth(), a.getDate());
  const ub = Date.UTC(b.getFullYear(), b.getMonth(), b.getDate());
  return Math.round((ub - ua) / 86400000);
}

/** Beräknar ett moments starttid utifrån projektets klar-tid. */
export function taskStart(deadline: string | Date, offset: Offset): Date {
  const dl = typeof deadline === 'string' ? parseLocal(deadline) : deadline;
  if (offset.kind === 'before') return new Date(dl.getTime() - offset.minutes * 60000);
  const [hh, mm] = offset.time.split(':').map(Number);
  return new Date(dl.getFullYear(), dl.getMonth(), dl.getDate() - offset.days, hh || 0, mm || 0);
}

/** Flyttar ett moment till en annan kalenderdag men behåller klockslaget. */
export function moveOffsetToDay(deadline: string, offset: Offset, targetDay: Date): Offset {
  const dl = parseLocal(deadline);
  const cur = taskStart(dl, offset);
  const delta = dayDiff(startOfDay(cur), startOfDay(targetDay));
  if (offset.kind === 'dayAt') return { ...offset, days: offset.days - delta };
  return { kind: 'before', minutes: offset.minutes - delta * 1440 };
}

export function describeOffset(o: Offset): string {
  if (o.kind === 'dayAt') {
    const d = o.days === 0 ? 'Klar-dagen' : o.days === 1 ? '1 dag före' : o.days < 0 ? `${-o.days} dag(ar) efter` : `${o.days} dagar före`;
    return `${d} kl ${o.time}`;
  }
  return `${formatDuration(o.minutes)} före klar-tid`;
}

export function formatDuration(min: number): string {
  if (min <= 0) return '0 min';
  const d = Math.floor(min / 1440);
  const h = Math.floor((min % 1440) / 60);
  const m = min % 60;
  const parts: string[] = [];
  if (d) parts.push(`${d} d`);
  if (h) parts.push(`${h} h`);
  if (m) parts.push(`${m} min`);
  return parts.join(' ');
}

const WD = ['sön', 'mån', 'tis', 'ons', 'tor', 'fre', 'lör'];
const MO = ['jan', 'feb', 'mar', 'apr', 'maj', 'jun', 'jul', 'aug', 'sep', 'okt', 'nov', 'dec'];

export const fmtTime = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`;
export const fmtDay = (d: Date) => `${WD[d.getDay()]} ${d.getDate()} ${MO[d.getMonth()]}`;
export const fmtDayShort = (d: Date) => `${WD[d.getDay()].replace(/^./, (c) => c.toUpperCase())} ${d.getDate()}`;
export const fmtDateTime = (d: Date) => `${fmtDay(d)} ${fmtTime(d)}`;

export function relativeDayLabel(day: Date, deadline: Date): string {
  const n = dayDiff(day, deadline);
  if (n === 0) return 'klar-dagen';
  if (n === 1) return 'dagen före';
  if (n > 1) return `${n} dagar före`;
  return `${-n} dag(ar) efter`;
}

/** "om 4 d 6 h" / "för 2 h sedan" */
export function countdown(to: Date, now = new Date()): string {
  const diff = Math.round((to.getTime() - now.getTime()) / 60000);
  if (Math.abs(diff) < 1) return 'nu';
  const abs = Math.abs(diff);
  let s: string;
  if (abs >= 2880) s = `${Math.round(abs / 1440)} dagar`;
  else if (abs >= 1440) s = `${Math.floor(abs / 1440)} d ${Math.floor((abs % 1440) / 60)} h`;
  else if (abs >= 60) s = `${Math.floor(abs / 60)} h ${abs % 60 ? `${abs % 60} min` : ''}`.trim();
  else s = `${abs} min`;
  return diff > 0 ? `om ${s}` : `för ${s} sedan`;
}

/** Tolkar "45 min", "1 h", "1,5 h", "2 h 30 min", "90" → minuter */
export function parseDuration(s: string): number | null {
  const t = s.trim().toLowerCase().replace(',', '.');
  if (!t) return null;
  if (/^\d+(\.\d+)?$/.test(t)) return Math.round(parseFloat(t));
  let total = 0;
  let matched = false;
  const re = /(\d+(?:\.\d+)?)\s*(d|dag|dagar|h|tim|timme|timmar|min|m)\b/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(t))) {
    matched = true;
    const v = parseFloat(m[1]);
    const u = m[2];
    total += u.startsWith('d') ? v * 1440 : u.startsWith('h') || u.startsWith('t') ? v * 60 : v;
  }
  return matched ? Math.round(total) : null;
}

/** ISO 8601-varaktighet (PT1H30M) → minuter */
export function isoDurationToMin(s?: string | null): number | null {
  if (!s) return null;
  const m = /P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/i.exec(s);
  if (!m) return null;
  const v = (+(m[1] || 0)) * 1440 + (+(m[2] || 0)) * 60 + (+(m[3] || 0));
  return v || null;
}
