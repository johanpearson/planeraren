import { describe, expect, it } from 'vitest';
import { extractUrl, guessCategory, parseRecipeHtml, parseRecipeText } from '../src/lib/recipe';
import type { Category } from '../src/lib/types';

const ld = (o: unknown) => `<html><head><title>x</title><script type="application/ld+json">${JSON.stringify(o)}</script></head><body></body></html>`;

describe('parseRecipeHtml (BR-5-B)', () => {
  it('läser Recipe i @graph med HowToStep och HowToSection', () => {
    const html = ld({
      '@context': 'https://schema.org',
      '@graph': [
        { '@type': 'WebPage', name: 'sida' },
        {
          '@type': 'Recipe', name: 'Prinsesst&aring;rta', recipeYield: '12 bitar', image: [{ url: 'https://x/y.jpg' }],
          recipeIngredient: ['6 ägg', '3 dl strösocker', 'Hallonsylt'],
          recipeInstructions: [
            { '@type': 'HowToSection', name: 'Botten', itemListElement: [{ '@type': 'HowToStep', text: 'Vispa ägg och socker.' }] },
            { '@type': 'HowToStep', text: 'Grädda i 40 min.' }
          ]
        }
      ]
    });
    const r = parseRecipeHtml(html, 'https://www.ica.se/recept/x')!;
    expect(r.title).toBe('Prinsesstårta');
    expect(r.servings).toEqual({ amount: 12, unit: 'bitar' });
    expect(r.ingredients.map((i) => i.qty)).toEqual([6, 3, undefined]);
    expect(r.steps).toEqual(['Vispa ägg och socker.', 'Grädda i 40 min.']);
    expect(r.imageUrl).toBe('https://x/y.jpg');
  });
  it('returnerar null utan receptdata (BR-5-C)', () => {
    expect(parseRecipeHtml('<html><body>Hej</body></html>')).toBeNull();
    expect(parseRecipeHtml(ld({ '@type': 'Article' }))).toBeNull();
  });
  it('tål @type som array och instruktioner som sträng', () => {
    const r = parseRecipeHtml(ld({ '@type': ['Recipe'], name: 'Bullar', recipeIngredient: ['50 g jäst'], recipeInstructions: 'Blanda.\nKnåda.' }))!;
    expect(r.steps).toEqual(['Blanda.', 'Knåda.']);
  });
});

describe('parseRecipeText', () => {
  it('delar upp rubrik, ingredienser och steg', () => {
    const r = parseRecipeText(`Kanelbullar\n40 st\nIngredienser\n50 g jäst\n5 dl mjölk\n• 1 tsk salt\nGör så här\n1. Smält smöret.\n2. Knåda degen.`)!;
    expect(r.title).toBe('Kanelbullar');
    expect(r.servings).toEqual({ amount: 40, unit: 'st' });
    expect(r.ingredients.map((i) => i.raw)).toEqual(['50 g jäst', '5 dl mjölk', '1 tsk salt']);
    expect(r.steps).toEqual(['Smält smöret.', 'Knåda degen.']);
  });
  it('fungerar utan rubriker', () => {
    const r = parseRecipeText(`Pannkakor\n3 dl mjöl\n6 dl mjölk\n3 ägg\n1. Vispa ihop.\n2. Stek.`)!;
    expect(r.ingredients).toHaveLength(3);
    expect(r.steps).toHaveLength(2);
  });
});

describe('hjälpfunktioner', () => {
  it('plockar URL ur delad text (BR-5-A)', () => {
    expect(extractUrl(null, 'Kolla! https://www.ica.se/recept/prinsesstarta-722887/ ')).toBe('https://www.ica.se/recept/prinsesstarta-722887/');
  });
  it('gissar kategori från användarens egna namn', () => {
    const cats = [{ id: 'b', name: 'Bakning' }, { id: 'k', name: 'Kylning/vila' }] as Category[];
    expect(guessCategory('Grädda i 175 grader', cats, 'x')).toBe('b');
    expect(guessCategory('Låt svalna', cats, 'x')).toBe('k');
    expect(guessCategory('Ring mormor', cats, 'x')).toBe('x');
  });
});
