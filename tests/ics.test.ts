import { describe, expect, it } from 'vitest';
import { buildIcs } from '../src/lib/ics';
import type { Category, Project, Task } from '../src/lib/types';

const project: Project = { id: 'p', name: 'Prinsesstårta', deadline: '2026-11-07T15:00', createdAt: 0, updatedAt: 0 };
const cats: Category[] = [{ id: 'c', name: 'Bakning', color: 'aprikos', icon: '🔥', order: 0 }];
const task = (id: string, extra: Partial<Task> = {}): Task => ({
  id, projectId: 'p', title: 'Baka bottnar', categoryId: 'c', offset: { kind: 'dayAt', days: 2, time: '10:00' },
  durationMin: 60, sortKey: 0, checklist: [{ text: '6 ägg' }], remind: true, createdAt: 0, ...extra
});

describe('buildIcs (BR-6-A)', () => {
  it('ett event per ej klart moment med alarm', () => {
    const ics = buildIcs(project, [task('a'), task('b', { doneAt: 1 })], cats, 15, new Date(Date.UTC(2026, 10, 2)));
    expect(ics.match(/BEGIN:VEVENT/g)).toHaveLength(1);
    expect(ics).toContain('UID:a@planeraren');
    expect(ics).toContain('DTSTART;TZID=Europe/Stockholm:20261105T100000');
    expect(ics).toContain('DURATION:PT60M');
    expect(ics).toContain('TRIGGER:-PT15M');
    expect(ics).toContain('BEGIN:VTIMEZONE');
    expect(ics.split('\r\n').every((l) => new TextEncoder().encode(l).length <= 75)).toBe(true);
  });
  it('hoppar över moment i arkiverade kategorier', () => {
    const ics = buildIcs(project, [task('a')], [{ ...cats[0], archivedAt: 1 }], 15);
    expect(ics).not.toContain('BEGIN:VEVENT');
  });
});
