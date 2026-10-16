import { produce, type Draft } from 'immer';
import type { Doc, Keyframe, KfRef, PropKey, SvgEl, Tool, Value } from '../model/types';
import { PROP_META, supports } from '../model/props';
import { cloneElement, createElement, migrateDoc, newDoc, uid } from '../model/factory';
import { findById, flatten, locate } from '../model/tree';
import { DEFAULT_EASING } from '../engine/easing';
import { frameAt, valueAt } from '../engine/interpolate';
import { ellipsePath, mapPath, rectPath } from '../engine/path';
import { getState, setState } from './store';

const EPS = 0.004;

// ---------------------------------------------------------------------------
// History

/**
 * Apply a mutation to the document. Consecutive updates sharing the same `key`
 * are merged into a single undo step (keys starting with "g:" — gestures —
 * merge indefinitely; others merge within one second).
 */
export function updateDoc(fn: (d: Draft<Doc>) => void, key?: string) {
  const s = getState();
  const next = produce(s.doc, fn);
  if (next === s.doc) return;
  const now = performance.now();
  const merge = !!key && key === s.histKey && (key.startsWith('g:') || now - s.histAt < 1000);
  setState({
    doc: next,
    past: merge ? s.past : [...s.past.slice(-150), s.doc],
    future: [],
    histKey: key ?? null,
    histAt: now,
  });
}

function sanitizeSelection(doc: Doc) {
  const ids = new Set(flatten(doc.elements).map((e) => e.id));
  const s = getState();
  return {
    selection: s.selection.filter((id) => ids.has(id)),
    selectedKfs: s.selectedKfs.filter((r) => ids.has(r.elId)),
    scope: s.scope && ids.has(s.scope) ? s.scope : null,
  };
}

export function undo() {
  const s = getState();
  const prev = s.past[s.past.length - 1];
  if (!prev) return;
  setState({ doc: prev, past: s.past.slice(0, -1), future: [s.doc, ...s.future], histKey: null, ...sanitizeSelection(prev) });
}

export function redo() {
  const s = getState();
  const next = s.future[0];
  if (!next) return;
  setState({ doc: next, past: [...s.past, s.doc], future: s.future.slice(1), histKey: null, ...sanitizeSelection(next) });
}

export function loadDoc(doc: Doc) {
  setState({ doc, selection: [], scope: null, selectedKfs: [], past: [], future: [], time: 0, playing: false, histKey: null });
}

export function newProject() {
  loadDoc(newDoc());
}

export function openProjectJson(text: string) {
  loadDoc(migrateDoc(JSON.parse(text)));
}

// ---------------------------------------------------------------------------
// Helpers

export const findEl = <T extends SvgEl>(d: { elements: T[] }, id: string) => findById(d.elements, id);
const mkKf = (time: number, value: Value, easing = DEFAULT_EASING): Keyframe => ({ id: uid(), time, value, easing });

function upsert(tr: Draft<Keyframe>[], time: number, value: Value, easing?: string) {
  const k = tr.find((k) => Math.abs(k.time - time) < EPS);
  if (k) {
    k.value = value;
    if (easing) k.easing = easing;
    return;
  }
  tr.push(mkKf(time, value, easing));
  tr.sort((a, b) => a.time - b.time);
}

export function expand(ids: string[], open = true) {
  if (!ids.length) return;
  const expanded = { ...getState().expanded };
  for (const id of ids) expanded[id] = open;
  setState({ expanded });
}

export const getEl = (id: string) => findEl(getState().doc, id);

/** The list (top level or a group's children) that holds `id`, in the given draft. */
export function listOf(d: Draft<Doc>, parentGroupId: string | null): Draft<SvgEl>[] {
  if (!parentGroupId) return d.elements;
  const g = findEl(d, parentGroupId);
  if (!g) return d.elements;
  if (!g.children) g.children = [];
  return g.children;
}

// ---------------------------------------------------------------------------
// Property editing with auto-keyframing

