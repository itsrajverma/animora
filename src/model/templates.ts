/** Ready-made animated projects for the Templates tab. Each one shows off a feature. */
import type { Doc, SvgEl } from './types';
import { createElement as E, demoDoc, newDoc, withTracks as W, type K } from './factory';
import { ellipsePath, polygonPath, rectPath, starPath } from '../engine/path';
import { LIBRARY } from './library';

export interface Template {
  id: string;
  name: string;
  hint: string;
  make: () => Doc;
}

const doc = (name: string, w: number, h: number, bg: string, duration: number): Doc => ({
  ...newDoc(), name, width: w, height: h, background: bg, duration,
});

const group = (name: string, x: number, y: number, children: SvgEl[], extra: Partial<SvgEl> = {}) =>
  E('group', { name, children, ...extra }, { x, y });

const heartD = LIBRARY.find((s) => s.id === 'heart')!.d;

function loader(): Doc {
  const d = doc('Loading spinner', 600, 600, '#0f172a', 1.2);
  const N = 8;
  const dots = Array.from({ length: N }, (_, i) => {
    const a = (i / N) * Math.PI * 2 - Math.PI / 2;
    const keys: K[] = Array.from({ length: N + 1 }, (_, k) => {
      const age = (((k - i) % N) + N) % N;
      return [(k / N) * 1.2, Math.round((0.2 + 0.8 * Math.max(0, 1 - age / 3)) * 100) / 100, 'linear'];
    });
    return W(E('ellipse', { name: `Dot ${i + 1}` }, { x: 300 + Math.cos(a) * 110, y: 300 + Math.sin(a) * 110, width: 34, height: 34, fill: '#38bdf8' }), {
      opacity: keys,
      scaleX: keys.map(([t, v]) => [t, 0.6 + 0.4 * Number(v), 'linear'] as K),
      scaleY: keys.map(([t, v]) => [t, 0.6 + 0.4 * Number(v), 'linear'] as K),
    });
  });
  const label = E('text', { name: 'Label', text: 'Loading', fontWeight: '600' }, { x: 300, y: 300, fontSize: 30, fill: '#e2e8f0' });
  d.elements = [...dots, label];
  return d;
}

function heartbeat(): Doc {
  const d = doc('Heartbeat', 800, 500, '#fff1f2', 1.6);
  const beat: K[] = [[0, 1, 'easeOutQuad'], [0.14, 1.22, 'easeInQuad'], [0.3, 1, 'easeOutQuad'], [0.44, 1.14, 'easeInOutQuad'], [0.72, 1]];
  const heart = W(E('path', { name: 'Heart' }, { x: 400, y: 210, d: heartD, fill: '#f43f5e', scaleX: 1.6, scaleY: 1.6 }), {
    scaleX: beat.map(([t, v, e]) => [t, Number(v) * 1.6, e] as K),
    scaleY: beat.map(([t, v, e]) => [t, Number(v) * 1.6, e] as K),
  });
  const line = W(E('path', { name: 'Pulse line', lineCap: 'round', lineJoin: 'round' }, {
    x: 400, y: 400, fill: 'none', stroke: '#fb7185', strokeWidth: 6,
    d: 'M-320 0 H-120 L-90 -50 L-50 60 L-20 -90 L10 40 L40 0 H320',
  }), { trim: [[0, 0, 'linear'], [1.2, 100, 'linear'], [1.6, 100]], opacity: [[0, 1], [1.2, 1, 'easeIn'], [1.6, 0]] });
  d.elements = [line, heart];
  return d;
}

function bell(): Doc {
  const d = doc('Notification bell', 600, 600, '#eef2ff', 2);
  const body = E('path', { name: 'Bell body' }, {
    x: 0, y: 0, fill: '#fbbf24',
    d: 'M0 -110 C-58 -110 -78 -64 -78 -18 V34 L-100 64 H100 L78 34 V-18 C78 -64 58 -110 0 -110 Z',
  });
  const clapper = E('ellipse', { name: 'Clapper' }, { x: 0, y: 84, width: 40, height: 40, fill: '#f59e0b' });
  const swing: K[] = [[0, 0, 'easeOutSine'], [0.12, 18, 'easeInOutSine'], [0.27, -15, 'easeInOutSine'], [0.42, 11, 'easeInOutSine'], [0.57, -7, 'easeInOutSine'], [0.72, 3, 'easeInOutSine'], [0.86, 0], [2, 0]];
  // The bell swings around its top: origin at the hook.
  const bellG = W(group('Bell', 300, 196, [clapper, body], { ax: 0, ay: -110 }), { rotation: swing });
  const badge = W(group('Badge', 372, 196, [
    E('ellipse', { name: 'Badge dot' }, { x: 0, y: 0, width: 64, height: 64, fill: '#ef4444', stroke: '#eef2ff', strokeWidth: 6 }),
    E('text', { name: 'Count', text: '3', fontWeight: '800' }, { x: 0, y: 1, fontSize: 32, fill: '#ffffff' }),
  ]), {
    scaleX: [[0.15, 0, 'easeOutBack'], [0.55, 1], [1.7, 1, 'easeIn'], [2, 0]],
    scaleY: [[0.15, 0, 'easeOutBack'], [0.55, 1], [1.7, 1, 'easeIn'], [2, 0]],
  });
  d.elements = [bellG, badge];
  return d;
}

