import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useStore, getState, setState } from '../state/store';
import {
  addElement, convertToPath, findEl, getEl, select, setRawProps, setTool, setValues, type Change,
} from '../state/actions';
import { enterGroup } from '../state/structure';
import { createElement, uid } from '../model/factory';
import { ancestors } from '../model/tree';
import type { SvgEl, Tool } from '../model/types';
import { frameAt } from '../engine/interpolate';
import { staticElementMarkup } from '../engine/render';
import { fmt, parsePath, polygonPath, serializePath, starPath, type Cmd } from '../engine/path';
import { canvasApi, type Measured } from './canvasApi';
import { ToolDock } from './ToolDock';
import { SelectionBar } from './SelectionBar';
import { Icon } from './Icon';

type Pt = { x: number; y: number };

const DRAW_TOOLS: Tool[] = ['rect', 'ellipse', 'line', 'star', 'polygon'];
const HANDLES: [number, number][] = [[-1, -1], [0, -1], [1, -1], [1, 0], [1, 1], [0, 1], [-1, 1], [-1, 0]];
const CURSORS: Record<string, string> = {
  '-1,-1': 'nwse-resize', '1,1': 'nwse-resize', '1,-1': 'nesw-resize', '-1,1': 'nesw-resize',
  '0,-1': 'ns-resize', '0,1': 'ns-resize', '-1,0': 'ew-resize', '1,0': 'ew-resize',
};

const rot = (p: Pt, deg: number): Pt => {
  const a = (deg * Math.PI) / 180, c = Math.cos(a), s = Math.sin(a);
  return { x: p.x * c - p.y * s, y: p.x * s + p.y * c };
};
const mid = (a: Pt, b: Pt): Pt => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });
const tp = (m: DOMMatrix, p: Pt): Pt => {
  const r = new DOMPoint(p.x, p.y).matrixTransform(m);
  return { x: r.x, y: r.y };
};

function inPolygon(p: Pt, poly: Pt[]): boolean {
  let inside = false;
  for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) {
    const a = poly[i], b = poly[j];
    if (a.y > p.y !== b.y > p.y && p.x < ((b.x - a.x) * (p.y - a.y)) / (b.y - a.y) + a.x) inside = !inside;
  }
  return inside;
}

const hostOf = (svg: SVGSVGElement, id: string) => svg.querySelector(`[data-el="${CSS.escape(id)}"]`) as SVGGraphicsElement | null;

function measureIn(svg: SVGSVGElement, el: SvgEl, time: number): Measured | null {
  const host = hostOf(svg, el.id);
  const main = host?.firstElementChild as SVGGraphicsElement | null;
  const root = svg.getScreenCTM();
  const hm = host?.getScreenCTM();
  const mm = main?.getScreenCTM();
  if (!main || !root || !hm || !mm) return null;
  let b: DOMRect;
  try {
    b = main.getBBox();
  } catch {
    return null;
  }
  const ri = root.inverse();
  const P = ri.multiply(hm);
  const M = ri.multiply(mm);
  const f = frameAt(el, time);
  return {
    id: el.id,
    f,
    P,
    origin: tp(P, { x: f.x, y: f.y }),
    lb: { x: b.x, y: b.y, w: b.width, h: b.height },
    corners: [
      tp(M, { x: b.x, y: b.y }), tp(M, { x: b.x + b.width, y: b.y }),
      tp(M, { x: b.x + b.width, y: b.y + b.height }), tp(M, { x: b.x, y: b.y + b.height }),
    ],
  };
}

function geometryMatrix(svg: SVGSVGElement, id: string): DOMMatrix | null {
  const inner = hostOf(svg, id)?.firstElementChild?.firstElementChild as SVGGraphicsElement | null;
  const root = svg.getScreenCTM();
  const m = inner?.getScreenCTM();
  if (!root || !m) return null;
  return root.inverse().multiply(m);
}

/** Layer ids under the pointer, outermost first. */
function hitChain(target: Element): string[] {
  const chain: string[] = [];
  let n: Element | null | undefined = target.closest('[data-el]');
  while (n) {
    chain.unshift(n.getAttribute('data-el')!);
    n = n.parentElement?.closest('[data-el]');
  }
  return chain;
}

/** Which layer a click should pick, respecting the selection and the entered group. */
function pick(chain: string[], deep: boolean): string | null {
  if (!chain.length) return null;
  if (deep) return chain[chain.length - 1];
  const s = getState();
  const selected = chain.find((id) => s.selection.includes(id));
  if (selected) return selected;
  if (s.scope) {
    const i = chain.indexOf(s.scope);
    if (i >= 0 && i < chain.length - 1) return chain[i + 1];
    setState({ scope: null });
  }
  return chain[0];
}

type PenPt = { x: number; y: number; hin?: Pt; hout?: Pt };

