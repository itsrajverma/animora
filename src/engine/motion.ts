/**
 * Motion paths: arc-length sampling of a path so an element can travel along it
 * (the editor's equivalent of SMIL <animateMotion>).
 */
import { parsePath } from './path';

interface Sampled {
  xs: Float64Array;
  ys: Float64Array;
  /** Cumulative length at each sample. */
  ls: Float64Array;
  total: number;
}

const cache = new Map<string, Sampled>();

function sample(d: string): Sampled {
  const hit = cache.get(d);
  if (hit) return hit;
  const xs: number[] = [], ys: number[] = [];
  let px = 0, py = 0, sx = 0, sy = 0;
  const push = (x: number, y: number) => {
    xs.push(x);
    ys.push(y);
  };
  for (const c of parsePath(d)) {
    if (c.c === 'M') {
      [px, py] = c.p;
      sx = px;
      sy = py;
      if (!xs.length) push(px, py);
    } else if (c.c === 'L') {
      [px, py] = c.p;
      push(px, py);
    } else if (c.c === 'C') {
      const [x1, y1, x2, y2, x, y] = c.p;
      const N = 24;
      for (let k = 1; k <= N; k++) {
        const t = k / N, u = 1 - t;
        push(u * u * u * px + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x,
          u * u * u * py + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y);
      }
      px = x;
      py = y;
    } else {
      px = sx;
      py = sy;
      push(px, py);
    }
  }
  if (!xs.length) push(0, 0);
  const ls = new Float64Array(xs.length);
  for (let i = 1; i < xs.length; i++) ls[i] = ls[i - 1] + Math.hypot(xs[i] - xs[i - 1], ys[i] - ys[i - 1]);
  const s: Sampled = { xs: Float64Array.from(xs), ys: Float64Array.from(ys), ls, total: ls[ls.length - 1] };
  if (cache.size > 200) cache.clear();
  cache.set(d, s);
  return s;
}

export interface PathPoint {
  x: number;
  y: number;
  /** Direction of travel in degrees. */
  angle: number;
}

/** Point at `pct` (0–100) of the path's length. */
export function pointAtPercent(d: string, pct: number): PathPoint {
  const s = sample(d);
  const n = s.xs.length;
  if (n < 2 || s.total <= 0) return { x: s.xs[0], y: s.ys[0], angle: 0 };
  const target = (Math.min(100, Math.max(0, pct)) / 100) * s.total;
  let lo = 0, hi = n - 1;
  while (hi - lo > 1) {
    const m = (lo + hi) >> 1;
    if (s.ls[m] < target) lo = m;
    else hi = m;
  }
  // Skip zero-length steps so the tangent is defined.
  let a = lo, b = hi;
  while (b < n - 1 && s.ls[b] - s.ls[a] < 1e-9) b++;
  while (a > 0 && s.ls[b] - s.ls[a] < 1e-9) a--;
  const seg = s.ls[b] - s.ls[a];
  const u = seg > 0 ? Math.min(1, Math.max(0, (target - s.ls[a]) / seg)) : 0;
  const dx = s.xs[b] - s.xs[a], dy = s.ys[b] - s.ys[a];
  return { x: s.xs[a] + dx * u, y: s.ys[a] + dy * u, angle: (Math.atan2(dy, dx) * 180) / Math.PI };
}

export const pathLength = (d: string) => sample(d).total;
