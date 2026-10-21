export type Bezier = [number, number, number, number];

export interface Easing {
  id: string;
  label: string;
  bezier?: Bezier;
  /** Step easing: `n` jumps, at the start or the end of each interval. */
  steps?: { n: number; start: boolean };
  fn: (t: number) => number;
}

export function stepsEasing(n: number, start: boolean): Easing {
  n = Math.max(1, Math.min(1000, Math.round(n)));
  const id = `steps(${n},${start ? 'start' : 'end'})`;
  return {
    id,
    label: `Step ${start ? 'start' : 'end'} ×${n}`,
    steps: { n, start },
    fn: (t) => (t >= 1 ? 1 : t <= 0 ? (start ? 1 / n : 0) : Math.min(1, (start ? Math.ceil(t * n) : Math.floor(t * n)) / n)),
  };
}

export function cubicBezier(x1: number, y1: number, x2: number, y2: number): (x: number) => number {
  x1 = Math.min(1, Math.max(0, x1));
  x2 = Math.min(1, Math.max(0, x2));
  const cx = 3 * x1;
  const bx = 3 * (x2 - x1) - cx;
  const ax = 1 - cx - bx;
  const cy = 3 * y1;
  const by = 3 * (y2 - y1) - cy;
  const ay = 1 - cy - by;
  const sx = (t: number) => ((ax * t + bx) * t + cx) * t;
  const sy = (t: number) => ((ay * t + by) * t + cy) * t;
  const dsx = (t: number) => (3 * ax * t + 2 * bx) * t + cx;
  return (x: number) => {
    if (x <= 0) return 0;
    if (x >= 1) return 1;
    let t = x;
    for (let i = 0; i < 8; i++) {
      const err = sx(t) - x;
      if (Math.abs(err) < 1e-6) return sy(t);
      const d = dsx(t);
      if (Math.abs(d) < 1e-6) break;
      t -= err / d;
    }
    let lo = 0;
    let hi = 1;
    t = x;
    for (let i = 0; i < 40 && hi - lo > 1e-7; i++) {
      if (sx(t) < x) lo = t;
      else hi = t;
      t = (lo + hi) / 2;
    }
    return sy(t);
  };
}

const B = (id: string, label: string, bezier: Bezier): Easing => ({
  id,
  label,
  bezier,
  fn: cubicBezier(...bezier),
});

function bounceOut(t: number): number {
  const n1 = 7.5625;
  const d1 = 2.75;
  if (t < 1 / d1) return n1 * t * t;
  if (t < 2 / d1) return n1 * (t -= 1.5 / d1) * t + 0.75;
  if (t < 2.5 / d1) return n1 * (t -= 2.25 / d1) * t + 0.9375;
  return n1 * (t -= 2.625 / d1) * t + 0.984375;
}

function elasticOut(t: number): number {
  if (t <= 0 || t >= 1) return t <= 0 ? 0 : 1;
  return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * ((2 * Math.PI) / 3)) + 1;
}

