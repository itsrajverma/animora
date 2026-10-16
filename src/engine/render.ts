import type { Doc, Keyframe, PropKey, SvgEl, Value } from '../model/types';
import { frameAt, interp, trackValues, type Frame } from './interpolate';
import { getEasing } from './easing';
import { fmt as n } from './path';

export const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const hasTrack = (el: SvgEl, p: PropKey) => (el.tracks[p]?.length ?? 0) > 1;

function innerTransform(el: SvgEl): string {
  const parts: string[] = [];
  if (el.ax || el.ay) parts.push(`translate(${n(-el.ax)} ${n(-el.ay)})`);
  if (el.baseTransform) parts.push(el.baseTransform);
  return parts.join(' ');
}

function textContent(el: SvgEl): string {
  const lines = (el.text ?? '').split('\n');
  if (lines.length === 1) return esc(lines[0]);
  return lines
    .map((l, i) => `<tspan x="0" dy="${i === 0 ? n(-(lines.length - 1) * 0.6) : '1.2'}em">${esc(l) || ' '}</tspan>`)
    .join('');
}

function shapeMarkup(el: SvgEl, f: Frame, anim: string, kids = ''): string {
  const paint = () => {
    let s = ` fill="${esc(f.fill)}" stroke="${esc(f.stroke)}" stroke-width="${n(Math.max(0, f.strokeWidth))}"`;
    if (el.lineCap) s += ` stroke-linecap="${esc(el.lineCap)}"`;
    if (el.lineJoin) s += ` stroke-linejoin="${esc(el.lineJoin)}"`;
    return s;
  };
  const w = Math.max(0, f.width);
  const h = Math.max(0, f.height);
  switch (el.type) {
    case 'rect': {
      const rx = f.rx > 0 || hasTrack(el, 'rx') ? ` rx="${n(Math.max(0, f.rx))}"` : '';
      return `<rect x="${n(-w / 2)}" y="${n(-h / 2)}" width="${n(w)}" height="${n(h)}"${rx}${paint()}>${anim}</rect>`;
    }
    case 'ellipse':
      return `<ellipse cx="0" cy="0" rx="${n(w / 2)}" ry="${n(h / 2)}"${paint()}>${anim}</ellipse>`;
    case 'path': {
      const trim = f.trim < 100 || hasTrack(el, 'trim')
        ? ` pathLength="100" stroke-dasharray="${n(clamp(f.trim, 0, 100))} 100"`
        : '';
      return `<path d="${esc(f.d)}"${paint()}${trim}>${anim}</path>`;
    }
    case 'text':
      return (
        `<text x="0" y="0" text-anchor="middle" dominant-baseline="central" font-size="${n(Math.max(1, f.fontSize))}"` +
        ` font-family="${esc(el.fontFamily ?? 'Inter, Arial, sans-serif')}" font-weight="${esc(el.fontWeight ?? '400')}"` +
        `${paint()}>${anim}${textContent(el)}</text>`
      );
    case 'image':
      return `<image href="${esc(el.href ?? '')}" x="${n(-w / 2)}" y="${n(-h / 2)}" width="${n(w)}" height="${n(h)}" preserveAspectRatio="none">${anim}</image>`;
    case 'raw':
      return el.markup ?? '';
    case 'group':
      return kids;
  }
}

/** Wrapper the editor puts around every layer so it can be hit-tested and measured. */
const tagged = (el: SvgEl, inner: string) =>
  `<g data-el="${esc(el.id)}"${el.visible ? '' : ' style="display:none"'}${el.locked ? ' pointer-events="none"' : ''}>${inner}</g>`;

/**
 * Markup of one element frozen at time `t` (used by the editor canvas and frame exports).
 * With `tag`, nested layers get `data-el` wrappers (editor only).
 */
