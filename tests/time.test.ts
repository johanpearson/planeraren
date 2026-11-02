import { describe, expect, it } from 'vitest';
import { countdown, describeOffset, moveOffsetToDay, parseDuration, parseLocal, taskStart, toLocalInput } from '../src/lib/time';

describe('taskStart', () => {
  it('räknar "2 dagar före kl 10:00" från lör 15:00 till tor 10:00', () => {
    expect(toLocalInput(taskStart('2026-11-07T15:00', { kind: 'dayAt', days: 2, time: '10:00' }))).toBe('2026-11-05T10:00');
  });
  it('räknar "3 h före"', () => {
    expect(toLocalInput(taskStart('2026-11-07T15:00', { kind: 'before', minutes: 180 }))).toBe('2026-11-07T12:00');
  });
  it('flyttar alla moment när klar-tiden ändras (BR-1-B)', () => {
    const a = { kind: 'dayAt' as const, days: 2, time: '10:00' };
    const b = { kind: 'before' as const, minutes: 180 };
    expect(toLocalInput(taskStart('2026-11-08T15:00', a))).toBe('2026-11-06T10:00');
    expect(toLocalInput(taskStart('2026-11-08T15:00', b))).toBe('2026-11-08T12:00');
  });
  it('klarar sommartidsskifte för dagar-före', () => {
    expect(toLocalInput(taskStart('2026-03-30T12:00', { kind: 'dayAt', days: 2, time: '09:00' }))).toBe('2026-03-28T09:00');
  });
});

describe('moveOffsetToDay', () => {
  it('flyttar dayAt en dag senare och behåller klockslag', () => {
    const o = moveOffsetToDay('2026-11-07T15:00', { kind: 'dayAt', days: 2, time: '19:00' }, parseLocal('2026-11-06T00:00'));
    expect(o).toEqual({ kind: 'dayAt', days: 1, time: '19:00' });
  });
  it('flyttar before-offset med hela dygn', () => {
    const o = moveOffsetToDay('2026-11-07T15:00', { kind: 'before', minutes: 60 }, parseLocal('2026-11-06T00:00'));
    expect(o).toEqual({ kind: 'before', minutes: 60 + 1440 });
  });
});

describe('formatering', () => {
  it('beskriver offset', () => {
    expect(describeOffset({ kind: 'dayAt', days: 2, time: '10:00' })).toBe('2 dagar före kl 10:00');
    expect(describeOffset({ kind: 'before', minutes: 90 })).toBe('1 h 30 min före klar-tid');
  });
  it('tolkar längd', () => {
    expect(parseDuration('45 min')).toBe(45);
    expect(parseDuration('1,5 h')).toBe(90);
    expect(parseDuration('2 h 30 min')).toBe(150);
    expect(parseDuration('abc')).toBeNull();
  });
  it('nedräkning', () => {
    const now = parseLocal('2026-11-03T09:00');
    expect(countdown(parseLocal('2026-11-07T15:00'), now)).toBe('om 4 dagar');
    expect(countdown(parseLocal('2026-11-03T08:00'), now)).toBe('för 1 h sedan');
  });
});
