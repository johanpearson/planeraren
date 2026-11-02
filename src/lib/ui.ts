import { useEffect, useState } from 'preact/hooks';

/** Minimal store med prenumeration. */
export function store<T>(initial: T) {
  let value = initial;
  const subs = new Set<(v: T) => void>();
  return {
    get: () => value,
    set(v: T) {
      value = v;
      subs.forEach((f) => f(v));
    },
    use(): T {
      const [v, setV] = useState(value);
      useEffect(() => {
        subs.add(setV);
        setV(value);
        return () => void subs.delete(setV);
      }, []);
      return v;
    }
  };
}

/* ---------- router (hash) ---------- */
export interface Route {
  path: string[];
  query: URLSearchParams;
}
function readRoute(): Route {
  const h = location.hash.replace(/^#\/?/, '');
  const [p, q = ''] = h.split('?');
  return { path: p ? p.split('/').map(decodeURIComponent) : [], query: new URLSearchParams(q) };
}
export const route = store<Route>(readRoute());
/** Läser om adressen (t.ex. efter history.replaceState vid start). */
export const syncRoute = () => route.set(readRoute());
let depth = 0;
/** true när en sheet har lagt en egen historikpost (så att Androids bakåt stänger den). */
let sheetEntry = false;
const onNav = () => {
  route.set(readRoute());
  sheet.set(null);
};
window.addEventListener('popstate', () => {
  if (sheetEntry) {
    sheetEntry = false;
    sheet.set(null);
    return;
  }
  depth = Math.max(0, depth - 1);
  onNav();
});
window.addEventListener('hashchange', () => route.set(readRoute()));
export function go(path: string, replace = false) {
  const h = '#/' + path.replace(/^\/+/, '');
  if (sheetEntry) {
    // Ersätt sheetens historikpost med den nya sidan
    sheetEntry = false;
    history.replaceState(null, '', h);
    if (!replace) depth++;
  } else if (replace) history.replaceState(null, '', h);
  else {
    history.pushState(null, '', h);
    depth++;
  }
  onNav();
  window.scrollTo(0, 0);
}
/** Tillbaka inom appen, annars till fallback (t.ex. när appen öppnats via delning). */
export function back(fallback = '') {
  if (depth > 0) history.back();
  else go(fallback, true);
}

/* ---------- snackbar ---------- */
export interface Snack {
  id: number;
  text: string;
  action?: { label: string; run: () => void };
}
export const snack = store<Snack | null>(null);
let snackTimer: ReturnType<typeof setTimeout> | undefined;
export function showSnack(text: string, action?: Snack['action'], ms = 6000) {
  clearTimeout(snackTimer);
  snack.set({ id: Date.now(), text, action });
  snackTimer = setTimeout(() => snack.set(null), ms);
}
export function toast(text: string) {
  showSnack(text, undefined, 3500);
}

/* ---------- bottom sheet ---------- */
export type SheetSpec = { kind: string; props?: Record<string, unknown> } | null;
export const sheet = store<SheetSpec>(null);
export function openSheet(kind: string, props?: Record<string, unknown>) {
  if (!sheetEntry) {
    history.pushState({ sheet: true }, '');
    sheetEntry = true;
  }
  sheet.set({ kind, props });
}
export function closeSheet() {
  if (!sheet.get()) return;
  if (sheetEntry) history.back(); // popstate stänger sheeten
  else sheet.set(null);
}
export const isBusy = () => sheet.get() !== null;

/* ---------- confirm-dialog ---------- */
export interface ConfirmSpec {
  title: string;
  text?: string;
  ok: string;
  danger?: boolean;
  resolve: (v: boolean) => void;
}
export const confirmDlg = store<ConfirmSpec | null>(null);
export function confirm(title: string, text: string | undefined, ok: string, danger = false): Promise<boolean> {
  return new Promise((resolve) => confirmDlg.set({ title, text, ok, danger, resolve }));
}

/* ---------- haptik ---------- */
export function buzz(ms = 12) {
  try {
    navigator.vibrate?.(ms);
  } catch {
    /* ignoreras */
  }
}