export function staticElementMarkup(el: SvgEl, t: number, tag = false): string {
  const f = frameAt(el, t);
  const kids = (el.children ?? [])
    .map((c) => (tag ? tagged(c, staticElementMarkup(c, t, true)) : c.visible ? staticElementMarkup(c, t) : ''))
    .join('');
  const main = `translate(${n(f.x)} ${n(f.y)}) rotate(${n(f.rotation)}) scale(${n(f.scaleX)} ${n(f.scaleY)})`;
  const inner = innerTransform(el);
  const op = f.opacity !== 1 ? ` opacity="${n(clamp(f.opacity, 0, 1))}"` : '';
  return `<g transform="${main}"${op}><g${inner ? ` transform="${inner}"` : ''}>${shapeMarkup(el, f, '', kids)}</g></g>`;
}

// ---------------------------------------------------------------------------
// Animated export (SVG + SMIL). Works in every modern browser, in <img> tags and
// as CSS backgrounds, with no JavaScript.

const LINEAR = '0 0 1 1';

interface KeyData {
  times: number[];
  values: Value[];
  splines: string[];
}

function keyData(prop: PropKey, tr: Keyframe[], D: number): KeyData {
  const vals = trackValues(prop, tr);
  const times: number[] = [];
  const values: Value[] = [];
  const splines: string[] = [];
  const push = (t: number, v: Value) => {
    times.push(clamp(t / D, 0, 1));
    values.push(v);
  };
  if (tr[0].time > 0) {
    push(0, vals[0]);
    splines.push(LINEAR);
  }
  for (let i = 0; i < tr.length; i++) {
    push(tr[i].time, vals[i]);
    if (i === tr.length - 1) break;
    const t0 = tr[i].time;
    const t1 = tr[i + 1].time;
    const e = getEasing(tr[i].easing);
    if (e.id === 'hold') {
      splines.push(LINEAR);
      push(t1 - Math.min(0.001, (t1 - t0) / 2), vals[i]);
      splines.push(LINEAR);
    } else if (e.bezier && e.bezier.every((v) => v >= 0 && v <= 1)) {
      splines.push(e.bezier.join(' '));
    } else {
      // keySplines must stay within [0,1]; approximate overshooting easings by sampling.
      const N = 16;
      for (let k = 1; k < N; k++) {
        splines.push(LINEAR);
        push(t0 + ((t1 - t0) * k) / N, interp(prop, vals[i], vals[i + 1], e.fn(k / N)));
      }
      splines.push(LINEAR);
    }
  }
  const last = tr[tr.length - 1];
  if (last.time < D) {
    splines.push(LINEAR);
    push(D, vals[vals.length - 1]);
  }
  return { times, values, splines };
}

function timing(doc: Doc, kd: KeyData): string {
  const repeat = doc.loop ? ' repeatCount="indefinite"' : '';
  return (
    `dur="${n(doc.duration)}s" begin="0s"${repeat} fill="freeze" calcMode="spline"` +
    ` keyTimes="${kd.times.map((t) => n(Math.round(t * 1e5) / 1e5)).join(';')}" keySplines="${kd.splines.join(';')}"`
  );
}

