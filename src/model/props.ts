import type { ElementType, PropKey, Value } from './types';

export type PropKind = 'number' | 'color' | 'path';

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
  rotation: { label: 'Rotation', kind: 'number', def: 0, step: 1, unit: '°' },
  scaleX: { label: 'Scale X', kind: 'number', def: 1, step: 0.01 },
  scaleY: { label: 'Scale Y', kind: 'number', def: 1, step: 0.01 },
  opacity: { label: 'Opacity', kind: 'number', def: 1, min: 0, max: 1, step: 0.01 },
  fill: { label: 'Fill', kind: 'color', def: '#000000' },
  stroke: { label: 'Stroke', kind: 'color', def: 'none' },
  strokeWidth: { label: 'Stroke width', kind: 'number', def: 0, min: 0, step: 0.5 },
  trim: { label: 'Draw (trim)', kind: 'number', def: 100, min: 0, max: 100, step: 1, unit: '%' },
  width: { label: 'Width', kind: 'number', def: 100, min: 0, step: 1 },
  height: { label: 'Height', kind: 'number', def: 100, min: 0, step: 1 },
  rx: { label: 'Corner radius', kind: 'number', def: 0, min: 0, step: 1 },
  d: { label: 'Shape (morph)', kind: 'path', def: '' },
  fontSize: { label: 'Font size', kind: 'number', def: 48, min: 1, step: 1 },
};

const TRANSFORM: PropKey[] = ['x', 'y', 'rotation', 'scaleX', 'scaleY', 'opacity'];

export const PROPS_BY_TYPE: Record<ElementType, PropKey[]> = {
  rect: [...TRANSFORM, 'width', 'height', 'rx', 'fill', 'stroke', 'strokeWidth'],
  ellipse: [...TRANSFORM, 'width', 'height', 'fill', 'stroke', 'strokeWidth'],
  path: [...TRANSFORM, 'd', 'fill', 'stroke', 'strokeWidth', 'trim'],
  text: [...TRANSFORM, 'fontSize', 'fill', 'stroke', 'strokeWidth'],
  image: [...TRANSFORM, 'width', 'height'],
  raw: TRANSFORM,
  group: TRANSFORM,
};

export const ALL_PROPS = Object.keys(PROP_META) as PropKey[];

export const supports = (type: ElementType, prop: PropKey) => PROPS_BY_TYPE[type].includes(prop);