export const EASING_GROUPS: { group: string; items: Easing[] }[] = [
  {
    group: 'Basic',
    items: [
      B('linear', 'Linear', [0, 0, 1, 1]),
      B('ease', 'Ease', [0.25, 0.1, 0.25, 1]),
      B('easeIn', 'Ease In', [0.42, 0, 1, 1]),
      B('easeOut', 'Ease Out', [0, 0, 0.58, 1]),
      B('easeInOut', 'Ease In Out', [0.42, 0, 0.58, 1]),
      { id: 'hold', label: 'Hold (step)', fn: (t) => (t >= 1 ? 1 : 0) },
    ],
  },
  {
    group: 'Sine',
    items: [
      B('easeInSine', 'In Sine', [0.12, 0, 0.39, 0]),
      B('easeOutSine', 'Out Sine', [0.61, 1, 0.88, 1]),
      B('easeInOutSine', 'In Out Sine', [0.37, 0, 0.63, 1]),
    ],
  },
  {
    group: 'Quad',
    items: [
      B('easeInQuad', 'In Quad', [0.11, 0, 0.5, 0]),
      B('easeOutQuad', 'Out Quad', [0.5, 1, 0.89, 1]),
      B('easeInOutQuad', 'In Out Quad', [0.45, 0, 0.55, 1]),
    ],
  },
  {
    group: 'Cubic',
    items: [
      B('easeInCubic', 'In Cubic', [0.32, 0, 0.67, 0]),
      B('easeOutCubic', 'Out Cubic', [0.33, 1, 0.68, 1]),
      B('easeInOutCubic', 'In Out Cubic', [0.65, 0, 0.35, 1]),
    ],
  },
  {
    group: 'Quint',
    items: [
      B('easeInQuint', 'In Quint', [0.64, 0, 0.78, 0]),
      B('easeOutQuint', 'Out Quint', [0.22, 1, 0.36, 1]),
      B('easeInOutQuint', 'In Out Quint', [0.83, 0, 0.17, 1]),
    ],
  },
  {
    group: 'Expo',
    items: [
      B('easeInExpo', 'In Expo', [0.7, 0, 0.84, 0]),
      B('easeOutExpo', 'Out Expo', [0.16, 1, 0.3, 1]),
      B('easeInOutExpo', 'In Out Expo', [0.87, 0, 0.13, 1]),
    ],
  },
  {
    group: 'Circ',
    items: [
      B('easeInCirc', 'In Circ', [0.55, 0, 1, 0.45]),
      B('easeOutCirc', 'Out Circ', [0, 0.55, 0.45, 1]),
      B('easeInOutCirc', 'In Out Circ', [0.85, 0, 0.15, 1]),
    ],
  },
  {
    group: 'Back',
    items: [
      B('easeInBack', 'In Back', [0.36, 0, 0.66, -0.56]),
      B('easeOutBack', 'Out Back', [0.34, 1.56, 0.64, 1]),
      B('easeInOutBack', 'In Out Back', [0.68, -0.6, 0.32, 1.6]),
    ],
  },
  {
    group: 'Physics',
    items: [
      { id: 'bounceOut', label: 'Bounce Out', fn: bounceOut },
      { id: 'bounceIn', label: 'Bounce In', fn: (t) => 1 - bounceOut(1 - t) },
      { id: 'elasticOut', label: 'Elastic Out', fn: elasticOut },
      { id: 'elasticIn', label: 'Elastic In', fn: (t) => 1 - elasticOut(1 - t) },
    ],
  },
  {
    group: 'Steps',
    items: [stepsEasing(1, true), stepsEasing(1, false), stepsEasing(4, false), stepsEasing(8, false)],
  },
];

const MAP = new Map<string, Easing>();
for (const g of EASING_GROUPS) for (const e of g.items) MAP.set(e.id, e);

export const DEFAULT_EASING = 'easeInOut';

export function getEasing(id: string): Easing {
  const known = MAP.get(id);
  if (known) return known;
  const st = /^steps\((\d+),(start|end)\)$/.exec(id);
  if (st) {
    const e = stepsEasing(Number(st[1]), st[2] === 'start');
    MAP.set(id, e);
    return e;
  }
  const m = /^cubic-bezier\(([^)]+)\)$/.exec(id);
  if (m) {
    const v = m[1].split(/[\s,]+/).map(Number);
    if (v.length === 4 && v.every(Number.isFinite)) {
      const e: Easing = { id, label: 'Custom', bezier: v as Bezier, fn: cubicBezier(v[0], v[1], v[2], v[3]) };
      MAP.set(id, e);
      return e;
    }
  }
  return MAP.get('linear')!;
}

export const bezierId = (b: Bezier) => `cubic-bezier(${b.map((v) => Math.round(v * 1000) / 1000).join(',')})`;
