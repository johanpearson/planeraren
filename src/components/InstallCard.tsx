import { useState } from 'preact/hooks';
import { bannerDismissed, dismissBanner, installState, promptInstall } from '../lib/install';
import { toast } from '../lib/ui';

async function install() {
  const r = await promptInstall();
  if (r === 'accepted') toast('Planeraren installeras – den dyker upp bland dina appar');
  else if (r === 'unavailable') toast('Installationen är inte tillgänglig just nu – se tipsen i Inställningar');
}

/** Kort i Inställningar: knapp när Chrome erbjuder installation, annars hjälp. */
export function InstallCard() {
  const s = installState.use();
  if (s === 'standalone') return null;
  return (
    <section class="card install-card">
      <h2 class="card-title">📲 Installera appen</h2>
      {s === 'available' && (
        <>
          <p class="muted small">Lägg Planeraren på hemskärmen så öppnas den i helskärm, fungerar offline och syns i delningsmenyn för recept.</p>
          <button class="btn primary wide" onClick={install}>
            Installera Planeraren
          </button>
        </>
      )}
      {s === 'installed' && <p class="muted small">✓ Installerad. Öppna Planeraren från hemskärmen eller applistan.</p>}
      {s === 'unavailable' && (
        <div class="muted small">
          <p>Chrome erbjuder ingen installation på den här sidan just nu. Det kan bero på att:</p>
          <ul class="tight">
            <li>appen redan är installerad – leta i applistan,</li>
            <li>sidan nyss laddats – vänta några sekunder eller ladda om,</li>
            <li>Chrome är version 154–156: där blockeras en andra app från samma webbplats felaktigt ("redan installerad"). Uppdatera Chrome till 157 eller senare i Play Butik.</li>
          </ul>
          <p>Annars: Chrome-menyn ⋮ → <b>Installera app</b>.</p>
        </div>
      )}
    </section>
  );
}

/** Diskret banner överst i projektlistan när installation är möjlig. */
export function InstallBanner() {
  const s = installState.use();
  const [hidden, setHidden] = useState(bannerDismissed());
  if (s !== 'available' || hidden) return null;
  return (
    <div class="install-banner" role="region" aria-label="Installera appen">
      <span>📲 Installera Planeraren på hemskärmen</span>
      <button class="btn primary sm" onClick={install}>
        Installera
      </button>
      <button
        class="icon-x"
        aria-label="Stäng"
        onClick={() => {
          dismissBanner();
          setHidden(true);
        }}
      >
        ✕
      </button>
    </div>
  );
}
