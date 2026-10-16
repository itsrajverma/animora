import type { SvgEl } from '../model/types';
import { createElement, uid } from '../model/factory';
import { formatColor, parseColor } from '../engine/color';
import { fmt } from '../engine/path';
import { modelBBox } from '../engine/matrix';

const DEF_TAGS = new Set(['linearGradient', 'radialGradient', 'clipPath', 'mask', 'pattern', 'filter', 'symbol', 'marker']);
const SKIP_TAGS = new Set(['defs', 'style', 'title', 'desc', 'metadata', 'script', ...DEF_TAGS]);
const SHAPES = new Set(['path', 'rect', 'circle', 'ellipse', 'line', 'polyline', 'polygon']);
const STYLE_PROPS = ['fill', 'fill-opacity', 'fill-rule', 'stroke', 'stroke-width', 'stroke-opacity', 'stroke-linecap', 'stroke-linejoin', 'stroke-dasharray', 'font-family', 'font-size', 'font-weight', 'font-style', 'text-anchor', 'opacity'];

export interface ImportResult {
  elements: SvgEl[];
  defs: string;
  width: number;
  height: number;
}

function paint(value: string, opacity: string): string {
  if (!value || value === 'none') return 'none';
  if (value.startsWith('url(')) return value.replace(/"/g, "'");
  const c = parseColor(value);
  if (!c) return value;
  return formatColor([c[0], c[1], c[2], c[3] * (parseFloat(opacity) || (opacity === '0' ? 0 : 1))]);
}

function shapeToPath(el: Element): string | null {
  const a = (k: string) => parseFloat(el.getAttribute(k) ?? '0') || 0;
  switch (el.tagName) {
    case 'path':
      return el.getAttribute('d');
    case 'rect': {
      const x = a('x'), y = a('y'), w = a('width'), h = a('height');
      let rx = el.hasAttribute('rx') ? a('rx') : a('ry');
      let ry = el.hasAttribute('ry') ? a('ry') : rx;
      rx = Math.min(rx, w / 2);
      ry = Math.min(ry, h / 2);
      if (!rx && !ry) return `M${x} ${y}H${x + w}V${y + h}H${x}Z`;
      return `M${x + rx} ${y}H${x + w - rx}A${rx} ${ry} 0 0 1 ${x + w} ${y + ry}V${y + h - ry}A${rx} ${ry} 0 0 1 ${x + w - rx} ${y + h}H${x + rx}A${rx} ${ry} 0 0 1 ${x} ${y + h - ry}V${y + ry}A${rx} ${ry} 0 0 1 ${x + rx} ${y}Z`;
    }
    case 'circle':
    case 'ellipse': {
      const cx = a('cx'), cy = a('cy');
      const rx = el.tagName === 'circle' ? a('r') : a('rx');
      const ry = el.tagName === 'circle' ? a('r') : a('ry');
      return `M${cx - rx} ${cy}A${rx} ${ry} 0 1 0 ${cx + rx} ${cy}A${rx} ${ry} 0 1 0 ${cx - rx} ${cy}Z`;
    }
    case 'line':
      return `M${a('x1')} ${a('y1')}L${a('x2')} ${a('y2')}`;
    case 'polyline':
    case 'polygon': {
      const pts = (el.getAttribute('points') ?? '').trim().split(/[\s,]+/).map(Number);
      if (pts.length < 4) return null;
      let d = `M${pts[0]} ${pts[1]}`;
      for (let i = 2; i + 1 < pts.length; i += 2) d += `L${pts[i]} ${pts[i + 1]}`;
      return el.tagName === 'polygon' ? d + 'Z' : d;
    }
  }
  return null;
}

/** Prefix ids so multiple imports never collide, and rewrite references. */
function prefixIds(root: Element, prefix: string) {
  const map = new Map<string, string>();
  root.querySelectorAll('[id]').forEach((n) => {
    const id = n.getAttribute('id')!;
    map.set(id, prefix + id);
    n.setAttribute('id', prefix + id);
  });
  if (!map.size) return;
  const fix = (v: string) =>
    v.replace(/url\(\s*['"]?#([^'")]+)['"]?\s*\)/g, (m, id) => (map.has(id) ? `url(#${map.get(id)})` : m));
  root.querySelectorAll('*').forEach((n) => {
    for (const attr of Array.from(n.attributes)) {
      if ((attr.name === 'href' || attr.name === 'xlink:href') && attr.value.startsWith('#')) {
        const id = attr.value.slice(1);
        if (map.has(id)) n.setAttribute(attr.name, '#' + map.get(id));
      } else if (attr.value.includes('url(')) {
        n.setAttribute(attr.name, fix(attr.value));
      }
    }
  });
}

function inlineStyles(orig: Element, clone: Element) {
  const cs = getComputedStyle(orig);
  const style: string[] = [];
  for (const p of STYLE_PROPS) {
    const v = cs.getPropertyValue(p);
    if (v) style.push(`${p}:${v.replace(/"/g, "'")}`);
  }
  clone.setAttribute('style', style.join(';'));
  clone.removeAttribute('class');
  const oc = Array.from(orig.children);
  const cc = Array.from(clone.children);
  oc.forEach((o, i) => cc[i] && !SKIP_TAGS.has(o.tagName) && inlineStyles(o, cc[i]));
}

export function importSvgText(text: string): ImportResult {
  const xml = new DOMParser().parseFromString(text, 'image/svg+xml');
  const src = xml.documentElement;
  if (src.nodeName !== 'svg' || xml.querySelector('parsererror')) throw new Error('This file is not a valid SVG.');
  prefixIds(src, `i${uid()}-`);

  const host = document.createElement('div');
  host.style.cssText = 'position:absolute;left:-100000px;top:0;width:2000px;height:2000px;overflow:hidden;visibility:hidden;';
  const svg = document.importNode(src, true) as unknown as SVGSVGElement;
  // <style> blocks would leak into the editor page; computed styles are inlined instead.
  const styles = Array.from(svg.querySelectorAll('style'));
  host.appendChild(svg);
  document.body.appendChild(host);

  try {
    const vb = svg.viewBox.baseVal;
    const hasVB = !!vb && vb.width > 0 && vb.height > 0;
    const width = hasVB ? vb.width : parseFloat(svg.getAttribute('width') ?? '') || 800;
    const height = hasVB ? vb.height : parseFloat(svg.getAttribute('height') ?? '') || 600;
    const ox = hasVB ? vb.x : 0;
    const oy = hasVB ? vb.y : 0;
    if (!hasVB) {
      svg.setAttribute('viewBox', `0 0 ${width} ${height}`);
    }
    svg.setAttribute('width', String(width));
    svg.setAttribute('height', String(height));

    const defs: string[] = [];
    const ser = new XMLSerializer();
    svg.querySelectorAll('*').forEach((n) => {
      if (DEF_TAGS.has(n.tagName) && !n.parentElement?.closest(Array.from(DEF_TAGS).join(','))) defs.push(ser.serializeToString(n));
    });

    const center = (n: SVGGraphicsElement, base: DOMMatrix) => {
      const b = n.getBBox();
      const pts = [[b.x, b.y], [b.x + b.width, b.y], [b.x, b.y + b.height], [b.x + b.width, b.y + b.height]].map(([x, y]) => new DOMPoint(x, y).matrixTransform(base));
      const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
      return { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
    };
    const toBase = (m: DOMMatrix) => {
      const ident = Math.abs(m.a - 1) < 1e-9 && Math.abs(m.b) < 1e-9 && Math.abs(m.c) < 1e-9 && Math.abs(m.d - 1) < 1e-9 && Math.abs(m.e) < 1e-9 && Math.abs(m.f) < 1e-9;
      return ident ? undefined : `matrix(${[m.a, m.b, m.c, m.d, m.e, m.f].map(fmt).join(' ')})`;
    };
    const nameOf = (n: Element, fallback: string) =>
      n.getAttribute('inkscape:label') || n.getAttribute('data-name') || n.getAttribute('id')?.replace(/^i[a-z0-9]+-/, '') || fallback;
    const safeCenter = (n: SVGGraphicsElement, base: DOMMatrix) => {
      try {
        return center(n, base);
      } catch {
        return { x: base.e, y: base.f };
      }
    };

    // Root space: viewBox user units with the viewBox origin moved to 0,0.
    const rootSpace = svg.getScreenCTM()?.translate(ox, oy);
    if (!rootSpace) throw new Error('Could not measure the SVG.');

    const makeRaw = (n: SVGGraphicsElement, parentInv: DOMMatrix, opacity: number): SvgEl | null => {
      const ctm = n.getScreenCTM();
      if (!ctm) return null;
      const base = parentInv.multiply(ctm);
      const clone = n.cloneNode(true) as Element;
      inlineStyles(n, clone);
      clone.removeAttribute('transform');
      clone.removeAttribute('opacity');
      clone.setAttribute('style', (clone.getAttribute('style') ?? '').replace(/(^|;)opacity:[^;]*/g, ''));
      const c = safeCenter(n, base);
      return createElement('raw', {
        name: nameOf(n, n.tagName === 'g' ? 'Group' : n.tagName === 'text' ? (n.textContent?.trim().slice(0, 24) || 'Text') : n.tagName),
        markup: ser.serializeToString(clone).replace(/ xmlns="http:\/\/www\.w3\.org\/2000\/svg"/g, ''),
        baseTransform: toBase(base), ax: c.x, ay: c.y,
      }, { x: c.x, y: c.y, opacity: Math.round(opacity * 1000) / 1000 });
    };

    /** Convert the children of `node` (whose own coordinate space maps to the screen via `space`). */
    const convert = (node: Element, space: DOMMatrix): SvgEl[] => {
      const out: SvgEl[] = [];
      const spaceInv = space.inverse();
      for (const child of Array.from(node.children)) {
        const tag = child.tagName;
        if (SKIP_TAGS.has(tag)) continue;
        const g = child as SVGGraphicsElement;
        const cs = getComputedStyle(child);
        if (cs.display === 'none' || typeof g.getScreenCTM !== 'function') continue;
        const op = parseFloat(cs.opacity);
        const opacity = Number.isFinite(op) ? op : 1;
        const complex = child.hasAttribute('clip-path') || child.hasAttribute('mask') || child.hasAttribute('filter') ||
          (cs.clipPath && cs.clipPath !== 'none') || (cs.mask && cs.mask !== 'none' && cs.mask !== '') || (cs.filter && cs.filter !== 'none');
        const ctm = g.getScreenCTM();
        if (!ctm) continue;
        if ((tag === 'g' || tag === 'a' || tag === 'switch') && !complex) {
          const kids = convert(child, ctm);
          if (!kids.length) continue;
          const base = spaceInv.multiply(ctm);
          const c = safeCenter(g, base);
          if (kids.length === 1 && !toBase(base) && opacity === 1) {
            out.push(kids[0]);
            continue;
          }
          out.push(createElement('group', {
            name: nameOf(child, 'Group'), children: kids, baseTransform: toBase(base), ax: c.x, ay: c.y,
          }, { x: c.x, y: c.y, opacity: Math.round(opacity * 1000) / 1000 }));
          continue;
        }
        if (SHAPES.has(tag) && !complex) {
          const d = shapeToPath(child);
          if (!d) continue;
          const base = spaceInv.multiply(ctm);
          const c = safeCenter(g, base);
          const stroke = paint(cs.stroke, cs.strokeOpacity);
          out.push(createElement('path', {
            name: nameOf(child, tag === 'path' ? 'Path' : tag[0].toUpperCase() + tag.slice(1)),
            baseTransform: toBase(base),
            ax: c.x, ay: c.y,
            lineCap: cs.strokeLinecap !== 'butt' ? cs.strokeLinecap : undefined,
            lineJoin: cs.strokeLinejoin !== 'miter' ? cs.strokeLinejoin : undefined,
          }, {
            x: c.x, y: c.y, d,
            fill: paint(cs.fill, cs.fillOpacity),
            stroke,
            strokeWidth: stroke === 'none' ? 0 : parseFloat(cs.strokeWidth) || 0,
            opacity: Math.round(opacity * 1000) / 1000,
          }));
          continue;
        }
        // text, image, use, nested svg, foreignObject, masked/clipped groups… keep as-is
        const raw = makeRaw(g, spaceInv, opacity);
        if (raw) out.push(raw);
      }
      return out;
    };
    const elements = convert(svg, rootSpace);
    styles.forEach((s) => s.remove());
    return { elements, defs: defs.join(''), width, height };
  } finally {
    host.remove();
  }
}

export function readFileAsText(file: File): Promise<string> {
  return file.text();
}

export function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(String(r.result));
    r.onerror = () => reject(r.error);
    r.readAsDataURL(file);
  });
}

export function imageSize(url: string): Promise<{ w: number; h: number }> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve({ w: img.naturalWidth || 200, h: img.naturalHeight || 200 });
    img.onerror = () => reject(new Error('Could not load image'));
    img.src = url;
  });
}

/** Wrap imported layers in one group named after the file, so the import stays tidy in the layer list. */
export function wrapImport(elements: SvgEl[], name: string): SvgEl[] {
  if (elements.length < 2) return elements;
  const g = createElement('group', { name, children: elements });
  const b = modelBBox(g, 0);
  const cx = b ? b.x + b.w / 2 : 0;
  const cy = b ? b.y + b.h / 2 : 0;
  g.ax = cx;
  g.ay = cy;
  g.props = { x: cx, y: cy };
  return [g];
}
