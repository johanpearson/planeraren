import { db, useLive } from '../lib/db';
import { PALETTE } from '../lib/palette';
import { countdown, fmtDateTime, parseLocal, taskStart } from '../lib/time';
import { go, openSheet, route } from '../lib/ui';
import { deleteProject, setArchived } from '../lib/actions';
import { Empty, Fab, Header } from '../components/common';
import { SwipeRow } from '../components/SwipeRow';
import type { Category, Project, Task } from '../lib/types';

function ProjectCard({ p, tasks, cats }: { p: Project; tasks: Task[]; cats: Map<string, Category> }) {
  const visible = tasks.filter((t) => !cats.get(t.categoryId)?.archivedAt);
  const done = visible.filter((t) => t.doneAt);
  const now = new Date();
  const dl = parseLocal(p.deadline);
  const open = visible.filter((t) => !t.doneAt).map((t) => ({ t, s: taskStart(dl, t.offset) })).sort((a, b) => +a.s - +b.s);
  const overdue = open.filter((x) => x.s < now).length;
  const next = open.find((x) => x.s >= now) ?? open[0];
  // Förloppsstapeln visar klara moment i kategorifärg
  const segs = new Map<string, number>();
  done.forEach((t) => segs.set(t.categoryId, (segs.get(t.categoryId) || 0) + 1));
  return (
    <div class="card pcard">
      <div class="pcard-head">
        <div>
          <h3>{p.name}</h3>
          <div class="muted small">
            Klar {fmtDateTime(dl)} · {countdown(dl, now)}
          </div>
        </div>
        <span class="pcard-emoji" aria-hidden="true">
          {p.emoji || '🗓️'}
        </span>
      </div>
      <div class="bar" role="progressbar" aria-valuenow={done.length} aria-valuemax={visible.length} aria-label="Förlopp">
        {[...segs].map(([cid, n]) => (
          <span style={{ width: `${(n / Math.max(1, visible.length)) * 100}%`, background: PALETTE[cats.get(cid)?.color ?? 'gra'].edge }} />
        ))}
      </div>
      <div class="chips">
        <span class="chip">
          {done.length} av {visible.length} klara
        </span>
        {overdue > 0 && <span class="chip warn">{overdue} försenat</span>}
        {next && !p.archivedAt && <span class="chip">Nästa: {next.t.title}</span>}
      </div>
    </div>
  );
}

export function ProjectsView() {
  const r = route.use();
  const archive = r.path[0] === 'archive';
  const projects = useLive(() => db.projects.toArray());
  const tasks = useLive(() => db.tasks.toArray());
  const cats = useLive(() => db.categories.toArray());
  if (!projects || !tasks || !cats) return null;
  const catMap = new Map(cats.map((c) => [c.id, c]));
  const list = projects
    .filter((p) => (archive ? p.archivedAt : !p.archivedAt))
    .sort((a, b) => (archive ? (b.archivedAt || 0) - (a.archivedAt || 0) : a.deadline.localeCompare(b.deadline)));
  const archivedCount = projects.filter((p) => p.archivedAt).length;
  return (
    <>
      <Header title={archive ? 'Arkiv' : 'Projekt'} sub={archive ? `${list.length} arkiverade` : `${list.length} pågående`} backTo={archive ? '' : undefined} />
      <main class="content">
        {list.length === 0 && !archive && (
          <Empty icon="🗓️" text="Inga projekt ännu. Planera en tårta, en fest, en flytt – vad som helst med en deadline.">
            <button class="btn primary" onClick={() => openSheet('project-form')}>
              ＋ Nytt projekt
            </button>
            <button class="btn ghost" onClick={() => go('recipes')}>
              Receptbok
            </button>
          </Empty>
        )}
        {list.length === 0 && archive && <Empty icon="🗄️" text="Inga arkiverade projekt." />}
        {list.map((p) => (
          <SwipeRow
            class="card-swipe"
            onTap={() => go(`p/${p.id}`)}
            actions={[
              archive
                ? { label: 'Återställ', tone: 'edit', run: () => setArchived(p.id, false) }
                : { label: 'Arkivera', tone: 'edit', run: () => setArchived(p.id, true) },
              { label: 'Ta bort', tone: 'del', run: () => deleteProject(p.id) }
            ]}
          >
            <ProjectCard p={p} tasks={tasks.filter((t) => t.projectId === p.id)} cats={catMap} />
          </SwipeRow>
        ))}
        {!archive && archivedCount > 0 && (
          <button class="link-btn" onClick={() => go('archive')}>
            Arkiv ({archivedCount} projekt)
          </button>
        )}
        {!archive && list.length > 0 && <p class="hint">Tips: swipa vänster på ett projekt för att arkivera eller ta bort.</p>}
      </main>
      {!archive && <Fab label="＋ Nytt projekt" onClick={() => openSheet('project-form')} />}
    </>
  );
}
