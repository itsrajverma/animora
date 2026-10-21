/**
 * Editing operations behind the SVGator-style toolbar and Properties panel:
 * transform origin, flip / rotate, motion paths, masks, guides and comments.
 */
import type { Draft } from 'immer';
import type { Doc, SvgEl } from '../model/types';
import { uid } from '../model/factory';
import { locate } from '../model/tree';
import { frameAt, valueAt } from '../engine/interpolate';
import { apply, inv, localMatrix, mul, parentToRoot, rotate, scale, skew, type Mat } from '../engine/matrix';
import { mapPath, fmt } from '../engine/path';
import { pointAtPercent } from '../engine/motion';
import { canvasApi } from '../components/canvasApi';
import { getState, notify, setState } from './store';
import { expand, findEl, geometryAsPath, mkKf, offsetElement, select, setValues, updateDoc, type Change } from './actions';
import { groupSelection } from './structure';

const isOriginAnimated = (el: SvgEl) => !!(el.tracks.originX?.length || el.tracks.originY?.length);

/** Linear part of the element's main transform (rotate · skew · scale). */
function linearPart(el: SvgEl, t: number): Mat {
  const f = frameAt(el, t);
  return mul(rotate(f.rotation + f.motionAngle), mul(skew(f.skewX, f.skewY), scale(f.scaleX, f.scaleY)));
}

/**
 * Move the transform origin to (ox, oy) in geometry coordinates. When the origin isn't animated the
 * element is shifted so it stays visually in place (like SVGator's Anchor field).
 */
export function setOrigin(ids: string[], ox: number | null, oy: number | null, key?: string) {
  const { doc, time } = getState();
  const animated: Change[] = [];
  updateDoc((d) => {
    for (const id of ids) {
      const src = findEl(doc, id);
      const el = findEl(d, id);
      if (!src || !el) continue;
      const f = frameAt(src, time);
      const nx = ox ?? f.originX, ny = oy ?? f.originY;
      if (isOriginAnimated(src)) {
        if (ox !== null) animated.push([id, 'originX', nx]);
        if (oy !== null) animated.push([id, 'originY', ny]);
        continue;
      }
      const [dx, dy] = apply(linearPart(src, time), nx - f.originX, ny - f.originY);
      el.ax = nx;
      el.ay = ny;
      delete el.props.originX;
      delete el.props.originY;
      offsetElement(el, dx, dy);
    }
  }, key);
  if (animated.length) setValues(animated, key);
}

/** Put the origin at the center of each selected element's bounding box. */
export function centerOrigin(ids = getState().selection) {
  const { doc, time } = getState();
  for (const id of ids) {
    const el = findEl(doc, id);
    const b = canvasApi.localBBox(id);
    if (!el || !b) continue;
    const f = frameAt(el, time);
    // localBBox is measured after translate(-origin), so add the origin back.
    setOrigin([id], Math.round((b.x + b.w / 2 + f.originX) * 100) / 100, Math.round((b.y + b.h / 2 + f.originY) * 100) / 100);
  }
}

export function flipSelection(axis: 'h' | 'v') {
  const { doc, selection, time } = getState();
  const ch: Change[] = [];
  for (const id of selection) {
    const el = findEl(doc, id);
    if (!el) continue;
    const p = axis === 'h' ? 'scaleX' : 'scaleY';
    ch.push([id, p, -Number(valueAt(el, p, time))]);
  }
  setValues(ch);
}

export function rotateSelection(deg: number) {
  const { doc, selection, time } = getState();
  setValues(selection.flatMap((id) => {
    const el = findEl(doc, id);
    return el ? [[id, 'rotation', Number(valueAt(el, 'rotation', time)) + deg] as Change] : [];
  }));
}

// ---------------------------------------------------------------------------
// Motion path

/** Ask the user to click the path the element should follow. */
export function startPickMotionPath(id: string) {
  setState({ pickMotionFor: id, tool: 'select' });
  notify('Click a path on the canvas to use it as the motion path (Esc to cancel).');
}

function attachMotionPath(d: Draft<Doc>, id: string, path: string, startPct = 0) {
  const el = findEl(d, id);
  if (!el) return;
  const { time } = getState();
  el.motionPath = path;
  el.autoRotate = el.autoRotate ?? false;
  delete el.tracks.x;
  delete el.tracks.y;
  const end = d.duration;
  el.tracks.motion = time < end - 0.05 ? [mkKf(time, startPct), mkKf(end, 100)] : [mkKf(0, 0), mkKf(end, 100)];
}

