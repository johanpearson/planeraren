import { render } from 'preact';
import { App } from './app';
import { initUpdates, announceVersion } from './lib/update';
import { initNotifications } from './lib/notify';
import { extractUrl } from './lib/recipe';
import { syncRoute } from './lib/ui';
import './styles.css';

// Delning från Android (Web Share Target): ./?title=…&text=…&url=…  →  #/import?url=…
const q = new URLSearchParams(location.search);
if (q.has('url') || q.has('text') || q.has('title')) {
  const link = extractUrl(q.get('url'), q.get('text'), q.get('title'));
  const hash = link ? `#/import?url=${encodeURIComponent(link)}` : `#/import?mode=paste&text=${encodeURIComponent(q.get('text') || '')}`;
  history.replaceState(null, '', location.pathname + hash);
  syncRoute();
}

render(<App />, document.getElementById('app')!);
initUpdates();
initNotifications();
announceVersion();