type Gesture =
  | { kind: 'pan'; cx: number; cy: number; px: number; py: number }
  | { kind: 'move'; p0: Pt; starts: { id: string; x: number; y: number; Pinv: DOMMatrix }[]; key: string; moved: boolean }
  | { kind: 'resize'; p0: Pt; m: Measured; type: SvgEl['type']; hx: number; hy: number; key: string; Pinv: DOMMatrix }
  | { kind: 'rotate'; c: Pt; a0: number; r0: number; key: string; Pinv: DOMMatrix }
  | { kind: 'marquee'; p0: Pt; additive: boolean }
  | { kind: 'draw'; tool: Tool; p0: Pt; id: string | null; key: string; Pinv: DOMMatrix | null }
  | { kind: 'pen'; idx: number }
  | { kind: 'node'; id: string; cmds: Cmd[]; targets: { ci: number; pi: number }[]; inv: DOMMatrix; p0: Pt; key: string };

export function Canvas({ onImport }: { onImport: () => void }) {
  const doc = useStore((s) => s.doc);
  const time = useStore((s) => s.time);
  const selection = useStore((s) => s.selection);
  const scope = useStore((s) => s.scope);
  const tool = useStore((s) => s.tool);
  const zoom = useStore((s) => s.zoom);
  const panX = useStore((s) => s.panX);
  const panY = useStore((s) => s.panY);

  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const gesture = useRef<Gesture | null>(null);
  const [dragging, setDragging] = useState(false);
  const [marquee, setMarquee] = useState<{ a: Pt; b: Pt } | null>(null);
  const [measured, setMeasured] = useState<Measured[]>([]);
  const [scopeBox, setScopeBox] = useState<Pt[] | null>(null);
  const [nodeMat, setNodeMat] = useState<DOMMatrix | null>(null);
  const pen = useRef<PenPt[]>([]);
  const [penHover, setPenHover] = useState<Pt | null>(null);
  const [, force] = useState(0);
  const rerender = () => force((n) => n + 1);

  // ---- viewport -----------------------------------------------------------
  useLayoutEffect(() => {
    const el = wrapRef.current!;
    const ro = new ResizeObserver(() => setSize({ w: el.clientWidth, h: el.clientHeight }));
    ro.observe(el);
    setSize({ w: el.clientWidth, h: el.clientHeight });
    return () => ro.disconnect();
  }, []);

  const fit = useCallback(() => {
    const el = wrapRef.current;
    if (!el) return;
    const { width, height } = getState().doc;
    const w = el.clientWidth, h = el.clientHeight;
    const z = Math.max(0.05, Math.min((w - 120) / width, (h - 150) / height, 4));
    setState({ zoom: z, panX: (w - width * z) / 2, panY: (h - height * z) / 2 + 10 });
  }, []);

  const ready = size.w > 0;
  useEffect(() => {
    if (ready) fit();
  }, [ready, doc.width, doc.height, fit]);

  useEffect(() => {
    const el = wrapRef.current!;
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      const s = getState();
      const r = el.getBoundingClientRect();
      if (e.ctrlKey || e.metaKey) {
        const mx = e.clientX - r.left, my = e.clientY - r.top;
        const z = Math.max(0.05, Math.min(32, s.zoom * Math.exp(-e.deltaY * 0.0025)));
        setState({ zoom: z, panX: mx - ((mx - s.panX) * z) / s.zoom, panY: my - ((my - s.panY) * z) / s.zoom });
      } else {
        setState({ panX: s.panX - e.deltaX, panY: s.panY - e.deltaY });
      }
    };
    el.addEventListener('wheel', onWheel, { passive: false });
    return () => el.removeEventListener('wheel', onWheel);
  }, []);

  const toDoc = (cx: number, cy: number): Pt => {
    const r = svgRef.current!.getBoundingClientRect();
    const s = getState();
    return { x: (cx - r.left - s.panX) / s.zoom, y: (cy - r.top - s.panY) / s.zoom };
  };

  /** Artboard → coordinates of the group new shapes are drawn into. */
  const scopeInv = (): DOMMatrix | null => {
    const s = getState();
    if (!s.scope || !svgRef.current) return null;
    const m = geometryMatrix(svgRef.current, s.scope);
    return m ? m.inverse() : null;
  };

  // ---- measurement ---------------------------------------------------------
  canvasApi.measure = (id: string) => {
    const el = getEl(id);
    return el && svgRef.current ? measureIn(svgRef.current, el, getState().time) : null;
  };
  canvasApi.localBBox = (id: string) => {
    const main = svgRef.current && (hostOf(svgRef.current, id)?.firstElementChild as SVGGraphicsElement | null);
    if (!main) return null;
    try {
      const b = main.getBBox();
      return b.width || b.height ? { x: b.x, y: b.y, w: b.width, h: b.height } : null;
    } catch {
      return null;
    }
  };
  canvasApi.fit = fit;

  const nodeTarget = tool === 'node' && selection.length === 1 ? findEl(doc, selection[0]) : undefined;
  const nodeEl = nodeTarget?.type === 'path' ? nodeTarget : undefined;

  useLayoutEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const next = selection
      .map((id) => findEl(doc, id))
      .filter(Boolean)
      .map((el) => measureIn(svg, el!, time))
      .filter(Boolean) as Measured[];
    const same = next.length === measured.length && next.every((m, i) =>
      m.id === measured[i].id && m.corners.every((c, j) => Math.abs(c.x - measured[i].corners[j].x) < 1e-3 && Math.abs(c.y - measured[i].corners[j].y) < 1e-3));
    if (!same) setMeasured(next);
    const sEl = scope ? findEl(doc, scope) : undefined;
    const sm = sEl ? measureIn(svg, sEl, time) : null;
    const sb = sm ? sm.corners : null;
    if (JSON.stringify(sb) !== JSON.stringify(scopeBox)) setScopeBox(sb);
    const nm = nodeEl ? geometryMatrix(svg, nodeEl.id) : null;
    const eq = (a: DOMMatrix | null, b: DOMMatrix | null) =>
      a === b || (!!a && !!b && [a.a - b.a, a.b - b.b, a.c - b.c, a.d - b.d, a.e - b.e, a.f - b.f].every((v) => Math.abs(v) < 1e-6));
    if (!eq(nm, nodeMat)) setNodeMat(nm);
  });

  // ---- pen tool -------------------------------------------------------------
  const finishPen = useCallback((closed: boolean) => {
    const raw = pen.current;
    pen.current = [];
    setPenHover(null);
    if (raw.length < 2) return rerender();
    const si = scopeInv();
    const T = (p: Pt) => (si ? tp(si, p) : p);
    const pts = raw.map((p) => ({ ...T(p), hin: p.hin && T(p.hin), hout: p.hout && T(p.hout) }));
    const all = pts.flatMap((p) => [p, p.hin, p.hout].filter(Boolean) as Pt[]);
    const xs = all.map((p) => p.x), ys = all.map((p) => p.y);
    const c = { x: (Math.min(...xs) + Math.max(...xs)) / 2, y: (Math.min(...ys) + Math.max(...ys)) / 2 };
    const r = (p: Pt) => `${fmt(p.x - c.x)} ${fmt(p.y - c.y)}`;
    let d = `M${r(pts[0])}`;
    const seg = (a: PenPt, b: PenPt) => (a.hout || b.hin ? ` C${r(a.hout ?? a)} ${r(b.hin ?? b)} ${r(b)}` : ` L${r(b)}`);
    for (let i = 1; i < pts.length; i++) d += seg(pts[i - 1], pts[i]);
    if (closed) d += seg(pts[pts.length - 1], pts[0]) + ' Z';
    const el = createElement('path', { lineCap: 'round', lineJoin: 'round' }, {
      x: c.x, y: c.y, d, fill: closed ? '#9aa8ff' : 'none', stroke: '#1b1d2a', strokeWidth: 3,
    });
    addElement(el);
    setTool('select');
    rerender();
  }, []);

  useEffect(() => {
    if (tool !== 'pen') {
      if (pen.current.length) finishPen(false);
      return;
    }
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Enter' || e.key === 'Escape') {
        e.preventDefault();
        e.stopPropagation();
        finishPen(false);
      }
    };
    window.addEventListener('keydown', onKey, true);
    return () => window.removeEventListener('keydown', onKey, true);
  }, [tool, finishPen]);

  // ---- pointer handling -------------------------------------------------------
  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    const s = getState();
    const p = toDoc(e.clientX, e.clientY);
    const target = e.target as Element;
    if (s.menu) setState({ menu: null });
    if (s.playing) setState({ playing: false });

    if (e.button === 2) {
      const id = pick(hitChain(target), e.ctrlKey || e.metaKey);
      if (id && !s.selection.includes(id)) select([id]);
      else if (!id && !s.selection.length) return;
      setState({ menu: { x: e.clientX, y: e.clientY } });
      return;
    }
    svgRef.current!.setPointerCapture(e.pointerId);

    if (e.button === 1 || s.tool === 'hand') {
      gesture.current = { kind: 'pan', cx: e.clientX, cy: e.clientY, px: s.panX, py: s.panY };
      setDragging(true);
      return;
    }
    if (e.button !== 0) return;

    if (DRAW_TOOLS.includes(s.tool)) {
      gesture.current = { kind: 'draw', tool: s.tool, p0: p, id: null, key: 'g:' + uid(), Pinv: scopeInv() };
      return;
    }
    if (s.tool === 'text') {
      const si = scopeInv();
      const q = si ? tp(si, p) : p;
      const el = createElement('text', { text: 'Your text', fontWeight: '700' }, { x: q.x, y: q.y, fontSize: 48, fill: '#1b1d2a' });
      addElement(el);
      setTool('select');
      setState({ focusText: Date.now(), inspectorTab: 'design' });
      return;
    }
    if (s.tool === 'pen') {
      const pts = pen.current;
      if (pts.length >= 2 && Math.hypot(pts[0].x - p.x, pts[0].y - p.y) * s.zoom < 9) {
        finishPen(true);
        return;
      }
      pts.push({ x: p.x, y: p.y });
      gesture.current = { kind: 'pen', idx: pts.length - 1 };
      rerender();
      return;
    }

    const handle = target.closest('[data-handle]');
    if (handle && measured.length === 1) {
      const h = handle.getAttribute('data-handle')!;
      const m = measured[0];
      const el = getEl(m.id)!;
      const key = 'g:' + uid();
      const Pinv = m.P.inverse();
      const lp = tp(Pinv, p);
      if (h === 'rot') {
        gesture.current = { kind: 'rotate', c: { x: m.f.x, y: m.f.y }, a0: Math.atan2(lp.y - m.f.y, lp.x - m.f.x), r0: m.f.rotation, key, Pinv };
      } else {
        const [hx, hy] = h.split(',').map(Number);
        gesture.current = { kind: 'resize', p0: lp, m, type: el.type, hx, hy, key, Pinv };
      }
      setDragging(true);
      return;
    }

    const node = target.closest('[data-node]');
    if (node && nodeEl && nodeMat) {
      const [ci, pi] = node.getAttribute('data-node')!.split(':').map(Number);
      const cmds = parsePath(frameAt(nodeEl, s.time).d);
      const targets = [{ ci, pi }];
      if (pi === cmds[ci].p.length - 2) {
        const ox = cmds[ci].p[pi], oy = cmds[ci].p[pi + 1];
        cmds.forEach((c, k) => {
          if (k === ci || c.c === 'Z') return;
          const j = c.p.length - 2;
          if (Math.abs(c.p[j] - ox) < 1e-3 && Math.abs(c.p[j + 1] - oy) < 1e-3) targets.push({ ci: k, pi: j });
        });
        for (const t of [...targets]) {
          if (cmds[t.ci].c === 'C') targets.push({ ci: t.ci, pi: 2 });
          const nx = cmds[t.ci + 1];
          if (nx && nx.c === 'C') targets.push({ ci: t.ci + 1, pi: 0 });
        }
      }
      gesture.current = { kind: 'node', id: nodeEl.id, cmds, targets, inv: nodeMat.inverse(), p0: p, key: 'g:' + uid() };
      return;
    }

    const id = pick(hitChain(target), e.ctrlKey || e.metaKey);
    const hitEl = id ? findEl(s.doc, id) : undefined;
    if (hitEl && !hitEl.locked && !ancestors(s.doc.elements, hitEl.id).some((a) => a.locked)) {
      let sel = getState().selection;
      if (e.shiftKey) {
        sel = sel.includes(hitEl.id) ? sel.filter((i) => i !== hitEl.id) : [...sel, hitEl.id];
        select(sel);
      } else if (!sel.includes(hitEl.id)) {
        sel = [hitEl.id];
        select(sel);
      }
      if (s.tool === 'node' && hitEl.type !== 'path') setTool('select');
      gesture.current = {
        kind: 'move',
        p0: p,
        key: 'g:' + uid(),
        moved: false,
        starts: sel.flatMap((sid) => {
          const el = getEl(sid);
          const m = el && measureIn(svgRef.current!, el, s.time);
          if (!el || !m) return [];
          return [{ id: sid, x: m.f.x, y: m.f.y, Pinv: m.P.inverse() }];
        }),
      };
      return;
    }

    // Pressing inside the box of the current selection (e.g. a gap inside a group) drags it.
    if (!e.shiftKey && (s.tool === 'select' || s.tool === 'node') && measured.some((m) => inPolygon(p, m.corners))) {
      gesture.current = {
        kind: 'move',
        p0: p,
        key: 'g:' + uid(),
        moved: false,
        starts: measured.map((m) => ({ id: m.id, x: m.f.x, y: m.f.y, Pinv: m.P.inverse() })),
      };
      return;
    }

    if (!e.shiftKey) select([]);
    gesture.current = { kind: 'marquee', p0: p, additive: e.shiftKey };
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const g = gesture.current;
    const p = toDoc(e.clientX, e.clientY);
    const s = getState();
    if (!g) {
      if (s.tool === 'pen' && pen.current.length) setPenHover(p);
      return;
    }
    switch (g.kind) {
      case 'pan':
        setState({ panX: g.px + e.clientX - g.cx, panY: g.py + e.clientY - g.cy });
        break;
      case 'move': {
        let dx = p.x - g.p0.x, dy = p.y - g.p0.y;
        if (!g.moved && Math.hypot(dx, dy) * s.zoom < 3) return;
        if (!g.moved) setDragging(true);
        g.moved = true;
        if (e.shiftKey) Math.abs(dx) > Math.abs(dy) ? (dy = 0) : (dx = 0);
        const ch: Change[] = [];
        for (const st of g.starts) {
          const a = tp(st.Pinv, g.p0), b = tp(st.Pinv, { x: g.p0.x + dx, y: g.p0.y + dy });
          ch.push([st.id, 'x', Math.round((st.x + b.x - a.x) * 10) / 10], [st.id, 'y', Math.round((st.y + b.y - a.y) * 10) / 10]);
        }
        setValues(ch, g.key);
        break;
      }
      case 'resize': {
        const { m, hx, hy } = g;
        const lp = tp(g.Pinv, p);
        const L = rot({ x: lp.x - g.p0.x, y: lp.y - g.p0.y }, -m.f.rotation);
        const VW = Math.max(1e-6, m.lb.w * Math.abs(m.f.scaleX));
        const VH = Math.max(1e-6, m.lb.h * Math.abs(m.f.scaleY));
        const k = e.altKey ? 2 : 1;
        let kx = hx ? Math.max(1 / VW, (VW + hx * L.x * k) / VW) : 1;
        let ky = hy ? Math.max(1 / VH, (VH + hy * L.y * k) / VH) : 1;
        if (e.shiftKey) {
          const u = hx && hy ? Math.max(kx, ky) : hx ? kx : ky;
          kx = ky = u;
        }
        const cx = m.lb.x + m.lb.w / 2, cy = m.lb.y + m.lb.h / 2;
        const lo = e.altKey ? { x: cx, y: cy } : { x: cx - (hx * m.lb.w) / 2, y: cy - (hy * m.lb.h) / 2 };
        if (e.shiftKey && !e.altKey) {
          if (!hx) lo.x = cx;
          if (!hy) lo.y = cy;
        }
        const delta = rot({ x: m.f.scaleX * lo.x * (1 - kx), y: m.f.scaleY * lo.y * (1 - ky) }, m.f.rotation);
        const id = m.id;
        const ch: Change[] = [[id, 'x', m.f.x + delta.x], [id, 'y', m.f.y + delta.y]];
        if (g.type === 'rect' || g.type === 'ellipse' || g.type === 'image') {
          if (kx !== 1) ch.push([id, 'width', Math.round(m.f.width * kx * 10) / 10]);
          if (ky !== 1) ch.push([id, 'height', Math.round(m.f.height * ky * 10) / 10]);
        } else {
          if (kx !== 1) ch.push([id, 'scaleX', Math.round(m.f.scaleX * kx * 1000) / 1000]);
          if (ky !== 1) ch.push([id, 'scaleY', Math.round(m.f.scaleY * ky * 1000) / 1000]);
        }
        setValues(ch, g.key);
        break;
      }
      case 'rotate': {
        const lp = tp(g.Pinv, p);
        let r = g.r0 + ((Math.atan2(lp.y - g.c.y, lp.x - g.c.x) - g.a0) * 180) / Math.PI;
        r = e.shiftKey ? Math.round(r / 15) * 15 : Math.round(r * 10) / 10;
        const id = s.selection[0];
        if (id) setValues([[id, 'rotation', r]], g.key);
        break;
      }
      case 'marquee':
        setMarquee({ a: g.p0, b: p });
        break;
      case 'draw': {
        const T = (q: Pt) => (g.Pinv ? tp(g.Pinv, q) : q);
        const p0 = T(g.p0), p1 = T(p);
        let dx = p1.x - p0.x, dy = p1.y - p0.y;
        if (!g.id && Math.hypot(p.x - g.p0.x, p.y - g.p0.y) * s.zoom < 3) return;
        let props: SvgEl['props'];
        if (g.tool === 'line') {
          if (e.shiftKey) {
            const a = Math.round(Math.atan2(dy, dx) / (Math.PI / 4)) * (Math.PI / 4), len = Math.hypot(dx, dy);
            dx = Math.cos(a) * len;
            dy = Math.sin(a) * len;
          }
          props = { x: p0.x + dx / 2, y: p0.y + dy / 2, d: `M${fmt(-dx / 2)} ${fmt(-dy / 2)} L${fmt(dx / 2)} ${fmt(dy / 2)}` };
        } else {
          if (e.shiftKey) {
            const mm = Math.max(Math.abs(dx), Math.abs(dy));
            dx = Math.sign(dx || 1) * mm;
            dy = Math.sign(dy || 1) * mm;
          }
          let w = Math.abs(dx), h = Math.abs(dy), x = p0.x + dx / 2, y = p0.y + dy / 2;
          if (e.altKey) {
            w *= 2; h *= 2; x = p0.x; y = p0.y;
          }
          w = Math.max(1, Math.round(w)); h = Math.max(1, Math.round(h));
          props = g.tool === 'star' ? { x, y, d: starPath(w, h) } : g.tool === 'polygon' ? { x, y, d: polygonPath(w, h) } : { x, y, width: w, height: h };
        }
        if (!g.id) {
          const el = newDrawn(g.tool, props);
          g.id = el.id;
          addElement(el, g.key);
        } else setRawProps(g.id, props, g.key);
        break;
      }
      case 'pen': {
        const pt = pen.current[g.idx];
        if (!pt || Math.hypot(p.x - pt.x, p.y - pt.y) * s.zoom < 3) return;
        pt.hout = p;
        pt.hin = { x: 2 * pt.x - p.x, y: 2 * pt.y - p.y };
        rerender();
        break;
      }
      case 'node': {
        const a = tp(g.inv, g.p0), b = tp(g.inv, p);
        const dx = b.x - a.x, dy = b.y - a.y;
        const cmds = g.cmds.map((c) => ({ c: c.c, p: [...c.p] }));
        for (const t of g.targets) {
          cmds[t.ci].p[t.pi] = g.cmds[t.ci].p[t.pi] + dx;
          cmds[t.ci].p[t.pi + 1] = g.cmds[t.ci].p[t.pi + 1] + dy;
        }
        setValues([[g.id, 'd', serializePath(cmds)]], g.key);
        break;
      }
    }
  };

  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    const g = gesture.current;
    gesture.current = null;
    setDragging(false);
    if (svgRef.current?.hasPointerCapture(e.pointerId)) svgRef.current.releasePointerCapture(e.pointerId);
    if (!g) return;
    if (g.kind === 'marquee') {
      setMarquee(null);
      const p = toDoc(e.clientX, e.clientY);
      const x0 = Math.min(g.p0.x, p.x), x1 = Math.max(g.p0.x, p.x), y0 = Math.min(g.p0.y, p.y), y1 = Math.max(g.p0.y, p.y);
      if ((x1 - x0) * getState().zoom < 3 && (y1 - y0) * getState().zoom < 3) return;
      const { doc: d, time: t, selection: sel, scope: sc } = getState();
      const pool = sc ? findEl(d, sc)?.children ?? d.elements : d.elements;
      const hits = pool.filter((el) => {
        if (el.locked || !el.visible) return false;
        const m = measureIn(svgRef.current!, el, t);
        if (!m) return false;
        const xs = m.corners.map((c) => c.x), ys = m.corners.map((c) => c.y);
        return Math.max(...xs) >= x0 && Math.min(...xs) <= x1 && Math.max(...ys) >= y0 && Math.min(...ys) <= y1;
      }).map((el) => el.id);
      select(g.additive ? [...new Set([...sel, ...hits])] : hits);
      if (sc && hits.length) setState({ scope: sc });
    } else if (g.kind === 'draw') {
      if (!g.id) {
        const q = g.Pinv ? tp(g.Pinv, g.p0) : g.p0;
        const props: SvgEl['props'] =
          g.tool === 'line' ? { x: q.x, y: q.y, d: 'M-60 0 L60 0' }
            : g.tool === 'star' ? { x: q.x, y: q.y, d: starPath(120, 120) }
              : g.tool === 'polygon' ? { x: q.x, y: q.y, d: polygonPath(120, 120) }
                : { x: q.x, y: q.y, width: 120, height: 120 };
        addElement(newDrawn(g.tool, props));
      }
      setTool('select');
    }
  };

  const onDoubleClick = (e: React.MouseEvent) => {
    const s = getState();
    if (s.tool === 'pen') {
      pen.current.pop();
      finishPen(false);
      return;
    }
    // Pointer capture retargets dblclick to the <svg>; find what is really under the cursor.
    const under = document.elementFromPoint(e.clientX, e.clientY) ?? (e.target as Element);
    const chain = hitChain(under);
    if (!chain.length) {
      if (s.scope) select([s.scope]);
      return;
    }
    const id = pick(chain, e.ctrlKey || e.metaKey);
    const el = id ? getEl(id) : undefined;
    if (!el || el.locked) return;
    if (el.type === 'group') {
      const i = chain.indexOf(el.id);
      const child = chain[i + 1];
      if (child) {
        setState({ scope: el.id });
        setState({ selection: [child], selectedKfs: [] });
      } else enterGroup(el.id);
      return;
    }
    if (el.type === 'text') {
      setState({ focusText: Date.now(), inspectorTab: 'design' });
      return;
    }
    if (el.type === 'rect' || el.type === 'ellipse') convertToPath(el.id);
    if (el.type === 'path' || el.type === 'rect' || el.type === 'ellipse') {
      select([el.id]);
      setTool('node');
    }
  };

  // ---- render -----------------------------------------------------------------
  const px = 1 / zoom;
  const viewBox = `${fmt(-panX / zoom)} ${fmt(-panY / zoom)} ${fmt(Math.max(1, size.w) / zoom)} ${fmt(Math.max(1, size.h) / zoom)}`;
  const transparent = !doc.background || doc.background === 'none' || doc.background === 'transparent';
  const single = measured.length === 1 && tool === 'select' && !getEl(measured[0].id)?.locked ? measured[0] : null;
  const cursor = tool === 'hand' ? (dragging ? 'grabbing' : 'grab') : DRAW_TOOLS.includes(tool) || tool === 'pen' ? 'crosshair' : tool === 'text' ? 'text' : 'default';
  const scopeEl = scope ? findEl(doc, scope) : undefined;

  return (
    <div className="canvas-wrap" ref={wrapRef} style={{ cursor }}>
      <svg
        ref={svgRef}
        className="canvas-svg"
        width={size.w}
        height={size.h}
        viewBox={viewBox}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onDoubleClick={onDoubleClick}
        onContextMenu={(e) => e.preventDefault()}
      >
        <defs>
          <pattern id="__checker" width="16" height="16" patternUnits="userSpaceOnUse">
            <rect width="16" height="16" fill="#ffffff" />
            <rect width="8" height="8" fill="#e6e8ef" />
            <rect x="8" y="8" width="8" height="8" fill="#e6e8ef" />
          </pattern>
          <filter id="__shadow" x="-10%" y="-10%" width="120%" height="120%">
            <feDropShadow dx="0" dy={6 * px} stdDeviation={16 * px} floodColor="#000" floodOpacity="0.28" />
          </filter>
        </defs>
        <rect width={doc.width} height={doc.height} fill={transparent ? 'url(#__checker)' : doc.background} filter="url(#__shadow)" />
        {doc.defs && <defs dangerouslySetInnerHTML={{ __html: doc.defs }} />}
        <g className={`content ${scope ? 'scoped' : ''}`}>
          {doc.elements.map((el) => (
            <g
              key={el.id}
              data-el={el.id}
              style={{ display: el.visible ? undefined : 'none', pointerEvents: el.locked ? 'none' : undefined }}
              dangerouslySetInnerHTML={{ __html: staticElementMarkup(el, time, true) }}
            />
          ))}
        </g>
        <rect width={doc.width} height={doc.height} fill="none" stroke="currentColor" className="artboard-outline" strokeWidth={px} pointerEvents="none" />

        {scopeBox && (
          <polygon points={scopeBox.map((c) => `${c.x},${c.y}`).join(' ')} fill="none" className="scope-box" strokeWidth={1.2 * px} strokeDasharray={`${5 * px} ${4 * px}`} pointerEvents="none" />
        )}

        <g pointerEvents="none">
          {measured.map((m) => (
            <polygon key={m.id} points={m.corners.map((c) => `${c.x},${c.y}`).join(' ')} fill="none" className="sel-box" strokeWidth={1.5 * px} />
          ))}
        </g>

        {single && !dragging && <Handles m={single} px={px} />}
        {single && dragging && <SizeBadge m={single} px={px} />}

        {nodeEl && nodeMat && <NodeOverlay el={nodeEl} time={time} mat={nodeMat} px={px} />}

        {marquee && (
          <rect
            x={Math.min(marquee.a.x, marquee.b.x)}
            y={Math.min(marquee.a.y, marquee.b.y)}
            width={Math.abs(marquee.a.x - marquee.b.x)}
            height={Math.abs(marquee.a.y - marquee.b.y)}
            className="marquee"
            strokeDasharray={`${4 * px} ${3 * px}`}
            strokeWidth={px}
            pointerEvents="none"
          />
        )}

        {tool === 'pen' && pen.current.length > 0 && <PenPreview pts={pen.current} hover={penHover} px={px} />}
      </svg>

      <ToolDock />

      {scopeEl && (
        <div className="scope-chip">
          <Icon name="folder" size={14} /> Inside <b>{scopeEl.name}</b>
          <button onClick={() => select([scopeEl.id])}>Exit group</button>
        </div>
      )}

      {doc.elements.length === 0 && (
        <div className="empty-state">
          <div className="empty-card">
            <div className="empty-icon"><Icon name="sparkles" size={28} /></div>
            <h2>Start your animation</h2>
            <p>Import an SVG (its groups and layers are kept) or draw with the tools above.</p>
            <div className="empty-actions">
              <button className="btn primary" onClick={onImport}><Icon name="upload" /> Import SVG or image</button>
              <button className="btn" onClick={() => setState({ sidebarTab: 'shapes' })}><Icon name="shapes" /> Browse shapes</button>
            </div>
            <span className="muted small">Tip: you can also drag & drop files anywhere.</span>
          </div>
        </div>
      )}

      {selection.length > 0 && !dragging && tool !== 'pen' && <SelectionBar />}

      <div className="zoom-badge">
        <button onClick={() => zoomBy(1 / 1.25)} title="Zoom out">−</button>
        <button onClick={fit} title="Fit to screen (Ctrl+0)">{Math.round(zoom * 100)}%</button>
        <button onClick={() => zoomBy(1.25)} title="Zoom in">+</button>
      </div>
      {tool === 'pen' && <div className="canvas-hint">Click to add points · drag to curve · click the first point to close · Enter to finish</div>}
      {tool === 'node' && <div className="canvas-hint">Drag points and handles to reshape. With Animate mode on, edits become morph keyframes. Esc to exit.</div>}
    </div>
  );

  function zoomBy(k: number) {
    const s = getState();
    const z = Math.max(0.05, Math.min(32, s.zoom * k));
    const mx = size.w / 2, my = size.h / 2;
    setState({ zoom: z, panX: mx - ((mx - s.panX) * z) / s.zoom, panY: my - ((my - s.panY) * z) / s.zoom });
  }
}

