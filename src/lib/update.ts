import { registerSW } from 'virtual:pwa-register';
import { getSettings, updateSettings } from './db';
import { isBusy, toast } from './ui';

declare const __APP_VERSION__: string;
export const APP_VERSION = __APP_VERSION__;
/** "1.0.0+abc1234" → "1.0.0 · abc1234" */
export const VERSION_LABEL = APP_VERSION.replace('+', ' · ');

/** Säkert läge = inget formulär öppet och inget inmatningsfält i fokus. */
function safe() {
  const a = document.activeElement;
  return !isBusy() && !(a && /^(INPUT|TEXTAREA|SELECT)$/.test(a.tagName));
}

/**
 * Automatisk uppdatering (BR-8): ny service worker laddas ned i bakgrunden; den aktiveras och
 * appen laddas om när det är säkert, eller när appen hamnar i bakgrunden.
 */
export function initUpdates() {
  if (!('serviceWorker' in navigator) || import.meta.env.DEV) return;
  let apply: (() => void) | null = null;
  let reloading = false;
  // Ladda om när den nya service workern tagit över. (vite-plugin-pwa laddar bara om för uppdateringar
  // den själv räknar som "egna" – inte för dem som hittas vid senare kontroller.)
  let requested = false;
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!requested || reloading) return;
    reloading = true;
    location.reload();
  });
  const updateSW = registerSW({
    immediate: true,
    onNeedRefresh() {
      apply = () => {
        apply = null;
        requested = true;
        updateSW(true);
      };
      tryApply();
    },
    onRegisteredSW(_url, reg) {
      if (!reg) return;
      setInterval(() => reg.update().catch(() => {}), 60 * 60 * 1000);
      document.addEventListener('visibilitychange', () => {
        if (document.visibilityState === 'visible') reg.update().catch(() => {});
        else apply?.();
      });
    }
  });
  function tryApply() {
    if (!apply) return;
    if (safe()) apply();
    else setTimeout(tryApply, 4000);
  }
}

export async function announceVersion() {
  const s = await getSettings();
  if (s.lastSeenAppVersion && s.lastSeenAppVersion !== APP_VERSION) {
    toast(`✨ Uppdaterad till v${VERSION_LABEL} – dina data är kvar`);
  }
  if (s.lastSeenAppVersion !== APP_VERSION) await updateSettings({ lastSeenAppVersion: APP_VERSION });
}