function rocket(): Doc {
  const d = doc('Rocket launch (motion path)', 800, 500, '#0b1026', 3);
  const stars = Array.from({ length: 14 }, (_, i) => {
    const x = (i * 157) % 780 + 10, y = (i * 89) % 300 + 15, ph = (i % 4) * 0.4;
    return W(E('path', { name: `Star ${i + 1}` }, { x, y, d: starPath(10 + (i % 3) * 4, 10 + (i % 3) * 4, 4, 0.4), fill: '#fde68a' }), {
      opacity: [[0, 0.3, 'easeInOutSine'], [0.75 + ph, 1, 'easeInOutSine'], [1.5 + ph, 0.3, 'easeInOutSine'], [3, 0.3]],
    });
  });
  // Rocket drawn pointing right (+x) so auto-rotate follows the path direction.
  const flame = W(E('path', { name: 'Flame' }, { x: -52, y: 0, d: 'M10 -12 C-10 -10 -30 -4 -36 0 C-30 4 -10 10 10 12 Z', fill: '#f97316' }), {
    scaleX: [[0, 1, 'linear'], [0.1, 1.4, 'linear'], [0.2, 0.9, 'linear'], [0.3, 1.3, 'linear'], [0.4, 1, 'linear'], [3, 1]],
  });
  flame.ax = 10;
  const body = E('path', { name: 'Body' }, { x: 0, y: 0, d: 'M56 0 C36 -26 -6 -26 -40 -18 V18 C-6 26 36 26 56 0 Z', fill: '#e2e8f0' });
  const fins = E('path', { name: 'Fins' }, { x: 0, y: 0, d: 'M-30 -18 L-50 -38 L-44 -16 Z M-30 18 L-50 38 L-44 16 Z', fill: '#ef4444' });
  const win = E('ellipse', { name: 'Window' }, { x: 16, y: 0, width: 22, height: 22, fill: '#38bdf8', stroke: '#64748b', strokeWidth: 4 });
  const ship = W(group('Rocket', 0, 0, [flame, fins, body, win], {
    motionPath: 'M70 430 C260 430 280 160 470 210 C620 250 690 120 740 60', autoRotate: true,
  }), { motion: [[0, 0, 'easeInOutCubic'], [2.6, 100], [3, 100]] });
  const trail = W(E('path', { name: 'Trail', lineCap: 'round' }, {
    x: 0, y: 0, d: 'M70 430 C260 430 280 160 470 210 C620 250 690 120 740 60', fill: 'none', stroke: '#64748b', strokeWidth: 3, dashArray: '2 12',
  }), { dashOffset: [[0, 0, 'linear'], [3, -84]] });
  d.elements = [...stars, trail, ship];
  return d;
}

function textReveal(): Doc {
  const d = doc('Text reveal (mask)', 800, 500, '#111827', 2.6);
  const title = W(E('text', { name: 'Title', text: 'ANIMATE', fontWeight: '900', letterSpacing: 6 }, { x: 0, y: 0, fontSize: 104, fill: '#f9fafb' }), {
    y: [[0.1, 120, 'easeOutCubic'], [0.9, 0], [2.2, 0, 'easeInCubic'], [2.6, -120]],
  });
  const mask = E('rect', { name: 'Mask' }, { x: 0, y: 0, width: 640, height: 130, fill: '#ffffff' });
  mask.isMask = true;
  const reveal = group('Mask group', 400, 210, [title, mask]);
  const bar = W(E('rect', { name: 'Underline' }, { x: 150, y: 292, width: 500, height: 8, rx: 4, fill: '#a78bfa' }), {
    scaleX: [[0.5, 0, 'easeOutExpo'], [1.3, 1], [2.1, 1, 'easeInExpo'], [2.5, 0]],
  });
  bar.ax = -250; // grow from the left end
  const sub = W(E('text', { name: 'Subtitle', text: 'anything you can draw', fontWeight: '500' }, { x: 400, y: 340, fontSize: 28, fill: '#c4b5fd' }), {
    opacity: [[0.9, 0, 'easeOut'], [1.5, 1], [2.1, 1], [2.4, 0]],
    blur: [[0.9, 8, 'easeOut'], [1.5, 0]],
  });
  d.elements = [reveal, bar, sub];
  return d;
}

