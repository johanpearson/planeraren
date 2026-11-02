import { useEffect, useState } from 'preact/hooks';
import { db, useLive } from '../lib/db';
import { dayDiff, fmtDay, startOfDay, taskStart } from '../lib/time';
import { go } from '../lib/ui';
import { toggleDone } from '../lib/actions';
import { Empty, Header, TaskRowContent } from '../components/common';
import { SwipeRow } from '../components/SwipeRow';
import type { Category, Project, Task } from '../lib/types';

type Row = { t: Task; p: Project; start: Date };

export function TodayView() {
  const projects = useLive(() => db.projects.toArray());
  const tasks = useLive(() => db.tasks.toArray());
  const cats = useLive(() => db.categories.toArray());
  const [, tick] = useState(0);
  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 60000);
    return () => clearInterval(t);
  }, []);
  if (!projects || !tasks || !cats) return null;

  const now = new Date();
  const today = startOfDay(now);
  const catMap = new Map<string, Category>(cats.map((c) => [c.id, c]));
  const pMap = new Map(projects.filter((p) => !p.archivedAt).map((p) => [p.id, p]));
  const rows: Row[] = [];
  for (const t of tasks) {
    const p = pMap.get(t.projectId);
    if (!p || t.doneAt || catMap.get(t.categoryId)?.archivedAt) continue;
    rows.push({ t, p, start: taskStart(p.deadline, t.offset) });
  }
  rows.sort((a, b) => +a.start - +b.start);
  const overdue = rows.filter((r) => r.start < now);
  const todays = rows.filter((r) => r.start >= now && dayDiff(today, r.start) === 0);
  const tomorrow = rows.filter((r) => dayDiff(today, r.start) === 1);

  const section = (title: string, list: Row[], warn = false) =>
    list.length > 0 && (
      <section>
        <h2 class="dayhead">
          <span>{title}</span>
          <span>{list.length}</span>
        </h2>
        {list.map(({ t, p, start }) => (
          <SwipeRow onSwipeRight={() => toggleDone(t)} onTap={() => go(`t/${t.id}`)}>
            <TaskRowContent task={t} cat={catMap.get(t.categoryId)} start={start} overdue={warn} showProject={p.name} onCheck={() => toggleDone(t)} />
          </SwipeRow>
        ))}
      </section>
    );

  const tmr = new Date(today.getFullYear(), today.getMonth(), today.getDate() + 1);
  return (
    <>
      <Header title="Idag" sub={fmtDay(now).replace(/^./, (c) => c.toUpperCase())} />
      <main class="content">
        {section('Försenat', overdue, true)}
        {section(`Idag · ${fmtDay(today)}`, todays)}
        {section(`Imorgon · ${fmtDay(tmr)}`, tomorrow)}
        {!overdue.length && !todays.length && !tomorrow.length && <Empty icon="☕" text="Inget att göra idag eller imorgon." />}
      </main>
    </>
  );
}
