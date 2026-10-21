import { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { useStore, getState, setState } from '../state/store';
import {
  addElement, convertToPath, findEl, getEl, select, setRawProps, setTool, setValues, type Change,
} from '../state/actions';
import { enterGroup } from '../state/structure';
import { addGuide, createDefaultMotionPath, moveGuide, removeGuide, setMotionPathData, setMotionPathFrom, setOrigin } from '../state/editing';
import { createElement, uid } from '../model/factory';
import { ancestors } from '../model/tree';
import type { SvgEl, Tool } from '../model/types';
import { frameAt } from '../engine/interpolate';
import { editorMarkup, staticElementMarkup } from '../engine/render';
import { fmt, mapPath, parsePath, polygonPath, serializePath, starPath, type Cmd } from '../engine/path';
import { canvasApi, type Measured } from './canvasApi';
import { Icon } from './Icon';

type Pt = { x: number; y: number };

const RULER = 20;
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
const toDomMatrix = (m: DOMMatrix) => `matrix(${[m.a, m.b, m.c, m.d, m.e, m.f].map(fmt).join(' ')})`;

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
    M,
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

/** Path command endpoints/handles that move together when dragging point (ci, pi). */
function nodeTargets(cmds: Cmd[], ci: number, pi: number) {
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
  return targets;
}

type PenPt = { x: number; y: number; hin?: Pt; hout?: Pt };
type SnapLine = { axis: 'x' | 'y'; v: number };
type Box = { l: number; r: number; t: number; b: number };

type Gesture =
  | { kind: 'pan'; cx: number; cy: number; px: number; py: number }
  | {
    kind: 'move'; p0: Pt; starts: { id: string; x: number; y: number; Pinv: DOMMatrix }[]; key: string; moved: boolean;
    box: Box | null; tx: number[]; ty: number[];
  }
  | { kind: 'resize'; p0: Pt; m: Measured; type: SvgEl['type']; hx: number; hy: number; key: string; Pinv: DOMMatrix }
  | { kind: 'rotate'; c: Pt; a0: number; r0: number; key: string; Pinv: DOMMatrix }
  /** `k`: screen pixels per main-local unit, for the snap distance. */
  | { kind: 'origin'; id: string; Minv: DOMMatrix; o0: Pt; lb: Measured['lb']; k: number; key: string }
  | { kind: 'marquee'; p0: Pt; additive: boolean }
  | { kind: 'draw'; tool: Tool; p0: Pt; id: string | null; key: string; Pinv: DOMMatrix | null }
  | { kind: 'pen'; idx: number }
  | { kind: 'node'; id: string; cmds: Cmd[]; targets: { ci: number; pi: number }[]; inv: DOMMatrix; p0: Pt; key: string }
  | { kind: 'mnode'; id: string; cmds: Cmd[]; targets: { ci: number; pi: number }[]; Pinv: DOMMatrix; p0: Pt; key: string };

export function Canvas({ onImport }: { onImport: () => void }) {
  const doc = useStore((s) => s.doc);
  const time = useStore((s) => s.time);
  const selection = useStore((s) => s.selection);
  const scope = useStore((s) => s.scope);
  const tool = useStore((s) => s.tool);
  const zoom = useStore((s) => s.zoom);
  const panX = useStore((s) => s.panX);
  const panY = useStore((s) => s.panY);
  const view = useStore((s) => s.view);
  const pickMotionFor = useStore((s) => s.pickMotionFor);
  const playing = useStore((s) => s.playing);

  const wrapRef = useRef<HTMLDivElement>(null);
  const svgRef = useRef<SVGSVGElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });
  const gesture = useRef<Gesture | null>(null);
  const [dragging, setDragging] = useState(false);
  const [marquee, setMarquee] = useState<{ a: Pt; b: Pt } | null>(null);
  const [measured, setMeasured] = useState<Measured[]>([]);
  const [scopeBox, setScopeBox] = useState<Pt[] | null>(null);
  const [nodeMat, setNodeMat] = useState<DOMMatrix | null>(null);
  const [snapLines, setSnapLines] = useState<SnapLine[]>([]);
  const [hoverPos, setHoverPos] = useState<Pt | null>(null);
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
    const w = el.clientWidth - RULER, h = el.clientHeight - RULER;
    const z = Math.max(0.05, Math.min((w - 60) / width, (h - 50) / height, 4));
    setState({ zoom: z, panX: RULER + (w - width * z) / 2, panY: RULER + (h - height * z) / 2 });
  }, []);

  const zoomBy = useCallback((k: number) => {
    const el = wrapRef.current;
    if (!el) return;
    const s = getState();
    const z = Math.max(0.05, Math.min(32, s.zoom * k));
    const mx = el.clientWidth / 2, my = el.clientHeight / 2;
    setState({ zoom: z, panX: mx - ((mx - s.panX) * z) / s.zoom, panY: my - ((my - s.panY) * z) / s.zoom });
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
      } else if (e.shiftKey) {
        setState({ panX: s.panX - (e.deltaY || e.deltaX) });
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
  canvasApi.snapshot = (ids: string[]) => {
    const svg = svgRef.current;
    if (!svg) return null;
    const t = getState().time;
    const parts: string[] = [];
    const pts: Pt[] = [];
    for (const id of ids) {
      const el = getEl(id);
      const m = el && measureIn(svg, el, t);
      if (!el || !m) continue;
      parts.push(`<g transform="${toDomMatrix(m.P)}">${staticElementMarkup(el, t)}</g>`);
      pts.push(...m.corners);
    }
    if (!pts.length) return null;
    const xs = pts.map((p) => p.x), ys = pts.map((p) => p.y);
    return { markup: parts.join(''), box: { x: Math.min(...xs), y: Math.min(...ys), w: Math.max(...xs) - Math.min(...xs), h: Math.max(...ys) - Math.min(...ys) } };
  };
  canvasApi.fit = fit;
  canvasApi.zoomBy = zoomBy;

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
      m.id === measured[i].id && m.corners.every((c, j) => Math.abs(c.x - measured[i].corners[j].x) < 1e-3 && Math.abs(c.y - measured[i].corners[j].y) < 1e-3) &&
      Math.abs(m.origin.x - measured[i].origin.x) < 1e-3 && Math.abs(m.origin.y - measured[i].origin.y) < 1e-3);
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

  // ---- snapping --------------------------------------------------------------
  const snapTargets = (exclude: Set<string>) => {
    const s = getState();
    const tx: number[] = [], ty: number[] = [];
    if (!s.view.snap) return { tx, ty };
    if (s.view.snapGuides && s.view.showGuides) {
      tx.push(...s.doc.guides.x);
      ty.push(...s.doc.guides.y);
    }
    if (s.view.snapObjects) {
      tx.push(0, s.doc.width / 2, s.doc.width);
      ty.push(0, s.doc.height / 2, s.doc.height);
      const pool = s.scope ? findEl(s.doc, s.scope)?.children ?? s.doc.elements : s.doc.elements;
      for (const el of pool) {
        if (exclude.has(el.id) || !el.visible) continue;
        const m = measureIn(svgRef.current!, el, s.time);
        if (!m) continue;
        const xs = m.corners.map((c) => c.x), ys = m.corners.map((c) => c.y);
        const l = Math.min(...xs), r = Math.max(...xs), t = Math.min(...ys), b = Math.max(...ys);
        tx.push(l, (l + r) / 2, r);
        ty.push(t, (t + b) / 2, b);
      }
    }
    return { tx, ty };
  };

  /** Adjust a move offset so the box edges/center land on nearby targets. */
  const snapOffset = (box: Box, dx: number, dy: number, tx: number[], ty: number[]) => {
    const s = getState();
    const lines: SnapLine[] = [];
    if (!s.view.snap) return { dx, dy, lines };
    const thr = 6 / s.zoom;
    const best = (edges: number[], targets: number[]) => {
      let bd = thr, off = 0, at: number | null = null;
      for (const e of edges) for (const t of targets) {
        const d = Math.abs(t - e);
        if (d < bd) {
          bd = d;
          off = t - e;
          at = t;
        }
      }
      return { off, at };
    };
    const bx = best([box.l + dx, (box.l + box.r) / 2 + dx, box.r + dx], tx);
    const by = best([box.t + dy, (box.t + box.b) / 2 + dy, box.b + dy], ty);
    if (bx.at !== null) {
      dx += bx.off;
      lines.push({ axis: 'x', v: bx.at });
    } else if (s.view.snapGrid) dx = Math.round((box.l + dx) / s.view.gridSize) * s.view.gridSize - box.l;
    else if (s.view.snapPixel) dx = Math.round(box.l + dx) - box.l;
    if (by.at !== null) {
      dy += by.off;
      lines.push({ axis: 'y', v: by.at });
    } else if (s.view.snapGrid) dy = Math.round((box.t + dy) / s.view.gridSize) * s.view.gridSize - box.t;
    else if (s.view.snapPixel) dy = Math.round(box.t + dy) - box.t;
    return { dx, dy, lines };
  };

  const snapPoint = (p: Pt): Pt => {
    const v = getState().view;
    if (!v.snap) return p;
    if (v.snapGrid) return { x: Math.round(p.x / v.gridSize) * v.gridSize, y: Math.round(p.y / v.gridSize) * v.gridSize };
    if (v.snapPixel) return { x: Math.round(p.x), y: Math.round(p.y) };
    return p;
  };

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

  // ---- rulers & guides --------------------------------------------------------
  const startRulerDrag = (axis: 'x' | 'y') => (e: React.PointerEvent) => {
    if (e.button !== 0) return;
    e.preventDefault();
    const p = toDoc(e.clientX, e.clientY);
    const i = addGuide(axis, axis === 'x' ? p.x : p.y);
    dragGuide(axis, i);
  };

  const dragGuide = (axis: 'x' | 'y', i: number) => {
    const key = 'g:' + uid();
    const wrapR = wrapRef.current!.getBoundingClientRect();
    const move = (ev: PointerEvent) => {
      const p = toDoc(ev.clientX, ev.clientY);
      moveGuide(axis, i, axis === 'x' ? p.x : p.y, key);
    };
    const up = (ev: PointerEvent) => {
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
      // Dropping a guide back on its ruler (or outside the canvas) deletes it.
      const overRuler = axis === 'x' ? ev.clientX - wrapR.left < RULER : ev.clientY - wrapR.top < RULER;
      const outside = ev.clientX < wrapR.left || ev.clientY < wrapR.top || ev.clientX > wrapR.right || ev.clientY > wrapR.bottom;
      if (overRuler || outside) removeGuide(axis, i);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  };

  // ---- pointer handling -------------------------------------------------------
  const onPointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    const s = getState();
    const p = toDoc(e.clientX, e.clientY);
    const target = e.target as Element;
    if (s.menu) setState({ menu: null });
    if (s.playing) setState({ playing: false });

    if (s.pickMotionFor && e.button === 0) {
      const chain = hitChain(target);
      const id = chain[chain.length - 1];
      if (id && id !== s.pickMotionFor) setMotionPathFrom(s.pickMotionFor, id);
      return;
    }

    if (e.button === 2) {
      const id = pick(hitChain(target), e.ctrlKey || e.metaKey);
      if (id && !s.selection.includes(id)) select([id]);
      else if (!id && !s.selection.length) return;
      setState({ menu: { x: e.clientX, y: e.clientY } });
      return;
    }

    const guide = target.closest('[data-guide]');
    if (guide && e.button === 0 && s.tool === 'select') {
      const [axis, i] = guide.getAttribute('data-guide')!.split(':');
      dragGuide(axis as 'x' | 'y', Number(i));
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
      gesture.current = { kind: 'draw', tool: s.tool, p0: snapPoint(p), id: null, key: 'g:' + uid(), Pinv: scopeInv() };
      return;
    }
    if (s.tool === 'text') {
      const si = scopeInv();
      const q = si ? tp(si, p) : p;
      const el = createElement('text', { text: 'Your text', fontWeight: '700' }, { x: q.x, y: q.y, fontSize: 48, fill: '#1b1d2a' });
      addElement(el);
      setTool('select');
      setState({ focusText: Date.now(), rightTab: 'properties', rightOpen: true });
      return;
    }
    if (s.tool === 'pen') {
      const pts = pen.current;
      if (pts.length >= 2 && Math.hypot(pts[0].x - p.x, pts[0].y - p.y) * s.zoom < 9) {
        finishPen(true);
        return;
      }
      const q = snapPoint(p);
      pts.push({ x: q.x, y: q.y });
      gesture.current = { kind: 'pen', idx: pts.length - 1 };
      rerender();
      return;
    }

    const mnode = target.closest('[data-mnode]');
    if (mnode && measured.length === 1) {
      const el = getEl(measured[0].id);
      if (el?.motionPath) {
        const [ci, pi] = mnode.getAttribute('data-mnode')!.split(':').map(Number);
        const cmds = parsePath(el.motionPath);
        gesture.current = { kind: 'mnode', id: el.id, cmds, targets: nodeTargets(cmds, ci, pi), Pinv: measured[0].P.inverse(), p0: p, key: 'g:' + uid() };
        setDragging(true);
        return;
      }
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
      } else if (h === 'origin') {
        const k = Math.sqrt(Math.abs(m.M.a * m.M.d - m.M.b * m.M.c)) * s.zoom;
        gesture.current = { kind: 'origin', id: m.id, Minv: m.M.inverse(), o0: { x: m.f.originX, y: m.f.originY }, lb: m.lb, k, key };
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
      gesture.current = { kind: 'node', id: nodeEl.id, cmds, targets: nodeTargets(cmds, ci, pi), inv: nodeMat.inverse(), p0: p, key: 'g:' + uid() };
      return;
    }

    const startMove = (ids: string[]) => {
      const t = getState().time;
      const ms = ids.flatMap((sid) => {
        const el = getEl(sid);
        const m = el && measureIn(svgRef.current!, el, t);
        return m ? [m] : [];
      });
      const pts = ms.flatMap((m) => m.corners);
      const box = pts.length
        ? { l: Math.min(...pts.map((q) => q.x)), r: Math.max(...pts.map((q) => q.x)), t: Math.min(...pts.map((q) => q.y)), b: Math.max(...pts.map((q) => q.y)) }
        : null;
      const { tx, ty } = snapTargets(new Set(ids));
      gesture.current = {
        kind: 'move', p0: p, key: 'g:' + uid(), moved: false, box, tx, ty,
        starts: ms.map((m) => ({ id: m.id, x: m.f.x, y: m.f.y, Pinv: m.P.inverse() })),
      };
    };

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
      startMove(sel);
      return;
    }

    // Pressing inside the box of the current selection (e.g. a gap inside a group) drags it.
    if (!e.shiftKey && (s.tool === 'select' || s.tool === 'node') && measured.some((m) => inPolygon(p, m.corners))) {
      startMove(measured.map((m) => m.id));
      return;
    }

    if (!e.shiftKey) select([]);
    gesture.current = { kind: 'marquee', p0: p, additive: e.shiftKey };
  };

  const onPointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    const g = gesture.current;
    const p = toDoc(e.clientX, e.clientY);
    const s = getState();
    if (s.view.showRulers) setHoverPos(p);
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
        if (g.box && !e.altKey) {
          const r = snapOffset(g.box, dx, dy, g.tx, g.ty);
          if (!e.shiftKey || dx) dx = r.dx;
          if (!e.shiftKey || dy) dy = r.dy;
          setSnapLines(r.lines);
        }
        const ch: Change[] = [];
        for (const st of g.starts) {
          const a = tp(st.Pinv, g.p0), b = tp(st.Pinv, { x: g.p0.x + dx, y: g.p0.y + dy });
          ch.push([st.id, 'x', Math.round((st.x + b.x - a.x) * 100) / 100], [st.id, 'y', Math.round((st.y + b.y - a.y) * 100) / 100]);
        }
        setValues(ch, g.key);
        break;
      }
      case 'resize': {
        const { m, hx, hy } = g;
        const lp = tp(g.Pinv, p);
        const L = rot({ x: lp.x - g.p0.x, y: lp.y - g.p0.y }, -(m.f.rotation + m.f.motionAngle));
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
        const delta = rot({ x: m.f.scaleX * lo.x * (1 - kx), y: m.f.scaleY * lo.y * (1 - ky) }, m.f.rotation + m.f.motionAngle);
        const id = m.id;
        const ch: Change[] = [[id, 'x', m.f.x + delta.x], [id, 'y', m.f.y + delta.y]];
        if ((g.type === 'rect' || g.type === 'ellipse' || g.type === 'image') && !m.f.skewX && !m.f.skewY) {
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
      case 'origin': {
        let lp = tp(g.Minv, p);
        // Snap to the box corners, edge centers and center (hold Alt to place freely).
        const xs = [g.lb.x, g.lb.x + g.lb.w / 2, g.lb.x + g.lb.w], ys = [g.lb.y, g.lb.y + g.lb.h / 2, g.lb.y + g.lb.h];
        if (!e.altKey) {
          for (const x of xs) for (const y of ys) if (Math.hypot(lp.x - x, lp.y - y) * g.k < 7) lp = { x, y };
        }
        setOrigin([g.id], Math.round((g.o0.x + lp.x) * 100) / 100, Math.round((g.o0.y + lp.y) * 100) / 100, g.key);
        break;
      }
      case 'marquee':
        setMarquee({ a: g.p0, b: p });
        break;
      case 'draw': {
        const T = (q: Pt) => (g.Pinv ? tp(g.Pinv, q) : q);
        const p0 = T(g.p0), p1 = T(snapPoint(p));
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
      case 'mnode': {
        const a = tp(g.Pinv, g.p0), b = tp(g.Pinv, p);
        const dx = b.x - a.x, dy = b.y - a.y;
        const cmds = g.cmds.map((c) => ({ c: c.c, p: [...c.p] }));
        for (const t of g.targets) {
          cmds[t.ci].p[t.pi] = g.cmds[t.ci].p[t.pi] + dx;
          cmds[t.ci].p[t.pi + 1] = g.cmds[t.ci].p[t.pi + 1] + dy;
        }
        setMotionPathData(g.id, serializePath(cmds), g.key);
        break;
      }
    }
  };

  const onPointerUp = (e: React.PointerEvent<SVGSVGElement>) => {
    const g = gesture.current;
    gesture.current = null;
    setDragging(false);
    setSnapLines([]);
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
      setState({ focusText: Date.now(), rightTab: 'properties', rightOpen: true });
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
  const vx = -panX / zoom, vy = -panY / zoom, vw = Math.max(1, size.w) / zoom, vh = Math.max(1, size.h) / zoom;
  const viewBox = `${fmt(vx)} ${fmt(vy)} ${fmt(vw)} ${fmt(vh)}`;
  const transparent = !doc.background || doc.background === 'none' || doc.background === 'transparent';
  const single = measured.length === 1 && tool === 'select' && !getEl(measured[0].id)?.locked && !pickMotionFor ? measured[0] : null;
  const singleEl = single ? getEl(single.id) : undefined;
  const cursor = pickMotionFor ? 'copy' : tool === 'hand' ? (dragging ? 'grabbing' : 'grab') : DRAW_TOOLS.includes(tool) || tool === 'pen' ? 'crosshair' : tool === 'text' ? 'text' : 'default';
  const scopeEl = scope ? findEl(doc, scope) : undefined;
  const guideExtent = 100000;

  return (
    <div className={`canvas-wrap ${view.showRulers ? 'with-rulers' : ''}`} ref={wrapRef} style={{ cursor }}>
      <svg
        ref={svgRef}
        className="canvas-svg"
        width={size.w}
        height={size.h}
        viewBox={viewBox}
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerLeave={() => setHoverPos(null)}
        onDoubleClick={onDoubleClick}
        onContextMenu={(e) => e.preventDefault()}
      >
        <defs>
          <pattern id="__checker" width="16" height="16" patternUnits="userSpaceOnUse">
            <rect width="16" height="16" fill="#ffffff" />
            <rect width="8" height="8" fill="#e6e8ef" />
            <rect x="8" y="8" width="8" height="8" fill="#e6e8ef" />
          </pattern>
          <pattern id="__grid" width={view.gridSize} height={view.gridSize} patternUnits="userSpaceOnUse">
            <path d={`M${view.gridSize} 0 H0 V${view.gridSize}`} fill="none" stroke="rgba(30,136,229,0.28)" strokeWidth={px} />
          </pattern>
        </defs>
        <rect width={doc.width} height={doc.height} fill={transparent ? 'url(#__checker)' : doc.background} className="artboard" />
        {doc.defs && <defs dangerouslySetInnerHTML={{ __html: doc.defs }} />}
        <g className={`content ${scope ? 'scoped' : ''}`} dangerouslySetInnerHTML={{ __html: editorMarkup(doc.elements, time) }} />
        {view.showGrid && <rect width={doc.width} height={doc.height} fill="url(#__grid)" pointerEvents="none" />}

        {view.showGuides && (
          <g className="guides">
            {doc.guides.x.map((x, i) => (
              <g key={'gx' + i} data-guide={`x:${i}`} style={{ cursor: 'ew-resize' }}>
                <line x1={x} y1={-guideExtent} x2={x} y2={guideExtent} stroke="transparent" strokeWidth={8 * px} />
                <line x1={x} y1={-guideExtent} x2={x} y2={guideExtent} className="guide" strokeWidth={px} />
              </g>
            ))}
            {doc.guides.y.map((y, i) => (
              <g key={'gy' + i} data-guide={`y:${i}`} style={{ cursor: 'ns-resize' }}>
                <line x1={-guideExtent} y1={y} x2={guideExtent} y2={y} stroke="transparent" strokeWidth={8 * px} />
                <line x1={-guideExtent} y1={y} x2={guideExtent} y2={y} className="guide" strokeWidth={px} />
              </g>
            ))}
          </g>
        )}

        {scopeBox && (
          <polygon points={scopeBox.map((c) => `${c.x},${c.y}`).join(' ')} fill="none" className="scope-box" strokeWidth={1.2 * px} strokeDasharray={`${5 * px} ${4 * px}`} pointerEvents="none" />
        )}

        {!playing && singleEl && !singleEl.motionPath && (singleEl.tracks.x?.length || singleEl.tracks.y?.length) ? (
          <Trajectory el={singleEl} P={single!.P} px={px} duration={doc.duration} />
        ) : null}

        <g pointerEvents="none">
          {measured.map((m) => (
            <polygon key={m.id} points={m.corners.map((c) => `${c.x},${c.y}`).join(' ')} fill="none" className="sel-box" strokeWidth={1.2 * px} />
          ))}
        </g>

        {single && singleEl?.motionPath && <MotionPathOverlay path={singleEl.motionPath} P={single.P} px={px} />}

        {single && !dragging && <Handles m={single} px={px} />}
        {single && dragging && <SizeBadge m={single} px={px} />}

        {nodeEl && nodeMat && <NodeOverlay el={nodeEl} time={time} mat={nodeMat} px={px} />}

        {snapLines.map((l, i) => (
          l.axis === 'x'
            ? <line key={i} x1={l.v} y1={vy} x2={l.v} y2={vy + vh} className="snap-line" strokeWidth={px} pointerEvents="none" />
            : <line key={i} x1={vx} y1={l.v} x2={vx + vw} y2={l.v} className="snap-line" strokeWidth={px} pointerEvents="none" />
        ))}

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

      {view.showRulers && (
        <>
          <Ruler axis="x" start={vx} zoom={zoom} length={size.w} hover={hoverPos?.x ?? null} sel={measured} onPointerDown={startRulerDrag('y')} />
          <Ruler axis="y" start={vy} zoom={zoom} length={size.h} hover={hoverPos?.y ?? null} sel={measured} onPointerDown={startRulerDrag('x')} />
          <div className="ruler-corner" title="Drag from a ruler to create a guide" />
        </>
      )}

      {scopeEl && (
        <div className="scope-chip">
          <Icon name="folder" size={14} /> Inside <b>{scopeEl.name}</b>
          <button onClick={() => select([scopeEl.id])}>Exit group</button>
        </div>
      )}

      {pickMotionFor && (
        <div className="pick-bar">
          <Icon name="motion" size={16} />
          <span>Click a path to use it as the motion path</span>
          <button className="btn sm primary" onClick={() => createDefaultMotionPath(pickMotionFor)}>Create a default path</button>
          <button className="btn sm" onClick={() => setState({ pickMotionFor: null })}>Cancel</button>
        </div>
      )}

      {doc.elements.length === 0 && (
        <div className="empty-state">
          <div className="empty-card">
            <div className="empty-icon"><Icon name="sparkles" size={28} /></div>
            <h2>Start your animation</h2>
            <p>Draw with the toolbar, pick artwork from the <b>Library</b>, start from a <b>Template</b>, or import an SVG.</p>
            <div className="empty-actions">
              <button className="btn primary" onClick={onImport}><Icon name="upload" /> Import SVG or image</button>
              <button className="btn" onClick={() => setState({ leftTab: 'library', leftOpen: true })}><Icon name="shapes" /> Library</button>
              <button className="btn" onClick={() => setState({ leftTab: 'templates', leftOpen: true })}><Icon name="template" /> Templates</button>
            </div>
            <span className="muted small">Tip: you can also drag & drop files anywhere.</span>
          </div>
        </div>
      )}

      {tool === 'pen' && <div className="canvas-hint">Click to add points · drag to curve · click the first point to close · Enter to finish</div>}
      {tool === 'node' && <div className="canvas-hint">Drag points and handles to reshape. With an animated shape, edits become Morph keyframes. Esc to exit.</div>}
    </div>
  );
}

function newDrawn(tool: Tool, props: SvgEl['props']): SvgEl {
  switch (tool) {
    case 'rect':
      return createElement('rect', {}, { fill: '#4a7fd4', rx: 0, ...props });
    case 'ellipse':
      return createElement('ellipse', {}, { fill: '#ff8c42', ...props });
    case 'star':
      return createElement('path', { lineJoin: 'round' }, { fill: '#ffc93c', ...props });
    case 'polygon':
      return createElement('path', { lineJoin: 'round' }, { fill: '#2ec4b6', ...props });
    default:
      return createElement('path', { lineCap: 'round' }, { fill: 'none', stroke: '#1b1d2a', strokeWidth: 4, ...props });
  }
}

function Ruler({ axis, start, zoom, length, hover, sel, onPointerDown }: {
  axis: 'x' | 'y'; start: number; zoom: number; length: number; hover: number | null; sel: Measured[];
  onPointerDown: (e: React.PointerEvent) => void;
}) {
  const steps = [1, 2, 5, 10, 20, 25, 50, 100, 200, 250, 500, 1000, 2000, 5000];
  const major = steps.find((s) => s * zoom >= 80) ?? 5000;
  const minor = major / 10;
  const end = start + length / zoom;
  const ticks: JSX.Element[] = [];
  for (let v = Math.floor(start / minor) * minor; v <= end; v += minor) {
    const pos = (v - start) * zoom;
    const i = Math.round(v / minor);
    const len = i % 10 === 0 ? RULER : i % 5 === 0 ? 8 : 4;
    ticks.push(axis === 'x'
      ? <line key={i} x1={pos} x2={pos} y1={RULER - len} y2={RULER} />
      : <line key={i} y1={pos} y2={pos} x1={RULER - len} x2={RULER} />);
    if (i % 10 === 0) {
      ticks.push(axis === 'x'
        ? <text key={'t' + i} x={pos + 3} y={9}>{Math.round(v)}</text>
        : <text key={'t' + i} x={9} y={pos + 3} transform={`rotate(-90 9 ${pos + 3})`} textAnchor="end">{Math.round(v)}</text>);
    }
  }
  const range = sel.length
    ? (() => {
      const vals = sel.flatMap((m) => m.corners.map((c) => (axis === 'x' ? c.x : c.y)));
      return [(Math.min(...vals) - start) * zoom, (Math.max(...vals) - start) * zoom];
    })()
    : null;
  const hp = hover !== null ? (hover - start) * zoom : null;
  return (
    <svg className={`ruler ruler-${axis}`} width={axis === 'x' ? length : RULER} height={axis === 'x' ? RULER : length} onPointerDown={onPointerDown}>
      {range && (axis === 'x'
        ? <rect x={range[0]} y={0} width={Math.max(1, range[1] - range[0])} height={RULER} className="ruler-sel" />
        : <rect y={range[0]} x={0} height={Math.max(1, range[1] - range[0])} width={RULER} className="ruler-sel" />)}
      <g className="ruler-ticks">{ticks}</g>
      {hp !== null && (axis === 'x'
        ? <line x1={hp} x2={hp} y1={0} y2={RULER} className="ruler-hover" />
        : <line y1={hp} y2={hp} x1={0} x2={RULER} className="ruler-hover" />)}
    </svg>
  );
}

function Trajectory({ el, P, px, duration }: { el: SvgEl; P: DOMMatrix; px: number; duration: number }) {
  const N = 80;
  const pts: Pt[] = [];
  for (let i = 0; i <= N; i++) {
    const f = frameAt(el, (i / N) * duration);
    pts.push(tp(P, { x: f.x, y: f.y }));
  }
  const times = new Set<number>([...(el.tracks.x ?? []), ...(el.tracks.y ?? [])].map((k) => k.time));
  const dots = [...times].map((t) => {
    const f = frameAt(el, t);
    return tp(P, { x: f.x, y: f.y });
  });
  return (
    <g pointerEvents="none" className="trajectory">
      <polyline points={pts.map((p) => `${p.x},${p.y}`).join(' ')} fill="none" strokeWidth={1.2 * px} strokeDasharray={`${3 * px} ${3 * px}`} />
      {dots.map((d, i) => <rect key={i} x={d.x - 3 * px} y={d.y - 3 * px} width={6 * px} height={6 * px} transform={`rotate(45 ${d.x} ${d.y})`} />)}
    </g>
  );
}

function MotionPathOverlay({ path, P, px }: { path: string; P: DOMMatrix; px: number }) {
  const T = (x: number, y: number) => tp(P, { x, y });
  const d = mapPath(path, (x, y) => {
    const q = T(x, y);
    return [q.x, q.y];
  });
  const cmds = parsePath(path);
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
      dots.push(<circle key={`h${i}a`} data-mnode={`${i}:0`} className="node-handle" cx={h1.x} cy={h1.y} r={3.5 * px} />);
      dots.push(<circle key={`h${i}b`} data-mnode={`${i}:2`} className="node-handle" cx={h2.x} cy={h2.y} r={3.5 * px} />);
    }
    dots.push(<rect key={`n${i}`} data-mnode={`${i}:${c.p.length - 2}`} className="node-point" x={end.x - 4 * px} y={end.y - 4 * px} width={8 * px} height={8 * px} />);
    prev = end;
  });
  return (
    <g className="motion-overlay" style={{ strokeWidth: 1.2 * px }}>
      <path d={d} className="motion-path" fill="none" strokeWidth={1.6 * px} strokeDasharray={`${6 * px} ${4 * px}`} pointerEvents="none" />
      <g opacity={0.7} pointerEvents="none">{lines}</g>
      <g className="node-overlay">{dots}</g>
    </g>
  );
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
  const s = 8 * px;
  return (
    <g className="handles">
      <line x1={top.x} y1={top.y} x2={rp.x} y2={rp.y} strokeWidth={px} pointerEvents="none" />
      <circle data-handle="rot" cx={rp.x} cy={rp.y} r={5.5 * px} strokeWidth={1.5 * px} style={{ cursor: 'grab' }} />
      {HANDLES.map(([hx, hy]) => {
        const k = `${hx},${hy}`;
        const p = pos[k];
        return (
          <rect key={k} data-handle={k} x={p.x - s / 2} y={p.y - s / 2} width={s} height={s} rx={1.5 * px} strokeWidth={1.5 * px} style={{ cursor: CURSORS[k] }} />
        );
      })}
      <g data-handle="origin" className="origin-handle" style={{ cursor: 'move' }}>
        <circle cx={m.origin.x} cy={m.origin.y} r={9 * px} fill="transparent" stroke="none" />
        <circle cx={m.origin.x} cy={m.origin.y} r={5 * px} strokeWidth={1.5 * px} />
        <line x1={m.origin.x - 9 * px} x2={m.origin.x + 9 * px} y1={m.origin.y} y2={m.origin.y} strokeWidth={px} />
        <line y1={m.origin.y - 9 * px} y2={m.origin.y + 9 * px} x1={m.origin.x} x2={m.origin.x} strokeWidth={px} />
      </g>
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
