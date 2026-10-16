/**
 * SVG path utilities: parsing into absolute M/L/C/Z commands, arc conversion,
 * bounding boxes and shape-morph normalization.
 */

export type Cmd = { c: 'M' | 'L' | 'C' | 'Z'; p: number[] };
type Pt = { x: number; y: number };

const NUM_RE = /[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/y;

export const fmt = (v: number) => {
  if (!Number.isFinite(v)) return '0';
  const r = Math.round(v * 1000) / 1000;
  return Object.is(r, -0) ? '0' : String(r);
};

function arcToCubics(
  x1: number, y1: number, rx: number, ry: number, phiDeg: number,
  fa: number, fs: number, x2: number, y2: number,
): number[][] {
  if ((x1 === x2 && y1 === y2)) return [];
  rx = Math.abs(rx);
  ry = Math.abs(ry);
  if (rx === 0 || ry === 0) return [[x1, y1, x2, y2, x2, y2]];
  const phi = (phiDeg * Math.PI) / 180;
  const cos = Math.cos(phi);
  const sin = Math.sin(phi);
  const dx = (x1 - x2) / 2;
  const dy = (y1 - y2) / 2;
  const x1p = cos * dx + sin * dy;
  const y1p = -sin * dx + cos * dy;
  const lambda = (x1p * x1p) / (rx * rx) + (y1p * y1p) / (ry * ry);
  if (lambda > 1) {
    rx *= Math.sqrt(lambda);
    ry *= Math.sqrt(lambda);
  }
  const sign = fa === fs ? -1 : 1;
  const num = rx * rx * ry * ry - rx * rx * y1p * y1p - ry * ry * x1p * x1p;
  const den = rx * rx * y1p * y1p + ry * ry * x1p * x1p;
  const coef = sign * Math.sqrt(Math.max(0, num / den));
  const cxp = (coef * rx * y1p) / ry;
  const cyp = (coef * -ry * x1p) / rx;
  const cx = cos * cxp - sin * cyp + (x1 + x2) / 2;
  const cy = sin * cxp + cos * cyp + (y1 + y2) / 2;
  const ang = (ux: number, uy: number, vx: number, vy: number) => Math.atan2(ux * vy - uy * vx, ux * vx + uy * vy);
  const t1 = ang(1, 0, (x1p - cxp) / rx, (y1p - cyp) / ry);
  let dt = ang((x1p - cxp) / rx, (y1p - cyp) / ry, (-x1p - cxp) / rx, (-y1p - cyp) / ry);
  if (!fs && dt > 0) dt -= 2 * Math.PI;
  if (fs && dt < 0) dt += 2 * Math.PI;
  const segs = Math.max(1, Math.ceil(Math.abs(dt) / (Math.PI / 2) - 1e-9));
  const delta = dt / segs;
  const k = (4 / 3) * Math.tan(delta / 4);
  const map = (ux: number, uy: number) => [cx + rx * ux * cos - ry * uy * sin, cy + rx * ux * sin + ry * uy * cos];
  const out: number[][] = [];
  for (let i = 0; i < segs; i++) {
    const a1 = t1 + i * delta;
    const a2 = a1 + delta;
    const c1 = map(Math.cos(a1) - k * Math.sin(a1), Math.sin(a1) + k * Math.cos(a1));
    const c2 = map(Math.cos(a2) + k * Math.sin(a2), Math.sin(a2) - k * Math.cos(a2));
    const e = i === segs - 1 ? [x2, y2] : map(Math.cos(a2), Math.sin(a2));
    out.push([...c1, ...c2, ...e]);
  }
  return out;
}

/** Parse any SVG path string into absolute M / L / C / Z commands. */
export function parsePath(d: string): Cmd[] {
  const out: Cmd[] = [];
  const n = d.length;
  let i = 0;
  const skip = () => {
    while (i < n && /[\s,]/.test(d[i])) i++;
  };
  const num = (): number | null => {
    skip();
    NUM_RE.lastIndex = i;
    const m = NUM_RE.exec(d);
    if (!m) return null;
    i = NUM_RE.lastIndex;
    return parseFloat(m[0]);
  };
  const flag = (): number | null => {
    skip();
    const ch = d[i];
    if (ch === '0' || ch === '1') {
      i++;
      return +ch;
    }
    return null;
  };
  const nums = (k: number): number[] | null => {
    const r: number[] = [];
    for (let j = 0; j < k; j++) {
      const v = num();
      if (v === null) return null;
      r.push(v);
    }
    return r;
  };

  let cx = 0, cy = 0, sx = 0, sy = 0;
  let lastC: Pt | null = null;
  let lastQ: Pt | null = null;
  let cmd = '';

  while (true) {
    skip();
    if (i >= n) break;
    const ch = d[i];
    if (/[a-zA-Z]/.test(ch)) {
      cmd = ch;
      i++;
    } else if (!cmd) break;
    const rel = cmd === cmd.toLowerCase();
    const C = cmd.toUpperCase();
    const ox = rel ? cx : 0;
    const oy = rel ? cy : 0;
    let nextC: Pt | null = null;
    let nextQ: Pt | null = null;
    if (C === 'Z') {
      out.push({ c: 'Z', p: [] });
      cx = sx;
      cy = sy;
      cmd = '';
    } else if (C === 'M' || C === 'L' || C === 'T') {
      const v = nums(2);
      if (!v) break;
      const x = v[0] + ox, y = v[1] + oy;
      if (C === 'M') {
        out.push({ c: 'M', p: [x, y] });
        sx = x;
        sy = y;
        cmd = rel ? 'l' : 'L';
      } else if (C === 'L') {
        out.push({ c: 'L', p: [x, y] });
      } else {
        const q: Pt = lastQ ? { x: 2 * cx - lastQ.x, y: 2 * cy - lastQ.y } : { x: cx, y: cy };
        out.push({ c: 'C', p: [cx + (2 / 3) * (q.x - cx), cy + (2 / 3) * (q.y - cy), x + (2 / 3) * (q.x - x), y + (2 / 3) * (q.y - y), x, y] });
        nextQ = q;
      }
      cx = x;
      cy = y;
    } else if (C === 'H') {
      const v = num();
      if (v === null) break;
      cx = v + ox;
      out.push({ c: 'L', p: [cx, cy] });
    } else if (C === 'V') {
      const v = num();
      if (v === null) break;
      cy = v + oy;
      out.push({ c: 'L', p: [cx, cy] });
    } else if (C === 'C') {
      const v = nums(6);
      if (!v) break;
      const p = [v[0] + ox, v[1] + oy, v[2] + ox, v[3] + oy, v[4] + ox, v[5] + oy];
      out.push({ c: 'C', p });
      nextC = { x: p[2], y: p[3] };
      cx = p[4];
      cy = p[5];
    } else if (C === 'S') {
      const v = nums(4);
      if (!v) break;
      const c1: Pt = lastC ? { x: 2 * cx - lastC.x, y: 2 * cy - lastC.y } : { x: cx, y: cy };
      const p: number[] = [c1.x, c1.y, v[0] + ox, v[1] + oy, v[2] + ox, v[3] + oy];
      out.push({ c: 'C', p });
      nextC = { x: p[2], y: p[3] };
      cx = p[4];
      cy = p[5];
    } else if (C === 'Q') {
      const v = nums(4);
      if (!v) break;
      const q = { x: v[0] + ox, y: v[1] + oy };
      const x = v[2] + ox, y = v[3] + oy;
      out.push({ c: 'C', p: [cx + (2 / 3) * (q.x - cx), cy + (2 / 3) * (q.y - cy), x + (2 / 3) * (q.x - x), y + (2 / 3) * (q.y - y), x, y] });
      nextQ = q;
      cx = x;
      cy = y;
    } else if (C === 'A') {
      const a = nums(3);
      const fa = flag();
      const fs = flag();
      const e = nums(2);
      if (!a || fa === null || fs === null || !e) break;
      const x = e[0] + ox, y = e[1] + oy;
      for (const p of arcToCubics(cx, cy, a[0], a[1], a[2], fa, fs, x, y)) out.push({ c: 'C', p });
      cx = x;
      cy = y;
    } else {
      break;
    }
    lastC = nextC;
    lastQ = nextQ;
  }
  return out;
}

export function serializePath(cmds: Cmd[]): string {
  return cmds
    .map((c) => (c.c === 'Z' ? 'Z' : c.c + c.p.map(fmt).join(' ')))
    .join(' ');
}

export function mapPath(d: string, f: (x: number, y: number) => [number, number]): string {
  return serializePath(
    parsePath(d).map((c) => {
      const p: number[] = [];
      for (let i = 0; i < c.p.length; i += 2) p.push(...f(c.p[i], c.p[i + 1]));
      return { c: c.c, p };
    }),
  );
}

export function pathBBox(d: string): { x: number; y: number; w: number; h: number } {
  let minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity;
  const add = (x: number, y: number) => {
    minX = Math.min(minX, x); minY = Math.min(minY, y);
    maxX = Math.max(maxX, x); maxY = Math.max(maxY, y);
  };
  let px = 0, py = 0;
  for (const c of parsePath(d)) {
    if (c.c === 'C') {
      const [x1, y1, x2, y2, x, y] = c.p;
      for (let k = 1; k <= 16; k++) {
        const t = k / 16, u = 1 - t;
        add(u * u * u * px + 3 * u * u * t * x1 + 3 * u * t * t * x2 + t * t * t * x,
          u * u * u * py + 3 * u * u * t * y1 + 3 * u * t * t * y2 + t * t * t * y);
      }
      px = x; py = y;
    } else if (c.c !== 'Z') {
      add(c.p[0], c.p[1]);
      px = c.p[0]; py = c.p[1];
    }
  }
  if (!Number.isFinite(minX)) return { x: 0, y: 0, w: 0, h: 0 };
  return { x: minX, y: minY, w: maxX - minX, h: maxY - minY };
}

// ---------------------------------------------------------------------------
// Morphing: bring a list of paths to an identical command structure so their
// numbers can be interpolated one-to-one (in the editor and in SMIL export).

interface Sub { x: number; y: number; segs: number[][]; closed: boolean }

function toSubs(cmds: Cmd[]): Sub[] {
  const subs: Sub[] = [];
  let cur: Sub | null = null;
  let px = 0, py = 0;
  const ensure = () => {
    if (!cur) {
      cur = { x: px, y: py, segs: [], closed: false };
      subs.push(cur);
    }
    return cur;
  };
  const line = (x0: number, y0: number, x: number, y: number) => [
    x0 + (x - x0) / 3, y0 + (y - y0) / 3, x0 + (2 * (x - x0)) / 3, y0 + (2 * (y - y0)) / 3, x, y,
  ];
  for (const c of cmds) {
    if (c.c === 'M') {
      cur = { x: c.p[0], y: c.p[1], segs: [], closed: false };
      subs.push(cur);
      px = c.p[0]; py = c.p[1];
    } else if (c.c === 'L') {
      ensure().segs.push(line(px, py, c.p[0], c.p[1]));
      px = c.p[0]; py = c.p[1];
    } else if (c.c === 'C') {
      ensure().segs.push([...c.p]);
      px = c.p[4]; py = c.p[5];
    } else if (c.c === 'Z') {
      const s = ensure();
      if (Math.hypot(px - s.x, py - s.y) > 1e-6) s.segs.push(line(px, py, s.x, s.y));
      s.closed = true;
      px = s.x; py = s.y;
      cur = null;
    }
  }
  for (const s of subs) if (!s.segs.length) s.segs.push([s.x, s.y, s.x, s.y, s.x, s.y]);
  return subs;
}

function splitSeg(x0: number, y0: number, s: number[]): [number[], number[]] {
  const [x1, y1, x2, y2, x3, y3] = s;
  const m = (a: number, b: number) => (a + b) / 2;
  const ax = m(x0, x1), ay = m(y0, y1), bx = m(x1, x2), by = m(y1, y2), cx = m(x2, x3), cy = m(y2, y3);
  const dx = m(ax, bx), dy = m(ay, by), ex = m(bx, cx), ey = m(by, cy);
  const fx = m(dx, ex), fy = m(dy, ey);
  return [[ax, ay, dx, dy, fx, fy], [ex, ey, cx, cy, x3, y3]];
}

function equalize(sub: Sub, n: number) {
  while (sub.segs.length < n) {
    let best = 0, bestLen = -1;
    let x0 = sub.x, y0 = sub.y, bx = x0, by = y0;
    sub.segs.forEach((s, i) => {
      const len = Math.hypot(s[0] - x0, s[1] - y0) + Math.hypot(s[2] - s[0], s[3] - s[1]) + Math.hypot(s[4] - s[2], s[5] - s[3]);
      if (len > bestLen) { bestLen = len; best = i; bx = x0; by = y0; }
      x0 = s[4]; y0 = s[5];
    });
    sub.segs.splice(best, 1, ...splitSeg(bx, by, sub.segs[best]));
  }
}

export function normalizePaths(ds: string[]): string[] {
  const all = ds.map((d) => toSubs(parsePath(d)));
  const nSub = Math.max(1, ...all.map((s) => s.length));
  for (const list of all) {
    while (list.length < nSub) {
      const last = list[list.length - 1];
      const x = last ? last.segs[last.segs.length - 1][4] : 0;
      const y = last ? last.segs[last.segs.length - 1][5] : 0;
      list.push({ x, y, segs: [[x, y, x, y, x, y]], closed: false });
    }
  }
  for (let j = 0; j < nSub; j++) {
    const n = Math.max(...all.map((l) => l[j].segs.length));
    const closed = all.every((l) => l[j].closed);
    for (const l of all) {
      equalize(l[j], n);
      l[j].closed = closed;
    }
  }
  return all.map((subs) =>
    subs
      .map((s) => `M${fmt(s.x)} ${fmt(s.y)} ` + s.segs.map((g) => 'C' + g.map(fmt).join(' ')).join(' ') + (s.closed ? ' Z' : ''))
      .join(' '),
  );
}

const ANY_NUM = /[+-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+-]?\d+)?/g;

