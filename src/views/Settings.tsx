import { useEffect, useRef, useState } from 'preact/hooks';
import { db, updateSettings, useLive, DEFAULT_SETTINGS } from '../lib/db';
import { go, openSheet, confirm, toast } from '../lib/ui';
import { exportBackup, importBackup, restoreCategory, type Backup } from '../lib/actions';
import { enableNotifications } from '../lib/notify';
import { shareOrDownload } from '../lib/ics';
import { VERSION_LABEL } from '../lib/update';
import { Empty, Header, catStyle } from '../components/common';
import { InstallCard } from '../components/InstallCard';
import type { ThemePref } from '../lib/types';

export function SettingsView() {
  const settings = useLive(async () => ({ ...DEFAULT_SETTINGS, ...((await db.settings.get('settings')) || {}) }));
  const cats = useLive(() => db.categories.orderBy('order').toArray());
  const tasks = useLive(() => db.tasks.toArray());
  const [storage, setStorage] = useState<{ persisted: boolean; kb: number } | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    (async () => {
      const persisted = (await navigator.storage?.persisted?.()) ?? false;
      const est = await navigator.storage?.estimate?.();
      setStorage({ persisted, kb: Math.round((est?.usage ?? 0) / 1024) });
    })();
  }, []);

  if (!settings || !cats || !tasks) return null;
  const active = cats.filter((c) => !c.archivedAt);
  const archived = cats.filter((c) => c.archivedAt);
  const count = (id: string) => tasks.filter((t) => t.categoryId === id).length;

  const doExport = async () => {
    const b = await exportBackup();
    const name = `planeraren-backup-${new Date().toISOString().slice(0, 10)}.json`;
    const res = await shareOrDownload(name, JSON.stringify(b, null, 1), 'application/json');
    if (res !== 'cancelled') toast(`${name} skapad`);
  };
  const doImport = async (file: File) => {
    try {
      const b = JSON.parse(await file.text()) as Backup;
      const ok = await confirm('Återställ säkerhetskopia?', `All nuvarande data ersätts med backupen från ${new Date(b.exportedAt).toLocaleDateString('sv-SE')} (${b.projects?.length ?? 0} projekt, ${b.recipes?.length ?? 0} recept).`, 'Återställ', true);
      if (!ok) return;
      await importBackup(b);
      toast('Säkerhetskopian återställd');
    } catch (e) {
      toast((e as Error).message || 'Kunde inte läsa filen');
    }
  };
  const daysSinceBackup = settings.lastBackupAt ? Math.floor((Date.now() - settings.lastBackupAt) / 86400000) : null;

  return (
    <>
      <Header title="Inställningar" />
      <main class="content">
        <InstallCard />
        <section class="card">
          <h2 class="card-title">Dina kategorier</h2>
          {active.length === 0 && <p class="muted">Inga kategorier. Skapa en eller lägg till en startuppsättning.</p>}
          <div class="cat-list">
            {active.map((c) => (
              <button class="cat-row" style={catStyle(c)} onClick={() => openSheet('category-form', { id: c.id })}>
                <span class="task-ico">{c.icon}</span>
                <span class="grow">{c.name}</span>
                <span class="muted small">{count(c.id)} moment</span>
              </button>
            ))}
          </div>
          <div class="btn-row">
            <button class="btn ghost" onClick={() => openSheet('category-form')}>
              ＋ Ny kategori
            </button>
            <button class="btn ghost" onClick={() => go('welcome')}>
              Startuppsättningar
            </button>
          </div>
          {archived.length > 0 && (
            <button class="link-btn" onClick={() => go('settings/archived')}>
              Arkiverade kategorier ({archived.length})
            </button>
          )}
        </section>

        <section class="card">
          <h2 class="card-title">Påminnelser</h2>
          <label class="toggle">
            <span>
              Notiser i appen
              <span class="hint block">Timers och moment som startar – fungerar när appen är igång eller nyss använd.</span>
            </span>
            <input
              type="checkbox"
              role="switch"
              checked={settings.notificationsEnabled}
              onChange={async (e) => {
                const on = (e.target as HTMLInputElement).checked;
                if (on) await enableNotifications();
                else await updateSettings({ notificationsEnabled: false });
              }}
            />
          </label>
          <label class="field">
            <span class="lbl">Påminnelse före moment (i appen)</span>
            <select value={settings.remindMin} onChange={(e) => updateSettings({ remindMin: +(e.target as HTMLSelectElement).value })}>
              {[0, 5, 15, 30, 60].map((m) => (
                <option value={m}>{m === 0 ? 'Vid start' : `${m} min innan`}</option>
              ))}
            </select>
          </label>
          <label class="field">
            <span class="lbl">Påminnelse i kalender-export</span>
            <select value={settings.calendarAlarmMin} onChange={(e) => updateSettings({ calendarAlarmMin: +(e.target as HTMLSelectElement).value })}>
              {[0, 5, 15, 30, 60, 120].map((m) => (
                <option value={m}>{m === 0 ? 'Vid start' : m >= 60 ? `${m / 60} h innan` : `${m} min innan`}</option>
              ))}
            </select>
            <span class="hint">För pålitliga påminnelser när appen är stängd: projekt → ⋯ → Lägg i kalender.</span>
          </label>
        </section>

        <section class="card">
          <h2 class="card-title">Utseende</h2>
          <div class="seg" role="radiogroup" aria-label="Tema">
            {(
              [
                ['light', 'Ljust'],
                ['dark', 'Mörkt'],
                ['system', 'Följ telefonen']
              ] as [ThemePref, string][]
            ).map(([v, l]) => (
              <button role="radio" aria-checked={settings.theme === v} class={settings.theme === v ? 'on' : ''} onClick={() => updateSettings({ theme: v })}>
                {l}
              </button>
            ))}
          </div>
        </section>

        <section class="card">
          <h2 class="card-title">Data</h2>
          <p class="muted small">
            Allt sparas bara i den här telefonen.
            {storage && (
              <>
                {' '}
                Lagring: <b>{storage.persisted ? 'beständig ✓' : 'kan rensas av webbläsaren'}</b> · {storage.kb} kB
              </>
            )}
          </p>
          {(daysSinceBackup === null || daysSinceBackup > 30) && <div class="banner">{daysSinceBackup === null ? 'Du har inte gjort någon säkerhetskopia än.' : `Senaste säkerhetskopian är ${daysSinceBackup} dagar gammal.`}</div>}
          <div class="btn-row">
            <button class="btn ghost" onClick={doExport}>
              Exportera säkerhetskopia
            </button>
            <button class="btn ghost" onClick={() => fileRef.current?.click()}>
              Återställ från fil …
            </button>
          </div>
          <input ref={fileRef} type="file" accept="application/json,.json" hidden onChange={(e) => {
            const f = (e.target as HTMLInputElement).files?.[0];
            if (f) doImport(f);
            (e.target as HTMLInputElement).value = '';
          }} />
        </section>

        <p class="about">
          <b>Planeraren v{VERSION_LABEL}</b> · uppdateras automatiskt
          <br />
          <a href="https://github.com/johanpearson/planeraren" target="_blank" rel="noopener noreferrer">
            Källkod på GitHub
          </a>
        </p>
      </main>
    </>
  );
}

