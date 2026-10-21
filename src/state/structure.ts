/**
 * Layer-tree operations: group, ungroup, merge into one path, move layers
 * between groups, align / distribute. Transforms are rebased so nothing jumps.
 */
import type { Draft } from 'immer';
import type { PropKey, SvgEl } from '../model/types';
import { createElement, nextName } from '../model/factory';
import { containsId, findById, locate } from '../model/tree';
import { frameAt, valueAt } from '../engine/interpolate';
import {
  apply, boxCorners, inv, isTranslation, localMatrix, mainMatrix, modelBBox, mul, parentToRoot, spaceToRoot, toSvgMatrix,
  type Mat,
} from '../engine/matrix';
import { mapPath, pathBBox } from '../engine/path';
import { canvasApi } from '../components/canvasApi';
import { getState, notify, setState } from './store';
import { expand, findEl, geometryAsPath, offsetElement, select, setValues, updateDoc, type Change } from './actions';

const TRANSFORM_PROPS: PropKey[] = ['x', 'y', 'rotation', 'scaleX', 'scaleY', 'skewX', 'skewY', 'originX', 'originY', 'motion'];

const bbox = (el: SvgEl, t: number) => canvasApi.localBBox(el.id) ?? modelBBox(el, t);

/** Center of an element's bounding box, in the space reached by `toSpace` from its parent space. */
function centerIn(el: SvgEl, t: number, toSpace: Mat): [number, number] {
  const b = bbox(el, t);
  const f = frameAt(el, t);
  if (!b) return apply(toSpace, f.x, f.y);
  const m = mul(toSpace, mainMatrix(f));
  const pts = boxCorners(b).map(([x, y]) => apply(m, x, y));
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  return [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2];
}

const hasTransformTracks = (el: SvgEl) => TRANSFORM_PROPS.some((p) => (el.tracks[p]?.length ?? 0) > 0);

/**
 * Re-express `el` (a draft) in a new parent space. `rel` maps old parent space → new parent space.
 * Exact for translations and for elements without transform animation; otherwise a close approximation.
 */
function rebase(el: Draft<SvgEl>, orig: SvgEl, rel: Mat, t: number) {
  if (isTranslation(rel)) {
    offsetElement(el, rel[4], rel[5]);
    return;
  }
  if (!hasTransformTracks(orig)) {
    const [cx, cy] = centerIn(orig, t, rel);
    el.baseTransform = toSvgMatrix(mul(rel, localMatrix(orig, t)));
    el.ax = cx;
    el.ay = cy;
    delete el.props.originX;
    delete el.props.originY;
    delete el.motionPath;
    Object.assign(el.props, { x: cx, y: cy, rotation: 0, scaleX: 1, scaleY: 1, skewX: 0, skewY: 0 });
    return;
  }
  const rot = (Math.atan2(rel[1], rel[0]) * 180) / Math.PI;
  const kx = Math.hypot(rel[0], rel[1]);
  const ky = Math.hypot(rel[2], rel[3]);
  const xAt = (tt: number) => Number(valueAt(orig, 'x', tt));
  const yAt = (tt: number) => Number(valueAt(orig, 'y', tt));
  if (el.tracks.x?.length) for (const k of el.tracks.x) k.value = apply(rel, Number(k.value), yAt(k.time))[0];
  else el.props.x = apply(rel, xAt(t), yAt(t))[0];
  if (el.tracks.y?.length) for (const k of el.tracks.y) k.value = apply(rel, xAt(k.time), Number(k.value))[1];
  else el.props.y = apply(rel, xAt(t), yAt(t))[1];
  const adjust = (p: PropKey, fn: (v: number) => number) => {
    const tr = el.tracks[p];
    if (tr?.length) for (const k of tr) k.value = fn(Number(k.value));
    else el.props[p] = fn(Number(valueAt(orig, p, t)));
  };
  if (Math.abs(rot) > 1e-6) adjust('rotation', (v) => v + rot);
  if (Math.abs(kx - 1) > 1e-6) adjust('scaleX', (v) => v * kx);
  if (Math.abs(ky - 1) > 1e-6) adjust('scaleY', (v) => v * ky);
}

