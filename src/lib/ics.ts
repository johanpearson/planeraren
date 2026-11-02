import type { Category, Project, Task } from './types';
import { taskStart } from './time';

const pad = (n: number) => String(n).padStart(2, '0');
const local = (d: Date) =>
  `${d.getFullYear()}${pad(d.getMonth() + 1)}${pad(d.getDate())}T${pad(d.getHours())}${pad(d.getMinutes())}00`;
const utc = (d: Date) =>
  `${d.getUTCFullYear()}${pad(d.getUTCMonth() + 1)}${pad(d.getUTCDate())}T${pad(d.getUTCHours())}${pad(d.getUTCMinutes())}${pad(d.getUTCSeconds())}Z`;

function esc(s: string) {
  return s.replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

/** Viker rader längre än 75 oktetter enligt RFC 5545. */
function fold(line: string): string {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out: string[] = [];
  let cur = '';
  let len = 0;
  for (const ch of line) {
    const l = new TextEncoder().encode(ch).length;
    if (len + l > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = '';
      len = 0;
    }
    cur += ch;
    len += l;
  }
  out.push(cur);
  return out.join('\r\n ');
}

const VTIMEZONE = [
  'BEGIN:VTIMEZONE', 'TZID:Europe/Stockholm',
  'BEGIN:DAYLIGHT', 'TZOFFSETFROM:+0100', 'TZOFFSETTO:+0200', 'TZNAME:CEST', 'DTSTART:19700329T020000', 'RRULE:FREQ=YEARLY;BYMONTH=3;BYDAY=-1SU', 'END:DAYLIGHT',
  'BEGIN:STANDARD', 'TZOFFSETFROM:+0200', 'TZOFFSETTO:+0100', 'TZNAME:CET', 'DTSTART:19701025T030000', 'RRULE:FREQ=YEARLY;BYMONTH=10;BYDAY=-1SU', 'END:STANDARD',
  'END:VTIMEZONE'
];

export function buildIcs(project: Project, tasks: Task[], cats: Category[], alarmMin: number, now = new Date()): string {
  const catById = new Map(cats.map((c) => [c.id, c]));
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//Planeraren//SV', 'CALSCALE:GREGORIAN', 'METHOD:PUBLISH', `X-WR-CALNAME:${esc(project.name)}`, ...VTIMEZONE];
  for (const t of tasks) {
    if (t.doneAt) continue;
    const cat = catById.get(t.categoryId);
    if (cat?.archivedAt) continue;
    const start = taskStart(project.deadline, t.offset);
    const desc = [cat ? `${cat.icon} ${cat.name}` : '', t.notes || '', ...t.checklist.map((c) => `• ${c.text}`)].filter(Boolean).join('\n');
    lines.push(
      'BEGIN:VEVENT',
      `UID:${t.id}@planeraren`,
      `DTSTAMP:${utc(now)}`,
      `DTSTART;TZID=Europe/Stockholm:${local(start)}`,
      `DURATION:PT${Math.max(5, t.durationMin || 15)}M`,
      `SUMMARY:${esc(`${cat?.icon ?? ''} ${t.title} (${project.name})`.trim())}`
    );
    if (desc) lines.push(`DESCRIPTION:${esc(desc)}`);
    if (cat) lines.push(`CATEGORIES:${esc(cat.name)}`);
    lines.push('BEGIN:VALARM', `TRIGGER:-PT${Math.max(0, alarmMin)}M`, 'ACTION:DISPLAY', `DESCRIPTION:${esc(t.title)}`, 'END:VALARM', 'END:VEVENT');
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}

export function slug(s: string) {
  return (
    s
      .toLowerCase()
      .normalize('NFD')
      .replace(/[\u0300-\u036f]/g, '')
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-|-$/g, '') || 'projekt'
  );
}

/** Delar filen (Android: välj Kalender) eller laddar ned den som reserv. */
export async function shareOrDownload(name: string, content: string, type: string): Promise<'shared' | 'downloaded' | 'cancelled'> {
  const file = new File([content], name, { type });
  try {
    if (navigator.canShare?.({ files: [file] })) {
      await navigator.share({ files: [file], title: name });
      return 'shared';
    }
  } catch (e) {
    if ((e as Error).name === 'AbortError') return 'cancelled';
  }
  const url = URL.createObjectURL(file);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 5000);
  return 'downloaded';
}