function animatedElementMarkup(el: SvgEl, doc: Doc): string {
  const f0 = frameAt(el, 0);
  const D = Math.max(0.01, doc.duration);
  const kd = (p: PropKey) => (hasTrack(el, p) ? keyData(p, el.tracks[p]!, D) : null);
  const numV = (v: Value) => Number(v);

  const animAttr = (attr: string, p: PropKey, map: (v: Value) => string = (v) => (typeof v === 'number' ? n(v) : String(v))) => {
    const k = kd(p);
    if (!k) return '';
    return `<animate attributeName="${attr}" ${timing(doc, k)} values="${esc(k.values.map(map).join(';'))}"/>`;
  };

  let open = '';
  let close = '';
  const wrap = (attrs: string, children = '') => {
    open += `<g${attrs}>${children}`;
    close = '</g>' + close;
  };

  if (hasTrack(el, 'opacity')) wrap('', animAttr('opacity', 'opacity', (v) => n(clamp(numV(v), 0, 1))));
  else if (f0.opacity !== 1) wrap(` opacity="${n(clamp(f0.opacity, 0, 1))}"`);

  const layers: { p: PropKey; type: string; f: (v: number) => string; identity: (v: number) => boolean }[] = [
    { p: 'x', type: 'translate', f: (v) => `${n(v)} 0`, identity: (v) => v === 0 },
    { p: 'y', type: 'translate', f: (v) => `0 ${n(v)}`, identity: (v) => v === 0 },
    { p: 'rotation', type: 'rotate', f: (v) => n(v), identity: (v) => v === 0 },
    { p: 'scaleX', type: 'scale', f: (v) => `${n(v)} 1`, identity: (v) => v === 1 },
    { p: 'scaleY', type: 'scale', f: (v) => `1 ${n(v)}`, identity: (v) => v === 1 },
  ];
  let pending: string[] = [];
  const flush = () => {
    if (pending.length) wrap(` transform="${pending.join(' ')}"`);
    pending = [];
  };
  if (!hasTrack(el, 'x') && !hasTrack(el, 'y')) {
    if (f0.x || f0.y) pending.push(`translate(${n(f0.x)} ${n(f0.y)})`);
    layers.splice(0, 2);
  }
  for (const L of layers) {
    const k = kd(L.p);
    if (!k) {
      const v = f0[L.p as 'x'];
      if (!L.identity(v)) pending.push(`${L.type}(${L.f(v)})`);
      continue;
    }
    flush();
    wrap(
      '',
      `<animateTransform attributeName="transform" type="${L.type}" ${timing(doc, k)} values="${k.values.map((v) => L.f(numV(v))).join(';')}"/>`,
    );
  }
  const inner = innerTransform(el);
  if (inner) pending.push(inner);
  flush();

  let anim = '';
  const paintAnims = () =>
    animAttr('fill', 'fill') + animAttr('stroke', 'stroke') + animAttr('stroke-width', 'strokeWidth', (v) => n(Math.max(0, numV(v))));
  const pos = (v: Value) => n(Math.max(0, numV(v)));
  const half = (v: Value) => n(Math.max(0, numV(v)) / 2);
  const negHalf = (v: Value) => n(-Math.max(0, numV(v)) / 2);
  switch (el.type) {
    case 'rect':
      anim = animAttr('width', 'width', pos) + animAttr('x', 'width', negHalf) + animAttr('height', 'height', pos) +
        animAttr('y', 'height', negHalf) + animAttr('rx', 'rx', pos) + paintAnims();
      break;
    case 'ellipse':
      anim = animAttr('rx', 'width', half) + animAttr('ry', 'height', half) + paintAnims();
      break;
    case 'image':
      anim = animAttr('width', 'width', pos) + animAttr('x', 'width', negHalf) + animAttr('height', 'height', pos) + animAttr('y', 'height', negHalf);
      break;
    case 'path':
      anim = animAttr('d', 'd') + animAttr('stroke-dasharray', 'trim', (v) => `${n(clamp(numV(v), 0, 100))} 100`) + paintAnims();
      break;
    case 'text':
      anim = animAttr('font-size', 'fontSize', (v) => n(Math.max(1, numV(v)))) + paintAnims();
      break;
    case 'raw':
    case 'group':
      break;
  }
  const kids = (el.children ?? []).filter((c) => c.visible).map((c) => animatedElementMarkup(c, doc)).join('');
  return open + shapeMarkup(el, f0, anim, kids) + close;
}

export interface ExportOptions {
  animated: boolean;
  time?: number;
}

export function exportSvg(doc: Doc, opts: ExportOptions): string {
  const out: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${doc.width}" height="${doc.height}" viewBox="0 0 ${doc.width} ${doc.height}">`,
    `<title>${esc(doc.name)}</title>`,
    `<desc>Created with Animora — open-source SVG animator</desc>`,
  ];
  if (doc.defs) out.push(`<defs>${doc.defs}</defs>`);
  if (doc.background && doc.background !== 'none' && doc.background !== 'transparent') {
    out.push(`<rect width="${doc.width}" height="${doc.height}" fill="${esc(doc.background)}"/>`);
  }
  for (const el of doc.elements) {
    if (!el.visible) continue;
    out.push(opts.animated ? animatedElementMarkup(el, doc) : staticElementMarkup(el, opts.time ?? 0));
  }
  out.push('</svg>');
  return out.join('\n');
}
