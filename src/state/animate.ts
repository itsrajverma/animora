/**
 * Animator-level operations (SVGator style): add an animator to the selection,
 * and keyframe clipboard / duplicate / reverse.
 */
import type { KfRef, PropKey, SvgEl } from '../model/types';
import { ANIMATORS, animatorById, animatorProps, supports, type Animator } from '../model/props';
import { valueAt, hasShadow, frameAt } from '../engine/interpolate';
import { getEasing, bezierId } from '../engine/easing';
import { uid } from '../model/factory';
import { getState, notify, setState, type KfClip } from './store';
import { EPS, convertToPath, expand, findEl, mkKf, updateDoc, upsert } from './actions';

/** Properties of an animator to keyframe on this element. */
function propsToKey(a: Animator, el: SvgEl, t: number): PropKey[] {
  if (a.id === 'filters') {
    const f = frameAt(el, t);
    return hasShadow(f) ? animatorProps(a, el) : ['blur'];
  }
  return animatorProps(a, el);
}

/** Add an animator to the selected elements: a keyframe with the current value at the playhead. */
export function addAnimator(animatorId: string, ids = getState().selection) {
  const a = animatorById(animatorId);
  if (!a || !ids.length) return;
  if (a.id === 'morph') {
    for (const id of ids) {
      const el = findEl(getState().doc, id);
      if (el && (el.type === 'rect' || el.type === 'ellipse')) convertToPath(id);
    }
  }
  const { time, doc } = getState();
  const touched: string[] = [];
  updateDoc((d) => {
    for (const id of ids) {
      const src = findEl(doc, id);
      const el = findEl(d, id);
      if (!src || !el) continue;
      if (a.needsMotionPath && !src.motionPath) continue;
      const props = propsToKey(a, findEl(getState().doc, id) ?? src, time);
      for (const p of props) {
        const v = valueAt(src, p, time);
        if (!el.tracks[p]) el.tracks[p] = [];
        upsert(el.tracks[p]!, time, v);
      }
      if (props.length) touched.push(id);
    }
  });
  if (!touched.length) {
    notify(`${a.label} can't be applied to the selected element${ids.length > 1 ? 's' : ''}.`);
    return;
  }
  expand(touched);
}

/** Shift + letter → animator, like SVGator. */
export function animatorForShortcut(key: string): Animator | undefined {
  return ANIMATORS.find((a) => a.key === key.toUpperCase());
}

// ---------------------------------------------------------------------------
// Keyframe clipboard

const groupRefs = (refs: KfRef[]) => {
  const m = new Map<string, { elId: string; prop: PropKey; ids: Set<string> }>();
  for (const r of refs) {
    const k = r.elId + '|' + r.prop;
    if (!m.has(k)) m.set(k, { elId: r.elId, prop: r.prop, ids: new Set() });
    m.get(k)!.ids.add(r.kfId);
  }
  return [...m.values()];
};

export function copyKeyframes() {
  const { selectedKfs, doc } = getState();
  if (!selectedKfs.length) return false;
  const groups = groupRefs(selectedKfs);
  let t0 = Infinity;
  const clips: KfClip[] = [];
  for (const g of groups) {
    const keys = (findEl(doc, g.elId)?.tracks[g.prop] ?? []).filter((k) => g.ids.has(k.id));
    if (!keys.length) continue;
    t0 = Math.min(t0, ...keys.map((k) => k.time));
    clips.push({ prop: g.prop, keys: keys.map(({ time, value, easing }) => ({ time, value, easing })) });
  }
  for (const c of clips) for (const k of c.keys) k.time -= t0;
  setState({ kfClipboard: clips });
  notify(`Copied ${clips.reduce((s, c) => s + c.keys.length, 0)} keyframe(s).`);
  return true;
}

/** Paste copied keyframes at the playhead onto the selected elements (same property only). */
export function pasteKeyframes() {
  const { kfClipboard, selection, time } = getState();
  if (!kfClipboard.length || !selection.length) return false;
  let count = 0;
  const added: KfRef[] = [];
  updateDoc((d) => {
    for (const id of selection) {
      const el = findEl(d, id);
      if (!el) continue;
      for (const c of kfClipboard) {
        // Keyframes only go to the same property (animator type) on elements that support it.
        if (!supports(el.type, c.prop)) continue;
        const tr = (el.tracks[c.prop] ??= []);
        for (const k of c.keys) {
          const t = Math.round((time + k.time) * 1000) / 1000;
          const exist = tr.find((x) => Math.abs(x.time - t) < EPS);
          if (exist) {
            exist.value = k.value;
            exist.easing = k.easing;
            added.push({ elId: id, prop: c.prop, kfId: exist.id });
          } else {
            const nk = mkKf(t, k.value, k.easing);
            tr.push(nk);
            added.push({ elId: id, prop: c.prop, kfId: nk.id });
          }
          count++;
        }
        tr.sort((a, b) => a.time - b.time);
      }
    }
    const end = Math.max(...kfClipboard.flatMap((c) => c.keys.map((k) => time + k.time)));
    if (end > d.duration) d.duration = Math.ceil(end * 10) / 10;
  });
  expand(selection);
  setState({ selectedKfs: added });
  return count > 0;
}

