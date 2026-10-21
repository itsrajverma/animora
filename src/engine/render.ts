import type { Doc, Keyframe, PropKey, SvgEl, Value } from '../model/types';
import { formatDash, frameAt, hasShadow, interp, parseDash, trackValues, type Frame } from './interpolate';
import { getEasing } from './easing';
import { fmt as n } from './path';
import { pointAtPercent } from './motion';

export const esc = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

const clamp = (v: number, a: number, b: number) => Math.min(b, Math.max(a, v));
const hasTrack = (el: SvgEl, p: PropKey) => (el.tracks[p]?.length ?? 0) > 1;
const anyTrack = (el: SvgEl, ps: PropKey[]) => ps.some((p) => hasTrack(el, p));

export const filterId = (el: SvgEl) => `anf-${el.id}`;
export const maskId = (el: SvgEl) => `anm-${el.id}`;
const ROOT_ID = 'animora';

const needsBlur = (el: SvgEl, f: Frame) => f.blur > 0 || hasTrack(el, 'blur');
const needsShadow = (el: SvgEl, f: Frame) => hasShadow(f) || hasTrack(el, 'shadowColor');

function textContent(el: SvgEl): string {
  const lines = (el.text ?? '').split('\n');
  if (lines.length === 1) return esc(lines[0]);
  return lines
    .map((l, i) => `<tspan x="0" dy="${i === 0 ? n(-(lines.length - 1) * 0.6) : '1.2'}em">${esc(l) || ' '}</tspan>`)
    .join('');
}

