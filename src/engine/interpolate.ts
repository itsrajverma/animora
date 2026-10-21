import type { Keyframe, PropKey, SvgEl, Value } from '../model/types';
import { PROP_META, staticValue } from '../model/props';
import { getEasing } from './easing';
import { lerpColor } from './color';
import { lerpPath, normalizePaths } from './path';
import { pointAtPercent } from './motion';

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

/** Parse a stroke-dasharray into an even-length list of numbers (SVG repeats odd lists). */
export function parseDash(v: Value): number[] {
  const nums = String(v).split(/[\s,]+/).map(parseFloat).filter((n) => Number.isFinite(n) && n >= 0);
  return nums.length % 2 ? [...nums, ...nums] : nums;
}

export const formatDash = (nums: number[]) => nums.map((n) => Math.round(n * 100) / 100).join(' ');

function lerpDash(a: Value, b: Value, u: number): string {
  let da = parseDash(a), db = parseDash(b);
  if (!da.length && !db.length) return '';
  // An empty list behaves like a solid line: a dash with no gap.
  if (!da.length) da = db.map((_, i) => (i % 2 ? 0 : Math.max(1, db[i])));
  if (!db.length) db = da.map((_, i) => (i % 2 ? 0 : Math.max(1, da[i])));
  const n = Math.max(da.length, db.length);
  const at = (l: number[], i: number) => l[i % l.length];
  return formatDash(Array.from({ length: n }, (_, i) => at(da, i) + (at(db, i) - at(da, i)) * u));
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
  if (kind === 'dash') return lerpDash(a, b, u);
  return lerpPath(String(a), String(b), u) ?? (u < 0.5 ? a : b);
}

export function trackValues(prop: PropKey, tr: Keyframe[]): Value[] {
  return prop === 'd' ? normalizedTrack(tr) : tr.map((k) => k.value);
}

export function valueAt(el: SvgEl, prop: PropKey, t: number): Value {
  const tr = el.tracks[prop];
  if (!tr || tr.length === 0) return staticValue(el, prop);
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
  originX: number;
  originY: number;
  rotation: number;
  scaleX: number;
  scaleY: number;
  skewX: number;
  skewY: number;
  opacity: number;
  fill: string;
  fillOpacity: number;
  stroke: string;
  strokeOpacity: number;
  strokeWidth: number;
  dashOffset: number;
  dashArray: string;
  trim: number;
  width: number;
  height: number;
  rx: number;
  d: string;
  fontSize: number;
  blur: number;
  shadowX: number;
  shadowY: number;
  shadowBlur: number;
  shadowColor: string;
  motion: number;
  /** Extra rotation from following the motion path (auto-rotate). */
  motionAngle: number;
}

const num = (v: Value) => (typeof v === 'number' ? v : parseFloat(v) || 0);

export function frameAt(el: SvgEl, t: number): Frame {
  const g = (p: PropKey) => valueAt(el, p, t);
  const f: Frame = {
    x: num(g('x')),
    y: num(g('y')),
    originX: num(g('originX')),
    originY: num(g('originY')),
    rotation: num(g('rotation')),
    scaleX: num(g('scaleX')),
    scaleY: num(g('scaleY')),
    skewX: num(g('skewX')),
    skewY: num(g('skewY')),
    opacity: num(g('opacity')),
    fill: String(g('fill')),
    fillOpacity: num(g('fillOpacity')),
    stroke: String(g('stroke')),
    strokeOpacity: num(g('strokeOpacity')),
    strokeWidth: num(g('strokeWidth')),
    dashOffset: num(g('dashOffset')),
    dashArray: String(g('dashArray')),
    trim: num(g('trim')),
    width: num(g('width')),
    height: num(g('height')),
    rx: num(g('rx')),
    d: String(g('d')),
    fontSize: num(g('fontSize')),
    blur: num(g('blur')),
    shadowX: num(g('shadowX')),
    shadowY: num(g('shadowY')),
    shadowBlur: num(g('shadowBlur')),
    shadowColor: String(g('shadowColor')),
    motion: num(g('motion')),
    motionAngle: 0,
  };
  if (el.motionPath) {
    const p = pointAtPercent(el.motionPath, f.motion);
    f.x = p.x;
    f.y = p.y;
    if (el.autoRotate) f.motionAngle = p.angle;
  }
  return f;
}

export const isAnimated = (el: SvgEl, prop: PropKey) => (el.tracks[prop]?.length ?? 0) > 0;

export const hasShadow = (f: Frame) => f.shadowColor !== 'none' && f.shadowColor !== '' && f.shadowColor !== 'transparent';
