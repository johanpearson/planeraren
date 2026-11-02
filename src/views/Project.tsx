import { useEffect, useRef, useState } from 'preact/hooks';
import { db, getSettings, useLive } from '../lib/db';
import { countdown, dayDiff, fmtDateTime, fmtDay, fmtDayShort, parseLocal, relativeDayLabel, startOfDay } from '../lib/time';
import { buzz, go, openSheet, route, toast } from '../lib/ui';
import { deleteTask, moveTaskToDay, sortTasks, toggleDone } from '../lib/actions';
import { buildIcs, shareOrDownload, slug } from '../lib/ics';
import { Empty, Fab, Header, TaskRowContent, catStyle } from '../components/common';
import { SwipeRow } from '../components/SwipeRow';
import type { Category, Task } from '../lib/types';

interface DragState {
  task: Task;
  y: number;
  overDay: string | null;
}

export function ProjectView() {
  const r = route.use();
  const id = r.path[1];
  const project = useLive(() => db.projects.get(id).then((p) => p ?? null), [id]);
  const tasks = useLive(() => db.tasks.where('projectId').equals(id).toArray(), [id]);
  const cats = useLive(() => db.categories.toArray());
  const [day, setDay] = useState<string>('all');
  const [drag, setDrag] = useState<DragState | null>(null);
  const [, tick] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);
  const swipe = useRef<{ x: number; y: number } | null>(null);

  useEffect(() => {
    const t = setInterval(() => tick((n) => n + 1), 30000);
    return () => clearInterval(t);
  }, []);
  const ctx = useRef<{ sorted: { t: Task; start: Date }[]; deadline: string }>({ sorted: [], deadline: '' });

  useEffect(() => {
    if (!drag) return;
    const preventScroll = (e: TouchEvent) => e.preventDefault();
    const findDay = (x: number, y: number) => {
      const el = document.elementFromPoint(x, y)?.closest('[data-day]') as HTMLElement | null;
      return el?.dataset.day ?? null;
    };
    const onMove = (e: PointerEvent) => {
      setDrag((d) => (d ? { ...d, y: e.clientY, overDay: findDay(e.clientX, e.clientY) } : d));
      const edge = 80;
      if (e.clientY < edge) window.scrollBy(0, -12);
      else if (e.clientY > window.innerHeight - edge) window.scrollBy(0, 12);
    };
    const onUp = (e: PointerEvent) => {
      const target = findDay(e.clientX, e.clientY);
      const d = drag;
      setDrag(null);
      if (d && target) {
        const date = new Date(target);
        const { sorted, deadline } = ctx.current;
        const cur = sorted.find((x) => x.t.id === d.task.id);
        if (cur && dayDiff(startOfDay(cur.start), date) !== 0) {
          buzz();
          moveTaskToDay(d.task, deadline, date);
        }
      }
    };
    document.addEventListener('touchmove', preventScroll, { passive: false });
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
    window.addEventListener('pointercancel', onUp);
    return () => {
      document.removeEventListener('touchmove', preventScroll);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
      window.removeEventListener('pointercancel', onUp);
    };
  }, [drag?.task.id]);

  if (project === undefined || !tasks || !cats) return null;
  if (!project) {
    return (
      <>
        <Header title="Projekt saknas" backTo="" />
        <main class="content">
          <Empty icon="🤷" text="Projektet finns inte längre." />
        </main>
      </>
    );
  }

  const catMap = new Map<string, Category>(cats.map((c) => [c.id, c]));
  const dl = parseLocal(project.deadline);
  const now = new Date();
  const visible = tasks.filter((t) => !catMap.get(t.categoryId)?.archivedAt);
  const sorted = sortTasks(visible, project.deadline);
  const nextId = sorted.find((x) => !x.t.doneAt)?.t.id;
  const done = visible.filter((t) => t.doneAt).length;
  ctx.current = { sorted, deadline: project.deadline };

  const groups = new Map<string, { date: Date; items: typeof sorted }>();
  for (const x of sorted) {
    const k = startOfDay(x.start).toISOString();
    if (!groups.has(k)) groups.set(k, { date: startOfDay(x.start), items: [] });
    groups.get(k)!.items.push(x);
  }
  const dayKeys = [...groups.keys()];
  if (day !== 'all' && !groups.has(day) && dayKeys.length) setTimeout(() => setDay('all'));
  const shown = day === 'all' ? [...groups.entries()] : [...groups.entries()].filter(([k]) => k === day);
  const usedCats = cats.filter((c) => !c.archivedAt && visible.some((t) => t.categoryId === c.id));

  const exportCal = async () => {
    const s = await getSettings();
    const ics = buildIcs(project, visible, cats, s.calendarAlarmMin);
    const n = visible.filter((t) => !t.doneAt).length;
    const res = await shareOrDownload(`${slug(project.name)}.ics`, ics, 'text/calendar');
    if (res !== 'cancelled') toast(res === 'shared' ? `${n} moment skickade – välj Kalender för att importera` : `${slug(project.name)}.ics sparad – öppna den för att lägga in ${n} moment`);
  };

  /* ---- dra moment till annan dag (långtryck) ---- */
  const startDrag = (t: Task, e: PointerEvent) => {
    setDrag({ task: t, y: e.clientY, overDay: null });
  };

  /* ---- swipe mellan dagar (på ytor utanför raderna) ---- */
  const allKeys = ['all', ...dayKeys];
  const onListDown = (e: PointerEvent) => {
    if ((e.target as HTMLElement).closest('.swipe')) return;
    swipe.current = { x: e.clientX, y: e.clientY };
  };
  const onListUp = (e: PointerEvent) => {
    const s = swipe.current;
    swipe.current = null;
    if (!s) return;
    const dx = e.clientX - s.x;
    if (Math.abs(dx) > 70 && Math.abs(dx) > Math.abs(e.clientY - s.y) * 1.5) {
      const i = allKeys.indexOf(day);
      const ni = Math.max(0, Math.min(allKeys.length - 1, i + (dx < 0 ? 1 : -1)));
      setDay(allKeys[ni]);
    }
  };

  // Lägg till dagar i närheten som släppmål när man drar
  const dropDays: Date[] = [];
  if (drag) {
    const first = sorted.length ? startOfDay(sorted[0].start) : startOfDay(dl);
    const start = new Date(Math.min(+first, +startOfDay(now)));
    for (let d = new Date(start); d <= dl; d = new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1)) dropDays.push(d);
  }

  return (
    <>
      <Header
        title={`${project.emoji ? project.emoji + ' ' : ''}${project.name}`}
        sub={`Klar ${fmtDateTime(dl)} · ${countdown(dl, now)}`}
        backTo=""
        actions={
          <button class="icon-btn" aria-label="Fler val" onClick={() => openSheet('project-menu', { id: project.id, exportCal })}>
            ⋯
          </button>
        }
      />
      {visible.length > 0 && (
        <div class="days" role="tablist" aria-label="Dagar">
          {allKeys.map((k) => (
            <button role="tab" aria-selected={day === k} class={day === k ? 'on' : ''} onClick={() => setDay(k)}>
              {k === 'all' ? 'Alla' : fmtDayShort(groups.get(k)!.date)}
            </button>
          ))}
        </div>
      )}
      <main class="content" ref={listRef} onPointerDown={onListDown as never} onPointerUp={onListUp as never}>
        {visible.length > 0 && (
          <>
            <div class="progress-line">
              <div class="bar">
                <span style={{ width: `${(done / visible.length) * 100}%`, background: 'var(--accent-strong)' }} />
              </div>
              <span>
                {done} av {visible.length} klara
              </span>
            </div>
            <div class="legend">
              {usedCats.map((c) => (
                <span class="legend-chip" style={catStyle(c)}>
                  {c.icon} {c.name}
                </span>
              ))}
            </div>
          </>
        )}
        {visible.length === 0 && (
          <Empty icon="🗓️" text="Dela upp projektet i moment – eller planera in ett recept så blir stegen moment.">
            <button class="btn primary" onClick={() => openSheet('task-form', { projectId: project.id })}>
              ＋ Moment
            </button>
            <button class="btn ghost" onClick={() => go('recipes')}>
              Från receptboken
            </button>
          </Empty>
        )}
        {drag ? (
          <div class="drop-days">
            <p class="hint">Släpp på dagen du vill flytta "{drag.task.title}" till</p>
            {dropDays.map((d) => (
              <div data-day={d.toISOString()} class={`drop-day ${drag.overDay === d.toISOString() ? 'over' : ''}`}>
                {fmtDay(d)} · {relativeDayLabel(d, dl)}
              </div>
            ))}
          </div>
        ) : (
          shown.map(([k, g]) => (
            <section data-day={k}>
              <h2 class="dayhead">
                <span>{fmtDay(g.date).replace(/^./, (c) => c.toUpperCase())}</span>
                <span>{relativeDayLabel(g.date, dl)}</span>
              </h2>
              {g.items.map(({ t, start }) => (
                <SwipeRow
                  rightLabel={t.doneAt ? 'Ej klar' : 'Klar'}
                  onSwipeRight={() => toggleDone(t)}
                  onTap={() => go(`t/${t.id}`)}
                  onLongPress={(e) => startDrag(t, e)}
                  actions={[
                    { label: 'Redigera', tone: 'edit', run: () => openSheet('task-form', { projectId: project.id, taskId: t.id }) },
                    { label: 'Ta bort', tone: 'del', run: () => deleteTask(t) }
                  ]}
                >
                  <TaskRowContent
                    task={t}
                    cat={catMap.get(t.categoryId)}
                    start={start}
                    next={t.id === nextId}
                    overdue={!t.doneAt && start < now && t.id !== nextId}
                    onCheck={() => toggleDone(t)}
                  />
                </SwipeRow>
              ))}
            </section>
          ))
        )}
        {visible.length > 0 && !drag && <p class="hint">Swipa höger = klar · vänster = redigera · håll inne för att flytta till annan dag</p>}
      </main>
      {drag && (
        <div class="drag-ghost" style={{ top: `${drag.y - 30}px`, ...catStyle(catMap.get(drag.task.categoryId)) }}>
          {catMap.get(drag.task.categoryId)?.icon} {drag.task.title}
        </div>
      )}
      {!drag && <Fab label="＋ Moment" onClick={() => openSheet('task-form', { projectId: project.id })} />}
    </>
  );
}