export type Change = [id: string, prop: PropKey, value: Value];

/**
 * Set property values at the playhead.
 * - property already animated → create/update keyframe at the current time
 * - record mode on → start a new track (with the old value at 0s if needed)
 * - otherwise → change the static value
 */
export function setValues(changes: Change[], key?: string) {
  const { time, recordMode } = getState();
  const created: string[] = [];
  updateDoc((d) => {
    for (const [id, prop, value] of changes) {
      const el = findEl(d, id);
      if (!el || !supports(el.type, prop)) continue;
      const tr = el.tracks[prop];
      if (tr && tr.length) upsert(tr, time, value);
      else if (recordMode) {
        const base = el.props[prop] ?? PROP_META[prop].def;
        el.tracks[prop] = time > EPS ? [mkKf(0, base), mkKf(time, value)] : [mkKf(0, value)];
        created.push(id);
      } else el.props[prop] = value;
    }
  }, key);
  expand(created);
}

export function setValue(ids: string[], prop: PropKey, value: Value, key?: string) {
  setValues(ids.map((id) => [id, prop, value]), key);
}

/** Write static props directly (no keyframing) — used while drawing new shapes. */
export function setRawProps(id: string, props: SvgEl['props'], key?: string) {
  updateDoc((d) => {
    const el = findEl(d, id);
    if (el) Object.assign(el.props, props);
  }, key);
}

export function patchElement(id: string, patch: Partial<Omit<SvgEl, 'id' | 'props' | 'tracks' | 'children'>>, key?: string) {
  updateDoc((d) => {
    const el = findEl(d, id);
    if (el) Object.assign(el, patch);
  }, key);
}

export function patchDoc(patch: Partial<Omit<Doc, 'elements'>>, key?: string) {
  updateDoc((d) => {
    Object.assign(d, patch);
  }, key);
}

// ---------------------------------------------------------------------------
// Keyframes

export function addKeyframe(elId: string, prop: PropKey, time = getState().time) {
  const el = getEl(elId);
  if (!el) return;
  const v = valueAt(el, prop, time);
  updateDoc((d) => {
    const e = findEl(d, elId)!;
    if (!e.tracks[prop]) e.tracks[prop] = [];
    upsert(e.tracks[prop]!, time, v);
  });
  expand([elId]);
}

export function keyframeAt(el: SvgEl, prop: PropKey, time: number) {
  return el.tracks[prop]?.find((k) => Math.abs(k.time - time) < EPS);
}

export function toggleKeyframe(elId: string, prop: PropKey) {
  const { time } = getState();
  const el = getEl(elId);
  if (!el) return;
  const k = keyframeAt(el, prop, time);
  if (!k) return addKeyframe(elId, prop, time);
  removeKeyframes([{ elId, prop, kfId: k.id }]);
}

export function removeKeyframes(refs: KfRef[]) {
  if (!refs.length) return;
  const { time, doc } = getState();
  const valuesNow = new Map(refs.map((r) => {
    const el = findEl(doc, r.elId);
    return [r.elId + r.prop, el ? valueAt(el, r.prop, time) : undefined];
  }));
  updateDoc((d) => {
    for (const r of refs) {
      const el = findEl(d, r.elId);
      const tr = el?.tracks[r.prop];
      if (!el || !tr) continue;
      const i = tr.findIndex((k) => k.id === r.kfId);
      if (i < 0) continue;
      const removed = tr[i].value;
      tr.splice(i, 1);
      if (!tr.length) {
        delete el.tracks[r.prop];
        el.props[r.prop] = valuesNow.get(r.elId + r.prop) ?? removed;
      }
    }
  });
  setState({ selectedKfs: [] });
}

export function removeTrack(elId: string, prop: PropKey) {
  const el = getEl(elId);
  if (!el) return;
  const v = valueAt(el, prop, getState().time);
  updateDoc((d) => {
    const e = findEl(d, elId)!;
    delete e.tracks[prop];
    e.props[prop] = v;
  });
  setState({ selectedKfs: getState().selectedKfs.filter((r) => !(r.elId === elId && r.prop === prop)) });
}

