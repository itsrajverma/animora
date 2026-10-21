import { useEffect, useRef, useState } from 'react';
import { uid } from '../model/factory';
import { toHex6 } from '../engine/color';

interface NumProps {
  label: string;
  value: number;
  onChange: (v: number, key: string) => void;
  step?: number;
  min?: number;
  max?: number;
  unit?: string;
  title?: string;
  /** Show the (draggable) label as a small suffix inside the box, SVGator style. */
  suffix?: boolean;
  disabled?: boolean;
}

const clamp = (v: number, min?: number, max?: number) => Math.min(max ?? Infinity, Math.max(min ?? -Infinity, v));
const round = (v: number, step: number) => {
  const dec = Math.max(0, Math.ceil(-Math.log10(step)));
  return Number(v.toFixed(Math.min(4, dec + 1)));
};

/** Numeric input whose label can be dragged horizontally to scrub the value. */
export function NumberField({ label, value, onChange, step = 1, min, max, unit, title, suffix, disabled }: NumProps) {
  const [text, setText] = useState<string | null>(null);
  const keyRef = useRef('');
  const shown = text ?? String(round(value, step));

  const commit = (s: string) => {
    const v = parseFloat(s);
    if (Number.isFinite(v)) onChange(clamp(v, min, max), 'field:' + label);
    setText(null);
  };

  const startScrub = (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const x0 = e.clientX;
    const v0 = value;
    keyRef.current = 'g:' + uid();
    const el = e.currentTarget as HTMLElement;
    el.setPointerCapture(e.pointerId);
    const move = (ev: PointerEvent) => {
      const k = ev.shiftKey ? 10 : ev.altKey ? 0.1 : 1;
      const v = clamp(v0 + Math.round((ev.clientX - x0) / 2) * step * k, min, max);
      onChange(round(v, step), keyRef.current);
    };
    const up = () => {
      el.removeEventListener('pointermove', move);
      el.removeEventListener('pointerup', up);
    };
    el.addEventListener('pointermove', move);
    el.addEventListener('pointerup', up);
  };

  const labelEl = <span className="num-label" onPointerDown={disabled ? undefined : startScrub}>{label}</span>;
  return (
    <div className={`num-field ${suffix ? 'suffix' : ''} ${disabled ? 'disabled' : ''}`} title={title}>
      {!suffix && labelEl}
      <input
        disabled={disabled}
        value={shown}
        onChange={(e) => setText(e.target.value)}
        onFocus={(e) => e.target.select()}
        onBlur={(e) => commit(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
          if (e.key === 'Escape') {
            setText(null);
            (e.target as HTMLInputElement).blur();
          }
          if (e.key === 'ArrowUp' || e.key === 'ArrowDown') {
            e.preventDefault();
            const k = (e.shiftKey ? 10 : 1) * (e.key === 'ArrowUp' ? 1 : -1);
            onChange(round(clamp(value + k * step, min, max), step), 'field:' + label);
            setText(null);
          }
        }}
      />
      {unit && <span className="num-unit">{unit}</span>}
      {suffix && labelEl}
    </div>
  );
}

export function ColorField({ value, onChange, allowNone = true }: { value: string; onChange: (v: string, key: string) => void; allowNone?: boolean }) {
  const [text, setText] = useState<string | null>(null);
  const isNone = value === 'none';
  const isUrl = value.startsWith('url');
  useEffect(() => setText(null), [value]);
  return (
    <div className="color-field">
      <label className={`swatch ${isNone ? 'none' : ''}`} style={{ background: isNone || isUrl ? undefined : value }}>
        <input type="color" value={toHex6(isNone || isUrl ? '#000000' : value)} onChange={(e) => onChange(e.target.value, 'color')} />
      </label>
      <input
        className="color-text"
        value={text ?? value}
        onChange={(e) => setText(e.target.value)}
        onBlur={(e) => {
          if (e.target.value.trim() && e.target.value !== value) onChange(e.target.value.trim(), 'colortext');
          setText(null);
        }}
        onKeyDown={(e) => e.key === 'Enter' && (e.target as HTMLInputElement).blur()}
      />
      {allowNone && (
        <button className={`mini ${isNone ? 'on' : ''}`} title={isNone ? 'Set a color' : 'No paint'} onClick={() => onChange(isNone ? '#5b6cff' : 'none', 'none')}>
          ∅
        </button>
      )}
    </div>
  );
}
