import type { SvgEl } from './types';
import { createElement } from './factory';
import { ellipsePath, polygonPath, rectPath, starPath } from '../engine/path';

export interface LibraryShape {
  id: string;
  name: string;
  d: string;
  fill: string;
  stroke?: string;
  strokeWidth?: number;
}

/** Ready-made shapes (geometry centered on 0,0, roughly 100×100). */
export const LIBRARY: LibraryShape[] = [
  { id: 'square', name: 'Rounded square', d: rectPath(100, 100, 16), fill: '#5b6cff' },
  { id: 'circle', name: 'Circle', d: ellipsePath(100, 100), fill: '#ff8c42' },
  { id: 'star', name: 'Star', d: starPath(110, 110), fill: '#ffc93c' },
  { id: 'hexagon', name: 'Hexagon', d: polygonPath(104, 104, 6), fill: '#2ec4b6' },
  { id: 'triangle', name: 'Triangle', d: 'M0 -45 L48 38 L-48 38 Z', fill: '#ff5d73' },
  { id: 'heart', name: 'Heart', d: 'M0 36 C-48 4 -60 -26 -36 -44 C-18 -56 0 -46 0 -30 C0 -46 18 -56 36 -44 C60 -26 48 4 0 36 Z', fill: '#ff4d6d' },
  { id: 'arrow', name: 'Arrow', d: 'M-50 -12 L10 -12 L10 -35 L50 0 L10 35 L10 12 L-50 12 Z', fill: '#4361ee' },
  { id: 'bolt', name: 'Lightning', d: 'M10 -50 L-30 8 L-2 8 L-12 50 L32 -10 L4 -10 Z', fill: '#ffb703' },
  { id: 'bubble', name: 'Speech bubble', d: 'M-45 -35 H45 Q50 -35 50 -30 V15 Q50 20 45 20 H-5 L-25 40 L-22 20 H-45 Q-50 20 -50 15 V-30 Q-50 -35 -45 -35 Z', fill: '#8b5cf6' },
  { id: 'plus', name: 'Plus', d: 'M-12 -45 H12 V-12 H45 V12 H12 V45 H-12 V12 H-45 V-12 H-12 Z', fill: '#06d6a0' },
  { id: 'drop', name: 'Drop', d: 'M0 -50 C20 -20 35 0 35 15 A35 35 0 0 1 -35 15 C-35 0 -20 -20 0 -50 Z', fill: '#4cc9f0' },
  { id: 'moon', name: 'Moon', d: 'M10 -45 A45 45 0 1 0 45 15 A35 35 0 1 1 10 -45 Z', fill: '#f9c74f' },
  { id: 'ring', name: 'Ring', d: 'M0 -45 A45 45 0 1 1 0 45 A45 45 0 1 1 0 -45 Z M0 -25 A25 25 0 1 0 0 25 A25 25 0 1 0 0 -25 Z', fill: '#f72585' },
  { id: 'check', name: 'Check mark', d: 'M-40 0 L-12 28 L42 -28', fill: 'none', stroke: '#06d6a0', strokeWidth: 14 },
  { id: 'wave', name: 'Wave', d: 'M-50 0 C-35 -25 -15 -25 0 0 C15 25 35 25 50 0', fill: 'none', stroke: '#ff5d73', strokeWidth: 8 },
  { id: 'spiral', name: 'Swirl', d: 'M0 0 C0 -10 14 -10 14 0 C14 18 -20 18 -20 0 C-20 -28 28 -28 28 0 C28 38 -36 38 -36 0', fill: 'none', stroke: '#7c6cf2', strokeWidth: 6 },
];

export function libraryElement(s: LibraryShape, x: number, y: number): SvgEl {
  return createElement(
    'path',
    { name: s.name, lineCap: s.stroke ? 'round' : undefined, lineJoin: 'round' },
    { x, y, d: s.d, fill: s.fill, stroke: s.stroke ?? 'none', strokeWidth: s.strokeWidth ?? 0 },
  );
}
