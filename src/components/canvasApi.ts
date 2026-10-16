import type { Frame } from '../engine/interpolate';
import type { Box } from '../engine/matrix';

type Pt = { x: number; y: number };

export interface Measured {
  id: string;
  /** Selection box corners in artboard space. */
  corners: Pt[];
  /** Bounding box in the element's own (main-local) space. */
  lb: Box;
  f: Frame;
  /** Element origin (x, y) in artboard space. */
  origin: Pt;
  /** Parent space → artboard. */
  P: DOMMatrix;
}

/** Imperative hooks into the mounted canvas (set by <Canvas/>). */
export const canvasApi = {
  measure: (_id: string): Measured | null => null,
  /** Bounding box from the live DOM, in the element's main-local space. */
  localBBox: (_id: string): Box | null => null,
  fit: () => {},
};
