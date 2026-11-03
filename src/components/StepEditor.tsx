import { useEffect, useRef } from 'preact/hooks';

/**
 * Redigerbar steglista. Enter i ett steg delar det i två, ⤴ slår ihop med steget ovanför.
 * Tomma steg tas bort först när listan lämnas ut via `cleanSteps`.
 */
export function StepEditor({ steps, onChange }: { steps: string[]; onChange: (steps: string[]) => void }) {
  const focus = useRef<{ i: number; pos: number } | null>(null);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const f = focus.current;
    if (!f || !root.current) return;
    focus.current = null;
    const el = root.current.querySelectorAll('textarea')[f.i] as HTMLTextAreaElement | undefined;
    if (el) {
      el.focus();
      el.setSelectionRange(f.pos, f.pos);
    }
  });

  const set = (i: number, value: string) => {
    if (value.includes('\n')) {
      const parts = value.split('\n').map((p) => p.trim());
      const next = [...steps.slice(0, i), ...parts, ...steps.slice(i + 1)];
      focus.current = { i: i + parts.length - 1, pos: 0 };
      onChange(next);
    } else onChange(steps.map((s, j) => (j === i ? value : s)));
  };
  const merge = (i: number) => {
    const prev = steps[i - 1].trim();
    focus.current = { i: i - 1, pos: prev.length + 1 };
    onChange([...steps.slice(0, i - 1), `${prev} ${steps[i].trim()}`.trim(), ...steps.slice(i + 1)]);
  };
  const remove = (i: number) => onChange(steps.filter((_, j) => j !== i));
  const add = () => {
    focus.current = { i: steps.length, pos: 0 };
    onChange([...steps, '']);
  };

  return (
    <div class="step-editor" ref={root}>
      {steps.map((s, i) => (
        <div class="step-edit">
          <b aria-hidden="true">{i + 1}.</b>
          <textarea
            aria-label={`Steg ${i + 1}`}
            rows={Math.max(1, Math.ceil(s.length / 34))}
            value={s}
            onInput={(e) => set(i, (e.target as HTMLTextAreaElement).value)}
          />
          <div class="step-edit-btns">
            {i > 0 && (
              <button type="button" class="row-x" title="Slå ihop med steget ovanför" aria-label={`Slå ihop steg ${i + 1} med steg ${i}`} onClick={() => merge(i)}>
                ⤴
              </button>
            )}
            <button type="button" class="row-x" aria-label={`Ta bort steg ${i + 1}`} onClick={() => remove(i)}>
              ✕
            </button>
          </div>
        </div>
      ))}
      <button type="button" class="link-btn" onClick={add}>
        ＋ Lägg till steg
      </button>
      <p class="hint left">Enter delar ett steg i två · ⤴ slår ihop med steget ovanför · ✕ tar bort</p>
    </div>
  );
}

export const cleanSteps = (steps: string[]) => steps.map((s) => s.replace(/\s+/g, ' ').trim()).filter(Boolean);