/** Interpolate two paths with identical structure; returns null when they differ. */
export function lerpPath(a: string, b: string, u: number): string | null {
  const na = a.match(ANY_NUM) ?? [];
  const nb = b.match(ANY_NUM) ?? [];
  if (na.length !== nb.length) return null;
  if (a.replace(ANY_NUM, '#') !== b.replace(ANY_NUM, '#')) return null;
  let k = 0;
  return a.replace(ANY_NUM, () => {
    const v = parseFloat(na[k]) + (parseFloat(nb[k]) - parseFloat(na[k])) * u;
    k++;
    return fmt(v);
  });
}

// ---------------------------------------------------------------------------
// Shape generators (geometry centered on 0,0).

export function rectPath(w: number, h: number, r = 0): string {
  const x = -w / 2, y = -h / 2;
  r = Math.max(0, Math.min(r, w / 2, h / 2));
  if (r <= 0) return `M${fmt(x)} ${fmt(y)} L${fmt(x + w)} ${fmt(y)} L${fmt(x + w)} ${fmt(y + h)} L${fmt(x)} ${fmt(y + h)} Z`;
  const k = r * 0.5523;
  return [
    `M${fmt(x + r)} ${fmt(y)}`, `L${fmt(x + w - r)} ${fmt(y)}`,
    `C${fmt(x + w - r + k)} ${fmt(y)} ${fmt(x + w)} ${fmt(y + r - k)} ${fmt(x + w)} ${fmt(y + r)}`,
    `L${fmt(x + w)} ${fmt(y + h - r)}`,
    `C${fmt(x + w)} ${fmt(y + h - r + k)} ${fmt(x + w - r + k)} ${fmt(y + h)} ${fmt(x + w - r)} ${fmt(y + h)}`,
    `L${fmt(x + r)} ${fmt(y + h)}`,
    `C${fmt(x + r - k)} ${fmt(y + h)} ${fmt(x)} ${fmt(y + h - r + k)} ${fmt(x)} ${fmt(y + h - r)}`,
    `L${fmt(x)} ${fmt(y + r)}`,
    `C${fmt(x)} ${fmt(y + r - k)} ${fmt(x + r - k)} ${fmt(y)} ${fmt(x + r)} ${fmt(y)}`, 'Z',
  ].join(' ');
}

