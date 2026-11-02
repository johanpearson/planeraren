import { useEffect, useState } from 'preact/hooks';
import { db, useLive } from '../lib/db';
import { describeOffset, fmtDateTime, fmtTime, formatDuration, parseLocal, taskStart } from '../lib/time';
import { go, openSheet, route } from '../lib/ui';
import { startTimer, stopTimer, toggleDone } from '../lib/actions';
import { enableNotifications } from '../lib/notify';
import { getSettings } from '../lib/db';
import { Empty, Header, catStyle } from '../components/common';

export function TaskView() {
  const r = route.use();
  const id = r.path[1];
  const task = useLive(() => db.tasks.get(id).then((t) => t ?? null), [id]);
  const project = useLive(async () => (task ? (await db.projects.get(task.projectId)) ?? null : null), [task?.projectId]);
  const cat = useLive(async () => (task ? await db.categories.get(task.categoryId) : undefined), [task?.categoryId]);
  const recipe = useLive(async () => (task?.recipeId ? await db.recipes.get(task.recipeId) : undefined), [task?.recipeId]);
  const [, tick] = useState(0);
  const [timerMin, setTimerMin] = useState<string>('');

  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 1000);
    return () => clearInterval(t);
  }, []);

  // Åtgärd från notis när appen var stängd: #/t/<id>?do=done|snooze
  useEffect(() => {
    const act = r.query.get('do');
    if (!task || !act) return;
    if (act === 'done' && !task.doneAt) db.tasks.update(task.id, { doneAt: Date.now(), timerEndsAt: null });
    if (act === 'snooze') db.tasks.update(task.id, { timerEndsAt: Date.now() + 5 * 60000 });
    history.replaceState(null, '', `#/t/${task.id}`);
  }, [task?.id]);

  if (task === undefined || project === undefined) return null;
  if (!task || !project) {
    return (
      <>
        <Header title="Moment saknas" backTo="" />
        <main class="content">
          <Empty icon="🤷" text="Momentet finns inte längre." />
        </main>
      </>
    );
  }

  const start = taskStart(project.deadline, task.offset);
  const end = task.durationMin ? new Date(start.getTime() + task.durationMin * 60000) : null;
  const left = task.timerEndsAt ? Math.max(0, task.timerEndsAt - Date.now()) : null;
  const mm = left !== null ? Math.floor(left / 60000) : 0;
  const ss = left !== null ? Math.floor((left % 60000) / 1000) : 0;

  const toggleItem = (i: number) => {
    const checklist = task.checklist.map((c, j) => (j === i ? { ...c, checked: !c.checked } : c));
    db.tasks.update(task.id, { checklist });
  };

  const onStartTimer = async () => {
    const m = parseInt(timerMin || String(task.timerMin || task.durationMin || 10), 10);
    if (!m || m < 1) return;
    await startTimer(task, m);
    const s = await getSettings();
    if (!s.notificationsEnabled && 'Notification' in window && Notification.permission === 'default') enableNotifications();
  };

  return (
    <>
      <Header
        title={task.title || 'Moment'}
        sub={project.name}
        backTo={`p/${project.id}`}
        actions={
          <button class="icon-btn" aria-label="Redigera" onClick={() => openSheet('task-form', { projectId: project.id, taskId: task.id })}>
            ✎
          </button>
        }
      />
      <main class="content">
        <div class={`task-hero ${task.doneAt ? 'done' : ''}`} style={catStyle(cat)}>
          <span class="badge-cat">
            {cat?.icon} {cat?.name ?? 'Utan kategori'}
          </span>
          <div class="task-hero-time">
            {fmtDateTime(start).replace(/^./, (c) => c.toUpperCase())}
            {end ? `–${fmtTime(end)}` : ''}
          </div>
          <div class="muted small">
            {describeOffset(task.offset)}
            {task.durationMin ? ` · tar ca ${formatDuration(task.durationMin)}` : ''} · klar-tid {fmtDateTime(parseLocal(project.deadline))}
          </div>
        </div>

        {task.checklist.length > 0 && (
          <section class="card">
            <h2 class="card-title">Checklista</h2>
            {task.checklist.map((c, i) => (
              <label class="check-item">
                <input type="checkbox" checked={!!c.checked} onChange={() => toggleItem(i)} />
                <span class={c.checked ? 'struck' : ''}>{c.text}</span>
              </label>
            ))}
          </section>
        )}

        {task.notes && (
          <section class="card">
            <h2 class="card-title">Anteckning</h2>
            <p class="pre">{task.notes}</p>
          </section>
        )}

        {recipe && (
          <button class="link-btn" onClick={() => go(`r/${recipe.id}`)}>
            📖 Öppna receptet: {recipe.title}
          </button>
        )}

        <section class="card timer">
          {left !== null ? (
            <>
              <div class="timer-big" aria-live="polite">
                {left === 0 ? '🔔 Klart!' : `${mm}:${String(ss).padStart(2, '0')}`}
              </div>
              <div class="btn-row">
                <button class="btn ghost" onClick={() => db.tasks.update(task.id, { timerEndsAt: (task.timerEndsAt || Date.now()) + 5 * 60000 })}>
                  +5 min
                </button>
                <button class="btn ghost" onClick={() => stopTimer(task)}>
                  Stoppa
                </button>
              </div>
              <p class="hint">Du får en notis när timern är klar så länge appen är igång eller nyss använd.</p>
            </>
          ) : (
            <div class="timer-start">
              <label class="field inline">
                <span class="lbl">Timer (min)</span>
                <input type="number" inputMode="numeric" min={1} value={timerMin} placeholder={String(task.timerMin || task.durationMin || 10)} onInput={(e) => setTimerMin((e.target as HTMLInputElement).value)} />
              </label>
              <button class="btn ghost" onClick={onStartTimer}>
                ⏱ Starta
              </button>
            </div>
          )}
        </section>

        <button class={`btn ${task.doneAt ? 'ghost' : 'primary'} wide`} onClick={() => toggleDone(task)}>
          {task.doneAt ? 'Markera som ej klar' : '✓ Markera klar'}
        </button>
      </main>
    </>
  );
}
