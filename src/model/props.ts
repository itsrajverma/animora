import type { ElementType, PropKey, SvgEl, Value } from './types';

export type PropKind = 'number' | 'color' | 'path' | 'dash';

export interface PropMeta {
  label: string;
  kind: PropKind;
  def: Value;
  min?: number;
  max?: number;
  step?: number;
  unit?: string;
}

export const PROP_META: Record<PropKey, PropMeta> = {
  x: { label: 'Position X', kind: 'number', def: 0, step: 1 },
  y: { label: 'Position Y', kind: 'number', def: 0, step: 1 },
  originX: { label: 'Origin X', kind: 'number', def: 0, step: 1 },
  originY: { label: 'Origin Y', kind: 'number', def: 0, step: 1 },
  rotation: { label: 'Rotation', kind: 'number', def: 0, step: 1, unit: '°' },
  scaleX: { label: 'Scale X', kind: 'number', def: 1, step: 0.01 },
  scaleY: { label: 'Scale Y', kind: 'number', def: 1, step: 0.01 },
  skewX: { label: 'Skew X', kind: 'number', def: 0, min: -89, max: 89, step: 1, unit: '°' },
  skewY: { label: 'Skew Y', kind: 'number', def: 0, min: -89, max: 89, step: 1, unit: '°' },
  opacity: { label: 'Opacity', kind: 'number', def: 1, min: 0, max: 1, step: 0.01 },
  fill: { label: 'Fill color', kind: 'color', def: '#000000' },
  fillOpacity: { label: 'Fill opacity', kind: 'number', def: 1, min: 0, max: 1, step: 0.01 },
  stroke: { label: 'Stroke color', kind: 'color', def: 'none' },
  strokeOpacity: { label: 'Stroke opacity', kind: 'number', def: 1, min: 0, max: 1, step: 0.01 },
  strokeWidth: { label: 'Stroke width', kind: 'number', def: 0, min: 0, step: 0.5 },
  dashOffset: { label: 'Stroke offset', kind: 'number', def: 0, step: 1 },
  dashArray: { label: 'Stroke dashes', kind: 'dash', def: '' },
  trim: { label: 'Draw (trim)', kind: 'number', def: 100, min: 0, max: 100, step: 1, unit: '%' },
  width: { label: 'Width', kind: 'number', def: 100, min: 0, step: 1 },
  height: { label: 'Height', kind: 'number', def: 100, min: 0, step: 1 },
  rx: { label: 'Corner radius', kind: 'number', def: 0, min: 0, step: 1 },
  d: { label: 'Morph', kind: 'path', def: '' },
  fontSize: { label: 'Font size', kind: 'number', def: 48, min: 1, step: 1 },
  blur: { label: 'Blur', kind: 'number', def: 0, min: 0, step: 0.5 },
  shadowX: { label: 'Shadow X', kind: 'number', def: 4, step: 1 },
  shadowY: { label: 'Shadow Y', kind: 'number', def: 4, step: 1 },
  shadowBlur: { label: 'Shadow blur', kind: 'number', def: 4, min: 0, step: 0.5 },
  shadowColor: { label: 'Shadow color', kind: 'color', def: 'none' },
  motion: { label: 'Motion path', kind: 'number', def: 0, min: 0, max: 100, step: 0.5, unit: '%' },
};

const TRANSFORM: PropKey[] = ['x', 'y', 'originX', 'originY', 'rotation', 'scaleX', 'scaleY', 'skewX', 'skewY', 'opacity', 'motion'];
const FILTERS: PropKey[] = ['blur', 'shadowX', 'shadowY', 'shadowBlur', 'shadowColor'];
const PAINT: PropKey[] = ['fill', 'fillOpacity', 'stroke', 'strokeOpacity', 'strokeWidth', 'dashOffset', 'dashArray'];

export const PROPS_BY_TYPE: Record<ElementType, PropKey[]> = {
  rect: [...TRANSFORM, 'width', 'height', 'rx', ...PAINT, ...FILTERS],
  ellipse: [...TRANSFORM, 'width', 'height', ...PAINT, ...FILTERS],
  path: [...TRANSFORM, 'd', ...PAINT, 'trim', ...FILTERS],
  text: [...TRANSFORM, 'fontSize', ...PAINT, ...FILTERS],
  image: [...TRANSFORM, 'width', 'height', ...FILTERS],
  raw: [...TRANSFORM, ...FILTERS],
  group: [...TRANSFORM, ...FILTERS],
};