function newDrawn(tool: Tool, props: SvgEl['props']): SvgEl {
  switch (tool) {
    case 'rect':
      return createElement('rect', {}, { fill: '#5b6cff', rx: 0, ...props });
    case 'ellipse':
      return createElement('ellipse', {}, { fill: '#ff8c42', ...props });
    case 'star':
      return createElement('path', { name: undefined, lineJoin: 'round' }, { fill: '#ffc93c', ...props });
    case 'polygon':
      return createElement('path', { lineJoin: 'round' }, { fill: '#2ec4b6', ...props });
    default:
      return createElement('path', { lineCap: 'round' }, { fill: 'none', stroke: '#1b1d2a', strokeWidth: 4, ...props });
  }
}

function Handles({ m, px }: { m: Measured; px: number }) {
  const [c0, c1, c2, c3] = m.corners;
  const pos: Record<string, Pt> = {
    '-1,-1': c0, '1,-1': c1, '1,1': c2, '-1,1': c3,
    '0,-1': mid(c0, c1), '1,0': mid(c1, c2), '0,1': mid(c2, c3), '-1,0': mid(c3, c0),
  };
  const top = mid(c0, c1);
  const bottom = mid(c3, c2);
  let dir = { x: top.x - bottom.x, y: top.y - bottom.y };
  const len = Math.hypot(dir.x, dir.y);
  dir = len > 1e-6 ? { x: dir.x / len, y: dir.y / len } : rot({ x: 0, y: -1 }, m.f.rotation);
  const rp = { x: top.x + dir.x * 26 * px, y: top.y + dir.y * 26 * px };
  const s = 9 * px;
  return (
    <g className="handles">
      <line x1={top.x} y1={top.y} x2={rp.x} y2={rp.y} strokeWidth={px} pointerEvents="none" />
      <circle data-handle="rot" cx={rp.x} cy={rp.y} r={5.5 * px} strokeWidth={1.5 * px} style={{ cursor: 'grab' }} />
      <circle cx={m.origin.x} cy={m.origin.y} r={3 * px} className="origin" pointerEvents="none" />
      {HANDLES.map(([hx, hy]) => {
        const k = `${hx},${hy}`;
        const p = pos[k];
        return (
          <rect
            key={k}
            data-handle={k}
            x={p.x - s / 2}
            y={p.y - s / 2}
            width={s}
            height={s}
            rx={2 * px}
            strokeWidth={1.5 * px}
            style={{ cursor: CURSORS[k] }}
          />
        );
      })}
    </g>
  );
}

