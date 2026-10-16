import type { Keyframe, PropKey, SvgEl, Value } from '../model/types';
import { PROP_META } from '../model/props';
import { getEasing } from './easing';
import { lerpColor } from './color';
import { lerpPath, normalizePaths } from './path';

const normCache = new WeakMap<Keyframe[], string[]>();

/** Path keyframe values brought to a common structure so they can morph. */
export function normalizedTrack(tr: Keyframe[]): string[] {
  let v = normCache.get(tr);
  if (!v) {
    const raw = tr.map((k) => String(k.value));
    v = tr.length < 2 ? raw : normalizePaths(raw);
    normCache.set(tr, v);
  }
  return v;
}

export function interp(prop: PropKey, a: Value, b: Value, u: number): Value {
  const kind = PROP_META[prop].kind;
  if (kind === 'number') {
    const na = Number(a), nb = Number(b);
    return na + (nb - na) * u;
  }
  if (kind === 'color') {
    return lerpColor(String(a), String(b), u) ?? (u < 0.5 ? a : b);
  }
  return lerpPath(String(a), String(b), u) ?? (u < 0.5 ? a : b);
}

export function trackValues(prop: PropKey, tr: Keyframe[]): Value[] {
  return prop === 'd' ? normalizedTrack(tr) : tr.map((k) => k.value);
}

export function valueAt(el: SvgEl, prop: PropKey, t: number): Value {
  const tr = el.tracks[prop];
  if (!tr || tr.length === 0) return el.props[prop] ?? PROP_META[prop].def;
  if (tr.length === 1) return tr[0].value;
  const vals = trackValues(prop, tr);
  if (t <= tr[0].time) return vals[0];
  const last = tr.length - 1;
  if (t >= tr[last].time) return vals[last];
  let i = 0;
  while (i < last - 1 && tr[i + 1].time <= t) i++;
  const span = tr[i + 1].time - tr[i].time;
  const u = span > 0 ? (t - tr[i].time) / span : 1;
  return interp(prop, vals[i], vals[i + 1], getEasing(tr[i].easing).fn(u));
}

export interface Frame {
  x: number;
  y: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  opacity: number;
  fill: string;
  stroke: string;
  strokeWidth: number;
  trim: number;
  width: number;
  height: number;
  rx: number;
  d: string;
  fontSize: number;
}

const num = (v: Value) => (typeof v === 'number' ? v : parseFloat(v) || 0);

export function frameAt(el: SvgEl, t: number): Frame {
  const g = (p: PropKey) => valueAt(el, p, t);
  return {
    x: num(g('x')),
    y: num(g('y')),
    rotation: num(g('rotation')),
    scaleX: num(g('scaleX')),
    scaleY: num(g('scaleY')),
    opacity: num(g('opacity')),
    fill: String(g('fill')),
    stroke: String(g('stroke')),
    strokeWidth: num(g('strokeWidth')),
    trim: num(g('trim')),
    width: num(g('width')),
    height: num(g('height')),
    rx: num(g('rx')),
    d: String(g('d')),
    fontSize: num(g('fontSize')),
  };
}

export const isAnimated = (el: SvgEl, prop: PropKey) => (el.tracks[prop]?.length ?? 0) > 0;
