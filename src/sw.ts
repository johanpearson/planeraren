/// <reference lib="webworker" />
import { cleanupOutdatedCaches, createHandlerBoundToURL, precacheAndRoute } from 'workbox-precaching';
import { NavigationRoute, registerRoute } from 'workbox-routing';

declare const self: ServiceWorkerGlobalScope & { __WB_MANIFEST: (string | { url: string; revision: string | null })[] };

precacheAndRoute(self.__WB_MANIFEST);
cleanupOutdatedCaches();
// Alla navigeringar (även delningar från Android: ./?url=…) besvaras med appen från cachen → fungerar offline.
registerRoute(new NavigationRoute(createHandlerBoundToURL('index.html')));

self.addEventListener('message', (e) => {
  if (e.data?.type === 'SKIP_WAITING') self.skipWaiting();
});
self.addEventListener('activate', (e) => e.waitUntil(self.clients.claim()));

self.addEventListener('notificationclick', (e) => {
  e.notification.close();
  const taskId: string | undefined = e.notification.data?.taskId;
  const action = e.action; // 'done' | 'snooze' | ''
  e.waitUntil(
    (async () => {
      const all = await self.clients.matchAll({ type: 'window', includeUncontrolled: true });
      const client = all[0] as WindowClient | undefined;
      if (client) {
        if (taskId && action) client.postMessage({ type: action === 'done' ? 'notif-done' : 'notif-snooze', taskId });
        if (!action) {
          await client.focus();
          if (taskId) client.postMessage({ type: 'open-task', taskId });
        }
        return;
      }
      const q = action ? `?do=${action}` : '';
      await self.clients.openWindow(taskId ? `./#/t/${taskId}${q}` : './');
    })()
  );
});