export function ellipsePath(w: number, h: number): string {
  const rx = w / 2, ry = h / 2, kx = rx * 0.5523, ky = ry * 0.5523;
  return [
    `M${fmt(0)} ${fmt(-ry)}`,
    `C${fmt(kx)} ${fmt(-ry)} ${fmt(rx)} ${fmt(-ky)} ${fmt(rx)} 0`,
    `C${fmt(rx)} ${fmt(ky)} ${fmt(kx)} ${fmt(ry)} 0 ${fmt(ry)}`,
    `C${fmt(-kx)} ${fmt(ry)} ${fmt(-rx)} ${fmt(ky)} ${fmt(-rx)} 0`,
    `C${fmt(-rx)} ${fmt(-ky)} ${fmt(-kx)} ${fmt(-ry)} 0 ${fmt(-ry)}`, 'Z',
  ].join(' ');
}

export function starPath(w: number, h: number, points = 5, inner = 0.45): string {
  const pts: string[] = [];
  for (let i = 0; i < points * 2; i++) {
    const a = -Math.PI / 2 + (i * Math.PI) / points;
    const r = i % 2 === 0 ? 1 : inner;
    pts.push(`${i === 0 ? 'M' : 'L'}${fmt((Math.cos(a) * r * w) / 2)} ${fmt((Math.sin(a) * r * h) / 2)}`);
  }
  return pts.join(' ') + ' Z';
}

export function polygonPath(w: number, h: number, sides = 6): string {
  const pts: string[] = [];
  for (let i = 0; i < sides; i++) {
    const a = -Math.PI / 2 + (i * 2 * Math.PI) / sides;
    pts.push(`${i === 0 ? 'M' : 'L'}${fmt((Math.cos(a) * w) / 2)} ${fmt((Math.sin(a) * h) / 2)}`);
  }
  return pts.join(' ') + ' Z';
}
