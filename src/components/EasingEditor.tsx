import { useRef, useState } from 'react';
import { EASING_GROUPS, bezierId, getEasing, type Bezier } from '../engine/easing';

const W = 200;
const H = 140;
const PAD_Y = 30;
const SAVED_KEY = 'animora.easings';

interface SavedEasing {
  name: string;
  id: string;
}

function loadSaved(): SavedEasing[] {
  try {
    return JSON.parse(localStorage.getItem(SAVED_KEY) ?? '[]');
  } catch {
    return [];
  }
}

/**
 * Easing dropdown + curve preview. The curve's handles can be dragged to make a custom cubic-bezier,
 * which can be saved by name; step easings get a step count and start/end choice.
 */
export function EasingEditor({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const e = getEasing(value);
  const svgRef = useRef<SVGSVGElement>(null);
  const [saved, setSaved] = useState(loadSaved);
  const isCustom = value.startsWith('cubic-bezier') && !saved.some((s) => s.id === value);
  const bez: Bezier | undefined = e.bezier;

  const X = (t: number) => t * W;
  const Y = (v: number) => PAD_Y + (1 - v) * (H - 2 * PAD_Y);
  let d = '';
  for (let i = 0; i <= 80; i++) {
    const t = i / 80;
    d += `${i ? 'L' : 'M'}${X(t).toFixed(1)} ${Y(e.fn(t)).toFixed(1)}`;
  }

  const drag = (which: 0 | 1) => (ev: React.PointerEvent) => {
    if (!bez) return;
    ev.preventDefault();
    const svg = svgRef.current!;
    (ev.target as Element).setPointerCapture(ev.pointerId);
    const move = (m: PointerEvent) => {
      const r = svg.getBoundingClientRect();
      const x = Math.min(1, Math.max(0, (m.clientX - r.left) / r.width));
      const yPix = ((m.clientY - r.top) / r.height) * H;
      const y = Math.min(2, Math.max(-1, 1 - (yPix - PAD_Y) / (H - 2 * PAD_Y)));
      const b = [...bez] as Bezier;
      b[which * 2] = x;
      b[which * 2 + 1] = y;
      onChange(bezierId(b));
    };
    const up = () => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  const save = () => {
    const name = prompt('Name this easing', 'My easing')?.trim();
    if (!name) return;
    const next = [...saved.filter((s) => s.name !== name), { name, id: value }];
    setSaved(next);
    try {
      localStorage.setItem(SAVED_KEY, JSON.stringify(next));
    } catch {
      /* ignore */
    }
  };

  const selectValue = e.steps ? 'steps' : isCustom ? 'custom' : value;

  return (
    <div className="easing-editor">
      <select
        value={selectValue}
        onChange={(ev) => {
          const v = ev.target.value;
          if (v === 'custom') onChange(bezierId(bez ?? [0.4, 0, 0.2, 1]));
          else if (v === 'steps') onChange('steps(4,end)');
          else onChange(v);
        }}
      >
        {EASING_GROUPS.filter((g) => g.group !== 'Steps').map((g) => (
          <optgroup key={g.group} label={g.group}>
            {g.items.map((it) => (
              <option key={it.id} value={it.id}>{it.label}</option>
            ))}
          </optgroup>
        ))}
        {saved.length > 0 && (
          <optgroup label="Saved">
            {saved.map((s) => <option key={s.name} value={s.id}>{s.name}</option>)}
          </optgroup>
        )}
        <optgroup label="Other">
          <option value="steps">Steps…</option>
          <option value="custom">Custom cubic-bezier…</option>
        </optgroup>
      </select>
      {e.steps && (
        <div className="grid2">
          <label className="mini-field">
            <span>Steps</span>
            <input type="number" min={1} max={1000} value={e.steps.n} onChange={(ev) => onChange(`steps(${Math.max(1, Math.min(1000, +ev.target.value || 1))},${e.steps!.start ? 'start' : 'end'})`)} />
          </label>
          <select value={e.steps.start ? 'start' : 'end'} onChange={(ev) => onChange(`steps(${e.steps!.n},${ev.target.value})`)}>
            <option value="start">Step start</option>
            <option value="end">Step end</option>
          </select>
        </div>
      )}
      <svg ref={svgRef} className="easing-curve" viewBox={`0 0 ${W} ${H}`}>
        <rect x={0} y={Y(1)} width={W} height={Y(0) - Y(1)} className="easing-box" />
        <path d={d} className="easing-path" />
        {bez && (
          <g>
            <line x1={X(0)} y1={Y(0)} x2={X(bez[0])} y2={Y(bez[1])} className="easing-arm" />
            <line x1={X(1)} y1={Y(1)} x2={X(bez[2])} y2={Y(bez[3])} className="easing-arm" />
            <circle cx={X(bez[0])} cy={Y(bez[1])} r={6} className="easing-handle" onPointerDown={drag(0)} />
            <circle cx={X(bez[2])} cy={Y(bez[3])} r={6} className="easing-handle" onPointerDown={drag(1)} />
          </g>
        )}
      </svg>
      {bez && (
        <div className="easing-code">
          <input
            key={value}
            defaultValue={bez.map((v) => Math.round(v * 1000) / 1000).join(', ')}
            title="Easing function values (x1, y1, x2, y2)"
            onKeyDown={(ev) => ev.key === 'Enter' && (ev.target as HTMLInputElement).blur()}
            onBlur={(ev) => {
              const v = ev.target.value.split(/[\s,]+/).map(Number);
              if (v.length === 4 && v.every(Number.isFinite)) onChange(bezierId([Math.min(1, Math.max(0, v[0])), v[1], Math.min(1, Math.max(0, v[2])), v[3]]));
            }}
          />
          <button className="btn sm" onClick={save} title="Save this curve to reuse it">Save</button>
        </div>
      )}
    </div>
  );
}
