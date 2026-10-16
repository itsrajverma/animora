import { useRef } from 'react';
import { EASING_GROUPS, bezierId, getEasing, type Bezier } from '../engine/easing';

const W = 200;
const H = 140;
const PAD_Y = 30;

/** Easing dropdown + curve preview; the curve's handles can be dragged to make a custom cubic-bezier. */
export function EasingEditor({ value, onChange }: { value: string; onChange: (id: string) => void }) {
  const e = getEasing(value);
  const svgRef = useRef<SVGSVGElement>(null);
  const isCustom = value.startsWith('cubic-bezier');
  const bez: Bezier | undefined = e.bezier;

  const X = (t: number) => t * W;
  const Y = (v: number) => PAD_Y + (1 - v) * (H - 2 * PAD_Y);
  let d = '';
  for (let i = 0; i <= 60; i++) {
    const t = i / 60;
    d += `${i ? 'L' : 'M'}${X(t).toFixed(1)} ${Y(e.fn(t)).toFixed(1)}`;
  }

  const drag = (which: 0 | 1) => (ev: React.PointerEvent) => {
    if (!bez) return;
    ev.preventDefault();
    const svg = svgRef.current!;
    (ev.target as Element).setPointerCapture(ev.pointerId);
    const move = (m: PointerEvent) => {
      const r = svg.getBoundingClientRect();
      const x = Math.min(1, Math.max(0, ((m.clientX - r.left) / r.width) * 1));
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

  return (
    <div className="easing-editor">
      <select value={isCustom ? 'custom' : e.id} onChange={(ev) => onChange(ev.target.value === 'custom' ? bezierId(bez ?? [0.4, 0, 0.2, 1]) : ev.target.value)}>
        {EASING_GROUPS.map((g) => (
          <optgroup key={g.group} label={g.group}>
            {g.items.map((it) => (
              <option key={it.id} value={it.id}>{it.label}</option>
            ))}
          </optgroup>
        ))}
        <option value="custom">Custom cubic-bezier…</option>
      </select>
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
      {bez && <div className="easing-code" title="Drag the handles to customise">cubic-bezier({bez.map((v) => Math.round(v * 100) / 100).join(', ')})</div>}
    </div>
  );
}