function multiplyOpacity(el: Draft<SvgEl>, k: number) {
  if (Math.abs(k - 1) < 1e-6) return;
  const tr = el.tracks.opacity;
  if (tr?.length) for (const kf of tr) kf.value = Number(kf.value) * k;
  else el.props.opacity = Number(el.props.opacity ?? 1) * k;
}

/** Selected ids that share one parent, sorted bottom → top. */
function siblingsOfSelection(): { ids: string[]; parent: string | null } | null {
  const { doc, selection } = getState();
  const locs = selection.map((id) => ({ id, loc: locate(doc.elements, id) })).filter((x) => x.loc);
  if (!locs.length) return null;
  const parent = locs[0].loc!.parent?.id ?? null;
  if (locs.some((x) => (x.loc!.parent?.id ?? null) !== parent)) {
    notify('Select layers inside the same group to do that.');
    return null;
  }
  return { ids: locs.sort((a, b) => a.loc!.index - b.loc!.index).map((x) => x.id), parent };
}

export function canGroup() {
  return getState().selection.length > 0;
}

export function groupSelection() {
  const sib = siblingsOfSelection();
  if (!sib) return;
  const { doc, time } = getState();
  const els = sib.ids.map((id) => findEl(doc, id)!);
  const pts = els.flatMap((el) => {
    const b = bbox(el, time);
    const f = frameAt(el, time);
    if (!b) return [[f.x, f.y] as [number, number]];
    const m = mainMatrix(f);
    return boxCorners(b).map(([x, y]) => apply(m, x, y));
  });
  const xs = pts.map((p) => p[0]), ys = pts.map((p) => p[1]);
  const cx = (Math.min(...xs) + Math.max(...xs)) / 2;
  const cy = (Math.min(...ys) + Math.max(...ys)) / 2;
  const group = createElement('group', { name: nextName('Group'), ax: cx, ay: cy, children: [] }, { x: cx, y: cy });
  updateDoc((d) => {
    const loc = locate(d.elements, sib.ids[0])!;
    const list = loc.list;
    const set = new Set(sib.ids);
    const top = Math.max(...sib.ids.map((id) => list.findIndex((e) => e.id === id)));
    const picked = list.filter((e) => set.has(e.id));
    const before = list.slice(0, top + 1).filter((e) => !set.has(e.id)).length;
    const rest = list.filter((e) => !set.has(e.id));
    rest.splice(before, 0, { ...group, children: picked as SvgEl[] });
    list.splice(0, list.length, ...rest);
  });
  select([group.id]);
  expand([group.id]);
}

export function ungroupSelection() {
  const { doc, selection, time } = getState();
  const groups = selection.map((id) => findEl(doc, id)).filter((e): e is SvgEl => e?.type === 'group');
  if (!groups.length) return;
  const released: string[] = [];
  let baked = false;
  updateDoc((d) => {
    for (const g of groups) {
      const loc = locate(d.elements, g.id);
      if (!loc) continue;
      const rel = localMatrix(g, time);
      const op = Number(valueAt(g, 'opacity', time));
      if (Object.values(g.tracks).some((tr) => tr?.length)) baked = true;
      const kids = loc.list[loc.index].children ?? [];
      kids.forEach((kid, i) => {
        rebase(kid, g.children![i], rel, time);
        multiplyOpacity(kid, op);
        released.push(kid.id);
      });
      loc.list.splice(loc.index, 1, ...kids);
    }
  });
  select(released);
  if (baked) notify('The group was animated — its animation was baked at the current time.');
}