function SizeBadge({ m, px }: { m: Measured; px: number }) {
  const xs = m.corners.map((c) => c.x), ys = m.corners.map((c) => c.y);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const by = Math.max(...ys) + 12 * px;
  const w = Math.round(m.lb.w * Math.abs(m.f.scaleX));
  const h = Math.round(m.lb.h * Math.abs(m.f.scaleY));
  const label = `${w} × ${h}${m.f.rotation ? `  ${Math.round(m.f.rotation)}°` : ''}`;
  const bw = (label.length * 7 + 14) * px;
  return (
    <g pointerEvents="none" className="size-badge">
      <rect x={cx - bw / 2} y={by} width={bw} height={20 * px} rx={4 * px} />
      <text x={cx} y={by + 14 * px} fontSize={11 * px} textAnchor="middle">{label}</text>
    </g>
  );
}

function NodeOverlay({ el, time, mat, px }: { el: SvgEl; time: number; mat: DOMMatrix; px: number }) {
  const cmds = parsePath(frameAt(el, time).d);
  const T = (x: number, y: number) => tp(mat, { x, y });
  const lines: JSX.Element[] = [];
  const dots: JSX.Element[] = [];
  let prev: Pt | null = null;
  cmds.forEach((c, i) => {
    if (c.c === 'Z') return;
    const end = T(c.p[c.p.length - 2], c.p[c.p.length - 1]);
    if (c.c === 'C') {
      const h1 = T(c.p[0], c.p[1]);
      const h2 = T(c.p[2], c.p[3]);
      if (prev) lines.push(<line key={`l${i}a`} x1={prev.x} y1={prev.y} x2={h1.x} y2={h1.y} />);
      lines.push(<line key={`l${i}b`} x1={end.x} y1={end.y} x2={h2.x} y2={h2.y} />);
      dots.push(<circle key={`h${i}a`} data-node={`${i}:0`} className="node-handle" cx={h1.x} cy={h1.y} r={3.5 * px} />);
      dots.push(<circle key={`h${i}b`} data-node={`${i}:2`} className="node-handle" cx={h2.x} cy={h2.y} r={3.5 * px} />);
    }
    dots.push(
      <rect key={`n${i}`} data-node={`${i}:${c.p.length - 2}`} className="node-point" x={end.x - 4 * px} y={end.y - 4 * px} width={8 * px} height={8 * px} />,
    );
    prev = end;
  });
  return (
    <g className="node-overlay" style={{ strokeWidth: 1.2 * px }}>
      <g opacity={0.7} pointerEvents="none">{lines}</g>
      {dots}
    </g>
  );
}

