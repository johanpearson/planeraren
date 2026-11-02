import { afterEach, describe, expect, it, vi } from 'vitest';
import { fetchRecipe, htmlToText, ImportError, parseRecipeText } from '../src/lib/recipe';

// Så som Jina Reader (r.jina.ai) returnerar en receptsida: rubrik, meny-brus, setext-rubriker, listor.
const JINA = `Title: Chili con carne | Recept ICA.se

URL Source: https://www.ica.se/recept/chili-con-carne-424/

Markdown Content:
[Hoppa till innehåll](#main)
*   [Recept](https://www.ica.se/recept/)
*   [Erbjudanden](https://www.ica.se/erbjudanden/)
![Image 1: Chili con carne](https://assets.icanet.se/chili.jpg)
Chili con carne
===============
4 portioner
Ingredienser
------------
*   500 g nötfärs
*   1 gul lök
*   2 vitlöksklyftor
*   1 msk chilipulver
*   2 burkar krossade tomater (à 400 g)
*   1 burk kidneybönor
Gör så här
----------
1.   Hacka lök och vitlök. Bryn färsen i en stor gryta.
2.   Tillsätt lök, vitlök och chilipulver och fräs någon minut.
3.   Häll i tomaterna och låt puttra under lock i 30 minuter.
4.   Skölj bönorna och rör ner dem. Smaka av med salt.
Tips
----
Servera med ris och gräddfil.
Liknande recept
---------------
*   [Tacogryta](https://www.ica.se/recept/tacogryta/)`;

describe('parseRecipeText med hel webbsida (page)', () => {
  it('läser bara avsnitten Ingredienser och Gör så här', () => {
    const r = parseRecipeText(JINA, 'https://www.ica.se/recept/chili-con-carne-424/', true)!;
    expect(r.title).toBe('Chili con carne');
    expect(r.servings).toEqual({ amount: 4, unit: 'portioner' });
    expect(r.ingredients.map((i) => i.raw)).toEqual(['500 g nötfärs', '1 gul lök', '2 vitlöksklyftor', '1 msk chilipulver', '2 burkar krossade tomater (à 400 g)', '1 burk kidneybönor']);
    expect(r.steps).toHaveLength(4);
    expect(r.steps[0]).toBe('Hacka lök och vitlök. Bryn färsen i en stor gryta.');
    expect(r.structured).toBeUndefined();
  });
  it('kräver både ingredienser och steg på en hel sida', () => {
    expect(parseRecipeText('Title: Startsida\n\nMarkdown Content:\nVälkommen till ICA\n- Erbjudanden', null, true)).toBeNull();
  });
});

describe('htmlToText', () => {
  it('ger rubriker och listpunkter på egna rader och tar bort skript', () => {
    const t = htmlToText('<html><body><nav>Meny</nav><h2>Ingredienser</h2><ul><li>2 ägg</li><li>1 dl mjölk</li></ul><h2>Gör så här</h2><ol><li>Vispa ihop allt ordentligt.</li></ol><script>x()</script></body></html>');
    const r = parseRecipeText(t, null, true)!;
    expect(r.ingredients.map((i) => i.raw)).toEqual(['2 ägg', '1 dl mjölk']);
    expect(r.steps).toEqual(['Vispa ihop allt ordentligt.']);
  });
});

const LD = `<html><head><script type="application/ld+json">${JSON.stringify({ '@type': 'Recipe', name: 'Chili con carne', recipeYield: '4 portioner', recipeIngredient: ['500 g nötfärs'], recipeInstructions: [{ '@type': 'HowToStep', text: 'Bryn färsen.' }] })}</script></head><body>${'x'.repeat(600)}</body></html>`;

function mockFetch(handler: (url: string) => { status?: number; body?: string; json?: unknown; delay?: number } | 'fail') {
  vi.stubGlobal('fetch', vi.fn(async (url: string) => {
    const h = handler(url);
    if (h === 'fail') throw new TypeError('Failed to fetch');
    if (h.delay) await new Promise((r) => setTimeout(r, h.delay));
    const body = h.json !== undefined ? JSON.stringify(h.json) : h.body ?? '';
    return new Response(body, { status: h.status ?? 200 });
  }));
}

describe('fetchRecipe', () => {
  afterEach(() => vi.unstubAllGlobals());
  const URL_ = 'https://www.ica.se/recept/chili-con-carne-424/';

  it('använder inte corsproxy.io', async () => {
    const seen: string[] = [];
    mockFetch((u) => { seen.push(u); return 'fail'; });
    await expect(fetchRecipe(URL_, 500)).rejects.toBeInstanceOf(ImportError);
    expect(seen.some((u) => u.includes('corsproxy.io'))).toBe(false);
    expect(seen.some((u) => u.startsWith('https://r.jina.ai/'))).toBe(true);
  });

  it('läser receptet via allorigins /get (JSON) när andra vägar blockeras', async () => {
    mockFetch((u) => (u.includes('allorigins.win/get') ? { json: { contents: LD } } : 'fail'));
    const r = await fetchRecipe(URL_, 500);
    expect(r.title).toBe('Chili con carne');
    expect(r.structured).toBe(true);
  });

  it('faller tillbaka på Jina-text när ingen HTML-väg fungerar', async () => {
    mockFetch((u) => (u.startsWith('https://r.jina.ai/') ? { body: JINA } : { status: 403 }));
    const r = await fetchRecipe(URL_, 500);
    expect(r.ingredients).toHaveLength(6);
    expect(r.structured).toBeUndefined();
  });

  it('föredrar JSON-LD även om textvägen svarar först', async () => {
    mockFetch((u) => (u.startsWith('https://r.jina.ai/') ? { body: JINA } : u.includes('codetabs') ? { body: LD, delay: 50 } : 'fail'));
    const r = await fetchRecipe(URL_, 1000);
    expect(r.structured).toBe(true);
  });

  it('skiljer på "ingen receptdata" och nätverksfel', async () => {
    mockFetch(() => ({ body: '<html><body>' + 'Annons '.repeat(200) + '</body></html>' }));
    await expect(fetchRecipe(URL_, 500)).rejects.toMatchObject({ kind: 'norecipe' });
    mockFetch(() => 'fail');
    await expect(fetchRecipe(URL_, 500)).rejects.toMatchObject({ kind: 'network' });
  });
});
