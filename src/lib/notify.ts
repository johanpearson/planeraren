import { liveQuery } from 'dexie';
import { db, getSettings, updateSettings } from './db';
import { taskStart } from './time';
import { toast } from './ui';

/**
 * Notiser utan server: medan appen är igång (eller nyss i bakgrunden) schemaläggs timers och
 * påminnelser med setTimeout och visas via service workerns showNotification. Kalender-exporten
 * är den tillförlitliga vägen när appen är stängd.
 */

const timers = new Map<string, ReturnType<typeof setTimeout>>();
const shown = new Set<string>();

export async function enableNotifications(): Promise<boolean> {
  if (!('Notification' in window)) {
    toast('Den här webbläsaren stöder inte notiser');
    return false;
  }
  const perm = Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
  const ok = perm === 'granted';
  await updateSettings({ notificationsEnabled: ok });
  if (!ok) toast('Notiser blockerade – ändra i Chromes webbplatsinställningar');
  else reschedule();
  return ok;
}

export async function notify(title: string, body: string, tag: string, taskId?: string) {
  if (Notification?.permission !== 'granted') return false;
  const reg = await navigator.serviceWorker?.getRegistration();
  const opts: NotificationOptions & { actions?: { action: string; title: string }[] } = {
    body,
    tag,
    icon: 'icons/icon-192.png',
    badge: 'icons/icon-192.png',
    data: { taskId }
  };
  if (taskId) opts.actions = [{ action: 'done', title: 'Markera klar' }, { action: 'snooze', title: '+5 min' }];
  if (reg) await reg.showNotification(title, opts);
  else new Notification(title, opts);
  return true;
}

function schedule(key: string, at: number, fire: () => void) {
  const ms = at - Date.now();
  if (ms < -60000 || ms > 24 * 3600000 || shown.has(key)) return;
  timers.set(key, setTimeout(() => {
    shown.add(key);
    fire();
  }, Math.max(0, ms)));
}

/** Planerar om alla timers och påminnelser för det närmaste dygnet. */
export async function reschedule() {
  timers.forEach(clearTimeout);
  timers.clear();
  const s = await getSettings();
  const [projects, tasks, cats] = await Promise.all([db.projects.toArray(), db.tasks.toArray(), db.categories.toArray()]);
  const pById = new Map(projects.filter((p) => !p.archivedAt).map((p) => [p.id, p]));
  const archivedCats = new Set(cats.filter((c) => c.archivedAt).map((c) => c.id));
  for (const t of tasks) {
    const p = pById.get(t.projectId);
    if (!p || t.doneAt || archivedCats.has(t.categoryId)) continue;
    if (t.timerEndsAt) {
      schedule(`timer:${t.id}:${t.timerEndsAt}`, t.timerEndsAt, () => {
        if (s.notificationsEnabled) notify(`⏱ ${t.title}`, `${t.timerMin ?? ''} min har gått`, `timer-${t.id}`, t.id);
        toast(`⏱ Timern för "${t.title}" är klar`);
        navigator.vibrate?.([200, 100, 200]);
      });
    }
    if (t.remind && s.notificationsEnabled) {
      const start = taskStart(p.deadline, t.offset).getTime();
      schedule(`remind:${t.id}:${start}`, start - s.remindMin * 60000, () =>
        notify(t.title, `${p.name} · startar om ${s.remindMin} min`, `remind-${t.id}`, t.id)
      );
    }
  }
}

export function initNotifications() {
  let deb: ReturnType<typeof setTimeout> | undefined;
  liveQuery(() => Promise.all([db.tasks.toArray(), db.projects.toArray(), db.settings.toArray()])).subscribe(() => {
    clearTimeout(deb);
    deb = setTimeout(reschedule, 300);
  });
  document.addEventListener('visibilitychange', () => document.visibilityState === 'visible' && reschedule());
  navigator.serviceWorker?.addEventListener('message', async (e) => {
    const { type, taskId } = e.data || {};
    if (!taskId) return;
    if (type === 'notif-done') await db.tasks.update(taskId, { doneAt: Date.now(), timerEndsAt: null });
    if (type === 'notif-snooze') await db.tasks.update(taskId, { timerEndsAt: Date.now() + 5 * 60000 });
    reschedule();
  });
}