function PenPreview({ pts, hover, px }: { pts: PenPt[]; hover: Pt | null; px: number }) {
  let d = `M${pts[0].x} ${pts[0].y}`;
  for (let i = 1; i < pts.length; i++) {
    const a = pts[i - 1], b = pts[i];
    d += a.hout || b.hin ? ` C${(a.hout ?? a).x} ${(a.hout ?? a).y} ${(b.hin ?? b).x} ${(b.hin ?? b).y} ${b.x} ${b.y}` : ` L${b.x} ${b.y}`;
  }
  const last = pts[pts.length - 1];
  return (
    <g pointerEvents="none" className="pen-preview">
      <path d={d} fill="none" stroke="#1b1d2a" strokeWidth={2 * px} />
      {hover && <line x1={last.x} y1={last.y} x2={hover.x} y2={hover.y} className="pen-rubber" strokeDasharray={`${4 * px} ${3 * px}`} strokeWidth={px} />}
      {pts.map((p, i) => (
        <g key={i}>
          {p.hin && p.hout && (
            <>
              <line x1={p.hin.x} y1={p.hin.y} x2={p.hout.x} y2={p.hout.y} className="pen-rubber" strokeWidth={px} />
              <circle cx={p.hin.x} cy={p.hin.y} r={3 * px} className="pen-dot" />
              <circle cx={p.hout.x} cy={p.hout.y} r={3 * px} className="pen-dot" />
            </>
          )}
          <rect x={p.x - 4 * px} y={p.y - 4 * px} width={8 * px} height={8 * px} className={i === 0 ? 'pen-first' : 'pen-pt'} strokeWidth={1.5 * px} />
        </g>
      ))}
    </g>
  );
}
