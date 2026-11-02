import type { ComponentChildren, CSSProperties } from 'preact';
import { useEffect, useRef } from 'preact/hooks';
import { PALETTE } from '../lib/palette';
import type { Category, Task } from '../lib/types';
import { back, closeSheet, confirmDlg, go, route, snack } from '../lib/ui';
import { fmtTime, formatDuration } from '../lib/time';

export function catStyle(c?: Category): CSSProperties {
  const p = PALETTE[c?.color ?? 'gra'] ?? PALETTE.gra;
  return { '--bgc': p.bg, '--bgd': p.bgDark, '--edge': p.edge } as CSSProperties;
}

export function Header({ title, sub, backTo, actions }: { title: ComponentChildren; sub?: ComponentChildren; backTo?: string; actions?: ComponentChildren }) {
  return (
    <header class="top">
      {backTo !== undefined && (
        <button class="icon-btn back" aria-label="Tillbaka" onClick={() => back(backTo)}>
          ←
        </button>
      )}
      <div class="top-text">
        <h1>{title}</h1>
        {sub && <div class="sub">{sub}</div>}
      </div>
      {actions && <div class="top-actions">{actions}</div>}
    </header>
  );
}

const TABS = [
  { path: '', icon: '▦', label: 'Projekt', match: ['', 'p', 'archive', 't'] },
  { path: 'today', icon: '☀', label: 'Idag', match: ['today'] },
  { path: 'recipes', icon: '📖', label: 'Recept', match: ['recipes', 'r', 'import'] },
  { path: 'settings', icon: '⚙', label: 'Inställningar', match: ['settings'] }
];

export function TabBar() {
  const r = route.use();
  const cur = r.path[0] ?? '';
  return (
    <nav class="tabbar" aria-label="Huvudmeny">
      {TABS.map((t) => (
        <a
          href={`#/${t.path}`}
          class={t.match.includes(cur) ? 'on' : ''}
          aria-current={t.match.includes(cur) ? 'page' : undefined}
          onClick={(e) => {
            e.preventDefault();
            go(t.path);
          }}
        >
          <b aria-hidden="true">{t.icon}</b>
          {t.label}
        </a>
      ))}
    </nav>
  );
}

export function Fab({ label, onClick }: { label: string; onClick: () => void }) {
  return (
    <button class="fab" onClick={onClick}>
      {label}
    </button>
  );
}

export function SnackBar() {
  const s = snack.use();
  return (
    <div class={`snack ${s ? 'show' : ''}`} role="status" aria-live="polite">
      <span>{s?.text}</span>
      {s?.action && (
        <button
          onClick={() => {
            s.action!.run();
            snack.set(null);
          }}
        >
          {s.action.label.toUpperCase()}
        </button>
      )}
    </div>
  );
}

export function ConfirmDialog() {
  const c = confirmDlg.use();
  if (!c) return null;
  const done = (v: boolean) => {
    confirmDlg.set(null);
    c.resolve(v);
  };
  return (
    <div class="dialog-bg" onClick={() => done(false)}>
      <div class="dialog" role="alertdialog" aria-modal="true" onClick={(e) => e.stopPropagation()}>
        <h2>{c.title}</h2>
        {c.text && <p>{c.text}</p>}
        <div class="btn-row">
          <button class="btn ghost" onClick={() => done(false)}>
            Avbryt
          </button>
          <button class={`btn ${c.danger ? 'danger' : 'primary'}`} onClick={() => done(true)}>
            {c.ok}
          </button>
        </div>
      </div>
    </div>
  );
}

/** Bottom sheet-ram. Innehållet väljs av SheetHost i app.tsx. */
export function Sheet({ title, children }: { title: string; children: ComponentChildren }) {
  const ref = useRef<HTMLDivElement>(null);
  const drag = useRef<{ y: number; dy: number } | null>(null);
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && closeSheet();
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, []);
  const down = (e: PointerEvent) => (drag.current = { y: e.clientY, dy: 0 });
  const move = (e: PointerEvent) => {
    if (!drag.current || !ref.current) return;
    drag.current.dy = Math.max(0, e.clientY - drag.current.y);
    ref.current.style.transform = `translateY(${drag.current.dy}px)`;
  };
  const up = () => {
    if (!drag.current || !ref.current) return;
    if (drag.current.dy > 90) closeSheet();
    else ref.current.style.transform = '';
    drag.current = null;
  };
  return (
    <div class="sheet-bg" onClick={closeSheet}>
      <div class="sheet" ref={ref} role="dialog" aria-modal="true" aria-label={title} onClick={(e) => e.stopPropagation()}>
        <div class="sheet-grab" onPointerDown={down as never} onPointerMove={move as never} onPointerUp={up} onPointerCancel={up}>
          <span />
        </div>
        <h2 class="sheet-title">{title}</h2>
        <div class="sheet-body">{children}</div>
      </div>
    </div>
  );
}

export function TaskRowContent({
  task,
  cat,
  start,
  next,
  overdue,
  showProject,
  onCheck
}: {
  task: Task;
  cat?: Category;
  start: Date;
  next?: boolean;
  overdue?: boolean;
  showProject?: string;
  onCheck: () => void;
}) {
  const timerLeft = task.timerEndsAt ? Math.max(0, Math.ceil((task.timerEndsAt - Date.now()) / 60000)) : null;
  return (
    <div class={`task ${task.doneAt ? 'done' : ''} ${next ? 'next' : ''}`} style={catStyle(cat)}>
      <div class="task-ico" aria-hidden="true">
        {cat?.icon ?? '•'}
      </div>
      <div class="task-t">
        <div class="task-title">
          {task.title || 'Namnlöst moment'}
          {next && !task.doneAt && <span class="pill">Nästa</span>}
          {overdue && <span class="pill warn">Försenad</span>}
          {timerLeft !== null && <span class="pill">⏱ {timerLeft} min</span>}
        </div>
        <div class="task-meta">
          {showProject ? `${showProject} · ` : `${cat?.name ?? 'Utan kategori'} · `}
          {fmtTime(start)}
          {task.durationMin ? ` · ${formatDuration(task.durationMin)}` : ''}
          {task.checklist.length ? ` · ☑ ${task.checklist.filter((c) => c.checked).length}/${task.checklist.length}` : ''}
        </div>
      </div>
      <button
        class="check"
        data-noswipe
        role="checkbox"
        aria-checked={!!task.doneAt}
        aria-label={task.doneAt ? 'Markera ej klar' : 'Markera klar'}
        onClick={(e) => {
          e.stopPropagation();
          onCheck();
        }}
      >
        {task.doneAt ? '✓' : ''}
      </button>
    </div>
  );
}

export function Empty({ icon, text, children }: { icon: string; text: string; children?: ComponentChildren }) {
  return (
    <div class="empty">
      <div class="empty-ico" aria-hidden="true">
        {icon}
      </div>
      <p>{text}</p>
      {children}
    </div>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: ComponentChildren }) {
  return (
    <label class="field">
      <span class="lbl">{label}</span>
      {children}
      {hint && <span class="hint">{hint}</span>}
    </label>
  );
}