/** Combine paths, rectangles and ellipses (including inside groups) into a single path layer. */
export function mergeSelection() {
  const sib = siblingsOfSelection();
  if (!sib) return;
  const { doc, time } = getState();
  const ds: string[] = [];
  let style: SvgEl | null = null;
  let styleScale = 1;
  let skipped = 0;
  let animated = false;
  const collect = (el: SvgEl, toParent: Mat) => {
    if (!el.visible) return;
    const m = mul(toParent, localMatrix(el, time));
    if (Object.values(el.tracks).some((tr) => tr?.length)) animated = true;
    if (el.type === 'group') {
      el.children?.forEach((c) => collect(c, m));
      return;
    }
    const d = geometryAsPath(el, time);
    if (!d) {
      skipped++;
      return;
    }
    ds.push(mapPath(d, (x, y) => apply(m, x, y)));
    style = el;
    styleScale = Math.sqrt(Math.abs(m[0] * m[3] - m[1] * m[2]));
  };
  for (const id of sib.ids) collect(findEl(doc, id)!, [1, 0, 0, 1, 0, 0]);
  if (!ds.length || !style) {
    notify('Nothing to merge — select shapes or paths (text and images can’t be merged).');
    return;
  }
  if (ds.length < 2 && sib.ids.length < 2 && findEl(doc, sib.ids[0])?.type !== 'group') {
    notify('Select two or more shapes (or a group) to merge.');
    return;
  }
  const combined = ds.join(' ');
  const b = pathBBox(combined);
  const cx = b.x + b.w / 2, cy = b.y + b.h / 2;
  const s = style as SvgEl;
  const f = frameAt(s, time);
  const topOpacity = Number(valueAt(findEl(doc, sib.ids[sib.ids.length - 1])!, 'opacity', time));
  const merged = createElement('path', { name: nextName('Merged shape'), lineCap: s.lineCap, lineJoin: s.lineJoin }, {
    x: cx, y: cy, d: mapPath(combined, (x, y) => [x - cx, y - cy]),
    fill: f.fill, stroke: f.stroke, strokeWidth: Math.round(f.strokeWidth * styleScale * 100) / 100, opacity: topOpacity,
  });
  updateDoc((d) => {
    const list = locate(d.elements, sib.ids[0])!.list;
    const set = new Set(sib.ids);
    const top = Math.max(...sib.ids.map((id) => list.findIndex((e) => e.id === id)));
    const before = list.slice(0, top + 1).filter((e) => !set.has(e.id)).length;
    const rest = list.filter((e) => !set.has(e.id));
    rest.splice(before, 0, merged);
    list.splice(0, list.length, ...rest);
  });
  select([merged.id]);
  const notes = [skipped && `${skipped} text/image layer${skipped > 1 ? 's were' : ' was'} skipped`, animated && 'animations were baked at the current time'].filter(Boolean);
  notify(`Merged ${ds.length} shape${ds.length > 1 ? 's' : ''} into one path${notes.length ? ' — ' + notes.join(', ') : ''}.`);
}

/**
 * Move a layer relative to another one in the tree.
 * `where`: 'above' / 'below' in the visual (top-first) order, or 'inside' a group (on top).
 */
export function moveLayer(id: string, targetId: string, where: 'above' | 'below' | 'inside') {
  const { doc, time } = getState();
  if (id === targetId) return;
  const el = findEl(doc, id);
  const target = findEl(doc, targetId);
  if (!el || !target || containsId(el, targetId)) return;
  if (where === 'inside' && target.type !== 'group') return;
  const oldParent = locate(doc.elements, id)?.parent?.id ?? null;
  const newParent = where === 'inside' ? targetId : locate(doc.elements, targetId)?.parent?.id ?? null;
  const rel = oldParent === newParent ? null : mul(inv(spaceToRoot(doc.elements, newParent, time)), spaceToRoot(doc.elements, oldParent, time));
  updateDoc((d) => {
    const from = locate(d.elements, id)!;
    const [moving] = from.list.splice(from.index, 1);
    if (rel) rebase(moving, el, rel, time);
    if (where === 'inside') {
      const g = findById(d.elements, targetId)!;
      (g.children ??= []).push(moving);
    } else {
      const to = locate(d.elements, targetId)!;
      to.list.splice(where === 'above' ? to.index + 1 : to.index, 0, moving);
    }
  });
  if (where === 'inside') expand([targetId]);
  select([id]);
}

// ---------------------------------------------------------------------------
// Align & distribute

type Align = 'left' | 'centerH' | 'right' | 'top' | 'middle' | 'bottom';

