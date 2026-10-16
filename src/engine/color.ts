export type RGBA = [number, number, number, number];

const cache = new Map<string, RGBA | null>();
let ctx: CanvasRenderingContext2D | null = null;

function parseUncached(s: string): RGBA | null {
  if (!s || s === 'none' || s.startsWith('url')) return null;
  if (s === 'transparent') return [0, 0, 0, 0];
  let m = /^#([0-9a-f]{3,8})$/i.exec(s);
  if (m) {
    let h = m[1];
    if (h.length === 3 || h.length === 4) h = [...h].map((c) => c + c).join('');
    if (h.length !== 6 && h.length !== 8) return null;
    const v = (i: number) => parseInt(h.slice(i, i + 2), 16);
    return [v(0), v(2), v(4), h.length === 8 ? v(6) / 255 : 1];
  }
  m = /^rgba?\(([^)]+)\)$/i.exec(s);
  if (m) {
    const parts = m[1].split(/[\s,/]+/).filter(Boolean);
    const ch = (p: string) => (p.endsWith('%') ? (parseFloat(p) * 255) / 100 : parseFloat(p));
    const a = parts[3] === undefined ? 1 : parts[3].endsWith('%') ? parseFloat(parts[3]) / 100 : parseFloat(parts[3]);
    const out: RGBA = [ch(parts[0]), ch(parts[1]), ch(parts[2]), a];
    return out.every(Number.isFinite) ? out : null;
  }
  // Named colors, hsl(), etc. — let the browser normalize them.
  if (typeof document === 'undefined') return null;
  ctx ??= document.createElement('canvas').getContext('2d');
  if (!ctx) return null;
  ctx.fillStyle = '#010203';
  ctx.fillStyle = s;
  const norm = String(ctx.fillStyle);
  if (norm === '#010203') return null;
  return parseUncached(norm);
}

export function parseColor(s: string): RGBA | null {
  const k = String(s).trim().toLowerCase();
  if (!cache.has(k)) cache.set(k, parseUncached(k));
  return cache.get(k)!;
}

const hex2 = (v: number) => Math.round(Math.min(255, Math.max(0, v))).toString(16).padStart(2, '0');

export function formatColor([r, g, b, a]: RGBA): string {
  if (a >= 0.999) return `#${hex2(r)}${hex2(g)}${hex2(b)}`;
  const c = (v: number) => Math.round(Math.min(255, Math.max(0, v)));
  return `rgba(${c(r)},${c(g)},${c(b)},${Math.round(Math.max(0, a) * 1000) / 1000})`;
}

export function lerpColor(a: string, b: string, u: number): string | null {
  const ca = parseColor(a);
  const cb = parseColor(b);
  if (!ca || !cb) return null;
  return formatColor([0, 1, 2, 3].map((i) => ca[i] + (cb[i] - ca[i]) * u) as RGBA);
}

/** Hex form for <input type="color">. */
export function toHex6(s: string): string {
  const c = parseColor(s);
  return c ? formatColor([c[0], c[1], c[2], 1]) : '#000000';
}
