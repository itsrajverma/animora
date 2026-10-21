export type ElementType = 'rect' | 'ellipse' | 'path' | 'text' | 'image' | 'raw' | 'group';

export type PropKey =
  | 'x'
  | 'y'
  | 'originX'
  | 'originY'
  | 'rotation'
  | 'scaleX'
  | 'scaleY'
  | 'skewX'
  | 'skewY'
  | 'opacity'
  | 'fill'
  | 'fillOpacity'
  | 'stroke'
  | 'strokeOpacity'
  | 'strokeWidth'
  | 'dashOffset'
  | 'dashArray'
  | 'trim'
  | 'width'
  | 'height'
  | 'rx'
  | 'd'
  | 'fontSize'
  | 'blur'
  | 'shadowX'
  | 'shadowY'
  | 'shadowBlur'
  | 'shadowColor'
  | 'motion';

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
 *   translate(x y) rotate(rotation) skewX(skewX) skewY(skewY) scale(scaleX scaleY) translate(-originX -originY) [baseTransform] <geometry>
 * so (originX, originY) is the transform origin expressed in geometry coordinates. Its static value lives in
 * `ax`/`ay` unless the origin is animated (or set through `props`).
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
  /** Path (in the parent's space) the element travels along; `motion` is the 0–100% offset on it. */
  motionPath?: string;
  /** Rotate the element along the motion path direction. */
  autoRotate?: boolean;
  /** This layer masks the layers below it inside the same group. */
  isMask?: boolean;
  /** CSS mix-blend-mode. */
  blend?: string;
  fillRule?: 'nonzero' | 'evenodd';
  textAlign?: 'start' | 'middle' | 'end';
  letterSpacing?: number;
  /** Child layers (only for type 'group'), bottom → top. */
  children?: SvgEl[];
}

export interface Guides {
  x: number[];
  y: number[];
}

export interface Comment {
  id: string;
  text: string;
  /** Timeline position the comment refers to (seconds), if any. */
  time: number | null;
  elId: string | null;
  created: number;
  resolved: boolean;
}

export type Trigger = 'load' | 'click' | 'hover';
export type Direction = 'normal' | 'reverse' | 'alternate' | 'alternate-reverse';

export interface Doc {
  version: 1;
  name: string;
  width: number;
  height: number;
  background: string;
  /** Seconds. */
  duration: number;
  /** Play forever (otherwise `iterations` times). */
  loop: boolean;
  iterations: number;
  direction: Direction;
  /** What starts the exported animation. */
  trigger: Trigger;
  /** When the animation ends: keep the last frame or go back to the first. */
  fillMode: 'freeze' | 'remove';
  /** Playback speed of the export, in percent. */
  speed: number;
  elements: SvgEl[];
  /** Raw <defs> content (gradients, clip paths…) from imported files. */
  defs: string;
  guides: Guides;
  comments: Comment[];
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