function morph(): Doc {
  const d = doc('Shape morph', 600, 600, '#fdf4ff', 4);
  const heart = heartD.replace(/-?\d+(\.\d+)?/g, (v) => String(Math.round(parseFloat(v) * 2.4 * 100) / 100));
  const shape = W(E('path', { name: 'Morphing shape' }, { x: 300, y: 300, fill: '#8b5cf6' }), {
    d: [[0, ellipsePath(240, 240), 'easeInOutBack'], [1, rectPath(220, 220, 40), 'easeInOutBack'], [2, starPath(280, 280, 5, 0.5), 'easeInOutBack'], [3, heart, 'easeInOutBack'], [4, ellipsePath(240, 240)]],
    fill: [[0, '#8b5cf6'], [1, '#ec4899'], [2, '#f59e0b'], [3, '#ef4444'], [4, '#8b5cf6']],
    rotation: [[0, 0], [1, 90], [2, 180], [3, 360], [4, 360]],
  });
  shape.tracks.rotation!.forEach((k, i) => (k.easing = i === 3 ? 'hold' : 'easeInOutBack'));
  const shadow = W(E('ellipse', { name: 'Shadow' }, { x: 300, y: 500, width: 240, height: 26, fill: '#581c87', opacity: 0.12 }), {
    scaleX: [[0, 1], [0.5, 0.8], [1, 1], [1.5, 0.8], [2, 1], [2.5, 0.8], [3, 1], [3.5, 0.8], [4, 1]],
  });
  d.elements = [shadow, shape];
  return d;
}

function strokeDraw(): Doc {
  const d = doc('Stroke drawing', 600, 600, '#f0fdf4', 2.4);
  const ring = W(E('path', { name: 'Circle', lineCap: 'round' }, { x: 300, y: 270, d: ellipsePath(260, 260), fill: 'none', stroke: '#16a34a', strokeWidth: 16 }), {
    trim: [[0, 0, 'easeInOutCubic'], [1, 100]],
    rotation: [[0, -90], [1, -90]],
  });
  const check = W(E('path', { name: 'Check', lineCap: 'round', lineJoin: 'round' }, { x: 300, y: 270, d: 'M-60 4 L-16 48 L66 -44', fill: 'none', stroke: '#16a34a', strokeWidth: 20 }), {
    trim: [[0.8, 0, 'easeOutCubic'], [1.4, 100]],
  });
  const ants = W(E('rect', { name: 'Marching ants' }, { x: 300, y: 270, width: 360, height: 360, rx: 36, fill: 'none', stroke: '#86efac', strokeWidth: 4, dashArray: '14 10' }), {
    dashOffset: [[0, 0, 'linear'], [2.4, -96]],
  });
  const label = W(E('text', { name: 'Done', text: 'Done!', fontWeight: '800' }, { x: 300, y: 520, fontSize: 44, fill: '#166534' }), {
    opacity: [[1.3, 0, 'easeOut'], [1.7, 1]],
    y: [[1.3, 545, 'easeOutBack'], [1.7, 520]],
  });
  d.elements = [ants, ring, check, label];
  return d;
}

function toggle(): Doc {
  const d = doc('Toggle switch', 600, 400, '#f8fafc', 2);
  const onOff: K[] = [[0.3, 0, 'easeInOutCubic'], [0.7, 1], [1.3, 1, 'easeInOutCubic'], [1.7, 0]];
  const trackEl = W(E('rect', { name: 'Track' }, { x: 300, y: 200, width: 220, height: 110, rx: 55, fill: '#cbd5e1' }), {
    fill: onOff.map(([t, v, e]) => [t, v ? '#22c55e' : '#cbd5e1', e] as K),
  });
  const knob = W(E('ellipse', { name: 'Knob' }, { x: 245, y: 200, width: 86, height: 86, fill: '#ffffff', shadowColor: 'rgba(15,23,42,0.3)', shadowX: 0, shadowY: 4, shadowBlur: 6 }), {
    x: onOff.map(([t, v, e]) => [t, v ? 355 : 245, e] as K),
    scaleX: [[0.3, 1, 'easeOut'], [0.5, 1.15, 'easeIn'], [0.7, 1], [1.3, 1, 'easeOut'], [1.5, 1.15, 'easeIn'], [1.7, 1]],
  });
  d.elements = [trackEl, knob];
  return d;
}