export const ALL_PROPS = Object.keys(PROP_META) as PropKey[];

export const supports = (type: ElementType, prop: PropKey) => PROPS_BY_TYPE[type].includes(prop);

/** Value of a property when it has no keyframes. */
export function staticValue(el: SvgEl, prop: PropKey): Value {
  const v = el.props[prop];
  if (v !== undefined) return v;
  if (prop === 'originX') return el.ax;
  if (prop === 'originY') return el.ay;
  return PROP_META[prop].def;
}

// ---------------------------------------------------------------------------
// Animators: what the timeline shows as one row, like SVGator. Each animator
// drives one or more properties that share their keyframe times.

export interface Animator {
  id: string;
  label: string;
  props: PropKey[];
  /** Shift + key adds the animator to the selection. */
  key?: string;
  /** Only offered when the element has a motion path. */
  needsMotionPath?: boolean;
  /** Menu separator before this entry. */
  sep?: boolean;
}

export const ANIMATORS: Animator[] = [
  { id: 'morph', label: 'Morph', props: ['d'], key: 'M' },
  { id: 'position', label: 'Position', props: ['x', 'y'], key: 'P', sep: true },
  { id: 'motion', label: 'Motion path', props: ['motion'], needsMotionPath: true },
  { id: 'origin', label: 'Origin', props: ['originX', 'originY'], key: 'A' },
  { id: 'scale', label: 'Scale', props: ['scaleX', 'scaleY'], key: 'S' },
  { id: 'rotate', label: 'Rotate', props: ['rotation'], key: 'R' },
  { id: 'skew', label: 'Skew', props: ['skewX', 'skewY'], key: 'K' },
  { id: 'size', label: 'Size', props: ['width', 'height'] },
  { id: 'radius', label: 'Corner radius', props: ['rx'] },
  { id: 'fontSize', label: 'Font size', props: ['fontSize'] },
  { id: 'opacity', label: 'Opacity', props: ['opacity'], key: 'O', sep: true },
  { id: 'fill', label: 'Fill color', props: ['fill'], key: 'C', sep: true },
  { id: 'fillOpacity', label: 'Fill opacity', props: ['fillOpacity'] },
  { id: 'stroke', label: 'Stroke color', props: ['stroke'], key: 'B', sep: true },
  { id: 'strokeOpacity', label: 'Stroke opacity', props: ['strokeOpacity'] },
  { id: 'strokeWidth', label: 'Stroke width', props: ['strokeWidth'], key: 'W' },
  { id: 'strokeOffset', label: 'Stroke offset', props: ['dashOffset'], key: 'F' },
  { id: 'strokeDashes', label: 'Stroke dashes', props: ['dashArray'], key: 'D' },
  { id: 'trim', label: 'Draw stroke', props: ['trim'] },
  { id: 'filters', label: 'Filters', props: FILTERS, key: 'L', sep: true },
];

export const animatorById = (id: string) => ANIMATORS.find((a) => a.id === id);
export const animatorOf = (prop: PropKey) => ANIMATORS.find((a) => a.props.includes(prop))!;

/** Animators that make sense for an element. Morph is offered for rects/ellipses too (they get converted). */
export function animatorsFor(el: SvgEl): Animator[] {
  return ANIMATORS.filter((a) => {
    if (a.needsMotionPath && !el.motionPath) return false;
    if (a.id === 'morph') return el.type === 'path' || el.type === 'rect' || el.type === 'ellipse';
    return a.props.some((p) => supports(el.type, p));
  });
}

/** Properties of an animator that the element actually supports. */
export const animatorProps = (a: Animator, el: SvgEl) => a.props.filter((p) => supports(el.type, p));

export const isAnimatorActive = (a: Animator, el: SvgEl) => a.props.some((p) => (el.tracks[p]?.length ?? 0) > 0);