/** Use the path layer `pathId` as the motion path of `id` (the path layer is consumed, like SVGator). */
export function setMotionPathFrom(id: string, pathId: string) {
  const { doc, time } = getState();
  const el = findEl(doc, id);
  const src = findEl(doc, pathId);
  setState({ pickMotionFor: null });
  if (!el || !src || id === pathId) return;
  const d = geometryAsPath(src, time);
  if (!d) {
    notify('Pick a path, rectangle or ellipse.');
    return;
  }
  // Source geometry → artboard → the element's parent space.
  const toRoot = mul(parentToRoot(doc.elements, pathId, time), localMatrix(src, time));
  const m = mul(inv(parentToRoot(doc.elements, id, time)), toRoot);
  const path = mapPath(d, (x, y) => apply(m, x, y));
  updateDoc((dr) => {
    attachMotionPath(dr, id, path);
    const loc = locate(dr.elements, pathId);
    if (loc) loc.list.splice(loc.index, 1);
  });
  select([id]);
  expand([id]);
  notify('Motion path set. Drag its points on the canvas to reshape it.');
}

/** Give the element a default curved path starting where it is now. */
export function createDefaultMotionPath(id: string) {
  const { doc, time } = getState();
  const el = findEl(doc, id);
  setState({ pickMotionFor: null });
  if (!el) return;
  const f = frameAt(el, time);
  const w = Math.max(120, Math.min(300, doc.width / 3));
  const path = `M${fmt(f.x)} ${fmt(f.y)} C${fmt(f.x + w / 3)} ${fmt(f.y - w / 2)} ${fmt(f.x + (2 * w) / 3)} ${fmt(f.y - w / 2)} ${fmt(f.x + w)} ${fmt(f.y)}`;
  updateDoc((d) => attachMotionPath(d, id, path));
  expand([id]);
}

export function removeMotionPath(id: string) {
  const { doc, time } = getState();
  const el = findEl(doc, id);
  if (!el?.motionPath) return;
  const p = pointAtPercent(el.motionPath, Number(valueAt(el, 'motion', time)));
  updateDoc((d) => {
    const e = findEl(d, id)!;
    delete e.motionPath;
    delete e.tracks.motion;
    delete e.props.motion;
    e.props.x = Math.round(p.x * 10) / 10;
    e.props.y = Math.round(p.y * 10) / 10;
  });
}

export function setMotionPathData(id: string, path: string, key?: string) {
  updateDoc((d) => {
    const e = findEl(d, id);
    if (e) e.motionPath = path;
  }, key);
}

// ---------------------------------------------------------------------------
// Masks

/** Group the selection and use its top-most layer as the mask (SVGator's "Create mask"). */
export function createMask() {
  const { selection } = getState();
  if (selection.length < 2) {
    notify('Select the mask shape and the layers it should mask (the mask must be on top).');
    return;
  }
  groupSelection();
  const g = findEl(getState().doc, getState().selection[0]);
  if (!g?.children?.length) return;
  const top = g.children[g.children.length - 1];
  updateDoc((d) => {
    const grp = findEl(d, g.id)!;
    grp.name = 'Mask group';
    const t = findEl(d, top.id)!;
    t.isMask = true;
    t.name = t.name.startsWith('Mask') ? t.name : `Mask (${t.name})`;
  });
  expand([g.id]);
}

export function releaseMask(id: string) {
  updateDoc((d) => {
    const e = findEl(d, id);
    if (e) e.isMask = false;
  });
}

// ---------------------------------------------------------------------------
// Guides

export function addGuide(axis: 'x' | 'y', v: number) {
  updateDoc((d) => {
    d.guides[axis].push(Math.round(v));
  });
  return getState().doc.guides[axis].length - 1;
}

export function moveGuide(axis: 'x' | 'y', i: number, v: number, key?: string) {
  updateDoc((d) => {
    d.guides[axis][i] = Math.round(v);
  }, key);
}

export function removeGuide(axis: 'x' | 'y', i: number) {
  updateDoc((d) => {
    d.guides[axis].splice(i, 1);
  });
}

export function clearGuides() {
  updateDoc((d) => {
    d.guides = { x: [], y: [] };
  });
}

// ---------------------------------------------------------------------------
// Comments

export function addComment(text: string, atTime: boolean) {
  const { time, selection } = getState();
  updateDoc((d) => {
    d.comments.push({
      id: uid(), text, time: atTime ? time : null, elId: selection.length === 1 ? selection[0] : null, created: Date.now(), resolved: false,
    });
  });
}

export function patchComment(id: string, patch: { text?: string; resolved?: boolean }) {
  updateDoc((d) => {
    const c = d.comments.find((x) => x.id === id);
    if (c) Object.assign(c, patch);
  });
}

export function deleteComment(id: string) {
  updateDoc((d) => {
    d.comments = d.comments.filter((x) => x.id !== id);
  });
}
