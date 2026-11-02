import { useEffect } from 'preact/hooks';
import { db, DEFAULT_SETTINGS, useLive } from './lib/db';
import { go, route } from './lib/ui';
import { ConfirmDialog, SnackBar, TabBar } from './components/common';
import { ProjectsView } from './views/Projects';
import { ProjectView } from './views/Project';
import { TaskView } from './views/Task';
import { TodayView } from './views/Today';
import { ImportView, RecipeView, RecipesView } from './views/Recipes';
import { ArchivedCategories, SettingsView } from './views/Settings';
import { WelcomeView } from './views/Welcome';
import { SheetHost } from './views/sheets';

function View() {
  const r = route.use();
  const [a, b] = r.path;
  switch (a ?? '') {
    case '':
    case 'archive':
      return <ProjectsView />;
    case 'p':
      return <ProjectView key={b} />;
    case 't':
      return <TaskView key={b} />;
    case 'today':
      return <TodayView />;
    case 'recipes':
      return <RecipesView />;
    case 'r':
      return <RecipeView key={b} />;
    case 'import':
      return <ImportView key={r.query.toString()} />;
    case 'settings':
      return b === 'archived' ? <ArchivedCategories /> : <SettingsView />;
    case 'welcome':
      return <WelcomeView />;
  }
  return <ProjectsView />;
}

export function App() {
  const settings = useLive(async () => ({ ...DEFAULT_SETTINGS, ...((await db.settings.get('settings')) || {}) }));

  useEffect(() => {
    if (settings) document.documentElement.dataset.theme = settings.theme;
  }, [settings?.theme]);

  useEffect(() => {
    const onMsg = (e: MessageEvent) => e.data?.type === 'open-task' && go(`t/${e.data.taskId}`);
    navigator.serviceWorker?.addEventListener('message', onMsg);
    return () => navigator.serviceWorker?.removeEventListener('message', onMsg);
  }, []);

  if (!settings) return null;
  if (!settings.onboarded) {
    return (
      <div class="app">
        <WelcomeView />
        <SnackBar />
      </div>
    );
  }
  return (
    <div class="app">
      <View />
      <TabBar />
      <SheetHost />
      <ConfirmDialog />
      <SnackBar />
    </div>
  );
}
