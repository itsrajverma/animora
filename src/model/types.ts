export type ElementType = 'rect' | 'ellipse' | 'path' | 'text' | 'image' | 'raw' | 'group';

export type PropKey =
  | 'x'
  | 'y'
  | 'rotation'
  | 'scaleX'
  | 'scaleY'
  | 'opacity'
  | 'fill'
  | 'stroke'
  | 'strokeWidth'
  | 'trim'
  | 'width'
  | 'height'
  | 'rx'
  | 'd'
  | 'fontSize';

export type Value = number | string;

/** A keyframe. `easing` controls the segment from this keyframe to the next one. */
export interface Keyframe {
  id: string;
  time: number;
  value: Value;
  easing: string;
}

export type Tracks = Partial<Record<PropKey, Keyframe[]>>;

/**
 * An element on the artboard. Rendered as:
 *   translate(x y) rotate(rotation) scale(scaleX scaleY) translate(-ax -ay) [baseTransform] <geometry>
 * so (ax, ay) is the transform origin expressed in geometry coordinates.
 */
export interface SvgEl {
  id: string;
  type: ElementType;
  name: string;
  visible: boolean;
  locked: boolean;
  /** Static values, used for properties that have no keyframes. */
  props: Partial<Record<PropKey, Value>>;
  tracks: Tracks;
  ax: number;
  ay: number;
  baseTransform?: string;
  text?: string;
  fontFamily?: string;
  fontWeight?: string;
  href?: string;
  markup?: string;
  lineCap?: string;
  lineJoin?: string;
  /** Child layers (only for type 'group'), bottom → top. */
  children?: SvgEl[];
}

export interface Doc {
  version: 1;
  name: string;
  width: number;
  height: number;
  background: string;
  /** Seconds. */
  duration: number;
  loop: boolean;
  elements: SvgEl[];
  /** Raw <defs> content (gradients, clip paths…) from imported files. */
  defs: string;
}

export type Tool =
  | 'select'
  | 'node'
  | 'hand'
  | 'rect'
  | 'ellipse'
  | 'line'
  | 'star'
  | 'polygon'
  | 'pen'
  | 'text';

export interface KfRef {
  elId: string;
  prop: PropKey;
  kfId: string;
}
