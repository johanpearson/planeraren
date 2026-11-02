import type { ComponentChildren } from 'preact';
import { useRef, useState } from 'preact/hooks';
import { buzz } from '../lib/ui';

interface Props {
  children: ComponentChildren;
  onSwipeRight?: () => void;
  rightLabel?: string;
  actions?: { label: string; tone?: 'edit' | 'del'; run: () => void }[];
  onTap?: () => void;
  onLongPress?: (e: PointerEvent) => void;
  class?: string;
}

const EDGE_GUARD = 24; // låt Androids bakåt-gest vara i fred
const OPEN_W = 160;

/** Rad med swipe höger (t.ex. bocka av) och swipe vänster (visar åtgärder). */
export function SwipeRow({ children, onSwipeRight, rightLabel = 'Klar', actions = [], onTap, onLongPress, class: cls = '' }: Props) {
  const el = useRef<HTMLDivElement>(null);
  const st = useRef<{ x: number; y: number; dx: number; mode: 'idle' | 'h' | 'v'; t?: ReturnType<typeof setTimeout>; long: boolean } | null>(null);
  const [open, setOpen] = useState(false);
  const [active, setActive] = useState(false);
  const [x, setX] = useState(0);
  const [anim, setAnim] = useState(true);

  const down = (e: PointerEvent) => {
    if ((e.target as HTMLElement).closest('[data-noswipe]')) return;
    if (e.pointerType === 'touch' && (e.clientX < EDGE_GUARD || e.clientX > window.innerWidth - EDGE_GUARD)) return;
    st.current = { x: e.clientX, y: e.clientY, dx: 0, mode: 'idle', long: false };
    if (onLongPress) {
      st.current.t = setTimeout(() => {
        if (st.current && st.current.mode === 'idle') {
          st.current.long = true;
          buzz(20);
          onLongPress(e);
          st.current = null;
        }
      }, 450);
    }
  };
  const move = (e: PointerEvent) => {
    const s = st.current;
    if (!s) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    if (s.mode === 'idle') {
      if (Math.abs(dy) > 10 && Math.abs(dy) > Math.abs(dx)) {
        clearTimeout(s.t);
        st.current = null;
        return;
      }
      if (Math.abs(dx) > 10) {
        s.mode = 'h';
        clearTimeout(s.t);
        setActive(true);
        setAnim(false);
        (e.currentTarget as HTMLElement).setPointerCapture?.(e.pointerId);
      } else return;
    }
    const base = open ? -OPEN_W : 0;
    let v = base + dx;
    if (!onSwipeRight && v > 0) v = 0;
    if (!actions.length && v < 0) v = 0;
    v = Math.max(-OPEN_W - 30, Math.min(150, v));
    s.dx = v;
    setX(v);
  };
  const up = () => {
    const s = st.current;
    st.current = null;
    if (!s) return;
    clearTimeout(s.t);
    setAnim(true);
    if (s.mode !== 'h') {
      if (open) {
        setOpen(false);
        setX(0);
        setTimeout(() => setActive(false), 250);
      } else if (!s.long) onTap?.();
      return;
    }
    if (s.dx > 90 && onSwipeRight) {
      buzz();
      setX(window.innerWidth);
      setTimeout(() => {
        onSwipeRight();
        setAnim(false);
        setX(0);
        setActive(false);
        requestAnimationFrame(() => setAnim(true));
      }, 180);
    } else if (s.dx < -70 && actions.length) {
      setOpen(true);
      setX(-OPEN_W);
    } else {
      setOpen(false);
      setX(0);
      setTimeout(() => setActive(false), 250);
    }
  };
  const cancel = () => {
    if (st.current) clearTimeout(st.current.t);
    st.current = null;
    setAnim(true);
    setX(open ? -OPEN_W : 0);
  };

  return (
    <div class={`swipe ${active ? 'active' : ''} ${cls}`}>
      <div class="swipe-under" aria-hidden={!active}>
        <div class="swipe-done">✓ {rightLabel}</div>
        <div class="swipe-actions">
          {actions.map((a) => (
            <button
              type="button"
              class={`swipe-act ${a.tone || ''}`}
              onClick={() => {
                setOpen(false);
                setX(0);
                setActive(false);
                a.run();
              }}
            >
              {a.label}
            </button>
          ))}
        </div>
      </div>
      <div
        ref={el}
        class="swipe-top"
        style={{ transform: x ? `translateX(${x}px)` : undefined, transition: anim ? undefined : 'none' }}
        onPointerDown={down as never}
        onPointerMove={move as never}
        onPointerUp={up}
        onPointerCancel={cancel}
        onContextMenu={(e) => onLongPress && e.preventDefault()}
      >
        {children}
      </div>
    </div>
  );
}
