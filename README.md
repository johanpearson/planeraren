# Planeraren

Planera allt baklänges från en deadline – en avancerad tårta, ett julbord, en fest eller en flytt.
En PWA för Android som körs gratis på GitHub Pages. All data ligger bara i telefonen.

**App:** https://johanpearson.github.io/planeraren/ (publiceras från `main`)

## Funktioner

- **Projekt med klar-tid** – alla moment planeras *baklänges* ("2 dagar före kl 10", "3 h före"). Ändrar du klar-tiden flyttas allt med.
- **Tidslinje per dag** där hela raden har kategorins färg. Bläddra mellan dagar med flikarna eller genom att swipa.
- **Gester** – swipa höger för att bocka av (med Ångra), swipa vänster för Redigera/Ta bort, håll inne och dra för att flytta ett moment till en annan dag.
- **Egna kategorier** med färg och ikon. Startuppsättningar: Bakning & matlagning, Fest & evenemang, Flytt. Kategorier kan arkiveras med alla moment (och läggas in i ett nytt projekt senare) eller raderas.
- **Receptbok** – dela en receptsida från Chrome till appen (eller klistra in text). Stegen kan redigeras, delas och slås ihop, och portionerna kan skalas.
- **Recept i projekt** – tryck **Lägg till recept** i ett projekt eller moment. Receptet blir antingen *ett moment* (t.ex. "Bottnar" i "Tårta") med stegen som delmoment att bocka av, eller *ett eget projekt* där varje steg blir ett moment.
- **Påminnelser** – exportera ett projekt till telefonens kalender (.ics) för pålitliga påminnelser. Timers och notiser fungerar när appen är igång eller nyss har använts.
- **Idag-vy** över alla projekt, **mallar** (nytt projekt från ett gammalt) och **säkerhetskopia** till fil.
- **Offline** och **automatisk uppdatering** – en ny version laddas ned i bakgrunden och aktiveras när inget formulär är öppet.

## Installera på Android

1. Öppna appens adress i Chrome.
2. Välj ⋮ → **Installera app** (eller *Lägg till på startskärmen*).
3. Nu finns **Planeraren** i delningsmenyn – dela en receptsida från Chrome för att importera den.

Tips: gör en säkerhetskopia då och då (Inställningar → Data). All data finns bara i telefonen.

## Utveckling

```bash
npm install
npm run dev       # utvecklingsserver
npm test          # enhetstester (vitest)
npm run build     # produktionsbygge till dist/
npm run preview   # kör bygget lokalt på http://localhost:4173/planeraren/
```

Teknik: Vite, Preact, TypeScript, Dexie (IndexedDB) och vite-plugin-pwa (Workbox, `src/sw.ts`).

| Fil | Innehåll |
|---|---|
| `src/lib/time.ts` | Tider räknas baklänges från klar-tiden |
| `src/lib/recipe.ts` | Hämtar recept via flera gratistjänster samtidigt och läser schema.org/Recipe, sidans text eller inklistrad text |
| `src/lib/ingredients.ts` | Tolkar och skalar ingredienser |
| `src/lib/ics.ts` | Kalenderexport |
| `src/lib/update.ts` | Automatisk uppdatering |
| `src/lib/notify.ts` | Notiser och timers |
| `plans/planeraren/` | Godkänd plan, prototyp och designskiss |

## Publicering

GitHub Actions (`.github/workflows/deploy.yml`) testar och bygger vid varje push och pull request. Det är bara `main` som publiceras till GitHub Pages.
Engångsinställning i repot: **Settings → Pages → Build and deployment → Source: GitHub Actions**.

## Begränsningar

- **Notiser när appen är stängd** kan inte garanteras utan en server. Använd därför kalenderexporten för viktiga påminnelser.
- **Receptimport** går via gratistjänster, eftersom receptsajter blockerar anrop direkt från webbläsaren. Appen frågar allorigins, codetabs och Jina Reader samtidigt och tar den första som ger ett recept. Strukturerad receptdata (schema.org) väljs i första hand, annars läses avsnitten "Ingredienser" och "Gör så här" ur sidans text. Tjänsterna ser receptets adress. Om ingen tjänst lyckas kan du klistra in texten istället. corsproxy.io används inte, eftersom dess gratisnivå bara gäller localhost.