export function duplicateKeyframes() {
  const sel = getState().selection;
  const els = new Set(getState().selectedKfs.map((r) => r.elId));
  if (!copyKeyframes()) return;
  setState({ selection: sel.length ? sel : [...els] });
  pasteKeyframes();
}

/** Mirror the selected keyframes in time (per property). */
export function reverseKeyframes(refs = getState().selectedKfs) {
  const groups = groupRefs(refs);
  if (!groups.length) return;
  // Played backwards, a curve becomes its point-reflection (ease-in turns into ease-out).
  const flip = (id: string) => {
    const e = getEasing(id);
    if (!e.bezier) return id;
    const [x1, y1, x2, y2] = e.bezier;
    return bezierId([1 - x2, 1 - y2, 1 - x1, 1 - y1]);
  };
  updateDoc((d) => {
    for (const g of groups) {
      const tr = findEl(d, g.elId)?.tracks[g.prop];
      if (!tr) continue;
      const keys = tr.filter((k) => g.ids.has(k.id)).sort((a, b) => a.time - b.time);
      if (keys.length < 2) continue;
      const lo = keys[0].time, hi = keys[keys.length - 1].time;
      const eases = keys.map((k) => k.easing);
      keys.forEach((k, i) => {
        k.time = Math.round((lo + hi - k.time) * 1000) / 1000;
        // The segment that now starts at this key was the one that ended here.
        if (i > 0) k.easing = flip(eases[i - 1]);
      });
      tr.sort((a, b) => a.time - b.time);
    }
  }, 'reverse:' + uid());
}

/** Move keyframes by `dt` seconds (used when dragging a segment). */
export function shiftKeyframes(refs: KfRef[], starts: number[], dt: number, key: string) {
  updateDoc((d) => {
    const touched = new Set<unknown[]>();
    refs.forEach((r, i) => {
      const tr = findEl(d, r.elId)?.tracks[r.prop];
      const k = tr?.find((x) => x.id === r.kfId);
      if (!tr || !k) return;
      k.time = Math.max(0, Math.round((starts[i] + dt) * 1000) / 1000);
      touched.add(tr);
    });
    for (const tr of touched) (tr as { time: number }[]).sort((a, b) => a.time - b.time);
  }, key);
}

/** Remove whole animators (all their properties' tracks) from an element, keeping current values. */
export function removeAnimator(elId: string, props: PropKey[]) {
  const { doc, time } = getState();
  const el = findEl(doc, elId);
  if (!el) return;
  updateDoc((d) => {
    const e = findEl(d, elId)!;
    for (const p of props) {
      if (!e.tracks[p]) continue;
      e.props[p] = valueAt(el, p, time);
      delete e.tracks[p];
    }
  });
  setState({ selectedKfs: getState().selectedKfs.filter((r) => !(r.elId === elId && props.includes(r.prop))) });
}

/** Add (or remove, if all exist) keyframes for every property of an animator at the playhead. */
export function toggleAnimatorKey(elId: string, props: PropKey[]) {
  const { doc, time } = getState();
  const el = findEl(doc, elId);
  if (!el) return;
  const active = props.filter((p) => el.tracks[p]?.length);
  const here = active.map((p) => el.tracks[p]!.find((k) => Math.abs(k.time - time) < EPS)).filter(Boolean);
  updateDoc((d) => {
    const e = findEl(d, elId)!;
    if (here.length && here.length === active.length) {
      for (const p of active) {
        const tr = e.tracks[p]!;
        const i = tr.findIndex((k) => Math.abs(k.time - time) < EPS);
        if (i >= 0) tr.splice(i, 1);
        if (!tr.length) {
          delete e.tracks[p];
          e.props[p] = valueAt(el, p, time);
        }
      }
    } else {
      for (const p of active.length ? active : props) upsert((e.tracks[p] ??= []), time, valueAt(el, p, time));
    }
  });
}

export function setKeyframeValue(ref: KfRef, value: number | string, key?: string) {
  updateDoc((d) => {
    const k = findEl(d, ref.elId)?.tracks[ref.prop]?.find((x) => x.id === ref.kfId);
    if (k) k.value = value;
  }, key);
}

/** Select every keyframe of the given properties of an element (clicking an animator row). */
export function selectAnimatorKeys(elId: string, props: PropKey[], add = false) {
  const el = findEl(getState().doc, elId);
  if (!el) return;
  const refs = props.flatMap((p) => (el.tracks[p] ?? []).map((k) => ({ elId, prop: p, kfId: k.id })));
  setState({ selectedKfs: add ? [...getState().selectedKfs, ...refs] : refs });
}
