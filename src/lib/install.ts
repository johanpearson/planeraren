import { store } from './ui';

/**
 * Installationsknapp i appen (beforeinstallprompt).
 *
 * Bakgrund: Chrome 154–156 på Android jämför installerade webbappar per webbplats (origin)
 * i stället för per scope, så en andra app på johanpearson.github.io blockeras med
 * "Appen är redan installerad" i Chromes meny. Installationsdialogen som startas härifrån
 * går en annan väg i Chrome. Rättat i Chrome 157 (Chromium-ärende 568841400).
 */

interface BeforeInstallPromptEvent extends Event {
  prompt(): Promise<void>;
  userChoice: Promise<{ outcome: 'accepted' | 'dismissed' }>;
}

export type InstallState = 'standalone' | 'available' | 'installed' | 'unavailable';

const isStandalone = () =>
  window.matchMedia?.('(display-mode: standalone)').matches || (navigator as unknown as { standalone?: boolean }).standalone === true;

let deferred: BeforeInstallPromptEvent | null = null;
export const installState = store<InstallState>(isStandalone() ? 'standalone' : 'unavailable');

/** Måste köras tidigt (före första render) så att händelsen inte missas. */
export function initInstall() {
  window.addEventListener('beforeinstallprompt', (e) => {
    e.preventDefault(); // visa vår egen knapp i stället för Chromes mini-infobar
    deferred = e as BeforeInstallPromptEvent;
    if (!isStandalone()) installState.set('available');
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    installState.set('installed');
  });
}

export async function promptInstall(): Promise<'accepted' | 'dismissed' | 'unavailable'> {
  if (!deferred) return 'unavailable';
  const ev = deferred;
  deferred = null; // en prompt kan bara visas en gång
  await ev.prompt();
  const { outcome } = await ev.userChoice;
  installState.set(outcome === 'accepted' ? 'installed' : 'unavailable');
  return outcome;
}

const DISMISS_KEY = 'planeraren.installBannerDismissed';
export function bannerDismissed(): boolean {
  try {
    return localStorage.getItem(DISMISS_KEY) === '1';
  } catch {
    return false;
  }
}
export function dismissBanner() {
  try {
    localStorage.setItem(DISMISS_KEY, '1');
  } catch {
    /* ignoreras */
  }
}