function shapeMarkup(el: SvgEl, f: Frame, anim: string, kids = ''): string {
  const trimmed = el.type === 'path' && (f.trim < 100 || hasTrack(el, 'trim'));
  const paint = () => {
    let s = ` fill="${esc(f.fill)}" stroke="${esc(f.stroke)}" stroke-width="${n(Math.max(0, f.strokeWidth))}"`;
    if (f.fillOpacity !== 1 || hasTrack(el, 'fillOpacity')) s += ` fill-opacity="${n(clamp(f.fillOpacity, 0, 1))}"`;
    if (f.strokeOpacity !== 1 || hasTrack(el, 'strokeOpacity')) s += ` stroke-opacity="${n(clamp(f.strokeOpacity, 0, 1))}"`;
    if (!trimmed && (parseDash(f.dashArray).length || hasTrack(el, 'dashArray'))) s += ` stroke-dasharray="${esc(formatDash(parseDash(f.dashArray)) || 'none')}"`;
    if (f.dashOffset || hasTrack(el, 'dashOffset')) s += ` stroke-dashoffset="${n(f.dashOffset)}"`;
    if (el.fillRule === 'evenodd') s += ' fill-rule="evenodd"';
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
      const trim = trimmed ? ` pathLength="100" stroke-dasharray="${n(clamp(f.trim, 0, 100))} 100"` : '';
      return `<path d="${esc(f.d)}"${paint()}${trim}>${anim}</path>`;
    }
    case 'text':
      return (
        `<text x="0" y="0" text-anchor="${el.textAlign ?? 'middle'}" dominant-baseline="central" font-size="${n(Math.max(1, f.fontSize))}"` +
        (el.letterSpacing ? ` letter-spacing="${n(el.letterSpacing)}"` : '') +
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

/** <filter> definition for blur / drop shadow, with optional SMIL children per primitive. */
function filterDef(el: SvgEl, f: Frame, anims?: { blur: string; shadow: string }): string {
  const blur = needsBlur(el, f);
  const shadow = needsShadow(el, f);
  if (!blur && !shadow) return '';
  let s = `<filter id="${filterId(el)}" x="-50%" y="-50%" width="200%" height="200%" color-interpolation-filters="sRGB">`;
  if (blur) s += `<feGaussianBlur stdDeviation="${n(Math.max(0, f.blur))}">${anims?.blur ?? ''}</feGaussianBlur>`;
  if (shadow) {
    const color = hasShadow(f) ? f.shadowColor : 'transparent';
    s += `<feDropShadow dx="${n(f.shadowX)}" dy="${n(f.shadowY)}" stdDeviation="${n(Math.max(0, f.shadowBlur))}" flood-color="${esc(color)}">${anims?.shadow ?? ''}</feDropShadow>`;
  }
  return s + '</filter>';
}

/**
 * Children of a group, bottom → top. A child flagged `isMask` masks the visible layers below it
 * (it is moved into a <mask> and the layers below are wrapped in a masked <g>).
 */
function composeKids(el: SvgEl, render: (c: SvgEl) => string, maskRender: (c: SvgEl) => string, tag: boolean): string {
  let acc = '';
  for (const c of el.children ?? []) {
    if (c.isMask && c.visible) {
      acc =
        `<mask id="${maskId(c)}" mask-type="alpha" maskUnits="userSpaceOnUse" x="-100000" y="-100000" width="200000" height="200000">${maskRender(c)}</mask>` +
        `<g mask="url(#${maskId(c)})">${acc}</g>`;
      // Invisible copy so the editor can still measure (and draw handles around) the mask layer.
      if (tag) acc += `<g data-el="${esc(c.id)}" opacity="0" pointer-events="none">${maskRender(c)}</g>`;
    } else acc += render(c);
  }
  return acc;
}

/** Wrapper the editor puts around every layer so it can be hit-tested and measured. */
const tagged = (el: SvgEl, inner: string) =>
  `<g data-el="${esc(el.id)}"${el.visible ? '' : ' style="display:none"'}${el.locked ? ' pointer-events="none"' : ''}>${inner}</g>`;

function mainTransform(f: Frame): string {
  let s = `translate(${n(f.x)} ${n(f.y)})`;
  const r = f.rotation + f.motionAngle;
  if (r) s += ` rotate(${n(r)})`;
  if (f.skewX) s += ` skewX(${n(clamp(f.skewX, -89, 89))})`;
  if (f.skewY) s += ` skewY(${n(clamp(f.skewY, -89, 89))})`;
  if (f.scaleX !== 1 || f.scaleY !== 1) s += ` scale(${n(f.scaleX)} ${n(f.scaleY)})`;
  return s;
}

function innerTransform(el: SvgEl, f: Frame): string {
  const parts: string[] = [];
  if (f.originX || f.originY) parts.push(`translate(${n(-f.originX)} ${n(-f.originY)})`);
  if (el.baseTransform) parts.push(el.baseTransform);
  return parts.join(' ');
}

/**
 * Markup of one element frozen at time `t` (used by the editor canvas and frame exports).
 * With `tag`, nested layers get `data-el` wrappers (editor only).
 */
export function staticElementMarkup(el: SvgEl, t: number, tag = false): string {
  const f = frameAt(el, t);
  const kids =
    el.type === 'group'
      ? composeKids(
        el,
        (c) => (tag ? tagged(c, staticElementMarkup(c, t, true)) : c.visible ? staticElementMarkup(c, t) : ''),
        (c) => staticElementMarkup(c, t),
        tag,
      )
      : '';
  const inner = innerTransform(el, f);
  const op = f.opacity !== 1 ? ` opacity="${n(clamp(f.opacity, 0, 1))}"` : '';
  const fdef = filterDef(el, f);
  const filter = fdef ? ` filter="url(#${filterId(el)})"` : '';
  const blend = el.blend && el.blend !== 'normal' ? ` style="mix-blend-mode:${esc(el.blend)}"` : '';
  return (
    `<g transform="${mainTransform(f)}"${op}${filter}${blend}>${fdef ? `<defs>${fdef}</defs>` : ''}` +
    `<g${inner ? ` transform="${inner}"` : ''}>${shapeMarkup(el, f, '', kids)}</g></g>`
  );
}

/** All top-level layers at time `t`, tagged for the editor canvas. */
export function editorMarkup(elements: SvgEl[], t: number): string {
  const root = { id: '__root', type: 'group', children: elements } as SvgEl;
  return composeKids(root, (c) => tagged(c, staticElementMarkup(c, t, true)), (c) => staticElementMarkup(c, t), true);
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
    } else if (e.steps) {
      // Discrete jumps: hold each step, then switch almost instantly.
      const { n: count } = e.steps;
      const eps = Math.min(0.001, (t1 - t0) / (count * 4));
      let prev = interp(prop, vals[i], vals[i + 1], e.fn(0));
      if (e.steps.start) {
        splines.push(LINEAR);
        push(t0 + eps, prev);
      }
      for (let k = 1; k <= count; k++) {
        const tk = t0 + ((t1 - t0) * k) / count;
        const next = k === count ? vals[i + 1] : interp(prop, vals[i], vals[i + 1], e.fn(k / count));
        splines.push(LINEAR);
        push(tk - eps, prev);
        if (k < count) {
          splines.push(LINEAR);
          push(tk, next);
        }
        prev = next;
      }
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

const flipSpline = (s: string) => {
  const [x1, y1, x2, y2] = s.split(' ').map(Number);
  return [1 - x2, 1 - y2, 1 - x1, 1 - y1].map((v) => n(v)).join(' ');
};

/** Play the cycle backwards. */
function reverse(k: KeyData): KeyData {
  return {
    times: k.times.map((t) => 1 - t).reverse(),
    values: [...k.values].reverse(),
    splines: [...k.splines].reverse().map(flipSpline),
  };
}

/** Play forward then backward within one (doubled) cycle. */
function mirror(k: KeyData): KeyData {
  const times = [...k.times.map((t) => t / 2), ...k.times.slice(0, -1).reverse().map((t) => 1 - t / 2)];
  const values = [...k.values, ...k.values.slice(0, -1).reverse()];
  return { times, values, splines: [...k.splines, ...k.splines.slice().reverse().map(flipSpline)] };
}

interface Timing {
  dur: number;
  begin: string;
  repeat: string;
  fill: string;
  /** Applies the playback direction to one property's key data. */
  shape: (k: KeyData) => KeyData;
}

export function exportTiming(doc: Doc): Timing {
  const dir = doc.direction ?? 'normal';
  const alternate = dir === 'alternate' || dir === 'alternate-reverse';
  const backwards = dir === 'reverse' || dir === 'alternate-reverse';
  const speed = Math.max(1, doc.speed || 100) / 100;
  const D = (Math.max(0.01, doc.duration) * (alternate ? 2 : 1)) / speed;
  const count = Math.max(1, doc.iterations || 1) / (alternate ? 2 : 1);
  return {
    dur: D,
    shape: (k) => {
      const r = backwards ? reverse(k) : k;
      return alternate ? mirror(r) : r;
    },
    begin: doc.trigger === 'click' ? `${ROOT_ID}.click` : doc.trigger === 'hover' ? `${ROOT_ID}.mouseover` : '0s',
    repeat: doc.loop ? 'indefinite' : n(count),
    fill: doc.fillMode === 'remove' ? 'remove' : 'freeze',
  };
}

function timingAttrs(tm: Timing, kd: KeyData): string {
  const k = tm.shape(kd);
  return (
    `dur="${n(tm.dur)}s" begin="${tm.begin}" repeatCount="${tm.repeat}" fill="${tm.fill}" calcMode="spline"` +
    ` keyTimes="${k.times.map((t) => n(Math.round(t * 1e5) / 1e5)).join(';')}" keySplines="${k.splines.join(';')}"`
  );
}

const valuesOf = (tm: Timing, kd: KeyData) => tm.shape(kd).values;

function animatedElementMarkup(el: SvgEl, doc: Doc, tm: Timing): string {
  const f0 = frameAt(el, 0);
  const D = Math.max(0.01, doc.duration);
  const kd = (p: PropKey) => (hasTrack(el, p) ? keyData(p, el.tracks[p]!, D) : null);
  const numV = (v: Value) => Number(v);

  const animAttr = (attr: string, p: PropKey, map: (v: Value) => string = (v) => (typeof v === 'number' ? n(v) : String(v))) => {
    const k = kd(p);
    if (!k) return '';
    return `<animate attributeName="${attr}" ${timingAttrs(tm, k)} values="${esc(valuesOf(tm, k).map(map).join(';'))}"/>`;
  };
  const animTransform = (type: string, p: PropKey, f: (v: number) => string) => {
    const k = kd(p)!;
    return `<animateTransform attributeName="transform" type="${type}" ${timingAttrs(tm, k)} values="${valuesOf(tm, k).map((v) => f(numV(v))).join(';')}"/>`;
  };

  let open = '';
  let close = '';
  const wrap = (attrs: string, children = '') => {
    open += `<g${attrs}>${children}`;
    close = '</g>' + close;
  };

  // Filters live on the outermost wrapper so they follow the element's transform.
  const fdef = filterDef(el, f0, {
    blur: animAttr('stdDeviation', 'blur', (v) => n(Math.max(0, numV(v)))),
    shadow:
      animAttr('dx', 'shadowX') + animAttr('dy', 'shadowY') + animAttr('stdDeviation', 'shadowBlur', (v) => n(Math.max(0, numV(v)))) +
      animAttr('flood-color', 'shadowColor', (v) => (String(v) === 'none' ? 'transparent' : String(v))),
  });

  const opacity = hasTrack(el, 'opacity')
    ? animAttr('opacity', 'opacity', (v) => n(clamp(numV(v), 0, 1)))
    : '';
  const opAttr = f0.opacity !== 1 || opacity ? ` opacity="${n(clamp(f0.opacity, 0, 1))}"` : '';
  const blend = el.blend && el.blend !== 'normal' ? ` style="mix-blend-mode:${esc(el.blend)}"` : '';
  if (opAttr || fdef || blend) wrap(`${opAttr}${fdef ? ` filter="url(#${filterId(el)})"` : ''}${blend}`, (fdef ? `<defs>${fdef}</defs>` : '') + opacity);

  // Motion path: <animateMotion> moves the element along the path; it adds to the transform attribute,
  // so the static start position is swapped out while the animation runs.
  if (el.motionPath) {
    const k = kd('motion');
    if (k) {
      const kk = tm.shape(k);
      const p0 = pointAtPercent(el.motionPath, f0.motion);
      wrap(
        ` transform="translate(${n(p0.x)} ${n(p0.y)})"`,
        `<animateTransform attributeName="transform" type="translate" values="0 0;0 0" keyTimes="0;1" dur="${n(tm.dur)}s" begin="${tm.begin}" repeatCount="${tm.repeat}" fill="${tm.fill}"/>` +
        `<animateMotion path="${esc(el.motionPath)}" rotate="${el.autoRotate ? 'auto' : '0'}" ${timingAttrs(tm, k)}` +
        ` keyPoints="${kk.values.map((v) => n(clamp(numV(v) / 100, 0, 1))).join(';')}"/>`,
      );
    } else {
      wrap(` transform="${`translate(${n(f0.x)} ${n(f0.y)})`}${f0.motionAngle ? ` rotate(${n(f0.motionAngle)})` : ''}"`);
    }
  }

  const layers: { p: PropKey; type: string; f: (v: number) => string; identity: (v: number) => boolean }[] = [
    { p: 'x', type: 'translate', f: (v) => `${n(v)} 0`, identity: (v) => v === 0 },
    { p: 'y', type: 'translate', f: (v) => `0 ${n(v)}`, identity: (v) => v === 0 },
    { p: 'rotation', type: 'rotate', f: (v) => n(v), identity: (v) => v === 0 },
    { p: 'skewX', type: 'skewX', f: (v) => n(clamp(v, -89, 89)), identity: (v) => v === 0 },
    { p: 'skewY', type: 'skewY', f: (v) => n(clamp(v, -89, 89)), identity: (v) => v === 0 },
    { p: 'scaleX', type: 'scale', f: (v) => `${n(v)} 1`, identity: (v) => v === 1 },
    { p: 'scaleY', type: 'scale', f: (v) => `1 ${n(v)}`, identity: (v) => v === 1 },
    { p: 'originX', type: 'translate', f: (v) => `${n(-v)} 0`, identity: (v) => v === 0 },
    { p: 'originY', type: 'translate', f: (v) => `0 ${n(-v)}`, identity: (v) => v === 0 },
  ];
  let pending: string[] = [];
  const flush = () => {
    if (pending.length) wrap(` transform="${pending.join(' ')}"`);
    pending = [];
  };
  if (el.motionPath) layers.splice(0, 2);
  else if (!hasTrack(el, 'x') && !hasTrack(el, 'y')) {
    if (f0.x || f0.y) pending.push(`translate(${n(f0.x)} ${n(f0.y)})`);
    layers.splice(0, 2);
  }
  if (!anyTrack(el, ['originX', 'originY'])) {
    layers.splice(-2, 2);
  }
  for (const L of layers) {
    const k = kd(L.p);
    const v0 = f0[L.p as 'x'];
    if (!k) {
      if (!L.identity(v0)) pending.push(`${L.type}(${L.f(v0)})`);
      continue;
    }
    flush();
    // The static transform keeps the first frame in place before a click/hover trigger starts the animation.
    wrap(` transform="${L.type}(${L.f(v0)})"`, animTransform(L.type, L.p, L.f));
  }
  if (!anyTrack(el, ['originX', 'originY']) && (f0.originX || f0.originY)) pending.push(`translate(${n(-f0.originX)} ${n(-f0.originY)})`);
  if (el.baseTransform) pending.push(el.baseTransform);
  flush();

  let anim = '';
  const paintAnims = () =>
    animAttr('fill', 'fill') + animAttr('fill-opacity', 'fillOpacity', (v) => n(clamp(numV(v), 0, 1))) +
    animAttr('stroke', 'stroke') + animAttr('stroke-opacity', 'strokeOpacity', (v) => n(clamp(numV(v), 0, 1))) +
    animAttr('stroke-width', 'strokeWidth', (v) => n(Math.max(0, numV(v)))) +
    animAttr('stroke-dashoffset', 'dashOffset') +
    (el.type === 'path' && (f0.trim < 100 || hasTrack(el, 'trim')) ? '' : animAttr('stroke-dasharray', 'dashArray', (v) => formatDash(parseDash(v)) || 'none'));
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
  const kids =
    el.type === 'group'
      ? composeKids(el, (c) => (c.visible ? animatedElementMarkup(c, doc, tm) : ''), (c) => animatedElementMarkup(c, doc, tm), false)
      : '';
  return open + shapeMarkup(el, f0, anim, kids) + close;
}

export interface ExportOptions {
  animated: boolean;
  time?: number;
}

export function exportSvg(doc: Doc, opts: ExportOptions): string {
  const tm = exportTiming(doc);
  const interactive = opts.animated && doc.trigger !== 'load';
  const out: string[] = [
    `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink" width="${doc.width}" height="${doc.height}" viewBox="0 0 ${doc.width} ${doc.height}"${opts.animated ? ` id="${ROOT_ID}"` : ''}${interactive ? ' style="cursor:pointer"' : ''}>`,
    `<title>${esc(doc.name)}</title>`,
    `<desc>Created with Animora — open-source SVG animator</desc>`,
  ];
  if (doc.defs) out.push(`<defs>${doc.defs}</defs>`);
  if (doc.background && doc.background !== 'none' && doc.background !== 'transparent') {
    out.push(`<rect width="${doc.width}" height="${doc.height}" fill="${esc(doc.background)}"/>`);
  }
  const root = { id: '__root', type: 'group', children: doc.elements } as SvgEl;
  out.push(
    composeKids(
      root,
      (el) => (!el.visible ? '' : opts.animated ? animatedElementMarkup(el, doc, tm) : staticElementMarkup(el, opts.time ?? 0)),
      (el) => (opts.animated ? animatedElementMarkup(el, doc, tm) : staticElementMarkup(el, opts.time ?? 0)),
      false,
    ),
  );
  out.push('</svg>');
  return out.join('\n');
}