export function ArchivedCategories() {
  const cats = useLive(() => db.categories.toArray());
  const tasks = useLive(() => db.tasks.toArray());
  if (!cats || !tasks) return null;
  const archived = cats.filter((c) => c.archivedAt);
  return (
    <>
      <Header title="Arkiverade kategorier" backTo="settings" />
      <main class="content">
        {archived.length === 0 && <Empty icon="🗄️" text="Inga arkiverade kategorier." />}
        {archived.map((c) => {
          const n = tasks.filter((t) => t.categoryId === c.id).length;
          return (
            <div class="card">
              <div class="cat-row static" style={catStyle(c)}>
                <span class="task-ico">{c.icon}</span>
                <span class="grow">{c.name}</span>
              </div>
              <p class="muted small">
                Arkiverad {new Date(c.archivedAt!).toLocaleDateString('sv-SE')} · <b>{n} moment sparade</b>
              </p>
              <div class="btn-row">
                <button class="btn ghost" onClick={() => restoreCategory(c)}>
                  Återställ
                </button>
                <button class="btn primary" onClick={() => openSheet('pick-project', { categoryId: c.id })}>
                  Lägg in i projekt …
                </button>
              </div>
              <button class="link-btn danger-text" onClick={() => openSheet('category-delete', { id: c.id })}>
                Radera för gott
              </button>
            </div>
          );
        })}
      </main>
    </>
  );
}