function worldBox(id: string) {
  const m = canvasApi.measure(id);
  if (!m) return null;
  const xs = m.corners.map((c) => c.x), ys = m.corners.map((c) => c.y);
  return { m, x0: Math.min(...xs), x1: Math.max(...xs), y0: Math.min(...ys), y1: Math.max(...ys) };
}

/** Converts an artboard-space offset into the element's parent space and applies it. */
function shiftChanges(ch: Change[], id: string, dx: number, dy: number) {
  const { doc, time } = getState();
  const el = findEl(doc, id);
  if (!el || (!dx && !dy)) return;
  const pinv = inv(parentToRoot(doc.elements, id, time));
  const [ox, oy] = apply(pinv, 0, 0);
  const [vx, vy] = apply(pinv, dx, dy);
  const f = frameAt(el, time);
  ch.push([id, 'x', Math.round((f.x + vx - ox) * 10) / 10], [id, 'y', Math.round((f.y + vy - oy) * 10) / 10]);
}

/** Move layers by an artboard-space offset. */
export function moveByWorld(ids: string[], dx: number, dy: number, key?: string) {
  const ch: Change[] = [];
  for (const id of ids) shiftChanges(ch, id, dx, dy);
  setValues(ch, key);
}

/** Align to the artboard (one layer) or to the selection bounds (several). */
export function alignSelection(how: Align) {
  const { doc, selection } = getState();
  const boxes = selection.map((id) => ({ id, b: worldBox(id) })).filter((x) => x.b) as { id: string; b: NonNullable<ReturnType<typeof worldBox>> }[];
  if (!boxes.length) return;
  const ref = boxes.length > 1
    ? { x0: Math.min(...boxes.map((x) => x.b.x0)), x1: Math.max(...boxes.map((x) => x.b.x1)), y0: Math.min(...boxes.map((x) => x.b.y0)), y1: Math.max(...boxes.map((x) => x.b.y1)) }
    : { x0: 0, x1: doc.width, y0: 0, y1: doc.height };
  const ch: Change[] = [];
  for (const { id, b } of boxes) {
    let dx = 0, dy = 0;
    if (how === 'left') dx = ref.x0 - b.x0;
    if (how === 'right') dx = ref.x1 - b.x1;
    if (how === 'centerH') dx = (ref.x0 + ref.x1) / 2 - (b.x0 + b.x1) / 2;
    if (how === 'top') dy = ref.y0 - b.y0;
    if (how === 'bottom') dy = ref.y1 - b.y1;
    if (how === 'middle') dy = (ref.y0 + ref.y1) / 2 - (b.y0 + b.y1) / 2;
    shiftChanges(ch, id, dx, dy);
  }
  setValues(ch);
}

export function distributeSelection(axis: 'h' | 'v') {
  const { selection } = getState();
  const boxes = selection.map((id) => ({ id, b: worldBox(id) })).filter((x) => x.b) as { id: string; b: NonNullable<ReturnType<typeof worldBox>> }[];
  if (boxes.length < 3) {
    notify('Select at least three layers to distribute.');
    return;
  }
  const lo = (x: (typeof boxes)[0]) => (axis === 'h' ? x.b.x0 : x.b.y0);
  const size = (x: (typeof boxes)[0]) => (axis === 'h' ? x.b.x1 - x.b.x0 : x.b.y1 - x.b.y0);
  boxes.sort((a, b) => lo(a) - lo(b));
  const start = lo(boxes[0]);
  const end = Math.max(...boxes.map((x) => lo(x) + size(x)));
  const gap = (end - start - boxes.reduce((s, x) => s + size(x), 0)) / (boxes.length - 1);
  const ch: Change[] = [];
  let cur = start;
  for (const x of boxes) {
    const d = cur - lo(x);
    shiftChanges(ch, x.id, axis === 'h' ? d : 0, axis === 'v' ? d : 0);
    cur += size(x) + gap;
  }
  setValues(ch);
}

export function enterGroup(id: string) {
  const el = findEl(getState().doc, id);
  if (el?.type !== 'group' || !el.children?.length) return;
  setState({ scope: id, selection: [el.children[el.children.length - 1].id], selectedKfs: [] });
}
