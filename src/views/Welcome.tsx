import { useState } from 'preact/hooks';
import { STARTER_SETS } from '../lib/palette';
import { addCategories, db, requestPersistence, updateSettings } from '../lib/db';
import { go, route, toast } from '../lib/ui';
import { Header, catStyle } from '../components/common';

/** Första start (och "Lägg till startuppsättning" från inställningar). */
export function WelcomeView() {
  const r = route.use();
  const fromSettings = r.path[0] === 'welcome';
  const [chosen, setChosen] = useState<Set<string>>(new Set(fromSettings ? [] : ['bake']));

  const toggle = (id: string) => {
    const n = new Set(chosen);
    n.has(id) ? n.delete(id) : n.add(id);
    setChosen(n);
  };

  const finish = async () => {
    const seeds = STARTER_SETS.filter((s) => chosen.has(s.id)).flatMap((s) => s.categories);
    const n = await addCategories(seeds);
    if (fromSettings) {
      toast(n ? `${n} kategorier tillagda` : 'Inga nya kategorier');
      go('settings', true);
      return;
    }
    if (!(await db.categories.count())) await addCategories([{ name: 'Allmänt', color: 'gra', icon: '⭐' }]);
    await updateSettings({ onboarded: true });
    requestPersistence();
    go('', true);
  };

  return (
    <>
      {fromSettings ? <Header title="Startuppsättningar" backTo="settings" /> : null}
      <main class={`content ${fromSettings ? '' : 'welcome'}`}>
        {!fromSettings && (
          <>
            <div class="welcome-ico" aria-hidden="true">
              🗓️
            </div>
            <h1 class="welcome-title">Välkommen till Planeraren</h1>
            <p class="muted">Planera vad som helst baklänges från en deadline. Börja med några kategorier – du kan ändra, lägga till och ta bort dem när som helst.</p>
          </>
        )}
        <div class="sets" role="group" aria-label="Startkategorier">
          {STARTER_SETS.map((s) => (
            <button class={`set ${chosen.has(s.id) ? 'on' : ''}`} aria-pressed={chosen.has(s.id)} onClick={() => toggle(s.id)}>
              <div class="set-head">
                <span>
                  {s.emoji} {s.label}
                </span>
                <span class="set-check">{chosen.has(s.id) ? '✓' : ''}</span>
              </div>
              <div class="set-cats">
                {s.categories.map((c) => (
                  <span class="legend-chip" style={catStyle({ ...c, id: '', order: 0 })}>
                    {c.icon} {c.name}
                  </span>
                ))}
              </div>
            </button>
          ))}
          {!fromSettings && (
            <button class={`set ${chosen.size === 0 ? 'on' : ''}`} aria-pressed={chosen.size === 0} onClick={() => setChosen(new Set())}>
              <div class="set-head">
                <span>✏️ Tomt – jag skapar egna</span>
                <span class="set-check">{chosen.size === 0 ? '✓' : ''}</span>
              </div>
            </button>
          )}
        </div>
        <p class="hint">Du kan välja flera och lägga till fler senare i Inställningar.</p>
        <button class="btn primary wide" onClick={finish}>
          {fromSettings ? 'Lägg till' : 'Kom igång'}
        </button>
      </main>
    </>
  );
}
