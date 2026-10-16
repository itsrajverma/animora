import type { SvgEl } from '../model/types';
import { ancestors, findById } from '../model/tree';
import { frameAt, type Frame } from './interpolate';
import { fmt, pathBBox } from './path';

/** 2D affine matrix [a b c d e f], same layout as SVG's matrix(). */
export type Mat = [number, number, number, number, number, number];

export const IDENTITY: Mat = [1, 0, 0, 1, 0, 0];

export const mul = (m: Mat, n: Mat): Mat => [
  m[0] * n[0] + m[2] * n[1],
  m[1] * n[0] + m[3] * n[1],
  m[0] * n[2] + m[2] * n[3],
  m[1] * n[2] + m[3] * n[3],
  m[0] * n[4] + m[2] * n[5] + m[4],
  m[1] * n[4] + m[3] * n[5] + m[5],
];

export function inv(m: Mat): Mat {
  const det = m[0] * m[3] - m[1] * m[2] || 1e-12;
  return [
    m[3] / det, -m[1] / det, -m[2] / det, m[0] / det,
    (m[2] * m[5] - m[3] * m[4]) / det, (m[1] * m[4] - m[0] * m[5]) / det,
  ];
}

export const apply = (m: Mat, x: number, y: number): [number, number] => [m[0] * x + m[2] * y + m[4], m[1] * x + m[3] * y + m[5]];
export const translate = (x: number, y: number): Mat => [1, 0, 0, 1, x, y];
export const scale = (sx: number, sy: number): Mat => [sx, 0, 0, sy, 0, 0];
export function rotate(deg: number): Mat {
  const a = (deg * Math.PI) / 180;
  const c = Math.cos(a), s = Math.sin(a);
  return [c, s, -s, c, 0, 0];
}

export const isTranslation = (m: Mat) =>
  Math.abs(m[0] - 1) < 1e-6 && Math.abs(m[1]) < 1e-6 && Math.abs(m[2]) < 1e-6 && Math.abs(m[3] - 1) < 1e-6;

export const toSvgMatrix = (m: Mat) => `matrix(${m.map(fmt).join(' ')})`;

/** Parse an SVG transform list (matrix, translate, scale, rotate, skewX, skewY). */
export function parseTransform(s: string | undefined): Mat {
  let m: Mat = IDENTITY;
  if (!s) return m;
  const re = /(matrix|translate|scale|rotate|skewX|skewY)\s*\(([^)]*)\)/g;
  let r: RegExpExecArray | null;
  while ((r = re.exec(s))) {
    const v = r[2].split(/[\s,]+/).filter(Boolean).map(Number);
    let t: Mat = IDENTITY;
    switch (r[1]) {
      case 'matrix': if (v.length === 6) t = v as Mat; break;
      case 'translate': t = translate(v[0] ?? 0, v[1] ?? 0); break;
      case 'scale': t = scale(v[0] ?? 1, v[1] ?? v[0] ?? 1); break;
      case 'rotate':
        t = v.length >= 3 ? mul(translate(v[1], v[2]), mul(rotate(v[0]), translate(-v[1], -v[2]))) : rotate(v[0] ?? 0);
        break;
      case 'skewX': t = [1, 0, Math.tan(((v[0] ?? 0) * Math.PI) / 180), 1, 0, 0]; break;
      case 'skewY': t = [1, Math.tan(((v[0] ?? 0) * Math.PI) / 180), 0, 1, 0, 0]; break;
    }
    m = mul(m, t);
  }
  return m;
}

/** translate(x y) rotate(r) scale(sx sy) */
export const mainMatrix = (f: Frame): Mat => mul(translate(f.x, f.y), mul(rotate(f.rotation), scale(f.scaleX, f.scaleY)));
/** translate(-ax -ay) [baseTransform] */
export const innerMatrix = (el: SvgEl): Mat => mul(translate(-el.ax, -el.ay), parseTransform(el.baseTransform));
/** Element geometry space → parent space. */
export const localMatrix = (el: SvgEl, t: number): Mat => mul(mainMatrix(frameAt(el, t)), innerMatrix(el));

/** Parent space of `id` → artboard space. */
export function parentToRoot(root: SvgEl[], id: string, t: number): Mat {
  return ancestors(root, id).reduce<Mat>((m, a) => mul(m, localMatrix(a, t)), IDENTITY);
}

/** Space of a group's children (or `null` = artboard) → artboard. */
export function spaceToRoot(root: SvgEl[], groupId: string | null, t: number): Mat {
  if (!groupId) return IDENTITY;
  const g = findById(root, groupId);
  return g ? mul(parentToRoot(root, groupId, t), localMatrix(g, t)) : IDENTITY;
}

export interface Box { x: number; y: number; w: number; h: number }

/** Approximate bounding box of an element in its main-local space (after anchor/base transform), without the DOM. */
export function modelBBox(el: SvgEl, t: number): Box | null {
  const f = frameAt(el, t);
  const inner = innerMatrix(el);
  let pts: [number, number][] = [];
  if (el.type === 'rect' || el.type === 'ellipse' || el.type === 'image') {
    pts = [[-f.width / 2, -f.height / 2], [f.width / 2, -f.height / 2], [f.width / 2, f.height / 2], [-f.width / 2, f.height / 2]];
  } else if (el.type === 'path') {
    const b = pathBBox(f.d);
    pts = [[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h]];
  } else if (el.type === 'text') {
    const lines = (el.text ?? '').split('\n');
    const w = Math.max(...lines.map((l) => l.length)) * f.fontSize * 0.55;
    const h = lines.length * f.fontSize * 1.2;
    pts = [[-w / 2, -h / 2], [w / 2, h / 2]];
  } else if (el.type === 'group') {
    for (const c of el.children ?? []) {
      const b = modelBBox(c, t);
      if (!b) continue;
      const m = mainMatrix(frameAt(c, t));
      pts.push(...([[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h]] as [number, number][]).map(([x, y]) => apply(m, x, y)));
    }
    if (!pts.length) return null;
    return boxOf(pts.map(([x, y]) => apply(inner, x, y)));
  } else return null;
  return boxOf(pts.map(([x, y]) => apply(inner, x, y)));
}

export function boxOf(pts: [number, number][]): Box {
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const x = Math.min(...xs), y = Math.min(...ys);
  return { x, y, w: Math.max(...xs) - x, h: Math.max(...ys) - y };
}

export const boxCorners = (b: Box): [number, number][] => [[b.x, b.y], [b.x + b.w, b.y], [b.x + b.w, b.y + b.h], [b.x, b.y + b.h]];
