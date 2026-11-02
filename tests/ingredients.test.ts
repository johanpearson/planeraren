import { describe, expect, it } from 'vitest';
import { parseIngredient, parseYield, scaleIngredient } from '../src/lib/ingredients';

const s = (raw: string, f: number) => scaleIngredient(parseIngredient(raw), f).text;

describe('skalning (BR-12)', () => {
  it('skalar vanliga mängder', () => {
    expect(s('1,5 dl vetemjöl', 2)).toBe('3 dl vetemjöl');
    expect(s('6 ägg', 2)).toBe('12 ägg');
    expect(s('2 ägg', 1.5)).toBe('3 ägg');
    expect(s('0,5 tsk salt', 2)).toBe('1 tsk salt');
    expect(s('½ tsk vaniljsocker', 1)).toBe('0,5 tsk vaniljsocker');
  });
  it('byter enhet vid stora mängder', () => {
    expect(s('5 dl vispgrädde', 2)).toBe('1 l vispgrädde');
    expect(s('600 g smör', 2)).toBe('1,2 kg smör');
  });
  it('skalar intervall', () => {
    expect(s('2-3 msk socker', 2)).toBe('4–6 msk socker');
    expect(s('1,25 dl mjölk', 1)).toBe('1,3 dl mjölk');
    expect(s('1 msk smör', 1.3)).toBe('1,5 msk smör');
  });
  it('lämnar rader utan mängd oförändrade (BR-12-B)', () => {
    const r = scaleIngredient(parseIngredient('Hallonsylt efter smak'), 2);
    expect(r).toEqual({ text: 'Hallonsylt efter smak', scaled: false });
  });
  it('enhet ska inte matcha mitt i ord', () => {
    const i = parseIngredient('2 gula lökar');
    expect(i.unit).toBeUndefined();
    expect(i.name).toBe('gula lökar');
  });
});

describe('portioner', () => {
  it('läser recipeYield', () => {
    expect(parseYield('12 bitar')).toEqual({ amount: 12, unit: 'bitar' });
    expect(parseYield(['4', '4 portioner'])).toEqual({ amount: 4, unit: 'portioner' });
    expect(parseYield(6)).toEqual({ amount: 6, unit: 'portioner' });
  });
});