export function setKeyframeTimes(updates: { ref: KfRef; time: number }[], key?: string) {
  updateDoc((d) => {
    const touched = new Set<Keyframe[]>();
    for (const { ref, time } of updates) {
      const tr = findEl(d, ref.elId)?.tracks[ref.prop];
      const k = tr?.find((k) => k.id === ref.kfId);
      if (tr && k) {
        k.time = Math.max(0, time);
        touched.add(tr);
      }
    }
    for (const tr of touched) tr.sort((a, b) => a.time - b.time);
  }, key);
}

export function setKeyframeEasing(refs: KfRef[], easing: string) {
  updateDoc((d) => {
    for (const r of refs) {
      const k = findEl(d, r.elId)?.tracks[r.prop]?.find((k) => k.id === r.kfId);
      if (k) k.easing = easing;
    }
  }, 'easing');
}

export function findKeyframe(ref: KfRef): Keyframe | undefined {
  return getEl(ref.elId)?.tracks[ref.prop]?.find((k) => k.id === ref.kfId);
}

// ---------------------------------------------------------------------------
// Selection

/** Select layers; when they all live in the same group, that group becomes the canvas scope. */
export function select(ids: string[]) {
  const { doc } = getState();
  const parents = new Set(ids.map((id) => locate(doc.elements, id)?.parent?.id ?? null));
  const scope = parents.size === 1 ? [...parents][0] : null;
  setState({ selection: ids, selectedKfs: [], scope });
}

export function selectAll() {
  const { doc, scope } = getState();
  const list = scope ? findEl(doc, scope)?.children ?? doc.elements : doc.elements;
  select(list.filter((e) => e.visible && !e.locked).map((e) => e.id));
}

// ---------------------------------------------------------------------------
// Elements

/** Add to the entered group (if any) or the top level. */
export function addElement(el: SvgEl, key?: string) {
  const { scope } = getState();
  updateDoc((d) => {
    listOf(d, scope).push(el);
  }, key);
  setState({ selection: [el.id], selectedKfs: [] });
}

export function addElements(els: SvgEl[], defs = '') {
  updateDoc((d) => {
    d.elements.push(...els);
    if (defs) d.defs += defs;
  });
  select(els.map((e) => e.id));
}

/** Remove the selection (or, when keyframes are selected, those keyframes). */
export function deleteSelection() {
  const { selection, selectedKfs } = getState();
  if (selectedKfs.length) return removeKeyframes(selectedKfs);
  if (!selection.length) return;
  updateDoc((d) => {
    for (const id of selection) {
      const loc = locate(d.elements, id);
      if (loc) loc.list.splice(loc.index, 1);
    }
  });
  setState({ selection: [] });
}

export function duplicateSelection() {
  const { selection, doc } = getState();
  const copies: string[] = [];
  updateDoc((d) => {
    for (const id of selection) {
      const el = findEl(doc, id);
      const loc = locate(d.elements, id);
      if (!el || !loc) continue;
      const c = cloneElement(el);
      c.name = el.name + ' copy';
      offsetElement(c, 16, 16);
      copies.push(c.id);
      loc.list.splice(loc.index + 1, 0, c);
    }
  });
  setState({ selection: copies });
}

export function offsetElement(el: SvgEl | Draft<SvgEl>, dx: number, dy: number) {
  for (const [p, dv] of [['x', dx], ['y', dy]] as const) {
    if (!dv) continue;
    const tr = el.tracks[p];
    if (tr?.length) for (const k of tr) k.value = Number(k.value) + dv;
    else el.props[p] = Number(el.props[p] ?? 0) + dv;
  }
}