function filters(): Doc {
  const d = doc('Card hover (filters)', 800, 500, '#e2e8f0', 2.4);
  const lift: K[] = [[0.2, 0, 'easeOutCubic'], [0.7, 1], [1.7, 1, 'easeInOutCubic'], [2.2, 0]];
  const card = W(group('Card', 400, 250, [
    E('rect', { name: 'Card body' }, { x: 0, y: 0, width: 340, height: 220, rx: 24, fill: '#ffffff' }),
    E('rect', { name: 'Image' }, { x: 0, y: -40, width: 300, height: 110, rx: 14, fill: '#818cf8' }),
    E('rect', { name: 'Line 1' }, { x: -50, y: 50, width: 200, height: 14, rx: 7, fill: '#cbd5e1' }),
    E('rect', { name: 'Line 2' }, { x: -90, y: 76, width: 120, height: 14, rx: 7, fill: '#e2e8f0' }),
  ]), {
    y: lift.map(([t, v, e]) => [t, v ? 230 : 250, e] as K),
    shadowY: lift.map(([t, v, e]) => [t, v ? 24 : 4, e] as K),
    shadowBlur: lift.map(([t, v, e]) => [t, v ? 18 : 4, e] as K),
  });
  card.props.shadowColor = 'rgba(15,23,42,0.28)';
  card.props.shadowX = 0;
  const glow = W(E('path', { name: 'Glow' }, { x: 400, y: 190, d: polygonPath(80, 80, 6), fill: '#e0e7ff' }), {
    blur: [[0, 0, 'easeInOutSine'], [1.2, 6, 'easeInOutSine'], [2.4, 0]],
    rotation: [[0, 0, 'linear'], [2.4, 120]],
  });
  d.elements = [card, glow];
  return d;
}

function clock(): Doc {
  const d = doc('Ticking clock (steps)', 600, 600, '#fefce8', 6);
  const face = E('ellipse', { name: 'Face' }, { x: 300, y: 300, width: 380, height: 380, fill: '#ffffff', stroke: '#1f2937', strokeWidth: 14 });
  const ticks = Array.from({ length: 12 }, (_, i) =>
    E('rect', { name: `Tick ${i + 1}` }, { x: 300 + Math.sin((i * Math.PI) / 6) * 160, y: 300 - Math.cos((i * Math.PI) / 6) * 160, width: 8, height: i % 3 ? 18 : 30, rx: 4, fill: '#1f2937', rotation: i * 30 }),
  );
  const minute = W(E('rect', { name: 'Minute hand' }, { x: 300, y: 300, width: 12, height: 140, rx: 6, fill: '#1f2937' }), {
    rotation: [[0, 0, 'linear'], [6, 36]],
  });
  minute.ay = 60; // pivot near one end
  const second = W(E('rect', { name: 'Second hand' }, { x: 300, y: 300, width: 5, height: 160, rx: 2.5, fill: '#ef4444' }), {
    rotation: [[0, 0, 'steps(60,end)'], [6, 360]],
  });
  second.ay = 66;
  const pin = E('ellipse', { name: 'Pin' }, { x: 300, y: 300, width: 24, height: 24, fill: '#ef4444' });
  d.elements = [face, ...ticks, minute, second, pin];
  return d;
}

export const TEMPLATES: Template[] = [
  { id: 'welcome', name: 'Welcome demo', hint: 'Bounce, morph, draw', make: demoDoc },
  { id: 'loader', name: 'Loading spinner', hint: 'Staggered opacity', make: loader },
  { id: 'heartbeat', name: 'Heartbeat', hint: 'Scale + stroke draw', make: heartbeat },
  { id: 'bell', name: 'Notification bell', hint: 'Origin + rotate', make: bell },
  { id: 'rocket', name: 'Rocket launch', hint: 'Motion path', make: rocket },
  { id: 'reveal', name: 'Text reveal', hint: 'Mask + blur', make: textReveal },
  { id: 'morph', name: 'Shape morph', hint: 'Morph + fill color', make: morph },
  { id: 'draw', name: 'Stroke drawing', hint: 'Draw + stroke offset', make: strokeDraw },
  { id: 'toggle', name: 'Toggle switch', hint: 'Position + color', make: toggle },
  { id: 'card', name: 'Card hover', hint: 'Drop shadow + blur', make: filters },
  { id: 'clock', name: 'Ticking clock', hint: 'Step easing', make: clock },
];