export function copySelection(cut = false) {
  const { selection, doc } = getState();
  const els = selection.map((id) => findEl(doc, id)).filter(Boolean) as SvgEl[];
  if (!els.length) return;
  setState({ clipboard: els.map((e) => JSON.parse(JSON.stringify(e))) });
  if (cut) deleteSelection();
}

export function paste() {
  const { clipboard } = getState();
  if (!clipboard.length) return;
  const els = clipboard.map((e) => {
    const c = cloneElement(e);
    offsetElement(c, 16, 16);
    return c;
  });
  setState({ clipboard: els.map((e) => JSON.parse(JSON.stringify(e))) });
  updateDoc((d) => {
    listOf(d, getState().scope).push(...els);
  });
  setState({ selection: els.map((e) => e.id) });
}

export function reorderSelection(dir: 'up' | 'down' | 'top' | 'bottom') {
  const { selection } = getState();
  const set = new Set(selection);
  updateDoc((d) => {
    const lists = new Set<Draft<SvgEl>[]>();
    for (const id of selection) {
      const loc = locate(d.elements, id);
      if (loc) lists.add(loc.list);
    }
    for (const els of lists) {
      if (dir === 'top' || dir === 'bottom') {
        const picked = els.filter((e) => set.has(e.id));
        const rest = els.filter((e) => !set.has(e.id));
        els.splice(0, els.length, ...(dir === 'top' ? [...rest, ...picked] : [...picked, ...rest]));
      } else if (dir === 'up') {
        for (let i = els.length - 2; i >= 0; i--)
          if (set.has(els[i].id) && !set.has(els[i + 1].id)) [els[i], els[i + 1]] = [els[i + 1], els[i]];
      } else {
        for (let i = 1; i < els.length; i++)
          if (set.has(els[i].id) && !set.has(els[i - 1].id)) [els[i], els[i - 1]] = [els[i - 1], els[i]];
      }
    }
  });
}

/** Path data of an element's geometry (rect/ellipse converted) in its own geometry space. */
export function geometryAsPath(el: SvgEl, time: number): string | null {
  const f = frameAt(el, time);
  if (el.type === 'path') return f.d;
  if (el.type === 'rect') return rectPath(f.width, f.height, f.rx);
  if (el.type === 'ellipse') return ellipsePath(f.width, f.height);
  return null;
}

export function convertToPath(id: string) {
  const el = getEl(id);
  if (!el || (el.type !== 'rect' && el.type !== 'ellipse')) return;
  const d = geometryAsPath(el, getState().time)!;
  updateDoc((dr) => {
    const e = findEl(dr, id)!;
    e.type = 'path';
    for (const p of ['width', 'height', 'rx'] as const) {
      delete e.tracks[p];
      delete e.props[p];
    }
    e.props.d = d;
  });
}

/** Morph `targetId`'s shape into `sourceId`'s geometry at the current time. */
export function morphTo(targetId: string, sourceId: string) {
  const t = getEl(targetId);
  const s = getEl(sourceId);
  if (!t || !s || t.type !== 'path') return;
  const d = geometryAsPath(s, getState().time);
  if (!d) return;
  const dx = t.ax - s.ax;
  const dy = t.ay - s.ay;
  setValue([targetId], 'd', dx || dy ? mapPath(d, (x, y) => [x + dx, y + dy]) : d);
}

export function setTool(tool: Tool) {
  setState({ tool });
}

export function setTime(t: number) {
  const { doc } = getState();
  setState({ time: Math.max(0, Math.min(doc.duration, Math.round(t * 1000) / 1000)) });
}

// ---------------------------------------------------------------------------
// Animation presets (applied at the playhead)

export type Preset = 'fadeIn' | 'fadeOut' | 'popIn' | 'slideLeft' | 'slideUp' | 'spin' | 'pulse' | 'shake' | 'draw' | 'bounce';

export const PRESETS: { id: Preset; label: string; hint: string }[] = [
  { id: 'fadeIn', label: 'Fade in', hint: 'Opacity 0 → 1' },
  { id: 'fadeOut', label: 'Fade out', hint: 'Opacity → 0' },
  { id: 'popIn', label: 'Pop in', hint: 'Scale up with overshoot' },
  { id: 'slideLeft', label: 'Slide in ←', hint: 'Enter from the left' },
  { id: 'slideUp', label: 'Slide in ↑', hint: 'Enter from below' },
  { id: 'bounce', label: 'Bounce', hint: 'Two hops' },
  { id: 'spin', label: 'Spin', hint: 'Full 360° turn' },
  { id: 'pulse', label: 'Pulse', hint: 'Grow and shrink' },
  { id: 'shake', label: 'Shake', hint: 'Wiggle left/right' },
  { id: 'draw', label: 'Draw stroke', hint: 'Reveal the outline' },
];

export function applyPreset(preset: Preset) {
  const { selection, time: t0, doc } = getState();
  let end = t0;
  const touched: string[] = [];
  updateDoc((d) => {
    for (const id of selection) {
      const src = findEl(doc, id);
      const el = findEl(d, id);
      if (!src || !el) continue;
      const v = (p: PropKey) => Number(valueAt(src, p, t0));
      const keys = (p: PropKey, list: [number, Value, string?][]) => {
        if (!supports(el.type, p)) return;
        if (!el.tracks[p]) {
          el.tracks[p] = [];
          if (t0 > EPS) el.tracks[p]!.push(mkKf(0, el.props[p] ?? PROP_META[p].def));
        }
        for (const [dt, val, e] of list) {
          upsert(el.tracks[p]!, t0 + dt, val, e);
          end = Math.max(end, t0 + dt);
        }
      };
      touched.push(id);
      switch (preset) {
        case 'fadeIn': keys('opacity', [[0, 0, 'easeOut'], [0.6, v('opacity') > 0.05 ? v('opacity') : 1]]); break;
        case 'fadeOut': keys('opacity', [[0, v('opacity'), 'easeIn'], [0.6, 0]]); break;
        case 'popIn':
          keys('scaleX', [[0, 0, 'easeOutBack'], [0.5, v('scaleX')]]);
          keys('scaleY', [[0, 0, 'easeOutBack'], [0.5, v('scaleY')]]);
          break;
        case 'slideLeft': keys('x', [[0, v('x') - doc.width * 0.4, 'easeOutCubic'], [0.7, v('x')]]); break;
        case 'slideUp': keys('y', [[0, v('y') + doc.height * 0.3, 'easeOutCubic'], [0.7, v('y')]]); break;
        case 'bounce': keys('y', [[0, v('y'), 'easeOutQuad'], [0.3, v('y') - 60, 'easeInQuad'], [0.6, v('y'), 'easeOutQuad'], [0.8, v('y') - 20, 'easeInQuad'], [1, v('y')]]); break;
        case 'spin': keys('rotation', [[0, v('rotation'), 'linear'], [1, v('rotation') + 360]]); break;
        case 'pulse':
          keys('scaleX', [[0, v('scaleX')], [0.3, v('scaleX') * 1.15], [0.6, v('scaleX')]]);
          keys('scaleY', [[0, v('scaleY')], [0.3, v('scaleY') * 1.15], [0.6, v('scaleY')]]);
          break;
        case 'shake': keys('x', [0, 0.08, 0.16, 0.24, 0.32, 0.4].map((dt, i) => [dt, v('x') + [0, 12, -12, 8, -8, 0][i], 'easeInOutSine'] as [number, Value, string])); break;
        case 'draw':
          keys('trim', [[0, 0, 'easeInOutCubic'], [1.2, 100]]);
          break;
      }
    }
    if (end > d.duration) d.duration = Math.ceil(end * 10) / 10;
  });
  expand(touched);
}

export function newShape(type: SvgEl['type'], init: Partial<SvgEl>, props: SvgEl['props']) {
  return createElement(type, init, props);
}
